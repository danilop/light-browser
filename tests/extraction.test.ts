/**
 * Light Browser - Extraction Module Tests
 *
 * Tests for HTML content extraction using fixture files.
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import {
  extractLinks,
  extractForms,
  extractMedia,
  extractMetadata,
  extractFromHtml,
  extractPlainText,
  getMainContent,
} from '../src/extraction/html.ts';

const FIXTURES_DIR = join(import.meta.dir, 'fixtures');

describe('Extraction - Complex Page Fixture', () => {
  let html: string;
  let $: ReturnType<typeof cheerio.load>;

  beforeAll(() => {
    html = readFileSync(join(FIXTURES_DIR, 'complex-page.html'), 'utf-8');
    $ = cheerio.load(html);
  });

  describe('Link Extraction', () => {
    it('should extract all links', () => {
      const links = extractLinks($, 'https://example.com');

      expect(links.length).toBeGreaterThan(10);
    });

    it('should classify navigation links correctly', () => {
      const links = extractLinks($, 'https://example.com');
      const navLinks = links.filter((l) => l.type === 'navigation');

      expect(navLinks.length).toBeGreaterThan(0);
      expect(navLinks.some((l) => l.text === 'Home')).toBe(true);
    });

    it('should classify external links correctly', () => {
      const links = extractLinks($, 'https://example.com');
      const externalLinks = links.filter((l) => l.type === 'external');

      expect(externalLinks.length).toBeGreaterThan(0);
      expect(externalLinks.some((l) => l.href.includes('external.com'))).toBe(true);
    });

    it('should resolve relative URLs', () => {
      const links = extractLinks($, 'https://example.com');
      const internalLink = links.find((l) => l.href === '/internal/page');

      expect(internalLink).toBeDefined();
      expect(internalLink?.resolvedUrl).toBe('https://example.com/internal/page');
    });

    it('should assign reference numbers to links', () => {
      const links = extractLinks($, 'https://example.com');

      links.forEach((link, i) => {
        expect(link.refNumber).toBe(i + 1);
      });
    });
  });

  describe('Form Extraction', () => {
    it('should extract forms', () => {
      const forms = extractForms($);

      expect(forms.length).toBe(1);
      expect(forms[0]?.id).toBe('contact');
    });

    it('should extract form action and method', () => {
      const forms = extractForms($);

      expect(forms[0]?.action).toBe('/api/contact');
      expect(forms[0]?.method).toBe('POST');
    });

    it('should extract form fields', () => {
      const forms = extractForms($);
      const fields = forms[0]?.fields ?? [];

      expect(fields.length).toBeGreaterThan(0);
      expect(fields.some((f) => f.name === 'name' && f.type === 'text')).toBe(true);
      expect(fields.some((f) => f.name === 'email' && f.type === 'email')).toBe(true);
    });

    it('should extract select options', () => {
      const forms = extractForms($);
      const selectField = forms[0]?.fields.find((f) => f.name === 'subject');

      expect(selectField).toBeDefined();
      expect(selectField?.options?.length).toBe(3);
      expect(selectField?.options?.find((o) => o.selected)?.value).toBe('sales');
    });

    it('should identify hidden fields', () => {
      const forms = extractForms($);
      const hiddenField = forms[0]?.fields.find((f) => f.name === '_token');

      expect(hiddenField).toBeDefined();
      expect(hiddenField?.hidden).toBe(true);
    });

    it('should identify required fields', () => {
      const forms = extractForms($);
      const nameField = forms[0]?.fields.find((f) => f.name === 'name');

      expect(nameField?.required).toBe(true);
    });

    it('should extract field labels', () => {
      const forms = extractForms($);
      const nameField = forms[0]?.fields.find((f) => f.name === 'name');

      expect(nameField?.label).toBe('Name');
    });
  });

  describe('Media Extraction', () => {
    it('should extract images', () => {
      const media = extractMedia($, 'https://example.com');
      const images = media.filter((m) => m.type === 'image');

      expect(images.length).toBeGreaterThan(0);
    });

    it('should extract image alt text', () => {
      const media = extractMedia($, 'https://example.com');
      const photo = media.find((m) => m.alt === 'A beautiful photo');

      expect(photo).toBeDefined();
    });

    it('should extract image dimensions', () => {
      const media = extractMedia($, 'https://example.com');
      const photo = media.find((m) => m.alt === 'A beautiful photo');

      expect(photo?.width).toBe(800);
      expect(photo?.height).toBe(600);
    });

    it('should extract videos', () => {
      const media = extractMedia($, 'https://example.com');
      const videos = media.filter((m) => m.type === 'video');

      expect(videos.length).toBe(1);
    });

    it('should extract audio', () => {
      const media = extractMedia($, 'https://example.com');
      const audio = media.filter((m) => m.type === 'audio');

      expect(audio.length).toBe(1);
    });
  });

  describe('Metadata Extraction', () => {
    it('should extract meta description', () => {
      const metadata = extractMetadata($);

      expect(metadata.description).toBe('A complex page for testing extraction');
    });

    it('should extract meta keywords', () => {
      const metadata = extractMetadata($);

      expect(metadata.keywords).toContain('test');
      expect(metadata.keywords).toContain('html');
    });

    it('should extract canonical URL', () => {
      const metadata = extractMetadata($);

      expect(metadata.canonical).toBe('https://example.com/complex-page');
    });

    it('should extract language', () => {
      const metadata = extractMetadata($);

      expect(metadata.lang).toBe('en');
    });

    it('should extract Open Graph data', () => {
      const metadata = extractMetadata($);

      expect(metadata.og?.title).toBe('OG Test Title');
      expect(metadata.og?.description).toBe('OG description for sharing');
    });
  });

  describe('Main Content Extraction', () => {
    it('should strip navigation', () => {
      const $main = getMainContent($, { stripNavigation: true });
      const text = $main.text();

      // Navigation should be removed
      expect(text).not.toContain('Products'); // Nav link
      expect(text).toContain('Main Article Title'); // Main content
    });

    it('should optionally strip footer', () => {
      const $main = getMainContent($, { stripNavigation: true, stripFooters: true });
      const text = $main.text();

      expect(text).not.toContain('All rights reserved');
    });

    it('should preserve main content', () => {
      const $main = getMainContent($, { stripNavigation: true });
      const text = $main.text();

      expect(text).toContain('Main Article Title');
      expect(text).toContain('Section One');
      expect(text).toContain('blockquote');
    });
  });

  describe('Plain Text Extraction', () => {
    it('should extract plain text content', () => {
      const text = extractPlainText($, { format: 'text' });

      expect(text).toContain('Main Article Title');
      expect(text).not.toContain('<h1>');
      expect(text).not.toContain('</');
    });

    it('should filter by keywords', () => {
      const text = extractPlainText($, {
        format: 'text',
        keywords: ['Product'],
        keywordMode: 'any',
      });

      expect(text).toContain('Product');
      // Non-matching content should be filtered
    });
  });

  describe('Full Extraction', () => {
    it('should extract everything with extractFromHtml', () => {
      const result = extractFromHtml(html, 'https://example.com', {
        format: 'json',
        includeMedia: true,
      });

      expect(result.links.length).toBeGreaterThan(0);
      expect(result.forms.length).toBe(1);
      expect(result.media.length).toBeGreaterThan(0);
      expect(result.metadata.description).toBeDefined();
    });

    it('should respect selector filters', () => {
      const result = extractFromHtml(html, 'https://example.com', {
        format: 'text',
        selectors: ['article'],
      });

      // Should only include article content
      expect(typeof result.content).toBe('string');
      expect(result.content).toContain('Main Article');
    });
  });
});

describe('Extraction - Edge Cases', () => {
  it('should handle empty HTML', () => {
    const $ = cheerio.load('');
    const links = extractLinks($, 'https://example.com');
    const forms = extractForms($);
    const media = extractMedia($, 'https://example.com');

    expect(links.length).toBe(0);
    expect(forms.length).toBe(0);
    expect(media.length).toBe(0);
  });

  it('should handle HTML without head', () => {
    const $ = cheerio.load('<body><p>Content</p></body>');
    const metadata = extractMetadata($);

    expect(metadata.description).toBeUndefined();
  });

  it('should handle malformed links', () => {
    const $ = cheerio.load('<a href="">Empty</a><a>No href</a>');
    const links = extractLinks($, 'https://example.com');

    expect(links.length).toBe(0); // Empty/missing hrefs should be skipped
  });

  it('should handle data-src lazy loading images', () => {
    const $ = cheerio.load('<img src="placeholder.jpg" data-src="real-image.jpg" alt="Lazy">');
    const media = extractMedia($, 'https://example.com');

    expect(media.length).toBe(1);
    expect(media[0]?.src).toContain('real-image.jpg');
  });
});
