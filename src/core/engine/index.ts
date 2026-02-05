/**
 * Light Browser - Engine Orchestration
 *
 * Manages the three-tier engine architecture and handles
 * auto-escalation between tiers based on page requirements.
 */

import type { EngineTier, EngineOptions, FetchOptions, PageResult, Config } from '../types.ts';
import { EngineTier as Tier } from '../types.ts';
import { cheerioFetch } from './tier1-cheerio.ts';
import { jsdomFetch, needsJavaScript } from './tier2-jsdom.ts';
import { playwrightFetch, closeBrowser } from './tier3-playwright.ts';
import { getUserAgent } from '../config.ts';
import { BrowserError, wrapError } from '../../utils/errors.ts';
import { ErrorCode } from '../types.ts';

/**
 * Default engine options
 */
const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  maxTier: Tier.PLAYWRIGHT,
  autoEscalate: true,
  timeout: 30000,
};

/**
 * Signals that indicate a page needs JavaScript to render properly
 */
const JS_REQUIRED_SIGNALS = [
  // Empty or minimal body content
  (html: string) => {
    const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    if (bodyMatch) {
      const bodyContent = bodyMatch[1]?.replace(/<script[\s\S]*?<\/script>/gi, '').trim() ?? '';
      // Very short body after removing scripts likely means JS renders content
      return bodyContent.length < 100;
    }
    return false;
  },
  // Has noscript tag with significant content
  (html: string) => {
    const noscriptMatch = /<noscript[^>]*>([\s\S]*?)<\/noscript>/i.exec(html);
    if (noscriptMatch && noscriptMatch[1]) {
      return noscriptMatch[1].trim().length > 50;
    }
    return false;
  },
  // Common SPA framework indicators
  (html: string) => {
    return (
      html.includes('id="root"') ||
      html.includes('id="app"') ||
      html.includes('id="__next"') ||
      html.includes('id="__nuxt"') ||
      html.includes('ng-app') ||
      html.includes('data-reactroot')
    );
  },
];

/**
 * Check if the page likely requires JavaScript to render
 */
function detectJsRequired(html: string): boolean {
  return JS_REQUIRED_SIGNALS.some((check) => check(html)) || needsJavaScript(html);
}

/**
 * Check if the page likely needs a full browser (Tier 3)
 * These are SPAs that jsdom can't handle properly
 */
function detectNeedsFullBrowser(html: string): boolean {
  // Check for complex SPA indicators that jsdom struggles with
  const complexIndicators = [
    // React with complex hydration
    '__NEXT_DATA__',
    '__NUXT__',
    // Complex bundlers
    'webpackJsonp',
    '__webpack_require__',
    // Shadow DOM / Web Components
    'customElements.define',
    'attachShadow',
    // Complex async loading
    'IntersectionObserver',
    'requestIdleCallback',
  ];

  return complexIndicators.some((indicator) => html.includes(indicator));
}

/**
 * Engine class that orchestrates fetching across tiers
 */
export class Engine {
  private options: EngineOptions;
  private config: Config;
  private currentTier: EngineTier = Tier.CHEERIO;
  private usedPlaywright = false;

  constructor(config: Config, options?: Partial<EngineOptions>) {
    this.config = config;
    this.options = {
      ...DEFAULT_ENGINE_OPTIONS,
      timeout: config.browser.timeout,
      ...options,
    };
  }

  /**
   * Get the currently active engine tier
   */
  getActiveTier(): EngineTier {
    return this.currentTier;
  }

  /**
   * Fetch a URL, optionally auto-escalating through tiers
   */
  async fetch(url: string, fetchOptions?: FetchOptions): Promise<PageResult> {
    const userAgent = this.options.userAgent ?? getUserAgent(this.config);
    const startTime = performance.now();

    // Determine starting tier
    let tier: EngineTier;
    if (this.options.autoEscalate) {
      tier = Tier.CHEERIO;
    } else {
      tier = this.options.maxTier;
    }
    this.currentTier = tier;

    // Build common options
    const commonOptions = {
      timeout: this.options.timeout,
      userAgent,
      headers: this.options.headers ?? fetchOptions?.headers,
      followRedirects: fetchOptions?.followRedirects ?? this.config.network.followRedirects,
      maxRedirects: fetchOptions?.maxRedirects ?? this.config.network.maxRedirects,
    };

    // Try each tier until we get good results or run out of tiers
    while (tier <= this.options.maxTier) {
      this.currentTier = tier;

      try {
        let result: PageResult;

        switch (tier) {
          case Tier.CHEERIO:
            result = await cheerioFetch(url, commonOptions);
            break;

          case Tier.JSDOM:
            result = await jsdomFetch(url, {
              ...commonOptions,
              runScripts: this.config.browser.javascript,
              waitForJs: 500,
            });
            break;

          case Tier.PLAYWRIGHT:
            this.usedPlaywright = true;
            result = await playwrightFetch(url, {
              ...commonOptions,
              headless: this.config.browser.headless,
              viewportWidth: this.config.browser.viewport.width,
              viewportHeight: this.config.browser.viewport.height,
              waitForNetworkIdle: true,
              extraWait: 100,
            });
            break;

          default:
            throw new BrowserError(ErrorCode.NETWORK_ERROR, `Unknown engine tier: ${tier}`, {
              recoverable: false,
            });
        }

        // Check if we should escalate to a higher tier
        if (this.options.autoEscalate && tier < this.options.maxTier) {
          const shouldEscalate = this.shouldEscalate(result.html, tier);
          if (shouldEscalate) {
            tier++;
            continue;
          }
        }

        // Success - return result with final timing
        const endTime = performance.now();
        return {
          ...result,
          tierUsed: tier,
          timing: {
            fetchMs: result.timing.fetchMs,
            totalMs: Math.round(endTime - startTime),
          },
        };
      } catch (error) {
        // If it's an HTTP error, don't retry with a different tier
        if (error instanceof BrowserError) {
          if (
            error.code === ErrorCode.HTTP_CLIENT_ERROR ||
            error.code === ErrorCode.HTTP_SERVER_ERROR
          ) {
            throw error;
          }
        }

        // For other errors, try to escalate
        if (this.options.autoEscalate && tier < this.options.maxTier) {
          tier++;
          continue;
        }

        throw wrapError(error);
      }
    }

    // Should never reach here
    throw new BrowserError(ErrorCode.NETWORK_ERROR, 'Failed to fetch with all available tiers', {
      recoverable: false,
    });
  }

  /**
   * Check if we should escalate to a higher tier
   */
  private shouldEscalate(html: string, currentTier: EngineTier): boolean {
    if (currentTier === Tier.CHEERIO) {
      // Escalate from Tier 1 to Tier 2 if JS is needed
      return detectJsRequired(html);
    }
    if (currentTier === Tier.JSDOM) {
      // Escalate from Tier 2 to Tier 3 if complex SPA detected
      return detectNeedsFullBrowser(html);
    }
    return false;
  }

  /**
   * Force a specific tier for the next fetch
   */
  setTier(tier: EngineTier): void {
    if (tier > this.options.maxTier) {
      throw new BrowserError(
        ErrorCode.NETWORK_ERROR,
        `Cannot set tier ${tier} when maxTier is ${this.options.maxTier}`,
        { recoverable: false }
      );
    }
    this.currentTier = tier;
    this.options.autoEscalate = false;
  }

  /**
   * Clean up any resources (browser instances for Tier 3)
   */
  async close(): Promise<void> {
    if (this.usedPlaywright) {
      await closeBrowser();
    }
  }
}

/**
 * Create and configure an engine instance
 */
export function createEngine(config: Config, options?: Partial<EngineOptions>): Engine {
  return new Engine(config, options);
}
