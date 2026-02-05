/**
 * Light Browser - Configuration Management
 *
 * Handles loading, merging, and validating configuration from:
 * 1. Default values (lowest priority)
 * 2. User config file (~/.config/light-browser/config.yaml)
 * 3. Project config file (./light-browser.yaml)
 * 4. CLI flags / per-request options (highest priority)
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import type { Config, EngineTier } from './types.ts';

// Product name - centralized for easy replacement
export const PRODUCT_NAME = 'light-browser';
export const PRODUCT_DISPLAY_NAME = 'Light Browser';
export const VERSION = '0.1.0';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Config = {
  browser: {
    headless: true,
    javascript: true,
    timeout: 30000,
    viewport: {
      width: 1280,
      height: 720,
    },
  },
  media: {
    images: {
      enabled: true,
      maxWidth: 640,
      maxHeight: 480,
      format: 'webp',
      quality: 80,
    },
    video: {
      enabled: true,
      extractFrames: 5,
      frameInterval: 'auto',
    },
  },
  output: {
    defaultFormat: 'markdown',
    includeMetadata: true,
    linkStyle: 'numbered',
  },
  extraction: {
    readabilityMode: false,
    stripNavigation: true,
    stripFooters: false,
  },
  privacy: {
    respectRobotsTxt: true,
    trackingProtection: false,
    sendDNT: false,
  },
  network: {
    retries: 2,
    followRedirects: true,
    maxRedirects: 10,
  },
  session: {
    persistCookies: false,
    cookieMode: 'all',
  },
  antibot: {
    mode: 'honest',
    userAgent: null,
  },
};

/**
 * Get the user agent string based on config
 */
export function getUserAgent(config: Config): string {
  if (config.antibot.userAgent) {
    return config.antibot.userAgent;
  }

  if (config.antibot.mode === 'honest') {
    return `${PRODUCT_NAME}/${VERSION} (https://github.com/danilop/light-browser)`;
  }

  // Stealth mode - use a common browser UA
  return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

/**
 * Get the path to the user config file
 */
export function getUserConfigPath(): string {
  const home = homedir();
  return join(home, '.config', PRODUCT_NAME, 'config.yaml');
}

/**
 * Get the path to the project config file
 */
export function getProjectConfigPath(): string {
  return join(process.cwd(), `${PRODUCT_NAME}.yaml`);
}

/**
 * Deep merge two config objects, with source taking precedence
 */
function deepMergeConfig(target: Config, source: Partial<Config>): Config {
  const result = { ...target };

  if (source.browser) {
    result.browser = { ...target.browser, ...source.browser };
    if (source.browser.viewport) {
      result.browser.viewport = { ...target.browser.viewport, ...source.browser.viewport };
    }
  }
  if (source.media) {
    result.media = { ...target.media };
    if (source.media.images) {
      result.media.images = { ...target.media.images, ...source.media.images };
    }
    if (source.media.video) {
      result.media.video = { ...target.media.video, ...source.media.video };
    }
  }
  if (source.output) {
    result.output = { ...target.output, ...source.output };
  }
  if (source.extraction) {
    result.extraction = { ...target.extraction, ...source.extraction };
  }
  if (source.privacy) {
    result.privacy = { ...target.privacy, ...source.privacy };
  }
  if (source.network) {
    result.network = { ...target.network, ...source.network };
  }
  if (source.session) {
    result.session = { ...target.session, ...source.session };
  }
  if (source.antibot) {
    result.antibot = { ...target.antibot, ...source.antibot };
  }

  return result;
}

/**
 * Load and parse a YAML config file
 */
function loadYamlFile(path: string): Partial<Config> | null {
  try {
    if (!existsSync(path)) {
      return null;
    }
    const content = readFileSync(path, 'utf-8');
    return YAML.parse(content) as Partial<Config>;
  } catch {
    // Silently ignore config file errors
    return null;
  }
}

/**
 * Load configuration with precedence:
 * 1. Default config
 * 2. User config file
 * 3. Project config file
 * 4. Runtime overrides
 */
export function loadConfig(overrides?: Partial<Config>): Config {
  let config = { ...DEFAULT_CONFIG };

  // Load user config
  const userConfig = loadYamlFile(getUserConfigPath());
  if (userConfig) {
    config = deepMergeConfig(config, userConfig);
  }

  // Load project config
  const projectConfig = loadYamlFile(getProjectConfigPath());
  if (projectConfig) {
    config = deepMergeConfig(config, projectConfig);
  }

  // Apply runtime overrides
  if (overrides) {
    config = deepMergeConfig(config, overrides);
  }

  return config;
}

/**
 * CLI options that can override config
 */
export interface CLIOptions {
  tier?: EngineTier;
  timeout?: number;
  format?: 'json' | 'markdown' | 'text' | 'a11y';
  js?: boolean;
  userAgent?: string;
  headers?: Record<string, string>;
  selectors?: string[];
  keywords?: string[];
  maxTokens?: number;
  readability?: boolean;
}

/**
 * Convert CLI options to config overrides
 */
export function cliOptionsToConfig(options: CLIOptions): Partial<Config> {
  const overrides: Partial<Config> = {};

  if (options.timeout !== undefined) {
    overrides.browser = { ...DEFAULT_CONFIG.browser, timeout: options.timeout };
  }

  if (options.format !== undefined) {
    overrides.output = { ...DEFAULT_CONFIG.output, defaultFormat: options.format };
  }

  if (options.js !== undefined) {
    overrides.browser = {
      ...(overrides.browser ?? DEFAULT_CONFIG.browser),
      javascript: options.js,
    };
  }

  if (options.userAgent !== undefined) {
    overrides.antibot = { ...DEFAULT_CONFIG.antibot, userAgent: options.userAgent };
  }

  if (options.readability !== undefined) {
    overrides.extraction = {
      ...DEFAULT_CONFIG.extraction,
      readabilityMode: options.readability,
    };
  }

  return overrides;
}
