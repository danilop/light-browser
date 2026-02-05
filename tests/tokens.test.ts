/**
 * Light Browser - Token Utilities Tests
 */

import { describe, it, expect } from 'bun:test';
import { estimateTokens, truncateContent, truncateText, truncate } from '../src/utils/tokens.ts';
import type { StructuredContent } from '../src/core/types.ts';

describe('estimateTokens', () => {
  it('should estimate tokens using char/4 heuristic', () => {
    expect(estimateTokens('test')).toBe(1);
    expect(estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 -> 3
    expect(estimateTokens('')).toBe(0);
  });

  it('should handle longer text', () => {
    const text = 'a'.repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });
});

describe('truncateContent', () => {
  const sampleContent: StructuredContent[] = [
    { type: 'heading', level: 1, text: 'Main Title' },
    { type: 'paragraph', text: 'First paragraph with some content that is longer.' },
    { type: 'heading', level: 2, text: 'Section Header' },
    { type: 'paragraph', text: 'Second paragraph with different content here.' },
    {
      type: 'list',
      children: [
        { type: 'paragraph', text: 'List item one' },
        { type: 'paragraph', text: 'List item two' },
      ],
    },
  ];

  it('should not truncate if within budget', () => {
    const result = truncateContent(sampleContent, 1000);

    expect(result.truncated).toBe(false);
    expect(result.content).toEqual(sampleContent);
    expect(result.itemsOmitted).toBe(0);
  });

  it('should truncate when over budget', () => {
    const result = truncateContent(sampleContent, 20);

    expect(result.truncated).toBe(true);
    expect((result.content as StructuredContent[]).length).toBeLessThan(sampleContent.length);
  });

  it('should prioritize headings over paragraphs', () => {
    const result = truncateContent(sampleContent, 30);

    const resultContent = result.content as StructuredContent[];
    const types = resultContent.map((c) => c.type);

    // Headings should be preserved over paragraphs
    expect(types.some((t) => t === 'heading')).toBe(true);
  });

  it('should add truncation indicator', () => {
    const result = truncateContent(sampleContent, 20, { addIndicator: true });

    const resultContent = result.content as StructuredContent[];
    const lastItem = resultContent[resultContent.length - 1];
    expect(lastItem?.text).toContain('truncated');
  });

  it('should respect custom priority order', () => {
    const result = truncateContent(sampleContent, 40, {
      priorityOrder: ['paragraph', 'heading', 'list'],
    });

    // With custom priority, paragraphs should be preferred
    const resultContent = result.content as StructuredContent[];
    const hasParagraph = resultContent.some((c) => c.type === 'paragraph');
    expect(hasParagraph).toBe(true);
  });
});

describe('truncateText', () => {
  const longText =
    'This is a long paragraph.\n\nThis is another paragraph.\n\nAnd a third one here.\n\nAnd even more content.';

  it('should not truncate if within budget', () => {
    const result = truncateText(longText, 1000);

    expect(result.truncated).toBe(false);
    expect(result.content).toBe(longText);
  });

  it('should truncate at end by default', () => {
    const result = truncateText(longText, 20);

    expect(result.truncated).toBe(true);
    expect((result.content as string).endsWith('[truncated]')).toBe(true);
  });

  it('should truncate in middle when requested', () => {
    const result = truncateText(longText, 15, { mode: 'middle' });

    expect(result.truncated).toBe(true);
    expect(result.content as string).toContain('[content truncated]');
  });

  it('should truncate smartly at paragraph boundaries', () => {
    const result = truncateText(longText, 20, { mode: 'smart' });

    expect(result.truncated).toBe(true);
    // Smart mode should try to keep complete paragraphs
    expect(result.content as string).toContain('This is');
  });
});

describe('truncate (unified)', () => {
  it('should handle string content', () => {
    const result = truncate('Hello world, this is a test string.', 5);

    expect(result.truncated).toBe(true);
    expect(typeof result.content).toBe('string');
  });

  it('should handle structured content', () => {
    const content: StructuredContent[] = [
      { type: 'heading', text: 'Title of the document' },
      {
        type: 'paragraph',
        text: 'This is a longer paragraph with more content that should exceed the budget.',
      },
    ];

    const result = truncate(content, 5);

    expect(result.truncated).toBe(true);
    expect(Array.isArray(result.content)).toBe(true);
  });

  it('should report accurate token counts', () => {
    const text = 'a'.repeat(100);
    const result = truncate(text, 10);

    expect(result.originalTokens).toBe(25);
    expect(result.returnedTokens).toBeLessThanOrEqual(10);
    expect(result.truncated).toBe(true);
  });
});
