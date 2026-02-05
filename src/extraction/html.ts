/**
 * Light Browser - HTML Content Extraction
 *
 * Extracts structured content from HTML including:
 * - Text content with semantic structure
 * - Links with classification
 * - Forms and form fields
 * - Media references
 * - Page metadata
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type {
  Link,
  Form,
  FormField,
  MediaRef,
  PageMetadata,
  StructuredContent,
  ExtractionOptions,
} from '../core/types.ts';

type AnyNode = ReturnType<CheerioAPI> extends cheerio.Cheerio<infer T> ? T : never;
type CheerioSelection = cheerio.Cheerio<AnyNode>;

/**
 * Selectors for elements to exclude by default
 */
const DEFAULT_EXCLUDE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'iframe',
  '[hidden]',
  '[aria-hidden="true"]',
];

/**
 * Navigation-related selectors to optionally exclude
 */
const NAVIGATION_SELECTORS = [
  'nav',
  'header',
  '[role="navigation"]',
  '[role="banner"]',
  '.nav',
  '.navbar',
  '.navigation',
  '.header',
  '#nav',
  '#navbar',
  '#navigation',
  '#header',
];

/**
 * Footer-related selectors to optionally exclude
 */
const FOOTER_SELECTORS = ['footer', '[role="contentinfo"]', '.footer', '#footer'];

/**
 * Extract all links from the page
 */
export function extractLinks($: CheerioAPI, baseUrl: string): Link[] {
  const links: Link[] = [];
  let refNumber = 1;

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') ?? '';
    const text = $el.text().trim();

    // Skip empty or javascript links
    if (!href || href.startsWith('javascript:') || href === '#') {
      return;
    }

    // Resolve relative URLs
    let resolvedUrl = href;
    try {
      resolvedUrl = new URL(href, baseUrl).href;
    } catch {
      // Keep original if URL parsing fails
    }

    // Classify the link
    let type: Link['type'] = 'content';
    const download = $el.attr('download');

    if (download !== undefined) {
      type = 'download';
    } else if (href.startsWith('#')) {
      type = 'anchor';
    } else {
      try {
        const linkUrl = new URL(resolvedUrl);
        const pageUrl = new URL(baseUrl);
        if (linkUrl.hostname !== pageUrl.hostname) {
          type = 'external';
        }
      } catch {
        // Keep as content link
      }
    }

    // Check if it's in a nav element
    if ($el.closest('nav, [role="navigation"]').length > 0) {
      type = 'navigation';
    }

    links.push({
      text: text || href,
      href,
      resolvedUrl,
      type,
      refNumber: refNumber++,
    });
  });

  return links;
}

/**
 * Extract all forms from the page
 */
export function extractForms($: CheerioAPI): Form[] {
  const forms: Form[] = [];

  $('form').each((index, el) => {
    const $form = $(el);
    const fields: FormField[] = [];

    // Extract form fields
    $form.find('input, textarea, select').each((_, fieldEl) => {
      const $field = $(fieldEl);
      const name = $field.attr('name') ?? '';
      const type = $field.attr('type') ?? $field.prop('tagName')?.toLowerCase() ?? 'text';
      const value = ($field.val() as string) ?? '';
      const required = $field.attr('required') !== undefined;
      const hidden = type === 'hidden';

      // Find label
      const id = $field.attr('id');
      let label: string | undefined;
      if (id) {
        label = $(`label[for="${id}"]`).text().trim() || undefined;
      }
      if (!label) {
        // Check for wrapping label
        label = $field.closest('label').text().trim() || undefined;
      }

      // Get options for select elements
      let options: FormField['options'];
      if ($field.prop('tagName')?.toLowerCase() === 'select') {
        options = [];
        $field.find('option').each((_, optEl) => {
          const $opt = $(optEl);
          options!.push({
            value: $opt.attr('value') ?? $opt.text().trim(),
            text: $opt.text().trim(),
            selected: $opt.attr('selected') !== undefined,
          });
        });
      }

      fields.push({
        name,
        type,
        value,
        label,
        required,
        options,
        hidden,
      });
    });

    forms.push({
      id: $form.attr('id') ?? $form.attr('name') ?? `form-${index}`,
      action: $form.attr('action') ?? '',
      method: ($form.attr('method')?.toUpperCase() as 'GET' | 'POST') ?? 'GET',
      fields,
    });
  });

  return forms;
}

/**
 * Extract media references (images, videos, audio)
 */
export function extractMedia($: CheerioAPI, baseUrl: string): MediaRef[] {
  const media: MediaRef[] = [];
  let refNumber = 1;

  // Images
  $('img[src]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') ?? '';
    const dataSrc = $el.attr('data-src') ?? $el.attr('data-lazy-src');

    let resolvedSrc = dataSrc ?? src;
    try {
      resolvedSrc = new URL(resolvedSrc, baseUrl).href;
    } catch {
      // Keep original
    }

    media.push({
      type: 'image',
      src: resolvedSrc,
      alt: $el.attr('alt'),
      title: $el.attr('title'),
      width: parseInt($el.attr('width') ?? '0', 10) || undefined,
      height: parseInt($el.attr('height') ?? '0', 10) || undefined,
      refNumber: refNumber++,
    });
  });

  // Videos
  $('video').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') ?? $el.find('source').first().attr('src') ?? '';

    let resolvedSrc = src;
    try {
      resolvedSrc = new URL(src, baseUrl).href;
    } catch {
      // Keep original
    }

    media.push({
      type: 'video',
      src: resolvedSrc,
      title: $el.attr('title'),
      width: parseInt($el.attr('width') ?? '0', 10) || undefined,
      height: parseInt($el.attr('height') ?? '0', 10) || undefined,
      refNumber: refNumber++,
    });
  });

  // Audio
  $('audio').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') ?? $el.find('source').first().attr('src') ?? '';

    let resolvedSrc = src;
    try {
      resolvedSrc = new URL(src, baseUrl).href;
    } catch {
      // Keep original
    }

    media.push({
      type: 'audio',
      src: resolvedSrc,
      title: $el.attr('title'),
      refNumber: refNumber++,
    });
  });

  return media;
}

/**
 * Extract page metadata
 */
export function extractMetadata($: CheerioAPI): PageMetadata {
  const metadata: PageMetadata = {};

  // Description
  const description = $('meta[name="description"]').attr('content');
  if (description) {
    metadata.description = description;
  }

  // Keywords
  const keywords = $('meta[name="keywords"]').attr('content');
  if (keywords) {
    metadata.keywords = keywords.split(',').map((k) => k.trim());
  }

  // Canonical URL
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) {
    metadata.canonical = canonical;
  }

  // Language
  const lang = $('html').attr('lang');
  if (lang) {
    metadata.lang = lang;
  }

  // Charset
  const charset =
    $('meta[charset]').attr('charset') ??
    $('meta[http-equiv="Content-Type"]')
      .attr('content')
      ?.match(/charset=([^;]+)/)?.[1];
  if (charset) {
    metadata.charset = charset;
  }

  // Open Graph
  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr('property')?.replace('og:', '') ?? '';
    const content = $(el).attr('content') ?? '';
    if (property && content) {
      og[property] = content;
    }
  });
  if (Object.keys(og).length > 0) {
    metadata.og = og;
  }

  return metadata;
}

/**
 * Build a map of link hrefs and text to their reference numbers
 */
function buildLinkRefMap(links: Link[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const link of links) {
    // Map by both href and text for reliable matching
    if (link.refNumber !== undefined) {
      map.set(link.href, link.refNumber);
      if (link.text) {
        map.set(link.text.toLowerCase(), link.refNumber);
      }
    }
  }
  return map;
}

/**
 * Extract text from an element, adding inline link references [n]
 */
function getTextWithLinkRefs(
  $: CheerioAPI,
  $el: CheerioSelection,
  linkRefMap: Map<string, number>,
  mediaRefMap: Map<string, number>
): string {
  let result = '';

  $el.contents().each((_, node) => {
    if (node.type === 'text') {
      result += $(node).text();
      return;
    }

    if (node.type !== 'tag') return;

    const $node = $(node);
    const tagName = (node as { tagName?: string }).tagName?.toLowerCase();

    if (tagName === 'a') {
      const href = $node.attr('href') ?? '';
      const text = $node.text().trim();
      const refNum = linkRefMap.get(href) || linkRefMap.get(text.toLowerCase());
      if (refNum) {
        result += `${text} [${refNum}]`;
      } else {
        result += text;
      }
    } else if (tagName === 'img') {
      const src = $node.attr('src') ?? '';
      const alt = $node.attr('alt') ?? 'image';
      const refNum = mediaRefMap.get(src);
      if (refNum) {
        result += `[${alt}] [img:${refNum}]`;
      } else {
        result += `[${alt}]`;
      }
    } else {
      // Recurse into child elements
      result += getTextWithLinkRefs($, $node, linkRefMap, mediaRefMap);
    }
  });

  return result;
}

/**
 * Extract text content as a structured tree
 */
export function extractStructuredContent(
  $: CheerioAPI,
  $root: CheerioSelection,
  options: ExtractionOptions,
  links?: Link[],
  media?: MediaRef[]
): StructuredContent[] {
  const content: StructuredContent[] = [];
  const linkRefMap = links ? buildLinkRefMap(links) : new Map<string, number>();
  const mediaRefMap = new Map<string, number>();
  if (media) {
    media.forEach((m, i) => mediaRefMap.set(m.src, i + 1));
  }

  // Build exclude selector
  let excludeSelector = DEFAULT_EXCLUDE_SELECTORS.join(', ');
  if (options.excludeSelectors) {
    excludeSelector += ', ' + options.excludeSelectors.join(', ');
  }

  // Remove excluded elements
  $root.find(excludeSelector).remove();

  // Process headings
  $root.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const $el = $(el);
    const level = parseInt(el.tagName.charAt(1), 10);
    const text = getTextWithLinkRefs($, $el, linkRefMap, mediaRefMap).trim();
    if (text) {
      content.push({ type: 'heading', level, text });
    }
  });

  // Process paragraphs
  $root.find('p').each((_, el) => {
    const text = getTextWithLinkRefs($, $(el), linkRefMap, mediaRefMap).trim();
    if (text) {
      content.push({ type: 'paragraph', text });
    }
  });

  // Process lists
  $root.find('ul, ol').each((_, el) => {
    const $el = $(el);
    const items: StructuredContent[] = [];
    $el.children('li').each((_, liEl) => {
      const text = getTextWithLinkRefs($, $(liEl), linkRefMap, mediaRefMap).trim();
      if (text) {
        items.push({ type: 'paragraph', text });
      }
    });
    if (items.length > 0) {
      content.push({ type: 'list', children: items });
    }
  });

  // Process blockquotes
  $root.find('blockquote').each((_, el) => {
    const text = getTextWithLinkRefs($, $(el), linkRefMap, mediaRefMap).trim();
    if (text) {
      content.push({ type: 'blockquote', text });
    }
  });

  // Process code blocks
  $root.find('pre, code').each((_, el) => {
    const text = $(el).text().trim(); // Don't add refs to code blocks
    if (text) {
      content.push({ type: 'code', text });
    }
  });

  return content;
}

/**
 * Get the main content area of the page
 */
export function getMainContent(
  $: CheerioAPI,
  options: { stripNavigation?: boolean; stripFooters?: boolean }
): CheerioSelection {
  // Clone the body to avoid modifying the original
  const $body = $('body').clone();

  // Try to find main content area
  let $main = $body.find('main, [role="main"], article, .content, #content, .post, .article');

  // If no main content area, use body
  if ($main.length === 0) {
    $main = $body;
  } else {
    $main = $main.first();
  }

  // Remove navigation if requested
  if (options.stripNavigation !== false) {
    $main.find(NAVIGATION_SELECTORS.join(', ')).remove();
  }

  // Remove footer if requested
  if (options.stripFooters) {
    $main.find(FOOTER_SELECTORS.join(', ')).remove();
  }

  return $main;
}

/**
 * Extract plain text content from HTML with inline link references
 */
export function extractPlainText(
  $: CheerioAPI,
  options: ExtractionOptions,
  links?: Link[],
  media?: MediaRef[]
): string {
  const $main = getMainContent($, {
    stripNavigation: true,
    stripFooters: options.excludeSelectors?.some((s) => FOOTER_SELECTORS.includes(s)),
  });

  // Remove script and style tags
  $main.find('script, style, noscript').remove();

  // Build reference maps for inline refs
  const linkRefMap = links ? buildLinkRefMap(links) : new Map<string, number>();
  const mediaRefMap = new Map<string, number>();
  if (media) {
    media.forEach((m, i) => mediaRefMap.set(m.src, i + 1));
  }

  // Replace <a> tags with text [n] format
  $main.find('a').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href') ?? '';
    const text = $a.text().trim();
    const refNum = linkRefMap.get(href) || linkRefMap.get(text.toLowerCase());
    if (refNum) {
      $a.replaceWith(`${text} [${refNum}]`);
    }
  });

  // Replace <img> tags with [alt] [img:n] format
  $main.find('img').each((_, el) => {
    const $img = $(el);
    const src = $img.attr('src') ?? '';
    const alt = $img.attr('alt') ?? 'image';
    const refNum = mediaRefMap.get(src);
    if (refNum) {
      $img.replaceWith(`[${alt}] [img:${refNum}]`);
    } else {
      $img.replaceWith(`[${alt}]`);
    }
  });

  // Add newlines around block elements to preserve structure
  $main.find('p, div, h1, h2, h3, h4, h5, h6, li, tr, br').each((_, el) => {
    const $el = $(el);
    $el.before('\n');
    $el.after('\n');
  });

  // Get text
  let text = $main.text();

  // Normalize whitespace (preserve paragraph breaks)
  text = text
    .split(/\n\s*\n/) // Split on paragraph breaks
    .map((para) => para.replace(/\s+/g, ' ').trim()) // Normalize each paragraph
    .filter((para) => para.length > 0) // Remove empty paragraphs
    .join('\n\n'); // Rejoin with double newlines

  // Apply keyword filter if specified
  if (options.keywords && options.keywords.length > 0) {
    const paragraphs = text.split(/\n\n+/);
    const filtered = paragraphs.filter((p) => {
      const lowerP = p.toLowerCase();
      if (options.keywordMode === 'all') {
        return options.keywords!.every((k) => lowerP.includes(k.toLowerCase()));
      }
      return options.keywords!.some((k) => lowerP.includes(k.toLowerCase()));
    });
    text = filtered.join('\n\n');
  }

  return text;
}

/**
 * Main extraction function
 */
export function extractFromHtml(
  html: string,
  url: string,
  options: ExtractionOptions
): {
  content: StructuredContent[] | string;
  links: Link[];
  forms: Form[];
  media: MediaRef[];
  metadata: PageMetadata;
} {
  const $ = cheerio.load(html);

  // Apply selector filters if specified
  let $root: CheerioSelection;
  if (options.selectors && options.selectors.length > 0) {
    $root = $(options.selectors.join(', '));
  } else if (options.readabilityMode) {
    $root = getMainContent($, {
      stripNavigation: true,
      stripFooters: true,
    });
  } else {
    $root = getMainContent($, {
      stripNavigation: true,
      stripFooters: false,
    });
  }

  // Extract links and media first (needed for inline references)
  const links = extractLinks($, url);
  const media = options.includeMedia !== false ? extractMedia($, url) : [];

  // Extract content based on format
  let content: StructuredContent[] | string;
  if (options.format === 'json') {
    content = extractStructuredContent($, $root, options, links, media);
  } else {
    content = extractPlainText($, options, links, media);
  }

  return {
    content,
    links,
    forms: extractForms($),
    media,
    metadata: extractMetadata($),
  };
}
