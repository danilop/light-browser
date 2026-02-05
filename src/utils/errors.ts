/**
 * Light Browser - Error Handling Utilities
 *
 * Custom error classes and error handling utilities for
 * graceful degradation and informative error reporting.
 */

import { ErrorCode, type LightBrowserError } from '../core/types.ts';

/**
 * Custom error class for Light Browser errors.
 * Includes error code, recoverability flag, and optional suggestions.
 */
export class BrowserError extends Error implements LightBrowserError {
  code: ErrorCode;
  recoverable: boolean;
  suggestion?: string;
  details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      recoverable?: boolean;
      suggestion?: string;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'BrowserError';
    this.code = code;
    this.recoverable = options?.recoverable ?? false;
    this.suggestion = options?.suggestion;
    this.details = options?.details;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Convert to a plain object for JSON serialization
   */
  toJSON(): LightBrowserError {
    return {
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      suggestion: this.suggestion,
      details: this.details,
    };
  }
}

/**
 * Create a network error
 */
export function networkError(
  message: string,
  options?: { cause?: Error; details?: unknown }
): BrowserError {
  return new BrowserError(ErrorCode.NETWORK_ERROR, message, {
    recoverable: true,
    suggestion: 'Check your internet connection and try again',
    ...options,
  });
}

/**
 * Create a DNS resolution error
 */
export function dnsError(hostname: string, options?: { cause?: Error }): BrowserError {
  return new BrowserError(ErrorCode.DNS_ERROR, `Could not resolve hostname: ${hostname}`, {
    recoverable: false,
    suggestion: 'Check that the URL is correct',
    ...options,
  });
}

/**
 * Create a timeout error
 */
export function timeoutError(
  url: string,
  timeoutMs: number,
  options?: { cause?: Error }
): BrowserError {
  return new BrowserError(ErrorCode.TIMEOUT, `Request to ${url} timed out after ${timeoutMs}ms`, {
    recoverable: true,
    suggestion: 'Try again or increase the timeout',
    ...options,
  });
}

/**
 * Create an SSL/TLS error
 */
export function sslError(message: string, options?: { cause?: Error }): BrowserError {
  return new BrowserError(ErrorCode.SSL_ERROR, message, {
    recoverable: false,
    suggestion: 'The site may have an invalid SSL certificate',
    ...options,
  });
}

/**
 * Create an HTTP client error (4xx)
 */
export function httpClientError(
  statusCode: number,
  url: string,
  options?: { cause?: Error }
): BrowserError {
  const messages: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized - authentication required',
    403: 'Forbidden - access denied',
    404: 'Page not found',
    429: 'Too many requests - rate limited',
  };

  const message = messages[statusCode] ?? `HTTP ${statusCode} error`;

  return new BrowserError(ErrorCode.HTTP_CLIENT_ERROR, `${message} for ${url}`, {
    recoverable: statusCode === 429,
    suggestion:
      statusCode === 429
        ? 'Wait a moment and try again'
        : statusCode === 404
          ? 'Check that the URL is correct'
          : undefined,
    details: { statusCode, url },
    ...options,
  });
}

/**
 * Create an HTTP server error (5xx)
 */
export function httpServerError(
  statusCode: number,
  url: string,
  options?: { cause?: Error }
): BrowserError {
  return new BrowserError(ErrorCode.HTTP_SERVER_ERROR, `Server error (${statusCode}) for ${url}`, {
    recoverable: true,
    suggestion: 'The server may be temporarily unavailable. Try again later.',
    details: { statusCode, url },
    ...options,
  });
}

/**
 * Create a parse error
 */
export function parseError(
  message: string,
  options?: { cause?: Error; details?: unknown }
): BrowserError {
  return new BrowserError(ErrorCode.PARSE_ERROR, message, {
    recoverable: false,
    suggestion: 'The page content may be malformed',
    ...options,
  });
}

/**
 * Create an extraction error
 */
export function extractionError(
  message: string,
  options?: { cause?: Error; details?: unknown }
): BrowserError {
  return new BrowserError(ErrorCode.EXTRACTION_ERROR, message, {
    recoverable: true,
    suggestion: 'Try a different extraction method or selector',
    ...options,
  });
}

/**
 * Determine if an error is a network-related error from fetch
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      message.includes('socket')
    );
  }
  return false;
}

/**
 * Wrap an unknown error into a BrowserError
 */
export function wrapError(error: unknown): BrowserError {
  if (error instanceof BrowserError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Try to classify the error
    if (message.includes('enotfound') || message.includes('getaddrinfo')) {
      return new BrowserError(ErrorCode.DNS_ERROR, error.message, {
        recoverable: false,
        cause: error,
      });
    }

    if (message.includes('etimedout') || message.includes('timeout')) {
      return new BrowserError(ErrorCode.TIMEOUT, error.message, {
        recoverable: true,
        cause: error,
      });
    }

    if (message.includes('ssl') || message.includes('certificate')) {
      return new BrowserError(ErrorCode.SSL_ERROR, error.message, {
        recoverable: false,
        cause: error,
      });
    }

    if (isNetworkError(error)) {
      return new BrowserError(ErrorCode.NETWORK_ERROR, error.message, {
        recoverable: true,
        cause: error,
      });
    }

    // Generic error wrapping
    return new BrowserError(ErrorCode.NETWORK_ERROR, error.message, {
      recoverable: false,
      cause: error,
    });
  }

  // Unknown error type
  return new BrowserError(ErrorCode.NETWORK_ERROR, String(error), { recoverable: false });
}
