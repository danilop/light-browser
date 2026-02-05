/**
 * Light Browser - Engine Tests
 *
 * Tests for Tier 1 (cheerio), Tier 2 (jsdom), and Tier 3 (Playwright) engines.
 */

import { describe, it, expect, afterAll } from 'bun:test';
import { cheerioFetch } from '../src/core/engine/tier1-cheerio.ts';
import { jsdomFetch, needsJavaScript } from '../src/core/engine/tier2-jsdom.ts';
import {
  playwrightFetch,
  closeBrowser,
  checkBrowserInstalled,
} from '../src/core/engine/tier3-playwright.ts';
import { EngineTier } from '../src/core/types.ts';

const TEST_USER_AGENT = 'LightBrowser/1.0 (Test)';
const TEST_TIMEOUT = 30000;

describe('Tier 1 Engine (Cheerio)', () => {
  it('should fetch a static HTML page', async () => {
    const result = await cheerioFetch('https://example.com', {
      timeout: TEST_TIMEOUT,
      userAgent: TEST_USER_AGENT,
    });

    expect(result.tierUsed).toBe(EngineTier.CHEERIO);
    expect(result.statusCode).toBe(200);
    expect(result.title).toBe('Example Domain');
    expect(result.html).toContain('Example Domain');
    expect(result.url).toBe('https://example.com/');
  }, 15000);

  it('should handle redirects', async () => {
    const result = await cheerioFetch('http://example.com', {
      timeout: TEST_TIMEOUT,
      userAgent: TEST_USER_AGENT,
      followRedirects: true,
    });

    expect(result.statusCode).toBe(200);
    expect(result.url).toContain('example.com');
  }, 15000);

  it('should throw on 404', async () => {
    await expect(
      cheerioFetch('https://httpstat.us/404', {
        timeout: TEST_TIMEOUT,
        userAgent: TEST_USER_AGENT,
      })
    ).rejects.toThrow();
  }, 15000);
});

describe('Tier 2 Engine (jsdom)', () => {
  it('should fetch and parse a page with jsdom', async () => {
    const result = await jsdomFetch('https://example.com', {
      timeout: TEST_TIMEOUT,
      userAgent: TEST_USER_AGENT,
      runScripts: false, // Disable JS for this simple test
    });

    expect(result.tierUsed).toBe(EngineTier.JSDOM);
    expect(result.statusCode).toBe(200);
    expect(result.title).toBe('Example Domain');
    expect(result.html).toContain('Example Domain');
  }, 15000);

  it('should execute JavaScript when enabled', async () => {
    // Create a simple test HTML with inline JS
    // We'll test against example.com which doesn't really need JS,
    // but we can verify the engine runs without errors
    const result = await jsdomFetch('https://example.com', {
      timeout: TEST_TIMEOUT,
      userAgent: TEST_USER_AGENT,
      runScripts: true,
      waitForJs: 200,
    });

    expect(result.tierUsed).toBe(EngineTier.JSDOM);
    expect(result.statusCode).toBe(200);
  }, 15000);
});

describe('needsJavaScript detection', () => {
  it('should detect React SPA indicators', () => {
    const html = '<html><body><div id="root"></div><script src="bundle.js"></script></body></html>';
    expect(needsJavaScript(html)).toBe(true);
  });

  it('should detect Vue/Nuxt indicators', () => {
    const html = '<html><body><div id="app" v-cloak></div></body></html>';
    expect(needsJavaScript(html)).toBe(true);
  });

  it('should detect Angular indicators', () => {
    const html = '<html><body ng-app="myApp"><div ng-view></div></body></html>';
    expect(needsJavaScript(html)).toBe(true);
  });

  it('should detect empty body', () => {
    const html = '<html><body><script>app.init()</script></body></html>';
    expect(needsJavaScript(html)).toBe(true);
  });

  it('should not flag static content', () => {
    const html = `<html><body>
      <h1>Hello World</h1>
      <p>This is a paragraph with lots of content that should be recognized as static HTML content without needing JavaScript to render properly.</p>
    </body></html>`;
    expect(needsJavaScript(html)).toBe(false);
  });
});

describe('Tier 3 Engine (Playwright)', () => {
  // Skip Playwright tests if browser is not installed
  let browserInstalled = false;

  it('should check if browser is installed', async () => {
    browserInstalled = await checkBrowserInstalled();
    // This test always passes, just records the status
    expect(typeof browserInstalled).toBe('boolean');
  }, 60000);

  it('should fetch a page with Playwright', async () => {
    if (!browserInstalled) {
      console.log('Skipping Playwright test - browser not installed');
      return;
    }

    const result = await playwrightFetch('https://example.com', {
      timeout: TEST_TIMEOUT,
      userAgent: TEST_USER_AGENT,
      headless: true,
    });

    expect(result.tierUsed).toBe(EngineTier.PLAYWRIGHT);
    expect(result.statusCode).toBe(200);
    expect(result.title).toBe('Example Domain');
    expect(result.html).toContain('Example Domain');
  }, 30000);

  it('should handle JS-rendered content', async () => {
    if (!browserInstalled) {
      console.log('Skipping Playwright test - browser not installed');
      return;
    }

    // Test with a simple page - in a real scenario we'd test with a SPA
    const result = await playwrightFetch('https://example.com', {
      timeout: TEST_TIMEOUT,
      userAgent: TEST_USER_AGENT,
      headless: true,
      waitForNetworkIdle: true,
    });

    expect(result.tierUsed).toBe(EngineTier.PLAYWRIGHT);
    expect(result.html).toContain('Example Domain');
  }, 30000);

  afterAll(async () => {
    await closeBrowser();
  });
});

describe('Engine Error Handling', () => {
  it('should handle invalid URLs in Tier 1', async () => {
    await expect(
      cheerioFetch('not-a-valid-url', {
        timeout: TEST_TIMEOUT,
        userAgent: TEST_USER_AGENT,
      })
    ).rejects.toThrow('Invalid URL');
  });

  it('should handle invalid URLs in Tier 2', async () => {
    await expect(
      jsdomFetch('not-a-valid-url', {
        timeout: TEST_TIMEOUT,
        userAgent: TEST_USER_AGENT,
      })
    ).rejects.toThrow('Invalid URL');
  });

  it('should handle timeouts in Tier 1', async () => {
    await expect(
      cheerioFetch('https://httpstat.us/200?sleep=5000', {
        timeout: 1000, // 1 second timeout
        userAgent: TEST_USER_AGENT,
      })
    ).rejects.toThrow();
  }, 10000);
});
