/**
 * Light Browser - Semantic Search
 *
 * Local embedding-based semantic search using transformers.js.
 * Uses all-MiniLM-L6-v2 model for fast, accurate text embeddings.
 *
 * Features:
 * - Fully local/offline (after first model download)
 * - ~23MB model size
 * - 384-dimension embeddings
 * - ~50-100ms per embedding
 */

import { pipeline, env } from '@xenova/transformers';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Configure transformers.js for Node/Bun environment
env.allowLocalModels = true; // Allow local models
env.useBrowserCache = false; // Don't use browser cache (not available in Node/Bun)

// Set a local cache directory for models
const CACHE_DIR = join(tmpdir(), 'light-browser', 'models');
env.cacheDir = CACHE_DIR;
env.localModelPath = CACHE_DIR;

// Model configuration
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const SIMILARITY_THRESHOLD = 0.3; // Minimum similarity score to include

// Singleton pipeline instance (lazy loaded)
let embeddingPipeline: Awaited<ReturnType<typeof pipeline>> | null = null;
let pipelineLoading: Promise<Awaited<ReturnType<typeof pipeline>>> | null = null;

/**
 * Get or create the embedding pipeline (singleton)
 */
async function getEmbeddingPipeline(): Promise<Awaited<ReturnType<typeof pipeline>>> {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  if (pipelineLoading) {
    return pipelineLoading;
  }

  pipelineLoading = pipeline('feature-extraction', MODEL_NAME, {
    quantized: true, // Use quantized model for faster inference
  });

  embeddingPipeline = await pipelineLoading;
  pipelineLoading = null;

  return embeddingPipeline;
}

// Embedding options for feature extraction
const EMBED_OPTIONS = { pooling: 'mean', normalize: true } as const;

/**
 * Generate embedding for a single text
 */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getEmbeddingPipeline();
  // @ts-expect-error transformers.js types are incomplete for normalize option
  const output = (await extractor(text, EMBED_OPTIONS)) as { data: Float32Array };
  return Array.from(output.data);
}

/**
 * Generate embeddings for multiple texts (batched)
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor = await getEmbeddingPipeline();
  const embeddings: number[][] = [];

  // Process in batches of 32 for memory efficiency
  const batchSize = 32;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const outputs = await Promise.all(
      batch.map(async (batchText) => {
        // @ts-expect-error transformers.js types are incomplete for normalize option
        const output = (await extractor(batchText, EMBED_OPTIONS)) as { data: Float32Array };
        return Array.from(output.data);
      })
    );
    embeddings.push(...outputs);
  }

  return embeddings;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Content chunk for semantic search
 */
export interface ContentChunk {
  /** The text content */
  text: string;
  /** Original index in the content array */
  index: number;
  /** HTML element type (p, h1, li, etc.) */
  type?: string;
  /** Precomputed embedding (optional) */
  embedding?: number[];
}

/**
 * Search result with similarity score
 */
export interface SemanticSearchResult {
  /** The matched chunk */
  chunk: ContentChunk;
  /** Similarity score (0-1) */
  score: number;
}

/**
 * Semantic search over content chunks
 */
export async function semanticSearch(
  query: string,
  chunks: ContentChunk[],
  options?: {
    topK?: number;
    threshold?: number;
    precomputedEmbeddings?: number[][];
  }
): Promise<SemanticSearchResult[]> {
  const topK = options?.topK ?? 10;
  const threshold = options?.threshold ?? SIMILARITY_THRESHOLD;

  if (chunks.length === 0) {
    return [];
  }

  // Get query embedding
  const queryEmbedding = await embed(query);

  // Get chunk embeddings (use precomputed if available)
  let chunkEmbeddings: number[][];
  if (options?.precomputedEmbeddings && options.precomputedEmbeddings.length === chunks.length) {
    chunkEmbeddings = options.precomputedEmbeddings;
  } else {
    // Compute embeddings for chunks that don't have them
    const textsToEmbed = chunks.map((c) => c.text);
    chunkEmbeddings = await embedBatch(textsToEmbed);
  }

  // Calculate similarities
  const results: SemanticSearchResult[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = chunkEmbeddings[i];
    if (!chunk || !embedding) continue;

    const score = cosineSimilarity(queryEmbedding, embedding);
    if (score >= threshold) {
      results.push({ chunk, score });
    }
  }

  // Sort by score descending and take top K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Extract text chunks from structured content
 */
export function extractChunks(
  content: Array<{ type: string; text?: string; children?: Array<{ text?: string }> }>
): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  let index = 0;

  for (const item of content) {
    if (item.text && item.text.trim().length > 10) {
      chunks.push({
        text: item.text.trim(),
        index: index++,
        type: item.type,
      });
    }

    // Handle list children
    if (item.children) {
      for (const child of item.children) {
        if (child.text && child.text.trim().length > 10) {
          chunks.push({
            text: child.text.trim(),
            index: index++,
            type: 'list-item',
          });
        }
      }
    }
  }

  return chunks;
}

/**
 * Extract text chunks from plain text (split by paragraphs)
 */
export function extractChunksFromText(text: string): ContentChunk[] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 10);
  return paragraphs.map((p, index) => ({
    text: p.trim(),
    index,
    type: 'paragraph',
  }));
}

/**
 * Filter content by semantic search query
 * Returns only the chunks that match the query
 */
export async function filterByQuery(
  content: string | Array<{ type: string; text?: string; children?: Array<{ text?: string }> }>,
  query: string,
  options?: {
    topK?: number;
    threshold?: number;
  }
): Promise<{
  filteredContent: string;
  results: SemanticSearchResult[];
  totalChunks: number;
  matchedChunks: number;
}> {
  // Extract chunks based on content type
  const chunks =
    typeof content === 'string' ? extractChunksFromText(content) : extractChunks(content);

  if (chunks.length === 0) {
    return {
      filteredContent: typeof content === 'string' ? content : '',
      results: [],
      totalChunks: 0,
      matchedChunks: 0,
    };
  }

  // Perform semantic search
  const results = await semanticSearch(query, chunks, options);

  // Reconstruct filtered content
  const filteredContent = results.map((r) => r.chunk.text).join('\n\n');

  return {
    filteredContent,
    results,
    totalChunks: chunks.length,
    matchedChunks: results.length,
  };
}

/**
 * Check if the embedding model is loaded
 */
export function isModelLoaded(): boolean {
  return embeddingPipeline !== null;
}

/**
 * Preload the embedding model
 */
export async function preloadModel(): Promise<void> {
  await getEmbeddingPipeline();
}

/**
 * Get model info
 */
export function getModelInfo(): { name: string; dimensions: number; loaded: boolean } {
  return {
    name: MODEL_NAME,
    dimensions: 384,
    loaded: isModelLoaded(),
  };
}
