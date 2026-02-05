/**
 * Light Browser - Tier 2 Engine (jsdom)
 *
 * HTTP fetch + jsdom for pages requiring JavaScript execution.
 * Slower than Tier 1 (~150-300ms) but handles simple JS.
 */

import { JSDOM, VirtualConsole } from 'jsdom';
import type { PageResult, TimingInfo } from '../types.ts';
import { EngineTier } from '../types.ts';
import { httpClientError, httpServerError, timeoutError, wrapError } from '../../utils/errors.ts';

export interface JsdomFetchOptions {
  timeout: number;
  userAgent: string;
  headers?: Record<string, string>;
  followRedirects?: boolean;
  maxRedirects?: number;
  /** Whether to run JavaScript (default: true) */
  runScripts?: boolean;
  /** Time to wait for JS execution to stabilize (ms) */
  waitForJs?: number;
}

/**
 * Wait for the DOM to stabilize after JS execution
 */
async function waitForDomStable(dom: JSDOM, timeout: number): Promise<void> {
  const window = dom.window;
  const document = window.document;

  // Wait for DOMContentLoaded if not already fired
  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) => {
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      setTimeout(resolve, timeout);
    });
  }

  // Wait a bit for any initial JS to run
  await new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 100)));

  // Use MutationObserver to detect when DOM stops changing
  return new Promise((resolve) => {
    let lastMutationTime = Date.now();
    let resolved = false;

    const observer = new window.MutationObserver(() => {
      lastMutationTime = Date.now();
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    // Check periodically if DOM has stabilized
    const checkInterval = setInterval(() => {
      const timeSinceLastMutation = Date.now() - lastMutationTime;
      if (timeSinceLastMutation > 100 && !resolved) {
        resolved = true;
        clearInterval(checkInterval);
        observer.disconnect();
        resolve(undefined);
      }
    }, 50);

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(checkInterval);
        observer.disconnect();
        resolve(undefined);
      }
    }, timeout);
  });
}

/**
 * Fetch a URL using native fetch and process with jsdom (with JS execution)
 */
export async function jsdomFetch(url: string, options: JsdomFetchOptions): Promise<PageResult> {
  const startTime = performance.now();
  const redirectChain: string[] = [];

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw wrapError(new Error(`Invalid URL: ${url}`));
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw wrapError(new Error(`Unsupported protocol: ${parsedUrl.protocol}`));
  }

  // Build headers
  const headers: Record<string, string> = {
    'User-Agent': options.userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    ...options.headers,
  };

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);

  let dom: JSDOM | null = null;

  try {
    // Perform the fetch
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: options.followRedirects ? 'follow' : 'manual',
    });

    clearTimeout(timeoutId);

    // Track redirects
    if (response.redirected) {
      redirectChain.push(url);
    }

    // Handle HTTP errors
    if (response.status >= 400 && response.status < 500) {
      throw httpClientError(response.status, url);
    }
    if (response.status >= 500) {
      throw httpServerError(response.status, url);
    }

    // Get response text
    const html = await response.text();
    const fetchEndTime = performance.now();

    // Convert response headers to plain object
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Create virtual console to suppress jsdom errors
    const virtualConsole = new VirtualConsole();
    // Optionally forward to real console for debugging:
    // virtualConsole.sendTo(console, { omitJSDOMErrors: true });

    // Parse with jsdom
    const runScripts = options.runScripts !== false;
    dom = new JSDOM(html, {
      url: response.url,
      referrer: url,
      contentType: responseHeaders['content-type'] || 'text/html',
      runScripts: runScripts ? 'dangerously' : undefined,
      // Don't load external resources for security and speed
      resources: 'usable',
      virtualConsole,
      pretendToBeVisual: true,
    });

    // Wait for JS to execute and DOM to stabilize
    if (runScripts) {
      const waitTime = options.waitForJs ?? 500;
      await waitForDomStable(dom, waitTime);
    }

    // Get the rendered HTML
    const renderedHtml = dom.serialize();

    // Extract title
    const title = dom.window.document.title || '';

    const timing: TimingInfo = {
      fetchMs: Math.round(fetchEndTime - startTime),
      totalMs: Math.round(performance.now() - startTime),
    };

    // Clean up
    dom.window.close();

    return {
      url: response.url,
      title,
      html: renderedHtml,
      statusCode: response.status,
      headers: responseHeaders,
      redirectChain,
      tierUsed: EngineTier.JSDOM,
      timing,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // Clean up jsdom
    if (dom) {
      try {
        dom.window.close();
      } catch {
        // Ignore cleanup errors
      }
    }

    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw timeoutError(url, options.timeout);
    }

    throw wrapError(error);
  }
}

/**
 * Check if a page likely needs JavaScript execution
 * Used for auto-escalation from Tier 1 to Tier 2
 */
export function needsJavaScript(html: string): boolean {
  // Check for common SPA frameworks
  const spaIndicators = [
    // React
    'id="root"',
    'id="app"',
    'data-reactroot',
    '__NEXT_DATA__',
    // Vue
    'id="app"',
    'v-cloak',
    '__NUXT__',
    // Angular
    'ng-app',
    'ng-version',
    // Generic SPA indicators
    'Loading...',
    'Please enable JavaScript',
    'requires JavaScript',
    'noscript',
  ];

  const htmlLower = html.toLowerCase();
  const hasIndicator = spaIndicators.some((indicator) =>
    htmlLower.includes(indicator.toLowerCase())
  );

  // Check if body is mostly empty (common in SPAs)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    const bodyContent = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();

    // If body text is very short, probably needs JS
    if (bodyContent.length < 100) {
      return true;
    }
  }

  return hasIndicator;
}
