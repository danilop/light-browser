/**
 * Light Browser - Batch Processing
 *
 * Process multiple URLs in sequence or parallel.
 */

import { createEngine } from '../core/engine/index.ts';
import { loadConfig } from '../core/config.ts';
import { extractFromHtml } from '../extraction/html.ts';
import { extractFromPdfUrl, isPdfUrl } from '../extraction/pdf.ts';
import type { PageSnapshot, ExtractionOptions } from '../core/types.ts';
import { EngineTier } from '../core/types.ts';

export interface BatchOptions {
  /** Maximum concurrent requests (default: 1 for sequential) */
  concurrency?: number;
  /** Maximum engine tier */
  maxTier?: EngineTier;
  /** Extraction options */
  extraction?: ExtractionOptions;
  /** Progress callback */
  onProgress?: (completed: number, total: number, url: string, success: boolean) => void;
  /** Error callback */
  onError?: (url: string, error: Error) => void;
}

export interface BatchResult {
  url: string;
  success: boolean;
  snapshot?: PageSnapshot;
  error?: string;
  timing?: number;
}

/**
 * Process a batch of URLs
 */
export async function processBatch(urls: string[], options?: BatchOptions): Promise<BatchResult[]> {
  const concurrency = options?.concurrency ?? 1;
  const maxTier = options?.maxTier ?? EngineTier.PLAYWRIGHT;
  const extraction = options?.extraction ?? { format: 'markdown' as const };

  const config = loadConfig();
  const results: BatchResult[] = [];
  let completed = 0;

  // Process URLs with controlled concurrency
  const processUrl = async (url: string): Promise<BatchResult> => {
    const startTime = performance.now();
    const engine = createEngine(config, { maxTier, autoEscalate: true });

    try {
      // Handle PDF URLs
      if (isPdfUrl(url)) {
        const pdfResult = await extractFromPdfUrl(url, {
          timeout: config.browser.timeout,
        });

        const snapshot: PageSnapshot = {
          url,
          title: pdfResult.metadata.title || 'PDF Document',
          content: pdfResult.content,
          links: [],
          forms: [],
          media: [],
          metadata: pdfResult.metadata,
          tierUsed: EngineTier.CHEERIO,
          timing: {
            fetchMs: Math.round(performance.now() - startTime),
            totalMs: Math.round(performance.now() - startTime),
          },
        };

        return {
          url,
          success: true,
          snapshot,
          timing: Math.round(performance.now() - startTime),
        };
      }

      // Fetch HTML page
      const result = await engine.fetch(url);
      const extracted = extractFromHtml(result.html, result.url, extraction);

      const snapshot: PageSnapshot = {
        url: result.url,
        title: result.title,
        content: extracted.content,
        links: extracted.links,
        forms: extracted.forms,
        media: extracted.media,
        metadata: extracted.metadata,
        tierUsed: result.tierUsed,
        timing: result.timing,
      };

      return {
        url,
        success: true,
        snapshot,
        timing: Math.round(performance.now() - startTime),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options?.onError?.(url, error instanceof Error ? error : new Error(message));
      return {
        url,
        success: false,
        error: message,
        timing: Math.round(performance.now() - startTime),
      };
    } finally {
      await engine.close();
      completed++;
      options?.onProgress?.(completed, urls.length, url, true);
    }
  };

  // Process with concurrency control
  if (concurrency === 1) {
    // Sequential processing
    for (const url of urls) {
      results.push(await processUrl(url));
    }
  } else {
    // Parallel processing with concurrency limit
    const queue = [...urls];
    const inFlight: Promise<void>[] = [];

    while (queue.length > 0 || inFlight.length > 0) {
      // Start new requests up to concurrency limit
      while (queue.length > 0 && inFlight.length < concurrency) {
        const url = queue.shift()!;
        const promise = processUrl(url).then((result) => {
          results.push(result);
        });
        inFlight.push(promise);
      }

      // Wait for any request to complete
      if (inFlight.length > 0) {
        await Promise.race(inFlight);
        // Remove completed promises
        for (let i = inFlight.length - 1; i >= 0; i--) {
          const p = inFlight[i];
          if (p && (await Promise.race([p.then(() => true), Promise.resolve(false)]))) {
            inFlight.splice(i, 1);
          }
        }
      }
    }
  }

  return results;
}

/**
 * Read URLs from a file (one per line)
 */
export async function readUrlsFromFile(filePath: string): Promise<string[]> {
  const file = Bun.file(filePath);
  const content = await file.text();
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/**
 * Write batch results to a file
 */
export async function writeBatchResults(
  results: BatchResult[],
  filePath: string,
  format: 'json' | 'csv' = 'json'
): Promise<void> {
  let content: string;

  if (format === 'csv') {
    const header = 'url,success,title,timing_ms,error';
    const rows = results.map((r) => {
      const title = r.snapshot?.title?.replace(/"/g, '""') || '';
      const error = r.error?.replace(/"/g, '""') || '';
      return `"${r.url}",${r.success},"${title}",${r.timing || 0},"${error}"`;
    });
    content = [header, ...rows].join('\n');
  } else {
    content = JSON.stringify(results, null, 2);
  }

  await Bun.write(filePath, content);
}
