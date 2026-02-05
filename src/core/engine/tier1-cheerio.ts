/**
 * Light Browser - Tier 1 Engine (Cheerio)
 *
 * HTTP fetch + cheerio parsing for static HTML pages.
 * This is the fastest tier (~50ms) and works for most static content.
 */

import * as cheerio from 'cheerio';
import type { PageResult, TimingInfo } from '../types.ts';
import { EngineTier } from '../types.ts';
import { httpClientError, httpServerError, timeoutError, wrapError } from '../../utils/errors.ts';

export interface CheerioFetchOptions {
  timeout: number;
  userAgent: string;
  headers?: Record<string, string>;
  followRedirects?: boolean;
  maxRedirects?: number;
}

/**
 * Fetch a URL using native fetch and parse with cheerio
 */
export async function cheerioFetch(url: string, options: CheerioFetchOptions): Promise<PageResult> {
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

  try {
    // Perform the fetch
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: options.followRedirects ? 'follow' : 'manual',
    });

    clearTimeout(timeoutId);

    // Track redirects (if we followed them)
    if (response.redirected) {
      redirectChain.push(url);
      // Note: Full redirect chain not available with native fetch
      // Would need manual redirect following for complete chain
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

    // Parse with cheerio
    const $ = cheerio.load(html);

    // Extract title
    const title = $('title').first().text().trim() || '';

    // Convert response headers to plain object
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const timing: TimingInfo = {
      fetchMs: Math.round(fetchEndTime - startTime),
      totalMs: Math.round(performance.now() - startTime),
    };

    return {
      url: response.url,
      title,
      html,
      statusCode: response.status,
      headers: responseHeaders,
      redirectChain,
      tierUsed: EngineTier.CHEERIO,
      timing,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw timeoutError(url, options.timeout);
    }

    throw wrapError(error);
  }
}

/**
 * Helper to check if a page was fetched successfully
 */
export function isSuccessfulFetch(result: PageResult): boolean {
  return result.statusCode >= 200 && result.statusCode < 300;
}
