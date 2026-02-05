/**
 * Light Browser - Markdown Output Formatter
 *
 * Converts extracted page content to clean, readable Markdown format.
 * Supports numbered links, tables, code blocks, and media references.
 */

import * as cheerio from 'cheerio';
import type { Link, PageSnapshot } from '../core/types.ts';

export interface MarkdownOptions {
  /** How to display links: numbered references or inline */
  linkStyle: 'numbered' | 'inline';
  /** Include page metadata at the top */
  includeMetadata: boolean;
  /** Include form information */
  includeForms: boolean;
  /** Include media references */
  includeMedia: boolean;
  /** Maximum width for text wrapping (0 = no wrap) */
  maxWidth: number;
}

const DEFAULT_OPTIONS: MarkdownOptions = {
  linkStyle: 'numbered',
  includeMetadata: true,
  includeForms: false,
  includeMedia: true,
  maxWidth: 0,
};

/**
 * Convert HTML content to Markdown
 */
export function htmlToMarkdown(
  html: string,
  _baseUrl: string,
  links: Link[],
  options: Partial<MarkdownOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const $ = cheerio.load(html);
  const lines: string[] = [];

  // Remove unwanted elements
  $('script, style, noscript, svg, [hidden]').remove();

  // Process the body
  processNode($, $('body'), lines, links, opts, 0);

  // Add link references at the end if using numbered style
  if (opts.linkStyle === 'numbered' && links.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Links');
    lines.push('');
    for (const link of links) {
      lines.push(`[${link.refNumber}]: ${link.resolvedUrl} "${escapeMarkdown(link.text)}"`);
    }
  }

  return lines.join('\n').trim();
}

/**
 * Process a DOM node and its children
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function processNode(
  $: cheerio.CheerioAPI,
  $node: cheerio.Cheerio<any>,
  lines: string[],
  links: Link[],
  options: MarkdownOptions,
  _depth: number
): void {
  $node.contents().each((_, el) => {
    if (el.type === 'text') {
      const text = $(el).text().trim();
      if (text && lines.length > 0) {
        // Append to last line if it's not a block element
        const lastLine = lines[lines.length - 1];
        if (lastLine && !lastLine.endsWith('\n') && !lastLine.match(/^#{1,6}\s/)) {
          lines[lines.length - 1] = lastLine + ' ' + text;
        } else if (text) {
          lines.push(text);
        }
      } else if (text) {
        lines.push(text);
      }
      return;
    }

    if (el.type !== 'tag') return;

    const $el = $(el);
    const tagName = el.tagName.toLowerCase();

    switch (tagName) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const level = parseInt(tagName.charAt(1), 10);
        const text = $el.text().trim();
        if (text) {
          lines.push('');
          lines.push('#'.repeat(level) + ' ' + text);
          lines.push('');
        }
        break;
      }

      case 'p': {
        const text = getInlineText($, $el, links, options);
        if (text) {
          lines.push('');
          lines.push(text);
        }
        break;
      }

      case 'br': {
        lines.push('');
        break;
      }

      case 'hr': {
        lines.push('');
        lines.push('---');
        lines.push('');
        break;
      }

      case 'ul':
      case 'ol': {
        lines.push('');
        $el.children('li').each((i, liEl) => {
          const prefix = tagName === 'ol' ? `${i + 1}. ` : '- ';
          const text = getInlineText($, $(liEl), links, options);
          if (text) {
            lines.push(prefix + text);
          }
        });
        lines.push('');
        break;
      }

      case 'blockquote': {
        const text = getInlineText($, $el, links, options);
        if (text) {
          lines.push('');
          lines.push('> ' + text.replace(/\n/g, '\n> '));
          lines.push('');
        }
        break;
      }

      case 'pre': {
        const code = $el.find('code').text() || $el.text();
        const lang =
          $el
            .find('code')
            .attr('class')
            ?.match(/language-(\w+)/)?.[1] ?? '';
        lines.push('');
        lines.push('```' + lang);
        lines.push(code.trim());
        lines.push('```');
        lines.push('');
        break;
      }

      case 'code': {
        // Inline code handled in getInlineText
        if ($el.parent().prop('tagName')?.toLowerCase() !== 'pre') {
          const text = '`' + $el.text().trim() + '`';
          lines.push(text);
        }
        break;
      }

      case 'table': {
        lines.push('');
        processTable($, $el, lines);
        lines.push('');
        break;
      }

      case 'img': {
        const alt = $el.attr('alt') ?? '';
        const src = $el.attr('src') ?? '';
        if (src) {
          try {
            const resolvedSrc = new URL(src, 'https://example.com').href;
            lines.push(`![${escapeMarkdown(alt)}](${resolvedSrc})`);
          } catch {
            lines.push(`![${escapeMarkdown(alt)}](${src})`);
          }
        }
        break;
      }

      case 'a': {
        // Links are handled in getInlineText
        break;
      }

      case 'div':
      case 'section':
      case 'article':
      case 'main':
      case 'aside':
      case 'header':
      case 'footer':
      case 'nav': {
        // Process children
        processNode($, $el, lines, links, options, _depth + 1);
        break;
      }

      default: {
        // For other elements, try to get text
        processNode($, $el, lines, links, options, _depth + 1);
      }
    }
  });
}

/**
 * Get inline text content with links converted to markdown
 */
function getInlineText(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<any>,
  links: Link[],
  options: MarkdownOptions
): string {
  let text = '';

  $el.contents().each((_, el) => {
    if (el.type === 'text') {
      text += $(el).text();
      return;
    }

    if (el.type !== 'tag') return;

    const $child = $(el);
    const tagName = el.tagName.toLowerCase();

    switch (tagName) {
      case 'a': {
        const href = $child.attr('href') ?? '';
        const linkText = $child.text().trim();
        const link = links.find((l) => l.text === linkText || l.href === href);

        if (options.linkStyle === 'numbered' && link) {
          text += `${linkText} [${link.refNumber}]`;
        } else if (href) {
          text += `[${linkText}](${href})`;
        } else {
          text += linkText;
        }
        break;
      }

      case 'strong':
      case 'b': {
        text += '**' + $child.text().trim() + '**';
        break;
      }

      case 'em':
      case 'i': {
        text += '*' + $child.text().trim() + '*';
        break;
      }

      case 'code': {
        text += '`' + $child.text().trim() + '`';
        break;
      }

      case 'br': {
        text += '\n';
        break;
      }

      default: {
        text += getInlineText($, $child, links, options);
      }
    }
  });

  return text.trim();
}

/**
 * Process a table element
 */
function processTable($: cheerio.CheerioAPI, $table: cheerio.Cheerio<any>, lines: string[]): void {
  const rows: string[][] = [];

  // Process header
  $table
    .find('thead tr, tr:first-child')
    .first()
    .find('th, td')
    .each((_, el) => {
      if (rows.length === 0) rows.push([]);
      rows[0]!.push($(el).text().trim());
    });

  // Process body
  $table.find('tbody tr, tr').each((i, el) => {
    if (i === 0 && rows.length > 0 && rows[0]!.length > 0) {
      // Skip first row if we already got headers
      const firstRowText = $(el).find('th, td').first().text().trim();
      if (rows[0]![0] === firstRowText) return;
    }

    const row: string[] = [];
    $(el)
      .find('th, td')
      .each((_, cell) => {
        row.push($(cell).text().trim());
      });
    if (row.length > 0) {
      rows.push(row);
    }
  });

  if (rows.length === 0) return;

  // Calculate column widths
  const numCols = Math.max(...rows.map((r) => r.length));
  const colWidths = new Array(numCols).fill(3);
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      if (cell) {
        colWidths[i] = Math.max(colWidths[i] ?? 3, cell.length);
      }
    }
  }

  // Output table
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const cells = row.map((cell, j) => cell.padEnd(colWidths[j] ?? 3));
    lines.push('| ' + cells.join(' | ') + ' |');

    // Add header separator after first row
    if (i === 0) {
      const separator = colWidths.map((w) => '-'.repeat(w));
      lines.push('| ' + separator.join(' | ') + ' |');
    }
  }
}

/**
 * Escape special markdown characters
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[[\]()#*_`]/g, '\\$&');
}

/**
 * Format a complete page snapshot as markdown
 */
export function formatAsMarkdown(
  snapshot: PageSnapshot,
  options: Partial<MarkdownOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  // Title
  lines.push('# ' + (snapshot.title || snapshot.url));
  lines.push('');

  // Metadata
  if (opts.includeMetadata && snapshot.metadata) {
    if (snapshot.metadata.description) {
      lines.push('> ' + snapshot.metadata.description);
      lines.push('');
    }
    lines.push(`URL: ${snapshot.url}`);
    if (snapshot.metadata.lang) {
      lines.push(`Language: ${snapshot.metadata.lang}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Content
  if (typeof snapshot.content === 'string') {
    lines.push(snapshot.content);
  } else {
    // Structured content
    for (const item of snapshot.content) {
      switch (item.type) {
        case 'heading':
          lines.push('#'.repeat(item.level ?? 1) + ' ' + item.text);
          lines.push('');
          break;
        case 'paragraph':
          lines.push(item.text ?? '');
          lines.push('');
          break;
        case 'list':
          for (const child of item.children ?? []) {
            lines.push('- ' + child.text);
          }
          lines.push('');
          break;
        case 'blockquote':
          lines.push('> ' + item.text);
          lines.push('');
          break;
        case 'code':
          lines.push('```');
          lines.push(item.text ?? '');
          lines.push('```');
          lines.push('');
          break;
      }
    }
  }

  // Links
  if (snapshot.links.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Links');
    lines.push('');
    for (const link of snapshot.links.slice(0, 50)) {
      lines.push(`[${link.refNumber}] ${link.text} - ${link.resolvedUrl}`);
    }
    if (snapshot.links.length > 50) {
      lines.push(`... and ${snapshot.links.length - 50} more links`);
    }
  }

  // Forms
  if (opts.includeForms && snapshot.forms.length > 0) {
    lines.push('');
    lines.push('## Forms');
    lines.push('');
    for (const form of snapshot.forms) {
      lines.push(`### Form: ${form.id}`);
      lines.push(`Action: ${form.action || '(same page)'}`);
      lines.push(`Method: ${form.method}`);
      lines.push('');
      lines.push('Fields:');
      for (const field of form.fields.filter((f) => !f.hidden)) {
        const label = field.label ? `${field.label}: ` : '';
        lines.push(`- ${label}${field.name} (${field.type})`);
      }
      lines.push('');
    }
  }

  // Media
  if (opts.includeMedia && snapshot.media.length > 0) {
    lines.push('');
    lines.push('## Media');
    lines.push('');
    for (const media of snapshot.media.slice(0, 20)) {
      const desc = media.alt || media.title || media.type;
      lines.push(`[${media.type}:${media.refNumber}] ${desc} - ${media.src}`);
    }
    if (snapshot.media.length > 20) {
      lines.push(`... and ${snapshot.media.length - 20} more media items`);
    }
  }

  return lines.join('\n');
}
