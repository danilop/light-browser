/**
 * Light Browser - Tier 3 Engine (Playwright)
 *
 * Full Chromium browser for complex SPAs and JS-heavy pages.
 * Slowest tier (~500-2000ms) but handles anything a real browser can.
 */

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import type { PageResult, TimingInfo } from '../types.ts';
import { EngineTier } from '../types.ts';
import { httpClientError, httpServerError, timeoutError, wrapError } from '../../utils/errors.ts';

export interface PlaywrightFetchOptions {
  timeout: number;
  userAgent: string;
  headers?: Record<string, string>;
  /** Viewport width (default: 1280) */
  viewportWidth?: number;
  /** Viewport height (default: 720) */
  viewportHeight?: number;
  /** Whether to run in headless mode (default: true) */
  headless?: boolean;
  /** Wait for this selector before returning */
  waitForSelector?: string;
  /** Wait for network to be idle */
  waitForNetworkIdle?: boolean;
  /** Extra time to wait after page load (ms) */
  extraWait?: number;
}

// Singleton browser instance for reuse
let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

/**
 * Get or create the browser instance
 */
async function getBrowser(headless: boolean = true): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });

  browserInstance = await browserLaunchPromise;
  browserLaunchPromise = null;

  return browserInstance;
}

/**
 * Close the browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Fetch a URL using Playwright (full browser)
 */
export async function playwrightFetch(
  url: string,
  options: PlaywrightFetchOptions
): Promise<PageResult> {
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

  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    const browser = await getBrowser(options.headless !== false);

    // Create a new context for isolation
    context = await browser.newContext({
      userAgent: options.userAgent,
      viewport: {
        width: options.viewportWidth ?? 1280,
        height: options.viewportHeight ?? 720,
      },
      extraHTTPHeaders: options.headers,
      ignoreHTTPSErrors: false,
    });

    page = await context.newPage();

    // Track redirects
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.redirectedFrom()) {
        redirectChain.push(request.redirectedFrom()!.url());
      }
    });

    // Track response status
    let statusCode = 200;
    let responseHeaders: Record<string, string> = {};

    page.on('response', (response) => {
      if (response.url() === url || response.request().isNavigationRequest()) {
        statusCode = response.status();
        responseHeaders = response.headers();
      }
    });

    // Navigate to the page
    const gotoOptions: Parameters<Page['goto']>[1] = {
      timeout: options.timeout,
      waitUntil: options.waitForNetworkIdle ? 'networkidle' : 'domcontentloaded',
    };

    const response = await page.goto(url, gotoOptions);

    if (response) {
      statusCode = response.status();
      const headers = await response.allHeaders();
      responseHeaders = headers;
    }

    // Handle HTTP errors
    if (statusCode >= 400 && statusCode < 500) {
      throw httpClientError(statusCode, url);
    }
    if (statusCode >= 500) {
      throw httpServerError(statusCode, url);
    }

    // Wait for specific selector if requested
    if (options.waitForSelector) {
      try {
        await page.waitForSelector(options.waitForSelector, {
          timeout: Math.min(options.timeout, 10000),
        });
      } catch {
        // Continue even if selector doesn't appear
      }
    }

    // Extra wait time for JS-heavy pages
    if (options.extraWait && options.extraWait > 0) {
      await page.waitForTimeout(options.extraWait);
    }

    const fetchEndTime = performance.now();

    // Get the rendered HTML
    const html = await page.content();

    // Get title
    const title = await page.title();

    // Get final URL after redirects
    const finalUrl = page.url();

    const timing: TimingInfo = {
      fetchMs: Math.round(fetchEndTime - startTime),
      totalMs: Math.round(performance.now() - startTime),
    };

    return {
      url: finalUrl,
      title,
      html,
      statusCode,
      headers: responseHeaders,
      redirectChain,
      tierUsed: EngineTier.PLAYWRIGHT,
      timing,
    };
  } catch (error) {
    // Handle timeout
    if (error instanceof Error && error.message.includes('Timeout')) {
      throw timeoutError(url, options.timeout);
    }

    throw wrapError(error);
  } finally {
    // Clean up
    if (page) {
      try {
        await page.close();
      } catch {
        // Ignore cleanup errors
      }
    }
    if (context) {
      try {
        await context.close();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Take a screenshot of a page
 */
export async function takeScreenshot(
  url: string,
  options: PlaywrightFetchOptions & {
    fullPage?: boolean;
    type?: 'png' | 'jpeg';
    quality?: number;
  }
): Promise<Buffer> {
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    const browser = await getBrowser(options.headless !== false);

    context = await browser.newContext({
      userAgent: options.userAgent,
      viewport: {
        width: options.viewportWidth ?? 1280,
        height: options.viewportHeight ?? 720,
      },
      extraHTTPHeaders: options.headers,
    });

    page = await context.newPage();

    await page.goto(url, {
      timeout: options.timeout,
      waitUntil: options.waitForNetworkIdle ? 'networkidle' : 'domcontentloaded',
    });

    if (options.waitForSelector) {
      try {
        await page.waitForSelector(options.waitForSelector, {
          timeout: Math.min(options.timeout, 10000),
        });
      } catch {
        // Continue
      }
    }

    if (options.extraWait && options.extraWait > 0) {
      await page.waitForTimeout(options.extraWait);
    }

    const screenshot = await page.screenshot({
      fullPage: options.fullPage ?? false,
      type: options.type ?? 'png',
      quality: options.type === 'jpeg' ? (options.quality ?? 80) : undefined,
    });

    return screenshot;
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

/**
 * Check if Playwright browsers are installed
 */
export async function checkBrowserInstalled(): Promise<boolean> {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Install Playwright browsers
 */
export async function installBrowsers(): Promise<void> {
  const { execSync } = await import('node:child_process');
  execSync('bunx playwright install chromium', { stdio: 'inherit' });
}
