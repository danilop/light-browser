/**
 * Light Browser - Semantic Search Tests
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import {
  embed,
  embedBatch,
  cosineSimilarity,
  semanticSearch,
  extractChunks,
  extractChunksFromText,
  filterByQuery,
  isModelLoaded,
  preloadModel,
  getModelInfo,
  type ContentChunk,
} from '../src/extraction/semantic.ts';

// Preload the model before tests (this will be slow on first run)
beforeAll(async () => {
  console.log('Preloading embedding model...');
  await preloadModel();
  console.log('Model loaded!');
}, 120000); // 2 minute timeout for model download

describe('Embedding Functions', () => {
  it('should generate embeddings for text', async () => {
    const embedding = await embed('Hello world');

    expect(embedding).toBeInstanceOf(Array);
    expect(embedding.length).toBe(384); // all-MiniLM-L6-v2 produces 384-dim embeddings
    expect(embedding.every((v) => typeof v === 'number')).toBe(true);
  }, 30000);

  it('should generate similar embeddings for similar texts', async () => {
    const emb1 = await embed('The cat sat on the mat');
    const emb2 = await embed('A cat was sitting on a mat');
    const emb3 = await embed('The stock market crashed today');

    const sim12 = cosineSimilarity(emb1, emb2);
    const sim13 = cosineSimilarity(emb1, emb3);

    // Similar texts should have higher similarity
    expect(sim12).toBeGreaterThan(sim13);
    expect(sim12).toBeGreaterThan(0.8); // Very similar
    expect(sim13).toBeLessThan(0.5); // Unrelated
  }, 30000);

  it('should batch embed multiple texts', async () => {
    const texts = ['Hello', 'World', 'Test'];
    const embeddings = await embedBatch(texts);

    expect(embeddings.length).toBe(3);
    expect(embeddings[0]?.length).toBe(384);
    expect(embeddings[1]?.length).toBe(384);
    expect(embeddings[2]?.length).toBe(384);
  }, 30000);

  it('should handle empty batch', async () => {
    const embeddings = await embedBatch([]);
    expect(embeddings).toEqual([]);
  });
});

describe('Cosine Similarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const v1 = [1, 0, 0];
    const v2 = [0, 1, 0];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(0, 5);
  });

  it('should return -1 for opposite vectors', () => {
    const v1 = [1, 2, 3];
    const v2 = [-1, -2, -3];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1, 5);
  });

  it('should handle zero vectors', () => {
    const v1 = [0, 0, 0];
    const v2 = [1, 2, 3];
    expect(cosineSimilarity(v1, v2)).toBe(0);
  });

  it('should throw for mismatched lengths', () => {
    const v1 = [1, 2, 3];
    const v2 = [1, 2];
    expect(() => cosineSimilarity(v1, v2)).toThrow('Vectors must have same length');
  });
});

describe('Chunk Extraction', () => {
  it('should extract chunks from structured content', () => {
    const content = [
      { type: 'heading', text: 'Main Title Here' },
      { type: 'paragraph', text: 'This is a paragraph with enough text.' },
      {
        type: 'list',
        children: [{ text: 'List item one with text' }, { text: 'List item two with text' }],
      },
      { type: 'paragraph', text: 'Short' }, // Too short, should be excluded
    ];

    const chunks = extractChunks(content);

    expect(chunks.length).toBe(4); // Title, paragraph, 2 list items
    expect(chunks[0]?.type).toBe('heading');
    expect(chunks[1]?.type).toBe('paragraph');
    expect(chunks[2]?.type).toBe('list-item');
  });

  it('should filter out short text', () => {
    const content = [
      { type: 'paragraph', text: 'Short' },
      { type: 'paragraph', text: 'This is long enough to be included' },
    ];

    const chunks = extractChunks(content);
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.text).toContain('long enough');
  });

  it('should extract chunks from plain text', () => {
    const text = `First paragraph with enough content here.

Second paragraph also has enough content.

Too short.

Third paragraph is also long enough to include.`;

    const chunks = extractChunksFromText(text);

    expect(chunks.length).toBe(3);
    expect(chunks[0]?.text).toContain('First');
    expect(chunks[1]?.text).toContain('Second');
    expect(chunks[2]?.text).toContain('Third');
  });
});

describe('Semantic Search', () => {
  const testChunks: ContentChunk[] = [
    { text: 'The price of the product is $50 with free shipping', index: 0, type: 'paragraph' },
    { text: 'Contact us at support@example.com for help', index: 1, type: 'paragraph' },
    { text: 'Our return policy allows 30 day returns', index: 2, type: 'paragraph' },
    { text: 'Shipping takes 3-5 business days', index: 3, type: 'paragraph' },
    { text: 'Product specifications: 10cm x 20cm, weight 500g', index: 4, type: 'paragraph' },
  ];

  it('should find relevant chunks for a query', async () => {
    const results = await semanticSearch('How much does it cost?', testChunks, { topK: 3 });

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
    // Price-related chunk should rank high
    const hasPrice = results.some((r) => r.chunk.text.includes('price'));
    expect(hasPrice).toBe(true);
  }, 30000);

  it('should find shipping-related content', async () => {
    const results = await semanticSearch('How long will delivery take?', testChunks, { topK: 2 });

    expect(results.length).toBeGreaterThan(0);
    // Shipping chunk should rank high
    const topResult = results[0];
    expect(topResult?.chunk.text.toLowerCase()).toContain('shipping');
  }, 30000);

  it('should return results above threshold', async () => {
    const results = await semanticSearch('price', testChunks, { threshold: 0.3 });

    expect(results.every((r) => r.score >= 0.3)).toBe(true);
  }, 30000);

  it('should handle empty chunks', async () => {
    const results = await semanticSearch('test', []);
    expect(results).toEqual([]);
  });
});

describe('Filter By Query', () => {
  it('should filter structured content by query', async () => {
    const content = [
      { type: 'heading', text: 'Welcome to our store' },
      { type: 'paragraph', text: 'The price of this item is $99 with tax included' },
      { type: 'paragraph', text: 'Contact our support team for assistance' },
      { type: 'paragraph', text: 'Free shipping on orders over $50' },
    ];

    const result = await filterByQuery(content, 'How much does it cost?', { topK: 2 });

    expect(result.totalChunks).toBe(4);
    expect(result.matchedChunks).toBeGreaterThan(0);
    expect(result.matchedChunks).toBeLessThanOrEqual(2);
    expect(result.filteredContent).toBeTruthy();
    // Should contain price-related content
    expect(result.filteredContent.toLowerCase()).toMatch(/price|\$|cost/);
  }, 30000);

  it('should filter plain text by query', async () => {
    const text = `Welcome to our online store.

We offer competitive prices on all products.

Contact us for customer support.

Free delivery on orders over $100.`;

    const result = await filterByQuery(text, 'delivery shipping cost', { topK: 2 });

    expect(result.totalChunks).toBeGreaterThan(0);
    expect(result.matchedChunks).toBeGreaterThan(0);
    // Should match delivery-related content
    expect(result.filteredContent.toLowerCase()).toMatch(/delivery|price/);
  }, 30000);

  it('should return full content when no chunks match threshold', async () => {
    const result = await filterByQuery(
      'single paragraph text here',
      'completely unrelated quantum physics',
      {
        threshold: 0.9, // Very high threshold
      }
    );

    expect(result.matchedChunks).toBe(0);
    expect(result.filteredContent).toBe('');
  }, 30000);
});

describe('Model Info', () => {
  it('should report model as loaded after preload', () => {
    expect(isModelLoaded()).toBe(true);
  });

  it('should return correct model info', () => {
    const info = getModelInfo();

    expect(info.name).toBe('Xenova/all-MiniLM-L6-v2');
    expect(info.dimensions).toBe(384);
    expect(info.loaded).toBe(true);
  });
});

describe('Integration: Real Website Semantic Search', () => {
  it('should filter Wikipedia content by semantic query', async () => {
    // Fetch a Wikipedia page about a well-defined topic
    const response = await fetch('https://en.wikipedia.org/wiki/Machine_learning');
    const html = await response.text();

    // Extract structured content using our extractor
    const { extractFromHtml } = await import('../src/extraction/html.ts');
    const extracted = extractFromHtml(html, 'https://en.wikipedia.org/wiki/Machine_learning', {
      format: 'json',
    });

    // Verify we have enough content to search
    expect(Array.isArray(extracted.content)).toBe(true);
    expect(extracted.content.length).toBeGreaterThan(50);

    // Search for neural network related content
    const result = await filterByQuery(extracted.content, 'neural networks deep learning', {
      topK: 5,
      threshold: 0.25,
    });

    // Should find relevant chunks
    expect(result.totalChunks).toBeGreaterThan(50);
    expect(result.matchedChunks).toBeGreaterThan(0);
    expect(result.matchedChunks).toBeLessThanOrEqual(5);

    // Filtered content should mention relevant terms
    const lowerContent = result.filteredContent.toLowerCase();
    expect(lowerContent).toMatch(/neural|network|deep|learning|algorithm/);
  }, 60000);

  it('should return different results for different queries on same page', async () => {
    // Use a simple test page with distinct topics
    const html = `
      <html><body>
        <h1>Technology Guide</h1>
        <p>Cloud computing enables scalable infrastructure and on-demand resources for businesses.</p>
        <p>Security measures include encryption, firewalls, and access control policies.</p>
        <p>Machine learning algorithms can process large datasets efficiently.</p>
        <p>Mobile applications provide user-friendly interfaces for consumers.</p>
        <p>Database systems store and retrieve information reliably.</p>
      </body></html>
    `;

    const { extractFromHtml } = await import('../src/extraction/html.ts');
    const extracted = extractFromHtml(html, 'http://test.com', { format: 'json' });

    // Search for security-related content
    const securityResult = await filterByQuery(extracted.content, 'cybersecurity protection', {
      topK: 2,
      threshold: 0.2,
    });

    // Search for cloud-related content
    const cloudResult = await filterByQuery(extracted.content, 'cloud infrastructure servers', {
      topK: 2,
      threshold: 0.2,
    });

    // Both should find matches
    expect(securityResult.matchedChunks).toBeGreaterThan(0);
    expect(cloudResult.matchedChunks).toBeGreaterThan(0);

    // Results should be different
    expect(securityResult.filteredContent).not.toBe(cloudResult.filteredContent);

    // Security result should contain security-related terms
    expect(securityResult.filteredContent.toLowerCase()).toMatch(/security|encryption|firewall/);

    // Cloud result should contain cloud-related terms
    expect(cloudResult.filteredContent.toLowerCase()).toMatch(/cloud|infrastructure|scalable/);
  }, 60000);
});
