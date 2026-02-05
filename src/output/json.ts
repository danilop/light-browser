/**
 * Light Browser - JSON Output Formatter
 *
 * Converts extracted page content to structured JSON format.
 * Full fidelity output for programmatic consumption.
 */

import type { PageSnapshot } from '../core/types.ts';
import type { ProcessedMedia } from '../utils/media-proc.ts';

export interface JsonOptions {
  /** Pretty print with indentation */
  pretty: boolean;
  /** Indentation spaces (if pretty) */
  indent: number;
  /** Include timing information */
  includeTiming: boolean;
  /** Include empty arrays/objects */
  includeEmpty: boolean;
}

const DEFAULT_OPTIONS: JsonOptions = {
  pretty: true,
  indent: 2,
  includeTiming: true,
  includeEmpty: false,
};

/**
 * Format a complete page snapshot as JSON
 */
export function formatAsJson(snapshot: PageSnapshot, options: Partial<JsonOptions> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Build output object, optionally excluding empty fields
  const output: Record<string, unknown> = {
    url: snapshot.url,
    title: snapshot.title,
    tierUsed: snapshot.tierUsed,
  };

  // Content
  output.content = snapshot.content;

  // Links
  if (opts.includeEmpty || snapshot.links.length > 0) {
    output.links = snapshot.links.map((link) => ({
      ref: link.refNumber,
      text: link.text,
      href: link.href,
      url: link.resolvedUrl,
      type: link.type,
    }));
  }

  // Forms
  if (opts.includeEmpty || snapshot.forms.length > 0) {
    output.forms = snapshot.forms.map((form) => ({
      id: form.id,
      action: form.action,
      method: form.method,
      fields: form.fields.map((field) => ({
        name: field.name,
        type: field.type,
        value: field.value,
        label: field.label,
        required: field.required,
        hidden: field.hidden,
        options: field.options,
      })),
    }));
  }

  // Media
  if (opts.includeEmpty || snapshot.media.length > 0) {
    output.media = snapshot.media.map((media) => {
      const base: Record<string, unknown> = {
        ref: media.refNumber,
        type: media.type,
        src: media.src,
        alt: media.alt,
        title: media.title,
        width: media.width,
        height: media.height,
      };

      // Include processed media fields if present
      const processed = media as ProcessedMedia;
      if (processed.localPath) {
        base.localPath = processed.localPath;
      }
      if (processed.fileSize) {
        base.fileSize = processed.fileSize;
      }
      if (processed.originalWidth) {
        base.originalWidth = processed.originalWidth;
        base.originalHeight = processed.originalHeight;
      }
      if (processed.duration) {
        base.duration = processed.duration;
      }
      if (processed.frames && processed.frames.length > 0) {
        base.frames = processed.frames;
      }
      if (processed.error) {
        base.error = processed.error;
      }
      // Include MCP content for AI agents
      if (processed.mcpContent) {
        base.mcpContent = processed.mcpContent;
      }
      if (processed.mcpFrames && processed.mcpFrames.length > 0) {
        base.mcpFrames = processed.mcpFrames;
      }

      return base;
    });
  }

  // Metadata
  if (opts.includeEmpty || Object.keys(snapshot.metadata).length > 0) {
    output.metadata = snapshot.metadata;
  }

  // Timing
  if (opts.includeTiming) {
    output.timing = snapshot.timing;
  }

  // Truncation info
  if (snapshot.truncated) {
    output.truncated = true;
    output.truncationInfo = snapshot.truncationInfo;
  }

  // Serialize
  if (opts.pretty) {
    return JSON.stringify(output, null, opts.indent);
  }
  return JSON.stringify(output);
}

/**
 * Format as NDJSON (newline-delimited JSON) for streaming
 */
export function formatAsNdjson(snapshots: PageSnapshot[]): string {
  return snapshots.map((s) => formatAsJson(s, { pretty: false })).join('\n');
}
