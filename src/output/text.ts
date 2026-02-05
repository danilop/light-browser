/**
 * Light Browser - Plain Text Output Formatter
 *
 * Converts extracted page content to clean, readable plain text.
 * Minimal formatting, suitable for piping to other tools.
 */

import type { PageSnapshot, Link } from '../core/types.ts';

export interface TextOptions {
  /** Include page title */
  includeTitle: boolean;
  /** Include link references at the end */
  includeLinks: boolean;
  /** Maximum links to include */
  maxLinks: number;
  /** Word wrap width (0 = no wrap) */
  wrapWidth: number;
}

const DEFAULT_OPTIONS: TextOptions = {
  includeTitle: true,
  includeLinks: true,
  maxLinks: 50,
  wrapWidth: 0,
};

/**
 * Word wrap text at specified width
 */
function wrapText(text: string, width: number): string {
  if (width <= 0) return text;

  const lines: string[] = [];
  const paragraphs = text.split(/\n\n+/);

  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    lines.push(''); // Paragraph break
  }

  return lines.join('\n').trim();
}

/**
 * Format a complete page snapshot as plain text
 */
export function formatAsText(snapshot: PageSnapshot, options: Partial<TextOptions> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  // Title
  if (opts.includeTitle && snapshot.title) {
    lines.push(snapshot.title.toUpperCase());
    lines.push('='.repeat(Math.min(snapshot.title.length, 60)));
    lines.push('');
  }

  // URL
  lines.push(`Source: ${snapshot.url}`);
  lines.push('');

  // Content
  if (typeof snapshot.content === 'string') {
    // Already plain text
    let text = snapshot.content;
    if (opts.wrapWidth > 0) {
      text = wrapText(text, opts.wrapWidth);
    }
    lines.push(text);
  } else {
    // Structured content - convert to plain text
    for (const item of snapshot.content) {
      switch (item.type) {
        case 'heading':
          lines.push('');
          lines.push((item.text ?? '').toUpperCase());
          lines.push('-'.repeat(Math.min((item.text ?? '').length, 40)));
          break;
        case 'paragraph':
          lines.push('');
          lines.push(item.text ?? '');
          break;
        case 'list':
          lines.push('');
          for (const child of item.children ?? []) {
            lines.push('  * ' + (child.text ?? ''));
          }
          break;
        case 'blockquote':
          lines.push('');
          lines.push('  | ' + (item.text ?? '').replace(/\n/g, '\n  | '));
          break;
        case 'code':
          lines.push('');
          lines.push('  ' + (item.text ?? '').replace(/\n/g, '\n  '));
          break;
      }
    }
  }

  // Links
  if (opts.includeLinks && snapshot.links.length > 0) {
    lines.push('');
    lines.push('');
    lines.push('LINKS');
    lines.push('-----');

    const linksToShow = snapshot.links.slice(0, opts.maxLinks);
    for (const link of linksToShow) {
      lines.push(`[${link.refNumber}] ${link.text}`);
      lines.push(`    ${link.resolvedUrl}`);
    }

    if (snapshot.links.length > opts.maxLinks) {
      lines.push(`... and ${snapshot.links.length - opts.maxLinks} more links`);
    }
  }

  // Truncation notice
  if (snapshot.truncated && snapshot.truncationInfo) {
    lines.push('');
    lines.push(`[Content truncated: ${snapshot.truncationInfo.itemsOmitted} items omitted]`);
  }

  return lines.join('\n');
}

/**
 * Format links only (for link extraction mode)
 */
export function formatLinks(links: Link[]): string {
  const lines: string[] = [];

  for (const link of links) {
    lines.push(`${link.resolvedUrl}\t${link.text}\t${link.type}`);
  }

  return lines.join('\n');
}
