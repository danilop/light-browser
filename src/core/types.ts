/**
 * Light Browser - Core Type Definitions
 *
 * Shared types used across the application for engine operations,
 * content extraction, and output formatting.
 */

// ============================================================================
// Engine Types
// ============================================================================

/**
 * Three-tier engine architecture:
 * - CHEERIO (Tier 1): HTTP fetch + cheerio parsing for static HTML
 * - JSDOM (Tier 2): In-process JS execution with jsdom/happy-dom
 * - PLAYWRIGHT (Tier 3): Full Chromium browser for complex SPAs
 */
export enum EngineTier {
  CHEERIO = 1,
  JSDOM = 2,
  PLAYWRIGHT = 3,
}

export interface EngineOptions {
  /** Maximum tier to escalate to */
  maxTier: EngineTier;
  /** Whether to try lower tiers first and auto-escalate */
  autoEscalate: boolean;
  /** Timeout per tier in milliseconds */
  timeout: number;
  /** Custom User-Agent string */
  userAgent?: string;
  /** Proxy configuration */
  proxy?: ProxyConfig;
  /** Custom headers */
  headers?: Record<string, string>;
}

export interface ProxyConfig {
  url: string;
  username?: string;
  password?: string;
}

export interface FetchOptions {
  /** HTTP method */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Request body */
  body?: string | Record<string, unknown>;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Follow redirects */
  followRedirects?: boolean;
  /** Maximum redirects to follow */
  maxRedirects?: number;
}

// ============================================================================
// Content Types
// ============================================================================

export interface PageResult {
  /** Final URL after redirects */
  url: string;
  /** Page title */
  title: string;
  /** Raw HTML content */
  html: string;
  /** HTTP status code */
  statusCode: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Redirect chain if any */
  redirectChain: string[];
  /** Which engine tier was used */
  tierUsed: EngineTier;
  /** Timing information */
  timing: TimingInfo;
}

export interface TimingInfo {
  /** Time to fetch the page in ms */
  fetchMs: number;
  /** Time to extract content in ms */
  extractMs?: number;
  /** Time for semantic search in ms */
  semanticMs?: number;
  /** Time to process media in ms */
  mediaMs?: number;
  /** Total processing time in ms */
  totalMs: number;
}

export interface Link {
  /** Link text content */
  text: string;
  /** href attribute */
  href: string;
  /** Resolved absolute URL */
  resolvedUrl: string;
  /** Link type classification */
  type: 'navigation' | 'content' | 'external' | 'download' | 'anchor';
  /** Reference number for easy access */
  refNumber?: number;
}

export interface FormField {
  /** Field id attribute */
  id?: string;
  /** Field name attribute */
  name: string;
  /** Field type (text, password, checkbox, etc.) */
  type: string;
  /** Current value */
  value: string;
  /** Label text if available */
  label?: string;
  /** Whether the field is required */
  required: boolean;
  /** Options for select/radio fields */
  options?: { value: string; text: string; selected: boolean }[];
  /** Whether this is a hidden field */
  hidden: boolean;
}

export interface Form {
  /** Form id attribute */
  id?: string;
  /** Form name attribute */
  name?: string;
  /** Form index in the page (0-based) */
  index?: number;
  /** Form action URL */
  action: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** Form encoding type */
  enctype?: string;
  /** Form fields */
  fields: FormField[];
}

export interface MediaRef {
  /** Media type */
  type: 'image' | 'video' | 'audio' | 'canvas';
  /** Source URL */
  src: string;
  /** Alt text for images */
  alt?: string;
  /** Title attribute */
  title?: string;
  /** Dimensions if known */
  width?: number;
  height?: number;
  /** Reference number */
  refNumber: number;
}

export interface PageMetadata {
  /** Meta description */
  description?: string;
  /** Meta keywords */
  keywords?: string[];
  /** Open Graph data */
  og?: Record<string, string>;
  /** Canonical URL */
  canonical?: string;
  /** Language */
  lang?: string;
  /** Character encoding */
  charset?: string;
}

// ============================================================================
// Extraction Types
// ============================================================================

export type OutputFormat = 'json' | 'markdown' | 'text' | 'a11y';

export interface ExtractionOptions {
  /** Output format */
  format: OutputFormat;
  /** CSS selectors to include */
  selectors?: string[];
  /** CSS selectors to exclude */
  excludeSelectors?: string[];
  /** Keywords to filter by */
  keywords?: string[];
  /** Match any or all keywords */
  keywordMode?: 'any' | 'all';
  /** Token budget for output */
  maxTokens?: number;
  /** Element priority for truncation */
  priority?: string[];
  /** Include media references */
  includeMedia?: boolean;
  /** Use readability mode to extract main content */
  readabilityMode?: boolean;
}

export interface StructuredContent {
  /** Content type */
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'blockquote' | 'code' | 'image' | 'link';
  /** Heading level for headings */
  level?: number;
  /** Text content */
  text?: string;
  /** Child elements */
  children?: StructuredContent[];
  /** Additional attributes */
  attrs?: Record<string, string>;
}

export interface PageSnapshot {
  /** Page URL */
  url: string;
  /** Page title */
  title: string;
  /** Extracted content (structured or formatted string) */
  content: StructuredContent[] | string;
  /** All links on the page */
  links: Link[];
  /** All forms on the page */
  forms: Form[];
  /** Media references */
  media: MediaRef[];
  /** Page metadata */
  metadata: PageMetadata;
  /** Timing information */
  timing: TimingInfo;
  /** Which engine tier was used */
  tierUsed: EngineTier;
  /** Whether content was truncated */
  truncated?: boolean;
  /** Truncation details */
  truncationInfo?: {
    reason: 'token_budget' | 'size_limit';
    originalTokens: number;
    returnedTokens: number;
    itemsOmitted: number;
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface BrowserConfig {
  headless: boolean;
  javascript: boolean;
  timeout: number;
  viewport: {
    width: number;
    height: number;
  };
}

export interface MediaConfig {
  images: {
    enabled: boolean;
    maxWidth: number;
    maxHeight: number;
    format: 'webp' | 'jpeg' | 'png';
    quality: number;
  };
  video: {
    enabled: boolean;
    extractFrames: number;
    frameInterval: 'auto' | number;
  };
}

export interface OutputConfig {
  defaultFormat: OutputFormat;
  includeMetadata: boolean;
  linkStyle: 'numbered' | 'inline';
}

export interface ExtractionConfig {
  readabilityMode: boolean;
  stripNavigation: boolean;
  stripFooters: boolean;
}

export interface PrivacyConfig {
  respectRobotsTxt: boolean;
  trackingProtection: boolean;
  sendDNT: boolean;
}

export interface NetworkConfig {
  retries: number;
  followRedirects: boolean;
  maxRedirects: number;
}

export interface SessionConfig {
  persistCookies: boolean;
  cookieMode: 'all' | 'session' | 'none';
}

export interface AntibotConfig {
  mode: 'honest' | 'stealth' | 'custom';
  userAgent: string | null;
}

export interface Config {
  browser: BrowserConfig;
  media: MediaConfig;
  output: OutputConfig;
  extraction: ExtractionConfig;
  privacy: PrivacyConfig;
  network: NetworkConfig;
  session: SessionConfig;
  antibot: AntibotConfig;
}

// ============================================================================
// Error Types
// ============================================================================

export enum ErrorCode {
  // Network errors (1xx)
  NETWORK_ERROR = 100,
  DNS_ERROR = 101,
  TIMEOUT = 102,
  SSL_ERROR = 103,

  // HTTP errors (2xx)
  HTTP_CLIENT_ERROR = 200,
  HTTP_SERVER_ERROR = 201,

  // Page errors (3xx)
  JS_ERROR = 300,
  RESOURCE_BLOCKED = 301,

  // Processing errors (4xx)
  PARSE_ERROR = 400,
  ENCODING_ERROR = 401,
  EXTRACTION_ERROR = 402,

  // Session errors (5xx)
  SESSION_NOT_FOUND = 500,
  SESSION_EXPIRED = 501,
}

export interface LightBrowserError {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
  suggestion?: string;
  details?: unknown;
}
