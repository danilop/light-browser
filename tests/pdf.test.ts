/**
 * Light Browser - PDF Extraction Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { isPdfUrl, extractFromPdf, formatPdfMetadata } from '../src/extraction/pdf.ts';
import { unlink } from 'node:fs/promises';

// Minimal valid PDF with text content ("Hello World")
// Base64 must be on single line to avoid corruption
const MINIMAL_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NCA+PgpzdHJlYW0KQlQKL0YxIDI0IFRmCjEwMCA3MDAgVGQKKEhlbGxvIFdvcmxkKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNzAgMDAwMDAgbiAKMDAwMDAwMDM2MyAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ0NQolJUVPRgo=';

const testPdfPath = '/tmp/light-browser-test-pdf.pdf';

beforeAll(async () => {
  // Write test PDF
  const pdfBuffer = Buffer.from(MINIMAL_PDF_BASE64, 'base64');
  await Bun.write(testPdfPath, pdfBuffer);
});

afterAll(async () => {
  try {
    await unlink(testPdfPath);
  } catch {
    // Ignore
  }
});

describe('PDF URL Detection', () => {
  it('should detect PDF URLs', () => {
    expect(isPdfUrl('https://example.com/document.pdf')).toBe(true);
    expect(isPdfUrl('https://example.com/document.PDF')).toBe(true);
    expect(isPdfUrl('https://example.com/path/to/file.pdf')).toBe(true);
  });

  it('should not detect non-PDF URLs', () => {
    expect(isPdfUrl('https://example.com/page.html')).toBe(false);
    expect(isPdfUrl('https://example.com/')).toBe(false);
    expect(isPdfUrl('https://example.com/api/pdf')).toBe(false);
  });

  it('should handle invalid URLs', () => {
    expect(isPdfUrl('not-a-url')).toBe(false);
    expect(isPdfUrl('')).toBe(false);
  });
});

describe('PDF Extraction', () => {
  it('extracts text from PDF buffer', async () => {
    const pdfBuffer = Buffer.from(MINIMAL_PDF_BASE64, 'base64');
    const result = await extractFromPdf(pdfBuffer);

    expect(result.text).toContain('Hello World');
    expect(result.pageCount).toBe(1);
  });

  it('returns metadata with page count', async () => {
    const pdfBuffer = Buffer.from(MINIMAL_PDF_BASE64, 'base64');
    const result = await extractFromPdf(pdfBuffer);

    expect(result.metadata).toBeDefined();
    expect(typeof result.metadata.pageCount).toBe('number');
    expect(result.metadata.pageCount).toBe(1);
  });
});

describe('PDF Metadata Formatting', () => {
  it('formats metadata as markdown', () => {
    const metadata = {
      title: 'Test Document',
      author: 'Test Author',
      pageCount: 5,
      creationDate: '2024-01-01',
    };

    const formatted = formatPdfMetadata(metadata);

    expect(formatted).toContain('Test Document');
    expect(formatted).toContain('Test Author');
    expect(formatted).toContain('Pages: 5');
  });
});
