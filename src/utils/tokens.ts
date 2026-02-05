/**
 * Light Browser - Token Utilities
 *
 * Estimates token counts and truncates content to fit within budgets.
 * Uses simple char/4 approximation (accurate enough for most use cases).
 */

import type { StructuredContent } from '../core/types.ts';

/**
 * Approximate token count from text using char/4 heuristic
 * This is a rough estimate - actual tokenization varies by model
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

/**
 * Priority levels for content types (higher = more important)
 */
const CONTENT_PRIORITY: Record<string, number> = {
  heading: 100,
  h1: 100,
  h2: 90,
  h3: 80,
  h4: 70,
  h5: 60,
  h6: 50,
  paragraph: 40,
  list: 35,
  'list-item': 30,
  blockquote: 25,
  code: 20,
  table: 15,
  link: 10,
  image: 5,
};

/**
 * Get content text from a StructuredContent item
 */
function getContentText(item: StructuredContent): string {
  let text = item.text || '';
  if (item.children) {
    for (const child of item.children) {
      text += ' ' + getContentText(child);
    }
  }
  return text.trim();
}

/**
 * Get priority for a content type
 */
function getPriority(type: string, level?: number): number {
  if (type === 'heading' && level) {
    return CONTENT_PRIORITY[`h${level}`] ?? CONTENT_PRIORITY.heading ?? 0;
  }
  return CONTENT_PRIORITY[type] ?? 0;
}

/**
 * Truncation result
 */
export interface TruncationResult {
  /** The truncated content */
  content: StructuredContent[] | string;
  /** Total tokens in original content */
  originalTokens: number;
  /** Tokens in truncated content */
  returnedTokens: number;
  /** Whether content was truncated */
  truncated: boolean;
  /** Number of items omitted */
  itemsOmitted: number;
}

/**
 * Truncate structured content to fit within token budget
 * Prioritizes headings over paragraphs, etc.
 */
export function truncateContent(
  content: StructuredContent[],
  maxTokens: number,
  options?: {
    /** Custom priority order (element types in order of importance) */
    priorityOrder?: string[];
    /** Whether to add truncation indicator */
    addIndicator?: boolean;
  }
): TruncationResult {
  const addIndicator = options?.addIndicator ?? true;

  // Calculate total tokens
  let originalTokens = 0;
  const itemsWithTokens = content.map((item) => {
    const text = getContentText(item);
    const tokens = estimateTokens(text);
    originalTokens += tokens;
    return { item, tokens, text, priority: getPriority(item.type, item.level) };
  });

  // If within budget, return as-is
  if (originalTokens <= maxTokens) {
    return {
      content,
      originalTokens,
      returnedTokens: originalTokens,
      truncated: false,
      itemsOmitted: 0,
    };
  }

  // Custom priority order if provided
  if (options?.priorityOrder) {
    const priorityMap = new Map(options.priorityOrder.map((type, idx) => [type, 1000 - idx]));
    for (const item of itemsWithTokens) {
      const customPriority = priorityMap.get(item.item.type);
      if (customPriority !== undefined) {
        item.priority = customPriority;
      }
    }
  }

  // Sort by priority (descending) then by original order
  const sortedItems = itemsWithTokens
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.originalIndex - b.originalIndex;
    });

  // Greedily add items until budget is exhausted
  const selectedIndices = new Set<number>();
  let usedTokens = 0;
  const indicatorTokens = addIndicator ? 20 : 0; // Reserve space for truncation indicator

  for (const item of sortedItems) {
    if (usedTokens + item.tokens + indicatorTokens <= maxTokens) {
      selectedIndices.add(item.originalIndex);
      usedTokens += item.tokens;
    }
  }

  // Build result in original order
  const truncatedContent: StructuredContent[] = [];
  for (let i = 0; i < content.length; i++) {
    if (selectedIndices.has(i)) {
      truncatedContent.push(content[i]!);
    }
  }

  // Add truncation indicator
  const itemsOmitted = content.length - truncatedContent.length;
  if (addIndicator && itemsOmitted > 0) {
    truncatedContent.push({
      type: 'paragraph',
      text: `[... ${itemsOmitted} more items truncated due to token limit ...]`,
    });
    usedTokens += indicatorTokens;
  }

  return {
    content: truncatedContent,
    originalTokens,
    returnedTokens: usedTokens,
    truncated: true,
    itemsOmitted,
  };
}

/**
 * Truncate plain text to fit within token budget
 */
export function truncateText(
  text: string,
  maxTokens: number,
  options?: {
    /** Where to truncate: 'end', 'middle', 'smart' (default: 'end') */
    mode?: 'end' | 'middle' | 'smart';
    /** Truncation indicator (default: '... [truncated]') */
    indicator?: string;
  }
): TruncationResult {
  const mode = options?.mode ?? 'end';
  const indicator = options?.indicator ?? '\n\n... [truncated]';
  const originalTokens = estimateTokens(text);

  if (originalTokens <= maxTokens) {
    return {
      content: text,
      originalTokens,
      returnedTokens: originalTokens,
      truncated: false,
      itemsOmitted: 0,
    };
  }

  const indicatorTokens = estimateTokens(indicator);
  const availableTokens = maxTokens - indicatorTokens;
  const maxChars = availableTokens * 4;

  let truncatedText: string;

  switch (mode) {
    case 'middle': {
      const halfChars = Math.floor(maxChars / 2);
      const start = text.slice(0, halfChars);
      const end = text.slice(-halfChars);
      truncatedText = start + '\n\n... [content truncated] ...\n\n' + end;
      break;
    }

    case 'smart': {
      // Try to truncate at paragraph boundaries
      const paragraphs = text.split(/\n\n+/);
      let result = '';
      let tokens = 0;

      for (const para of paragraphs) {
        const paraTokens = estimateTokens(para + '\n\n');
        if (tokens + paraTokens + indicatorTokens <= maxTokens) {
          result += para + '\n\n';
          tokens += paraTokens;
        } else {
          break;
        }
      }

      truncatedText = result.trim() + indicator;
      break;
    }

    case 'end':
    default: {
      truncatedText = text.slice(0, maxChars) + indicator;
    }
  }

  return {
    content: truncatedText,
    originalTokens,
    returnedTokens: estimateTokens(truncatedText),
    truncated: true,
    itemsOmitted: 0,
  };
}

/**
 * Truncate any content type to fit within token budget
 */
export function truncate(
  content: StructuredContent[] | string,
  maxTokens: number,
  options?: {
    priorityOrder?: string[];
    addIndicator?: boolean;
    textMode?: 'end' | 'middle' | 'smart';
  }
): TruncationResult {
  if (typeof content === 'string') {
    return truncateText(content, maxTokens, { mode: options?.textMode });
  }
  return truncateContent(content, maxTokens, options);
}
