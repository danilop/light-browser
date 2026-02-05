/**
 * Light Browser - Local Server Tests
 *
 * Comprehensive tests using the local test server for all browser capabilities.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import {
  startTestServer,
  stopTestServer,
  getFormSubmissions,
  clearFormSubmissions,
} from './server/index.ts';
import { createEngine } from '../src/core/engine/index.ts';
import { loadConfig } from '../src/core/config.ts';
import { extractFromHtml } from '../src/extraction/html.ts';
import { EngineTier } from '../src/core/types.ts';

let baseUrl: string;

beforeAll(async () => {
  baseUrl = await startTestServer(9876);
});

afterAll(() => {
  stopTestServer();
});

describe('Local Test Server', () => {
  describe('Tier 1 (Cheerio) - Static Pages', () => {
    test('fetches home page', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/`);
        expect(result.html).toContain('Welcome to Test Site');
        expect(result.title).toBe('Test Home Page');
        expect(result.tierUsed).toBe(EngineTier.CHEERIO);
      } finally {
        await engine.close();
      }
    });

    test('extracts links from home page', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/`);
        const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

        expect(extracted.links.length).toBeGreaterThan(0);
        expect(extracted.links.some((l) => l.href.includes('/about'))).toBe(true);
        expect(extracted.links.some((l) => l.href.includes('/products'))).toBe(true);
        expect(extracted.links.some((l) => l.href.includes('/contact'))).toBe(true);
      } finally {
        await engine.close();
      }
    });

    test('extracts metadata', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/`);
        const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

        expect(extracted.metadata.description).toBe('Test page for Light Browser');
        // Keywords may be returned as array or comma-separated string
        const keywords = extracted.metadata.keywords;
        if (Array.isArray(keywords)) {
          expect(keywords).toContain('test');
          expect(keywords).toContain('browser');
        } else {
          expect(keywords).toContain('test');
        }
      } finally {
        await engine.close();
      }
    });

    test('fetches products page', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/products`);
        expect(result.html).toContain('Product A');
        expect(result.html).toContain('$49.99');
        expect(result.html).toContain('$99.99');
        expect(result.html).toContain('$149.99');
      } finally {
        await engine.close();
      }
    });

    test('handles 404 pages', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        await expect(engine.fetch(`${baseUrl}/nonexistent`)).rejects.toThrow('not found');
      } finally {
        await engine.close();
      }
    });
  });

  describe('Form Extraction', () => {
    test('extracts login form fields', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/forms`);
        const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

        const loginForm = extracted.forms.find((f) => f.id === 'login-form');
        expect(loginForm).toBeDefined();
        expect(loginForm!.method).toBe('POST');
        expect(loginForm!.action).toContain('/submit/login');
        expect(loginForm!.fields.some((f) => f.name === 'username')).toBe(true);
        expect(loginForm!.fields.some((f) => f.name === 'password')).toBe(true);
        expect(loginForm!.fields.some((f) => f.name === 'csrf_token')).toBe(true);
      } finally {
        await engine.close();
      }
    });

    test('extracts search form fields', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/forms`);
        const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

        const searchForm = extracted.forms.find((f) => f.id === 'search-form');
        expect(searchForm).toBeDefined();
        expect(searchForm!.method).toBe('GET');
        expect(searchForm!.fields.some((f) => f.name === 'q')).toBe(true);
        expect(searchForm!.fields.some((f) => f.name === 'category')).toBe(true);
      } finally {
        await engine.close();
      }
    });

    test('extracts contact form with all field types', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/forms`);
        const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

        const contactForm = extracted.forms.find((f) => f.id === 'contact-form');
        expect(contactForm).toBeDefined();
        expect(contactForm!.fields.some((f) => f.name === 'name' && f.type === 'text')).toBe(true);
        expect(contactForm!.fields.some((f) => f.name === 'email' && f.type === 'email')).toBe(
          true
        );
        expect(contactForm!.fields.some((f) => f.name === 'subject' && f.type === 'select')).toBe(
          true
        );
        expect(contactForm!.fields.some((f) => f.name === 'message' && f.type === 'textarea')).toBe(
          true
        );
        expect(
          contactForm!.fields.some((f) => f.name === 'newsletter' && f.type === 'checkbox')
        ).toBe(true);
      } finally {
        await engine.close();
      }
    });
  });

  describe('Link Types', () => {
    test('extracts all link types', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/links`);
        const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

        // Internal links
        expect(extracted.links.some((l) => l.href.includes('/about'))).toBe(true);

        // External links
        expect(extracted.links.some((l) => l.href.includes('google.com'))).toBe(true);
        expect(extracted.links.some((l) => l.href.includes('github.com'))).toBe(true);

        // Download links
        expect(extracted.links.some((l) => l.href.includes('/files/document.pdf'))).toBe(true);

        // Anchor links
        expect(extracted.links.some((l) => l.href.includes('#section1'))).toBe(true);
      } finally {
        await engine.close();
      }
    });
  });

  describe('Media Extraction', () => {
    test('extracts media references', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/media`);
        const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

        // Images
        const images = extracted.media.filter((m) => m.type === 'image');
        expect(images.length).toBeGreaterThan(0);
        expect(images.some((i) => i.src.includes('/images/test.png'))).toBe(true);

        // Videos
        const videos = extracted.media.filter((m) => m.type === 'video');
        expect(videos.length).toBeGreaterThan(0);

        // Audio
        const audio = extracted.media.filter((m) => m.type === 'audio');
        expect(audio.length).toBeGreaterThan(0);
      } finally {
        await engine.close();
      }
    });

    test('fetches test image', async () => {
      const response = await fetch(`${baseUrl}/images/test.png`);
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('image/png');
    });
  });

  describe('Redirects', () => {
    test('follows single redirect', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/redirect`);
        expect(result.url).toContain('/about');
        expect(result.html).toContain('About Us');
      } finally {
        await engine.close();
      }
    });

    test('follows redirect chain', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/redirect-chain`);
        expect(result.url).toContain('/about');
        expect(result.html).toContain('About Us');
      } finally {
        await engine.close();
      }
    });
  });

  describe('Search Results', () => {
    test('returns search results with query params', async () => {
      const config = loadConfig();
      const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

      try {
        const result = await engine.fetch(`${baseUrl}/search?q=test&category=products`);
        expect(result.html).toContain('Search Results');
        expect(result.html).toContain('test');
        expect(result.html).toContain('products');
      } finally {
        await engine.close();
      }
    });
  });
});

describe('Form Submission via HTTP', () => {
  beforeAll(() => {
    clearFormSubmissions();
  });

  test('submits login form (POST)', async () => {
    const formData = new URLSearchParams();
    formData.append('username', 'testuser');
    formData.append('password', 'testpass');
    formData.append('csrf_token', 'abc123');

    const response = await fetch(`${baseUrl}/submit/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    expect(response.ok).toBe(true);
    const html = await response.text();
    expect(html).toContain('Form Submitted Successfully');
    expect(html).toContain('testuser');

    const submissions = getFormSubmissions();
    expect(submissions.length).toBeGreaterThan(0);
    expect(submissions[submissions.length - 1].data.username).toBe('testuser');
  });

  test('submits search form (GET)', async () => {
    const response = await fetch(`${baseUrl}/search?q=testing&category=articles`);
    expect(response.ok).toBe(true);
    const html = await response.text();
    expect(html).toContain('testing');
    expect(html).toContain('articles');
  });

  test('submits contact form (POST)', async () => {
    const formData = new URLSearchParams();
    formData.append('name', 'John Doe');
    formData.append('email', 'john@example.com');
    formData.append('subject', 'support');
    formData.append('message', 'Test message');
    formData.append('newsletter', 'yes');

    const response = await fetch(`${baseUrl}/submit/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    expect(response.ok).toBe(true);
    const html = await response.text();
    expect(html).toContain('John Doe');
    expect(html).toContain('john@example.com');
  });
});

describe('Tier 2 (jsdom) - JavaScript Pages', () => {
  test('renders JS-required content', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.JSDOM });

    try {
      const result = await engine.fetch(`${baseUrl}/js-required`);
      // jsdom should execute the script and render content
      expect(result.html).toContain('JavaScript Rendered Content');
      expect(result.tierUsed).toBe(EngineTier.JSDOM);
    } finally {
      await engine.close();
    }
  });

  test('Tier 1 does not render JS content', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      const result = await engine.fetch(`${baseUrl}/js-required`);
      const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });
      // Tier 1 should not execute JS, so the main content should be empty
      // The script tag contains the text but it's not rendered
      expect(result.html).toContain('<div id="root"></div>');
      // The extracted content should NOT have the JS-rendered heading
      expect(extracted.content).not.toContain('# JavaScript Rendered Content');
    } finally {
      await engine.close();
    }
  });
});
