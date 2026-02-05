#!/usr/bin/env bun
/**
 * Light Browser - Unified CLI Entry Point
 *
 * A lightweight web browser for humans (TUI) and AI agents (MCP).
 *
 * Usage:
 *   light-browser <url>              - Fetch URL and output markdown (CLI mode)
 *   light-browser <url> --format json - Output as JSON
 *   light-browser tui [url]          - Interactive terminal UI
 *   light-browser serve              - Start MCP server for AI agents
 */

import { Command } from 'commander';
import {
  loadConfig,
  cliOptionsToConfig,
  PRODUCT_NAME,
  PRODUCT_DISPLAY_NAME,
  VERSION,
} from './core/config.ts';
import {
  EngineTier,
  type ExtractionOptions,
  type PageSnapshot,
  type MediaRef,
  type Link,
} from './core/types.ts';
import { createEngine } from './core/engine/index.ts';
import { extractFromHtml } from './extraction/html.ts';
import { formatAsMarkdown } from './output/markdown.ts';
import { formatAsText } from './output/text.ts';
import { formatAsJson } from './output/json.ts';
import { BrowserError } from './utils/errors.ts';
import { processAllMedia, getMediaSummary, type ProcessedMedia } from './utils/media-proc.ts';
import { filterHtmlByQuery, getModelInfo } from './extraction/semantic.ts';
import { truncate, type TruncationResult } from './utils/tokens.ts';
import { extractFromPdfUrl, isPdfUrl, formatPdfMetadata } from './extraction/pdf.ts';
import { processBatch, readUrlsFromFile, writeBatchResults } from './utils/batch.ts';

/**
 * Filter links to only those appearing in the filtered content
 */
function filterRelevantLinks(links: Link[], filteredContent: string): Link[] {
  if (!filteredContent) return [];
  const contentLower = filteredContent.toLowerCase();
  return links.filter((link) => {
    // Check if link text appears in filtered content
    const linkTextLower = link.text.toLowerCase();
    return linkTextLower.length > 2 && contentLower.includes(linkTextLower);
  });
}

/**
 * Filter media to only those appearing in/near the filtered content
 */
function filterRelevantMedia(media: MediaRef[], filteredContent: string): MediaRef[] {
  if (!filteredContent) return [];
  const contentLower = filteredContent.toLowerCase();
  return media.filter((m) => {
    // Check if alt text or title appears in filtered content
    const altLower = (m.alt || '').toLowerCase();
    const titleLower = (m.title || '').toLowerCase();
    return (
      (altLower.length > 2 && contentLower.includes(altLower)) ||
      (titleLower.length > 2 && contentLower.includes(titleLower))
    );
  });
}

const program = new Command();

program
  .name(PRODUCT_NAME)
  .description(`${PRODUCT_DISPLAY_NAME} - A lightweight web browser for humans and AI agents`)
  .version(VERSION)
  .argument('[url]', 'URL to fetch')
  .option('-f, --format <format>', 'Output format: markdown, text, json, a11y', 'markdown')
  .option('-t, --tier <tier>', 'Engine tier: 1 (static), 2 (jsdom), 3 (playwright)', '1')
  .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
  .option('--no-js', 'Disable JavaScript execution')
  .option('-s, --selector <selector...>', 'CSS selectors to extract')
  .option('-k, --keyword <keyword...>', 'Keywords to filter content (exact text match)')
  .option('--query <text>', 'Semantic search query (uses local embeddings)')
  .option('--keyword-mode <mode>', 'Keyword matching: any, all', 'any')
  .option(
    '--semantic-threshold <score>',
    'Minimum similarity score for semantic search (0-1)',
    '0.3'
  )
  .option('--semantic-top-k <count>', 'Maximum results for semantic search', '10')
  .option('-r, --readability', 'Use readability mode to extract main content')
  .option('--max-tokens <tokens>', 'Maximum tokens in output')
  .option('-u, --user-agent <ua>', 'Custom User-Agent string')
  .option('-H, --header <header...>', 'Custom headers (format: "Name: Value")')
  .option('--json', 'Shorthand for --format json')
  .option('-q, --quiet', 'Suppress status messages')
  .option('-v, --verbose', 'Show detailed output')
  .option('--download-media', 'Download and process media (images, videos)')
  .option('--media-dir <dir>', 'Directory to save downloaded media')
  .option('--batch <file>', 'Process URLs from file (one per line)')
  .option('--batch-output <file>', 'Write batch results to file')
  .option('--batch-concurrency <n>', 'Concurrent requests for batch mode', '1')
  .option('--stealth', 'Use stealth mode (browser-like fingerprint)')
  .action(async (url: string | undefined, options) => {
    // Handle --json shorthand
    if (options.json) {
      options.format = 'json';
    }

    // Handle batch mode
    if (options.batch) {
      try {
        const urls = await readUrlsFromFile(options.batch);
        if (urls.length === 0) {
          console.error('Error: No URLs found in batch file');
          process.exit(1);
        }

        if (!options.quiet) {
          console.error(
            `Processing ${urls.length} URLs (concurrency: ${options.batchConcurrency || 1})...`
          );
        }

        const tier = parseInt(options.tier, 10) as EngineTier;
        const results = await processBatch(urls, {
          concurrency: parseInt(options.batchConcurrency || '1', 10),
          maxTier: tier,
          extraction: {
            format: options.format as 'markdown' | 'text' | 'json',
            selectors: options.selector,
            keywords: options.keyword,
          },
          onProgress: (completed, total, processedUrl, success) => {
            if (!options.quiet) {
              const status = success ? '✓' : '✗';
              console.error(`[${completed}/${total}] ${status} ${processedUrl}`);
            }
          },
        });

        // Output results
        if (options.batchOutput) {
          const format = options.batchOutput.endsWith('.csv') ? 'csv' : 'json';
          await writeBatchResults(results, options.batchOutput, format);
          console.error(`Results written to ${options.batchOutput}`);
        } else {
          console.log(JSON.stringify(results, null, 2));
        }

        // Summary
        const successful = results.filter((r) => r.success).length;
        console.error(`\nCompleted: ${successful}/${results.length} successful`);
        process.exit(successful === results.length ? 0 : 1);
      } catch (error) {
        console.error(`Batch error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
      return;
    }

    // If no URL provided, show help
    if (!url) {
      program.help();
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      // Try adding https://
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
        try {
          new URL(url);
        } catch {
          console.error(`Error: Invalid URL: ${url}`);
          process.exit(1);
        }
      } else {
        console.error(`Error: Invalid URL: ${url}`);
        process.exit(1);
      }
    }

    // Parse tier
    const tier = parseInt(options.tier, 10) as EngineTier;
    if (![1, 2, 3].includes(tier)) {
      console.error('Error: Tier must be 1, 2, or 3');
      process.exit(1);
    }

    // Parse headers
    const headers: Record<string, string> = {};
    if (options.header) {
      for (const h of options.header) {
        const idx = h.indexOf(':');
        if (idx > 0) {
          const name = h.substring(0, idx).trim();
          const value = h.substring(idx + 1).trim();
          headers[name] = value;
        }
      }
    }

    // Stealth mode user agent (mimics real Chrome browser)
    const STEALTH_USER_AGENT =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // Load config with CLI overrides
    const cliOptions = {
      tier,
      timeout: parseInt(options.timeout, 10),
      format: options.format as 'json' | 'markdown' | 'text' | 'a11y',
      js: options.js !== false,
      userAgent: options.stealth ? STEALTH_USER_AGENT : options.userAgent,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      selectors: options.selector,
      keywords: options.keyword,
      maxTokens: options.maxTokens ? parseInt(options.maxTokens, 10) : undefined,
      readability: options.readability,
    };

    const configOverrides = cliOptionsToConfig(cliOptions);
    const config = loadConfig(configOverrides);

    // Create engine
    const engine = createEngine(config, {
      maxTier: tier,
      autoEscalate: false, // Don't auto-escalate in CLI mode by default
      timeout: cliOptions.timeout,
      userAgent: cliOptions.userAgent,
      headers: cliOptions.headers,
    });

    try {
      // Show status if not quiet
      if (!options.quiet) {
        console.error(`Fetching: ${url}`);
      }

      const startTime = performance.now();

      // Check if URL is a PDF
      if (isPdfUrl(url)) {
        if (!options.quiet) {
          console.error('Detected PDF document');
        }

        const pdfResult = await extractFromPdfUrl(url, {
          timeout: cliOptions.timeout,
          userAgent: cliOptions.userAgent,
        });

        const pdfSnapshot: PageSnapshot = {
          url,
          title: pdfResult.metadata.title || 'PDF Document',
          content: pdfResult.content,
          links: [],
          forms: [],
          media: [],
          metadata: pdfResult.metadata,
          tierUsed: tier,
          timing: {
            fetchMs: Math.round(performance.now() - startTime),
            totalMs: Math.round(performance.now() - startTime),
          },
        };

        // Format output
        let pdfOutput: string;
        switch (cliOptions.format) {
          case 'json':
            pdfOutput = formatAsJson(pdfSnapshot);
            break;
          case 'text':
            pdfOutput = pdfResult.text;
            break;
          case 'markdown':
          default:
            pdfOutput = `# ${pdfSnapshot.title}\n\n`;
            pdfOutput += formatPdfMetadata(pdfResult.metadata) + '\n\n---\n\n';
            pdfOutput += pdfResult.text;
        }

        console.log(pdfOutput);

        if (options.verbose) {
          console.error('');
          console.error(`PDF pages: ${pdfResult.pageCount}`);
          console.error(`Total time: ${pdfSnapshot.timing.totalMs}ms`);
        }

        await engine.close();
        return;
      }

      // Fetch the page (HTML)
      const result = await engine.fetch(url);

      // Extract content
      const extractionOptions: ExtractionOptions = {
        format: cliOptions.format,
        selectors: cliOptions.selectors,
        keywords: cliOptions.keywords,
        keywordMode: options.keywordMode,
        maxTokens: cliOptions.maxTokens,
        readabilityMode: cliOptions.readability,
        includeMedia: true,
      };

      const extractStartTime = performance.now();
      const extracted = extractFromHtml(result.html, result.url, extractionOptions);
      const extractEndTime = performance.now();

      // Apply semantic search filtering if --query is provided
      let semanticResults: Awaited<ReturnType<typeof filterHtmlByQuery>> | null = null;
      let semanticSearchTime = 0;

      if (options.query) {
        if (!options.quiet) {
          const modelInfo = getModelInfo();
          const status = modelInfo.loaded ? 'ready' : 'loading model...';
          console.error(`Semantic search (${status}): "${options.query}"`);
        }

        // Use raw HTML for semantic search - extracts ALL visible text
        // regardless of HTML structure (tables, divs, links, etc.)
        const semanticStartTime = performance.now();
        semanticResults = await filterHtmlByQuery(result.html, options.query, {
          topK: parseInt(options.semanticTopK || '10', 10),
          threshold: parseFloat(options.semanticThreshold || '0.3'),
        });
        semanticSearchTime = Math.round(performance.now() - semanticStartTime);

        if (!options.quiet) {
          console.error(
            `Matched: ${semanticResults.matchedChunks}/${semanticResults.totalChunks} chunks`
          );
        }
      }

      // Process media if requested
      let processedMedia: (MediaRef | ProcessedMedia)[] = extracted.media;
      let mediaProcessTime = 0;

      if (options.downloadMedia && extracted.media.length > 0) {
        if (!options.quiet) {
          console.error(`Processing ${extracted.media.length} media files...`);
        }

        const mediaStartTime = performance.now();
        processedMedia = await processAllMedia(extracted.media, config.media, {
          cacheDir: options.mediaDir,
          skipDisabled: true,
        });
        mediaProcessTime = Math.round(performance.now() - mediaStartTime);

        if (!options.quiet) {
          const summary = getMediaSummary(processedMedia as ProcessedMedia[]);
          console.error(
            `Processed: ${summary.processed}/${summary.total} (${summary.errors} errors)`
          );
        }
      }

      // Build snapshot (use filtered content if semantic search was applied)
      let finalContent = semanticResults ? semanticResults.filteredContent : extracted.content;

      // Determine if content was filtered (semantic search or keywords)
      const contentWasFiltered =
        semanticResults || (cliOptions.keywords && cliOptions.keywords.length > 0);
      const filteredContentString =
        typeof finalContent === 'string'
          ? finalContent
          : (finalContent as Array<{ text?: string }>).map((c) => c.text || '').join(' ');

      // Filter links and media to only those relevant to filtered content
      let finalLinks = extracted.links;
      let finalMedia: (MediaRef | ProcessedMedia)[] = processedMedia;

      if (contentWasFiltered && filteredContentString) {
        finalLinks = filterRelevantLinks(extracted.links, filteredContentString);
        finalMedia = filterRelevantMedia(extracted.media, filteredContentString);

        if (
          !options.quiet &&
          (finalLinks.length < extracted.links.length || finalMedia.length < extracted.media.length)
        ) {
          console.error(
            `Filtered: ${finalLinks.length}/${extracted.links.length} links, ${finalMedia.length}/${extracted.media.length} media`
          );
        }
      }

      // Apply token budget truncation if specified
      let truncationResult: TruncationResult | null = null;
      if (cliOptions.maxTokens && cliOptions.maxTokens > 0) {
        truncationResult = truncate(finalContent, cliOptions.maxTokens, {
          addIndicator: true,
          textMode: 'smart',
        });
        finalContent = truncationResult.content;

        if (!options.quiet && truncationResult.truncated) {
          console.error(
            `Token budget: ${truncationResult.returnedTokens}/${truncationResult.originalTokens} tokens ` +
              `(${truncationResult.itemsOmitted} items omitted)`
          );
        }
      }

      const snapshot: PageSnapshot = {
        url: result.url,
        title: result.title,
        content: finalContent,
        links: finalLinks,
        forms: extracted.forms,
        media: finalMedia,
        metadata: extracted.metadata,
        tierUsed: result.tierUsed,
        timing: {
          fetchMs: result.timing.fetchMs,
          extractMs: Math.round(extractEndTime - extractStartTime),
          semanticMs: semanticSearchTime || undefined,
          mediaMs: mediaProcessTime || undefined,
          totalMs: Math.round(performance.now() - startTime),
        } as PageSnapshot['timing'],
        truncated: truncationResult?.truncated,
        truncationInfo: truncationResult?.truncated
          ? {
              reason: 'token_budget',
              originalTokens: truncationResult.originalTokens,
              returnedTokens: truncationResult.returnedTokens,
              itemsOmitted: truncationResult.itemsOmitted,
            }
          : undefined,
      };

      // Add semantic search results to metadata if available
      if (semanticResults) {
        (snapshot.metadata as Record<string, unknown>).semanticSearch = {
          query: options.query,
          totalChunks: semanticResults.totalChunks,
          matchedChunks: semanticResults.matchedChunks,
          results: semanticResults.results.map((r) => ({
            text: r.chunk.text.substring(0, 100) + (r.chunk.text.length > 100 ? '...' : ''),
            score: Math.round(r.score * 1000) / 1000,
            type: r.chunk.type,
          })),
        };
      }

      // Format output
      let output: string;
      switch (cliOptions.format) {
        case 'json':
          output = formatAsJson(snapshot);
          break;
        case 'text':
          output = formatAsText(snapshot);
          break;
        case 'a11y':
          // TODO: Implement accessibility tree output
          output = formatAsText(snapshot);
          break;
        case 'markdown':
        default:
          output = formatAsMarkdown(snapshot, {
            linkStyle: config.output.linkStyle,
            includeMetadata: config.output.includeMetadata,
          });
      }

      // Output result
      console.log(output);

      // Show timing if verbose
      if (options.verbose) {
        console.error('');
        console.error(`Tier used: ${result.tierUsed}`);
        console.error(`Fetch time: ${result.timing.fetchMs}ms`);
        console.error(`Extract time: ${snapshot.timing.extractMs}ms`);
        if (semanticSearchTime > 0) {
          console.error(`Semantic search time: ${semanticSearchTime}ms`);
          if (semanticResults) {
            console.error(
              `Semantic matches: ${semanticResults.matchedChunks}/${semanticResults.totalChunks} chunks`
            );
          }
        }
        if (mediaProcessTime > 0) {
          console.error(`Media process time: ${mediaProcessTime}ms`);
        }
        console.error(`Total time: ${snapshot.timing.totalMs}ms`);
        console.error(`Links found: ${snapshot.links.length}`);
        console.error(`Forms found: ${snapshot.forms.length}`);
        console.error(`Media found: ${snapshot.media.length}`);

        // Show downloaded media paths
        if (options.downloadMedia) {
          const downloaded = (processedMedia as ProcessedMedia[]).filter((m) => m.localPath);
          if (downloaded.length > 0) {
            console.error('');
            console.error('Downloaded media:');
            for (const m of downloaded) {
              console.error(`  [${m.type}] ${m.localPath}`);
              if (m.frames && m.frames.length > 0) {
                for (const frame of m.frames) {
                  console.error(`    └─ ${frame}`);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof BrowserError) {
        console.error(`Error: ${error.message}`);
        if (error.suggestion) {
          console.error(`Suggestion: ${error.suggestion}`);
        }
        process.exit(error.code);
      } else if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      } else {
        console.error(`Error: ${String(error)}`);
        process.exit(1);
      }
    } finally {
      await engine.close();
    }
  });

// TUI subcommand
program
  .command('tui [url]')
  .description('Start interactive terminal UI')
  .action(async (url: string | undefined) => {
    const { startTui } = await import('./tui/app.ts');
    try {
      await startTui(url);
    } catch (error) {
      console.error('TUI Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// MCP server subcommand
program
  .command('serve')
  .description('Start MCP server for AI agents')
  .action(async () => {
    const { startMcpServer } = await import('./mcp/server.ts');
    try {
      await startMcpServer();
    } catch (error) {
      console.error('MCP Server Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Parse arguments
program.parse();
