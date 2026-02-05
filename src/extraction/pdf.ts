/**
 * Light Browser - PDF Extraction
 *
 * Extracts text, metadata, and structure from PDF documents.
 */

// PDF parser class type (pdf-parse v2.x)
interface PdfParseResult {
  text: string;
  total: number;
  pages: Array<{ text: string; num: number }>;
}

interface PdfParseClass {
  new (options: { data?: Buffer }): {
    load(): Promise<void>;
    getText(): Promise<PdfParseResult>;
    getInfo(): { numPages?: number; info?: Record<string, string> };
  };
}

// Import pdf-parse directly
async function getPdfParseClass(): Promise<PdfParseClass> {
  const mod = await import('pdf-parse');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PdfParse = (mod as any).PDFParse as PdfParseClass;
  if (!PdfParse) {
    throw new Error('Failed to load pdf-parse module');
  }
  return PdfParse;
}
import type { StructuredContent, PageMetadata } from '../core/types.ts';

export interface PdfExtractResult {
  /** Extracted text content */
  text: string;
  /** Structured content with page markers */
  content: StructuredContent[];
  /** Number of pages */
  pageCount: number;
  /** PDF metadata */
  metadata: PdfMetadata;
}

export interface PdfMetadata extends PageMetadata {
  /** PDF title */
  title?: string;
  /** PDF author */
  author?: string;
  /** PDF subject */
  subject?: string;
  /** PDF keywords */
  keywords?: string[];
  /** PDF creator application */
  creator?: string;
  /** PDF producer */
  producer?: string;
  /** Creation date */
  creationDate?: string;
  /** Modification date */
  modDate?: string;
  /** Number of pages */
  pageCount?: number;
}

/**
 * Extract text and metadata from a PDF buffer
 */
export async function extractFromPdf(
  buffer: Buffer,
  options?: {
    /** Maximum pages to extract (default: all) */
    maxPages?: number;
    /** Page range to extract (e.g., "1-5", "1,3,5") */
    pageRange?: string;
  }
): Promise<PdfExtractResult> {
  const PdfParse = await getPdfParseClass();
  const parser = new PdfParse({ data: buffer });
  await parser.load();

  const textResult = await parser.getText();
  const pdfInfo = parser.getInfo();

  // Parse page range if specified
  let pageFilter: Set<number> | null = null;
  if (options?.pageRange) {
    pageFilter = parsePageRange(options.pageRange);
  }

  // Build structured content with page markers
  const content: StructuredContent[] = [];
  let fullText = '';
  const pageCount = textResult.total || pdfInfo.numPages || 1;

  // Process pages from the result
  const pages = textResult.pages || [];
  for (const page of pages) {
    const pageNum = page.num;

    // Skip pages not in range
    if (pageFilter && !pageFilter.has(pageNum)) {
      continue;
    }

    // Apply max pages limit
    if (options?.maxPages && pageNum > options.maxPages) {
      continue;
    }

    const pageText = page.text?.trim();
    if (!pageText) continue;

    // Add page marker
    content.push({
      type: 'heading',
      level: 2,
      text: `[Page ${pageNum}]`,
    });

    // Split page into paragraphs
    const paragraphs = pageText.split(/\n\n+/).filter((p: string) => p.trim());
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (trimmed) {
        content.push({
          type: 'paragraph',
          text: trimmed,
        });
        fullText += trimmed + '\n\n';
      }
    }
  }

  // Extract metadata
  const info = pdfInfo.info || {};
  const metadata: PdfMetadata = {
    title: info.Title || undefined,
    author: info.Author || undefined,
    subject: info.Subject || undefined,
    keywords: info.Keywords ? info.Keywords.split(/[,;]/).map((k: string) => k.trim()) : undefined,
    creator: info.Creator || undefined,
    producer: info.Producer || undefined,
    creationDate: info.CreationDate || undefined,
    modDate: info.ModDate || undefined,
    pageCount,
  };

  return {
    text: fullText.trim() || textResult.text,
    content,
    pageCount,
    metadata,
  };
}

/**
 * Extract text from a PDF URL
 */
export async function extractFromPdfUrl(
  url: string,
  options?: {
    timeout?: number;
    userAgent?: string;
    maxPages?: number;
    pageRange?: string;
  }
): Promise<PdfExtractResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeout || 30000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': options?.userAgent || 'LightBrowser/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/pdf') && !url.toLowerCase().endsWith('.pdf')) {
      throw new Error('URL does not appear to be a PDF');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return extractFromPdf(buffer, {
      maxPages: options?.maxPages,
      pageRange: options?.pageRange,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Check if a URL points to a PDF
 */
export function isPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

/**
 * Parse a page range string into a set of page numbers
 * Supports formats like "1-5", "1,3,5", "1-3,5,7-9"
 */
function parsePageRange(range: string): Set<number> {
  const pages = new Set<number>();
  const parts = range.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const rangeParts = trimmed.split('-');
      const start = parseInt(rangeParts[0]?.trim() ?? '', 10);
      const end = parseInt(rangeParts[1]?.trim() ?? '', 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          pages.add(i);
        }
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) {
        pages.add(num);
      }
    }
  }

  return pages;
}

/**
 * Format PDF metadata as a string
 */
export function formatPdfMetadata(metadata: PdfMetadata): string {
  const lines: string[] = [];

  if (metadata.title) lines.push(`Title: ${metadata.title}`);
  if (metadata.author) lines.push(`Author: ${metadata.author}`);
  if (metadata.subject) lines.push(`Subject: ${metadata.subject}`);
  if (metadata.pageCount) lines.push(`Pages: ${metadata.pageCount}`);
  if (metadata.creator) lines.push(`Creator: ${metadata.creator}`);
  if (metadata.creationDate) lines.push(`Created: ${metadata.creationDate}`);

  return lines.join('\n');
}
