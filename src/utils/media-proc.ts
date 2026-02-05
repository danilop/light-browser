/**
 * Light Browser - Media Processing
 *
 * Handles downloading, processing, and saving media files:
 * - Images: Download and downscale using sharp
 * - Videos: Extract frames using ffmpeg (if available)
 * - Audio: Download and return metadata
 */

import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'bun';
import type { MediaRef, MediaConfig } from '../core/types.ts';
import { PRODUCT_NAME } from '../core/config.ts';

/**
 * MCP-compatible content types for tool responses
 * See: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
 */
export interface MCPImageContent {
  type: 'image';
  data: string; // base64-encoded
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}

export interface MCPAudioContent {
  type: 'audio';
  data: string; // base64-encoded
  mimeType: 'audio/wav' | 'audio/mp3' | 'audio/mpeg' | 'audio/ogg';
}

export type MCPMediaContent = MCPImageContent | MCPAudioContent;

/**
 * Processed media result
 */
export interface ProcessedMedia extends MediaRef {
  /** Local file path where media is saved */
  localPath?: string;
  /** Base64 encoded data (for small images if inline mode) */
  base64?: string;
  /** File size in bytes */
  fileSize?: number;
  /** Original dimensions before processing */
  originalWidth?: number;
  originalHeight?: number;
  /** Processing error if any */
  error?: string;
  /** Video frames extracted (for video type) */
  frames?: string[];
  /** Duration in seconds (for video/audio) */
  duration?: number;
  /** MCP-compatible content for AI agent responses */
  mcpContent?: MCPMediaContent;
  /** MCP-compatible content for video frames */
  mcpFrames?: MCPImageContent[];
}

/**
 * Get the media cache directory
 */
export function getMediaCacheDir(): string {
  const dir = join(tmpdir(), PRODUCT_NAME, 'media-cache');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Generate a unique filename for cached media
 */
function generateCacheFilename(url: string, suffix?: string): string {
  // Create a hash-like identifier from URL
  const urlHash = Buffer.from(url).toString('base64url').slice(0, 16);
  const ext = extname(new URL(url).pathname) || '.bin';
  const base = basename(new URL(url).pathname, ext) || 'media';
  const safeName = base.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 32);
  return `${safeName}-${urlHash}${suffix || ''}${ext}`;
}

/**
 * Download a file from URL
 */
async function downloadFile(url: string, timeout: number = 30000): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'light-browser/0.1.0',
        Accept: '*/*',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Process an image: download, resize, and save
 */
export async function processImage(
  media: MediaRef,
  config: MediaConfig['images'],
  cacheDir?: string
): Promise<ProcessedMedia> {
  const result: ProcessedMedia = { ...media };
  const dir = cacheDir || getMediaCacheDir();

  try {
    // Download the image
    const buffer = await downloadFile(media.src);
    result.fileSize = buffer.length;

    // Get original metadata
    const metadata = await sharp(buffer).metadata();
    result.originalWidth = metadata.width;
    result.originalHeight = metadata.height;

    // Process with sharp
    let processor = sharp(buffer);

    // Resize if needed
    if (
      (metadata.width && metadata.width > config.maxWidth) ||
      (metadata.height && metadata.height > config.maxHeight)
    ) {
      processor = processor.resize(config.maxWidth, config.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert format
    let outputBuffer: Buffer;
    let outputExt: string;

    switch (config.format) {
      case 'webp':
        outputBuffer = await processor.webp({ quality: config.quality }).toBuffer();
        outputExt = '.webp';
        break;
      case 'jpeg':
        outputBuffer = await processor.jpeg({ quality: config.quality }).toBuffer();
        outputExt = '.jpg';
        break;
      case 'png':
        outputBuffer = await processor.png().toBuffer();
        outputExt = '.png';
        break;
      default:
        outputBuffer = await processor.toBuffer();
        outputExt = extname(media.src) || '.jpg';
    }

    // Get processed dimensions
    const processedMeta = await sharp(outputBuffer).metadata();
    result.width = processedMeta.width;
    result.height = processedMeta.height;
    result.fileSize = outputBuffer.length;

    // Save to cache directory
    const filename = generateCacheFilename(
      media.src,
      `-${config.maxWidth}x${config.maxHeight}`
    ).replace(/\.[^.]+$/, outputExt);
    const localPath = join(dir, filename);
    writeFileSync(localPath, outputBuffer);
    result.localPath = localPath;

    // For small images, also provide base64
    if (outputBuffer.length < 50000) {
      // 50KB threshold
      result.base64 = `data:image/${config.format};base64,${outputBuffer.toString('base64')}`;
    }

    // Always provide MCP-compatible content for AI agents
    const mimeType =
      config.format === 'webp'
        ? 'image/webp'
        : config.format === 'png'
          ? 'image/png'
          : 'image/jpeg';
    result.mcpContent = {
      type: 'image',
      data: outputBuffer.toString('base64'),
      mimeType: mimeType as MCPImageContent['mimeType'],
    };
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * Check if ffmpeg is available
 */
let ffmpegAvailable: boolean | null = null;

export async function checkFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) {
    return ffmpegAvailable;
  }

  try {
    const proc = spawn(['ffmpeg', '-version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await proc.exited;
    ffmpegAvailable = proc.exitCode === 0;
  } catch {
    ffmpegAvailable = false;
  }

  return ffmpegAvailable;
}

/**
 * Extract frames from a video using ffmpeg
 */
export async function extractVideoFrames(
  media: MediaRef,
  config: MediaConfig['video'],
  cacheDir?: string
): Promise<ProcessedMedia> {
  const result: ProcessedMedia = { ...media, frames: [] };
  const dir = cacheDir || getMediaCacheDir();

  // Check ffmpeg availability
  if (!(await checkFfmpeg())) {
    result.error = 'ffmpeg not available - video frame extraction skipped';
    return result;
  }

  try {
    // Download video to temp file
    const videoBuffer = await downloadFile(media.src, 60000); // 60s timeout for videos
    const videoFilename = generateCacheFilename(media.src);
    const videoPath = join(dir, videoFilename);
    writeFileSync(videoPath, videoBuffer);
    result.fileSize = videoBuffer.length;

    // Get video duration using ffprobe
    const probeProc = spawn(
      [
        'ffprobe',
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );

    const probeOutput = await new Response(probeProc.stdout).text();
    await probeProc.exited;

    const duration = parseFloat(probeOutput.trim());
    if (!isNaN(duration)) {
      result.duration = duration;
    }

    // Calculate frame extraction points
    const numFrames = config.extractFrames;
    const interval =
      config.frameInterval === 'auto'
        ? (duration || 10) / (numFrames + 1)
        : (config.frameInterval as number);

    // Extract frames
    for (let i = 0; i < numFrames; i++) {
      const timestamp = interval * (i + 1);
      const frameFilename = generateCacheFilename(media.src, `-frame${i + 1}`).replace(
        /\.[^.]+$/,
        '.jpg'
      );
      const framePath = join(dir, frameFilename);

      const frameProc = spawn(
        [
          'ffmpeg',
          '-ss',
          timestamp.toFixed(2),
          '-i',
          videoPath,
          '-vframes',
          '1',
          '-vf',
          `scale='min(640,iw)':'-1'`,
          '-y',
          framePath,
        ],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        }
      );

      await frameProc.exited;

      if (existsSync(framePath)) {
        result.frames!.push(framePath);

        // Read frame and convert to MCP content for AI agents
        const frameBuffer = readFileSync(framePath);
        if (!result.mcpFrames) {
          result.mcpFrames = [];
        }
        result.mcpFrames.push({
          type: 'image',
          data: frameBuffer.toString('base64'),
          mimeType: 'image/jpeg',
        });
      }
    }

    // Clean up video file (keep frames)
    rmSync(videoPath);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * Process audio: download and get metadata
 */
export async function processAudio(media: MediaRef, cacheDir?: string): Promise<ProcessedMedia> {
  const result: ProcessedMedia = { ...media };
  const dir = cacheDir || getMediaCacheDir();

  try {
    // Download audio
    const buffer = await downloadFile(media.src, 60000);
    result.fileSize = buffer.length;

    // Save to cache
    const filename = generateCacheFilename(media.src);
    const localPath = join(dir, filename);
    writeFileSync(localPath, buffer);
    result.localPath = localPath;

    // Get duration if ffprobe available
    if (await checkFfmpeg()) {
      const probeProc = spawn(
        [
          'ffprobe',
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          localPath,
        ],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        }
      );

      const probeOutput = await new Response(probeProc.stdout).text();
      await probeProc.exited;

      const duration = parseFloat(probeOutput.trim());
      if (!isNaN(duration)) {
        result.duration = duration;
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * Process all media from a page
 */
export async function processAllMedia(
  mediaList: MediaRef[],
  config: MediaConfig,
  options?: {
    cacheDir?: string;
    maxConcurrent?: number;
    skipDisabled?: boolean;
  }
): Promise<ProcessedMedia[]> {
  const results: ProcessedMedia[] = [];
  const cacheDir = options?.cacheDir || getMediaCacheDir();
  const maxConcurrent = options?.maxConcurrent || 3;

  // Process in batches to limit concurrency
  for (let i = 0; i < mediaList.length; i += maxConcurrent) {
    const batch = mediaList.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(async (media) => {
      switch (media.type) {
        case 'image':
          if (!config.images.enabled && options?.skipDisabled) {
            return { ...media, error: 'Image processing disabled' };
          }
          return processImage(media, config.images, cacheDir);

        case 'video':
          if (!config.video.enabled && options?.skipDisabled) {
            return { ...media, error: 'Video processing disabled' };
          }
          return extractVideoFrames(media, config.video, cacheDir);

        case 'audio':
          return processAudio(media, cacheDir);

        default:
          return { ...media, error: 'Unknown media type' };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Clean up cached media files
 */
export function clearMediaCache(): void {
  const dir = getMediaCacheDir();
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
  }
}

/**
 * Get summary of processed media
 */
export function getMediaSummary(media: ProcessedMedia[]): {
  total: number;
  processed: number;
  errors: number;
  totalSize: number;
  byType: Record<string, number>;
} {
  const summary = {
    total: media.length,
    processed: 0,
    errors: 0,
    totalSize: 0,
    byType: {} as Record<string, number>,
  };

  for (const m of media) {
    summary.byType[m.type] = (summary.byType[m.type] || 0) + 1;

    if (m.error) {
      summary.errors++;
    } else if (m.localPath || m.base64) {
      summary.processed++;
      summary.totalSize += m.fileSize || 0;
    }
  }

  return summary;
}

/**
 * Extract all MCP-compatible content from processed media
 * For use in MCP tool responses
 */
export function getMCPContent(media: ProcessedMedia[]): MCPMediaContent[] {
  const content: MCPMediaContent[] = [];

  for (const m of media) {
    // Add main MCP content (for images)
    if (m.mcpContent) {
      content.push(m.mcpContent);
    }

    // Add video frames
    if (m.mcpFrames) {
      content.push(...m.mcpFrames);
    }
  }

  return content;
}

/**
 * Get MCP content for a single processed media item
 * Returns the main image or first video frame
 */
export function getSingleMCPContent(media: ProcessedMedia): MCPMediaContent | null {
  if (media.mcpContent) {
    return media.mcpContent;
  }
  if (media.mcpFrames && media.mcpFrames.length > 0) {
    return media.mcpFrames[0] ?? null;
  }
  return null;
}

/**
 * Build MCP tool response content array from processed media
 * Includes both text descriptions and image content
 */
export function buildMCPMediaResponse(
  media: ProcessedMedia[]
): Array<MCPMediaContent | { type: 'text'; text: string }> {
  const response: Array<MCPMediaContent | { type: 'text'; text: string }> = [];

  for (const m of media) {
    // Add text description
    const desc = m.alt || m.title || `${m.type} from ${m.src}`;
    response.push({
      type: 'text',
      text: `[${m.type}:${m.refNumber}] ${desc}${m.error ? ` (Error: ${m.error})` : ''}`,
    });

    // Add image content
    if (m.mcpContent) {
      response.push(m.mcpContent);
    }

    // Add video frames
    if (m.mcpFrames && m.mcpFrames.length > 0) {
      response.push({
        type: 'text',
        text: `Video frames (${m.mcpFrames.length} extracted at ${m.duration ? `${m.duration.toFixed(1)}s duration` : 'unknown duration'}):`,
      });
      for (const frame of m.mcpFrames) {
        response.push(frame);
      }
    }
  }

  return response;
}
