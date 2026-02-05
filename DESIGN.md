# Light Browser - Technical Design Document

## Technology Stack Decision

**Runtime:** Bun (v1.x)
**Language:** TypeScript
**Browser Engine:** Playwright
**Distribution:** Single binary via `bun build --compile`

### Rationale
- Bun cold start ~50ms (meets <500ms requirement)
- Playwright is best-in-class browser automation
- Official MCP TypeScript SDK is most mature
- Bun can compile to standalone executable
- Fastest path to working product

---

## Project Structure

```
light-browser/
├── src/
│   ├── index.ts                 # Entry point, CLI parsing
│   ├── daemon.ts                # Daemon mode entry
│   │
│   ├── core/
│   │   ├── engine/
│   │   │   ├── index.ts         # Engine orchestration
│   │   │   ├── tier1-cheerio.ts # HTTP + cheerio (static)
│   │   │   ├── tier2-jsdom.ts   # jsdom (simple JS)
│   │   │   ├── tier3-playwright.ts # Full browser
│   │   │   └── escalation.ts    # Auto-escalation logic
│   │   ├── session.ts           # Session management
│   │   ├── config.ts            # Configuration loading/merging
│   │   └── types.ts             # Shared type definitions
│   │
│   ├── extraction/
│   │   ├── html.ts              # HTML content extraction
│   │   ├── pdf.ts               # PDF processing
│   │   ├── media.ts             # Image/video processing
│   │   ├── filters.ts           # Keyword/selector filtering
│   │   └── readability.ts       # Main content extraction
│   │
│   ├── output/
│   │   ├── json.ts              # JSON formatter
│   │   ├── markdown.ts          # Markdown formatter
│   │   ├── text.ts              # Plain text formatter
│   │   └── a11y.ts              # Accessibility tree formatter
│   │
│   ├── mcp/
│   │   ├── server.ts            # MCP server implementation
│   │   ├── handlers.ts          # MCP method handlers
│   │   └── protocol.ts          # MCP types and schemas
│   │
│   ├── tui/
│   │   ├── app.ts               # TUI application
│   │   ├── renderer.ts          # Content renderer
│   │   ├── input.ts             # Keyboard input handling
│   │   └── components/          # UI components
│   │
│   └── utils/
│       ├── encoding.ts          # Character encoding detection
│       ├── media-proc.ts        # Image/video downscaling
│       ├── tokens.ts            # Token counting/budgeting
│       └── errors.ts            # Error types and handling
│
├── config/
│   └── default.yaml             # Default configuration
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── scripts/
│   ├── build.ts                 # Build script
│   └── release.ts               # Release automation
│
├── SPEC.md                      # Requirements specification
├── DESIGN.md                    # This document
├── package.json
├── tsconfig.json
├── bunfig.toml
└── README.md
```

---

## Core Components

### 1. Tiered Engine (`src/core/engine/`)

Three-tier architecture that auto-escalates based on page requirements:

```typescript
enum EngineTier {
  CHEERIO = 1,    // HTTP fetch + cheerio parsing
  JSDOM = 2,      // In-process JS (jsdom/happy-dom)
  PLAYWRIGHT = 3, // Full Chromium browser
}

interface EngineOptions {
  maxTier: EngineTier;      // Don't escalate beyond this
  autoEscalate: boolean;    // Try lower tiers first
  timeout: number;          // Per-tier timeout
  userAgent?: string;
  proxy?: ProxyConfig;
}

interface Engine {
  fetch(url: string, options?: FetchOptions): Promise<PageResult>;
  getActiveTier(): EngineTier;
  escalate(): Promise<void>;
}
```

**Tier implementations:**

```
src/core/engine/
├── index.ts           # Engine interface and orchestration
├── tier1-cheerio.ts   # HTTP + cheerio (static HTML)
├── tier2-jsdom.ts     # jsdom with JS execution
├── tier3-playwright.ts # Full browser
└── escalation.ts      # Auto-escalation logic
```

**Escalation triggers:**
- Page has `<noscript>` content suggesting JS is needed
- Extracted content is suspiciously empty
- jsdom throws unsupported API errors
- Explicit framework detection (React, Vue, Angular)

### 2. Browser Engine (`src/core/engine/tier3-playwright.ts`)

Playwright wrapper for Tier 3 operations.

```typescript
interface BrowserOptions {
  headless: boolean;        // true by default, false for debugging
  timeout: number;          // Page load timeout
  userAgent?: string;       // Custom UA
  proxy?: ProxyConfig;      // Proxy settings
  viewport?: Viewport;      // Virtual viewport size
}

interface PlaywrightEngine {
  navigate(url: string, options?: NavigateOptions): Promise<PageResult>;
  snapshot(options?: SnapshotOptions): Promise<PageSnapshot>;
  interact(action: Action): Promise<void>;
  evaluate<T>(script: string): Promise<T>;
  close(): Promise<void>;
}
```

**Key decisions:**
- Single browser context per session (isolation)
- Lazy browser launch (not started until Tier 3 needed)
- Browser instance pooling for daemon mode

### 2. Session Manager (`src/core/session.ts`)

Manages isolated browsing sessions.

```typescript
interface Session {
  id: string;
  name?: string;
  browser: Browser;
  cookies: CookieJar;
  storage: StorageState;
  config: SessionConfig;
  createdAt: Date;
}

interface SessionManager {
  create(name?: string): Promise<Session>;
  get(id: string): Session | undefined;
  list(): Session[];
  destroy(id: string): Promise<void>;
  destroyAll(): Promise<void>;
}
```

**Key decisions:**
- Sessions are isolated (separate browser contexts)
- Session state can be persisted to disk (opt-in)
- Default session created automatically

### 3. Content Extractor (`src/extraction/`)

Modular extraction pipeline.

```typescript
interface ExtractionOptions {
  format: 'json' | 'markdown' | 'text' | 'a11y';
  selectors?: string[];           // CSS selectors to include
  excludeSelectors?: string[];    // CSS selectors to exclude
  keywords?: string[];            // Keywords to filter by
  keywordMode?: 'any' | 'all';    // Match any or all keywords
  maxTokens?: number;             // Token budget
  priority?: string[];            // Element priority for truncation
  includeMedia?: boolean;         // Include media references
  readabilityMode?: boolean;      // Extract main content only
}

interface PageSnapshot {
  url: string;
  title: string;
  content: StructuredContent | string;
  links: Link[];
  forms: Form[];
  media: MediaRef[];
  metadata: PageMetadata;
  timing: TimingInfo;
  truncated?: boolean;
  truncationInfo?: TruncationInfo;
}
```

**Extraction pipeline:**
1. Get DOM from Playwright
2. Apply selector filters (include/exclude)
3. Extract structured content
4. Apply keyword filters
5. Format to requested output type
6. Apply token budget (truncate if needed)

### 4. MCP Server (`src/mcp/`)

Implements Model Context Protocol server.

```typescript
// Using @modelcontextprotocol/sdk
import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';

const server = new Server({
  name: 'light-browser',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

// Register tools - HIGH-LEVEL API FIRST
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ===== HIGH-LEVEL (covers 80% of use cases) =====
    {
      name: 'browse',
      description: 'Fetch URL and extract content in one call',
      inputSchema: {
        url: { type: 'string', required: true },
        format: { type: 'string', enum: ['markdown', 'text', 'json', 'a11y'] },
        selectors: { type: 'array', items: { type: 'string' } },
        keywords: { type: 'array', items: { type: 'string' } },
        maxTokens: { type: 'number' },
        maxTier: { type: 'number', min: 1, max: 3 },
      }
    },

    // ===== LOW-LEVEL (power users) =====
    { name: 'navigate', description: '...', inputSchema: {...} },
    { name: 'snapshot', description: '...', inputSchema: {...} },
    { name: 'interact', description: '...', inputSchema: {...} },
    // ... remaining operations
  ],
}));
```

**High-level `browse()` operation:**
```typescript
// Single call for AI agents - no session management needed
const result = await browse({
  url: 'https://example.com/article',
  format: 'markdown',
  keywords: ['price', 'shipping'],
  selectors: ['main article'],
  maxTokens: 3000,
  maxTier: 2,  // Don't use Playwright
});

// Returns:
{
  url: string;
  title: string;
  content: string;        // Extracted content in requested format
  links: Link[];
  tierUsed: 1 | 2 | 3;   // Which engine tier was used
  truncated: boolean;
  timing: { fetchMs: number, extractMs: number, totalMs: number };
}
```

**Key decisions:**
- Use official MCP TypeScript SDK
- stdio transport for CLI integration
- **High-level `browse()` for simple cases** (stateless, one call)
- Low-level operations for power users (stateful sessions)

### 5. TUI Application (`src/tui/`)

Terminal user interface using a TUI library.

**Library options:**
- **ink** (React for CLI) - familiar patterns, but heavier
- **blessed/neo-blessed** - powerful but dated API
- **terminal-kit** - good balance of features
- **@preact/signals** + custom renderer - minimal

**Recommended:** `terminal-kit` or custom minimal renderer

**Key features:**
- Vim-like keybindings (configurable)
- Link numbering and quick-jump
- Form field navigation
- Status bar with page info
- Command mode (`:` prefix)
- Search (`/pattern`)

---

## Key Libraries

| Purpose | Library | Tier | Notes |
|---------|---------|------|-------|
| **Tier 1: Static** |
| HTTP client | `undici` (Bun built-in) | 1 | Fast HTTP fetch |
| HTML parsing | `cheerio` | 1 | jQuery-like DOM |
| **Tier 2: Simple JS** |
| DOM + JS | `jsdom` or `happy-dom` | 2 | In-process JS execution |
| **Tier 3: Full browser** |
| Browser automation | `playwright` | 3 | Full Chromium |
| **Shared** |
| MCP server | `@modelcontextprotocol/sdk` | - | Official SDK |
| CLI parsing | `commander` | - | Standard, well-maintained |
| YAML config | `yaml` | - | YAML 1.2 compliant |
| Readability | `@mozilla/readability` | - | Content extraction |
| PDF extraction | `pdf-parse` | - | Text extraction |
| Image processing | `sharp` | - | Fast, native bindings |
| Video frames | shell `ffmpeg` | - | Frame extraction |
| TUI | `terminal-kit` | - | Terminal interface |
| **Semantic Search** |
| Embeddings | `@xenova/transformers` | - | Local ONNX models (all-MiniLM-L6-v2) |
| Vector search | In-memory cosine similarity | - | Simple, fast for per-page data |

---

## Build & Distribution

### Development

```bash
# Install dependencies
bun install

# Run in development
bun run src/index.ts <url>

# Run daemon
bun run src/daemon.ts

# Run tests
bun test
```

### Production Build

```bash
# Compile to standalone binary
bun build ./src/index.ts --compile --outfile light-browser

# Cross-compile
bun build ./src/index.ts --compile --target=bun-linux-x64 --outfile light-browser-linux
bun build ./src/index.ts --compile --target=bun-darwin-arm64 --outfile light-browser-macos-arm
bun build ./src/index.ts --compile --target=bun-windows-x64 --outfile light-browser.exe
```

### Distribution Artifacts

- `light-browser-linux-x64` (~100MB with Playwright)
- `light-browser-darwin-arm64`
- `light-browser-darwin-x64`
- `light-browser-windows-x64.exe`

**Note:** Playwright browsers are NOT bundled. Users run:
```bash
light-browser --install-browsers  # Downloads chromium
```

Or the tool auto-downloads on first use.

---

## Configuration

### Default Config (`config/default.yaml`)

```yaml
# Light Browser Configuration

# Browser settings
browser:
  headless: true
  javascript: true
  timeout: 30000  # 30s
  viewport:
    width: 1280
    height: 720

# Media settings
media:
  images:
    enabled: true
    maxWidth: 640
    maxHeight: 480
    format: webp
    quality: 80
  video:
    enabled: true
    extractFrames: 5
    frameInterval: auto  # or seconds

# Output settings
output:
  defaultFormat: markdown
  includeMetadata: true
  linkStyle: numbered  # or inline

# Extraction settings
extraction:
  readabilityMode: false
  stripNavigation: true
  stripFooters: false

# Privacy settings
privacy:
  respectRobotsTxt: true
  trackingProtection: false
  sendDNT: false

# Network settings
network:
  retries: 2
  followRedirects: true
  maxRedirects: 10

# Session settings
session:
  persistCookies: false
  cookieMode: all  # all, session, none

# Anti-bot settings
antibot:
  mode: honest  # honest, stealth, custom
  userAgent: null  # null = honest identification
```

### Config Precedence

1. CLI flags (highest)
2. Per-request options (MCP)
3. Session config
4. User config (`~/.config/light-browser/config.yaml`)
5. Default config (lowest)

---

## Error Handling

### Error Types

```typescript
enum ErrorCode {
  // Network errors (1xx)
  NETWORK_ERROR = 100,
  DNS_ERROR = 101,
  TIMEOUT = 102,
  SSL_ERROR = 103,

  // HTTP errors (2xx)
  HTTP_CLIENT_ERROR = 200,  // 4xx
  HTTP_SERVER_ERROR = 201,  // 5xx

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

interface LightBrowserError {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
  suggestion?: string;
  details?: unknown;
}
```

### Graceful Degradation

- JS fails → Return static HTML extraction
- Image fails → Return alt text + broken reference
- Timeout → Return partial content with `truncated: true`
- PDF fails → Return raw text if possible

---

## Performance Considerations

### Startup Optimization

1. **Lazy browser launch**: Don't start Playwright until first navigate
2. **Config caching**: Parse YAML once, cache result
3. **Module lazy loading**: Import heavy modules on demand
4. **Pre-compiled binary**: Use `bun build --compile`

### Daemon Mode

1. **Browser pool**: Keep 1-2 browser instances warm
2. **Session reuse**: Reuse contexts when possible
3. **Garbage collection**: Periodic cleanup of old sessions
4. **Health checks**: Restart browsers if they become unresponsive

### Memory Management

1. **Stream large pages**: Don't load entire DOM in memory
2. **Dispose resources**: Close pages/contexts after use
3. **Image processing**: Stream through sharp, don't buffer
4. **Token counting**: Estimate first, count only if near budget

---

## Testing Strategy

### Unit Tests
- Extraction functions
- Output formatters
- Token counting
- Config merging

### Integration Tests
- Full page extraction against fixture HTML
- MCP protocol compliance
- Session lifecycle

### E2E Tests
- Real website extraction (limited, for sanity)
- CLI commands
- TUI interaction (headless terminal)

### Test Fixtures
- Sample HTML pages with various structures
- PDF documents
- Images at various sizes

---

## Development Phases

### Phase 1: Core Foundation + Tier 1 ✅ COMPLETE
- [x] Project setup (Bun, TypeScript, structure)
- [x] Tier 1 engine: HTTP fetch + cheerio
- [x] CLI entry point: `light-browser <url>`
- [x] Basic text extraction → markdown output
- [x] Works for static sites
- [x] Multiple output formats (markdown, text, json)
- [x] 109 automated tests (CLI, extraction, engines, semantic, tokens, PDF)
- [x] Media processing with sharp (image downscaling)
- [x] Video frame extraction with ffmpeg
- [x] MCP-compatible image content (base64 + mimeType)
- [x] `--download-media` CLI flag
- [x] Semantic search with local embeddings (`--query`)

### Phase 2: Tier 2 + 3 Engines ✅ COMPLETE
- [x] Tier 2 engine: jsdom with JS execution
- [x] Tier 3 engine: Playwright wrapper
- [x] Auto-escalation logic
- [x] `--tier` flag to force specific tier

### Phase 3: Extraction Pipeline ✅ COMPLETE
- [x] HTML structure extraction (headings, lists, tables, links)
- [ ] Readability mode (basic implementation done)
- [x] Keyword filtering (`--keyword`)
- [x] Selector filtering (`--selector`)
- [x] Semantic search (`--query`) with local embeddings
- [x] Token budget implementation (`--max-tokens`)
- [x] PDF extraction
- [x] Image downscaling (via sharp)

### Phase 4: MCP Server ✅ COMPLETE
- [x] MCP server with official SDK
- [x] High-level `browse()` operation
- [x] Low-level operations (navigate, snapshot, get_links, get_forms)
- [x] Session management (session_list, session_close)
- [x] Per-request `maxTier` option
- [x] MCP image/audio content types defined

### Phase 5: TUI ✅ COMPLETE
- [x] terminal-kit renderer
- [x] Keyboard navigation (vim-like)
- [x] Link following
- [x] Form display
- [x] Command mode

### Phase 6: Advanced Features ✅ COMPLETE
- [ ] WebSocket streaming (TODO)
- [x] Video frame extraction (via ffmpeg)
- [ ] Challenge handling (TODO)
- [x] Batch processing (`--batch`)
- [x] Stealth mode (`--stealth`)

### Phase 7: Polish & Release
- [ ] Cross-platform builds
- [x] Documentation (README, DESIGN, SPEC)
- [ ] Performance optimization
- [ ] Public release

---

## MCP Media Content

When `--download-media` is used, processed media includes MCP-compatible content for AI agents:

```typescript
// MCP image content (per spec 2025-06-18)
{
  type: 'image',
  data: 'base64-encoded-data',
  mimeType: 'image/webp' | 'image/jpeg' | 'image/png'
}

// Video frames extracted every N seconds
{
  mcpFrames: [
    { type: 'image', data: '...', mimeType: 'image/jpeg' },
    { type: 'image', data: '...', mimeType: 'image/jpeg' },
    // ... up to config.video.extractFrames
  ]
}
```

**Media cache location:** `$TMPDIR/light-browser/media-cache/`

**Helper functions for MCP server:**
- `getMCPContent(media)` - Extract all MCP content from processed media
- `getSingleMCPContent(media)` - Get first image/frame for a media item
- `buildMCPMediaResponse(media)` - Build full MCP tool response with text + images

---

## Semantic Search (`--query`)

Filter content by semantic similarity using local embeddings:

```typescript
// CLI
light-browser https://example.com --query "find pricing information"

// MCP
browse({ url: "...", query: "find pricing information" })
```

**Architecture:**

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Page Content   │────▶│  Chunk & Embed   │────▶│  Vector Store   │
│  (paragraphs,   │     │  (transformers.js│     │  (in-memory     │
│   headings...)  │     │   MiniLM model)  │     │   float32[])    │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐              │
│  Query String   │────▶│  Embed Query     │──────────────┤
└─────────────────┘     └──────────────────┘              ▼
                                                ┌─────────────────┐
                                                │ Cosine Similarity│
                                                │   Top-K Results  │
                                                └─────────────────┘
```

**Implementation Details:**

| Component | Choice | Notes |
|-----------|--------|-------|
| Model | `all-MiniLM-L6-v2` | 384-dim vectors, ~23MB, fast |
| Library | `@xenova/transformers` | ONNX runtime for JS |
| Vector storage | In-memory arrays | Sufficient for single-page data |
| Similarity | Cosine similarity | Standard for text embeddings |
| Chunking | By HTML element | Paragraphs, headings, list items |

**Keyword vs Query comparison:**

| Feature | `--keyword` | `--query` |
|---------|-------------|-----------|
| Matching | Exact text | Semantic similarity |
| Speed | Instant | ~100-500ms (embedding) |
| Model needed | No | Yes (local) |
| Use case | Known terms | Natural language intent |

---

## Resolved Implementation Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Engine architecture** | Three-tier (cheerio→jsdom→Playwright) | Fast when possible, full browser when needed |
| **Tier escalation** | Auto with configurable max | Per-request `maxTier` option, global config |
| **MCP API** | High-level `browse()` + low-level ops | `browse()` covers 80% of agent use cases |
| **Playwright browsers** | Bundle with binary | Works offline, no first-run delay |
| **TUI library** | terminal-kit | Full-featured, has Sixel/Kitty image support |
| **Token counting** | Generic approximation | `chars / 4`. Exact tokenizer unnecessary |
| **Video processing** | Shell ffmpeg | Simpler than wasm, better performance |
| **MCP media output** | base64 in mcpContent field | Per MCP spec 2025-06-18 |
| **Image processing** | sharp library | Fast native bindings, webp/jpeg/png support |
| **Semantic search** | @xenova/transformers + all-MiniLM-L6-v2 | Local embeddings, 384-dim, ~23MB model |
| **Versioning** | SemVer from 0.1.0 | Pre-1.0 allows breaking changes |

## Remaining Open Questions

1. **Naming**: Final product name (currently "Light Browser")
2. **Default User-Agent**: Honest identification vs. browser mimicry
3. **Initial release targets**: All platforms or start with one?
4. **jsdom vs happy-dom**: Which Tier 2 library to use?
