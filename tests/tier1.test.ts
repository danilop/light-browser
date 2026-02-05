/**
 * Light Browser - Tier 1 Engine Tests
 */

import { describe, it, expect } from 'bun:test';
import { cheerioFetch } from '../src/core/engine/tier1-cheerio.ts';
import { extractFromHtml, extractLinks, extractMetadata } from '../src/extraction/html.ts';
import { formatAsMarkdown } from '../src/output/markdown.ts';
import { formatAsJson } from '../src/output/json.ts';
import { formatAsText } from '../src/output/text.ts';
import * as cheerio from 'cheerio';

describe('Tier 1 Engine - cheerioFetch', () => {
  it('should fetch a simple HTML page', async () => {
    const result = await cheerioFetch('https://example.com', {
      timeout: 10000,
      userAgent: 'light-browser-test/1.0',
    });

    expect(result.statusCode).toBe(200);
    expect(result.title).toBe('Example Domain');
    expect(result.html).toContain('Example Domain');
    expect(result.url).toBe('https://example.com/');
    expect(result.timing.fetchMs).toBeGreaterThan(0);
  });

  it('should handle HTTP requests', async () => {
    const result = await cheerioFetch('http://example.com', {
      timeout: 10000,
      userAgent: 'light-browser-test/1.0',
      followRedirects: true,
    });

    expect(result.statusCode).toBe(200);
    // May or may not redirect to HTTPS depending on server config
    expect(result.url).toContain('example.com');
  });
});

describe('HTML Extraction', () => {
  const sampleHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>Test Page</title>
      <meta name="description" content="A test page">
      <meta property="og:title" content="OG Title">
    </head>
    <body>
      <nav><a href="/home">Home</a></nav>
      <main>
        <h1>Main Heading</h1>
        <p>This is a paragraph with a <a href="https://example.com">link</a>.</p>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
        <form action="/submit" method="POST">
          <input type="text" name="username" required>
          <input type="password" name="password">
          <button type="submit">Submit</button>
        </form>
        <img src="image.jpg" alt="Test image">
      </main>
      <footer><a href="/about">About</a></footer>
    </body>
    </html>
  `;

  it('should extract links', () => {
    const $ = cheerio.load(sampleHtml);
    const links = extractLinks($, 'https://test.com');

    expect(links.length).toBe(3);
    expect(links[0]?.text).toBe('Home');
    expect(links[0]?.type).toBe('navigation');
    expect(links[1]?.text).toBe('link');
    expect(links[1]?.type).toBe('external');
  });

  it('should extract metadata', () => {
    const $ = cheerio.load(sampleHtml);
    const metadata = extractMetadata($);

    expect(metadata.description).toBe('A test page');
    expect(metadata.lang).toBe('en');
    expect(metadata.og?.title).toBe('OG Title');
  });

  it('should extract content as structured data', () => {
    const result = extractFromHtml(sampleHtml, 'https://test.com', {
      format: 'json',
      includeMedia: true,
    });

    expect(result.links.length).toBeGreaterThan(0);
    expect(result.forms.length).toBe(1);
    expect(result.forms[0]?.method).toBe('POST');
    expect(result.media.length).toBe(1);
    expect(result.media[0]?.type).toBe('image');
  });
});

describe('Output Formatters', () => {
  const mockSnapshot = {
    url: 'https://example.com',
    title: 'Test Page',
    content: [
      { type: 'heading' as const, level: 1, text: 'Hello World' },
      { type: 'paragraph' as const, text: 'This is a test.' },
    ],
    links: [
      {
        text: 'Example',
        href: 'https://example.com',
        resolvedUrl: 'https://example.com',
        type: 'external' as const,
        refNumber: 1,
      },
    ],
    forms: [],
    media: [],
    metadata: { description: 'A test page' },
    tierUsed: 1 as const,
    timing: { fetchMs: 100, extractMs: 10, totalMs: 110 },
  };

  it('should format as markdown', () => {
    const output = formatAsMarkdown(mockSnapshot);

    expect(output).toContain('# Test Page');
    expect(output).toContain('https://example.com');
    expect(output).toContain('Hello World');
  });

  it('should format as JSON', () => {
    const output = formatAsJson(mockSnapshot);
    const parsed = JSON.parse(output);

    expect(parsed.url).toBe('https://example.com');
    expect(parsed.title).toBe('Test Page');
    expect(parsed.tierUsed).toBe(1);
  });

  it('should format as text', () => {
    const output = formatAsText(mockSnapshot);

    expect(output).toContain('TEST PAGE');
    expect(output).toContain('HELLO WORLD'); // Headings are uppercased in text format
    expect(output).toContain('Source: https://example.com');
  });
});
