# Light Browser

A lightweight web browser designed for **humans** (CLI/TUI) and **AI agents** (MCP). Prioritizes content extraction over visual fidelity, making web content accessible in bandwidth-constrained environments and to systems that process text more efficiently than pixels.

## Features

- **Three engine tiers**: cheerio (static HTML), jsdom (simple JS), Playwright (full browser)
- **Semantic search**: AI-powered content filtering using local embeddings
- **Smart filtering**: When searching, only relevant links and images are returned
- **Multiple outputs**: Markdown, JSON, plain text
- **MCP server**: Full Model Context Protocol support for AI agents
- **Interactive TUI**: Vim-like terminal interface
- **Single binary**: No runtime dependencies needed

## Installation

### Option 1: One-Line Install (requires Bun)

```bash
# Run directly without installing (downloads on first use)
bunx github:danilop/light-browser https://example.com

# Or install globally
bun add -g github:danilop/light-browser
light-browser https://example.com
```

### Option 2: Download Binary (no Bun needed)

Download the pre-built binary for your platform from [Releases](https://github.com/danilop/light-browser/releases):

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | `light-browser-darwin-arm64` |
| macOS (Intel) | `light-browser-darwin-x64` |
| Linux (ARM64) | `light-browser-linux-arm64` |
| Linux (x64) | `light-browser-linux-x64` |
| Windows (x64) | `light-browser-windows-x64.exe` |

```bash
# macOS/Linux: Make executable and move to PATH
chmod +x light-browser-darwin-arm64
sudo mv light-browser-darwin-arm64 /usr/local/bin/light-browser
```

### Option 3: From Source

```bash
git clone https://github.com/danilop/light-browser.git
cd light-browser
bun install
bun run src/index.ts https://example.com
```

## Quick Start

```bash
# CLI: Fetch a page as markdown
light-browser https://example.com

# CLI: Semantic search - find content about pricing
light-browser https://store.com --query "how much does it cost"

# TUI: Interactive terminal browser
light-browser tui https://example.com

# MCP: Start server for AI agents
light-browser serve
```

---

# For Humans

## CLI Usage

### Basic Commands

```bash
# Fetch and display as markdown (default)
light-browser https://example.com

# Output as JSON
light-browser https://example.com --json

# Output as plain text
light-browser https://example.com --format text

# Quiet mode (no status messages)
light-browser https://example.com -q

# Verbose mode (timing details)
light-browser https://example.com -v
```

### Content Filtering

Light Browser offers powerful filtering to extract only what you need:

```bash
# CSS selectors - extract specific elements
light-browser https://example.com -s "main" -s "article"

# Keywords - exact text matching
light-browser https://example.com -k "price" -k "shipping"

# Semantic search - AI-powered similarity matching
light-browser https://example.com --query "contact information"
```

**Smart Link & Media Filtering**: When using `-k` (keywords) or `--query` (semantic search), only links and images that appear in or relate to the matched content are returned. This dramatically reduces noise in the output.

```bash
# Example: On a news site, only get links related to "AI"
light-browser https://news.ycombinator.com --query "artificial intelligence"
# Returns: Only the matching headlines + their specific links
```

### Semantic Search

The `--query` option uses local AI embeddings (all-MiniLM-L6-v2) to find semantically related content:

```bash
# Find pricing info even if page doesn't use the word "price"
light-browser https://store.com --query "how much does it cost"
# Matches: "pricing", "$99", "fees", "subscription cost", etc.

# Find contact methods
light-browser https://company.com --query "ways to reach support"
# Matches: email addresses, phone numbers, contact forms, etc.
```

The ~23MB model downloads automatically on first use and runs entirely locally.

**Options:**
- `--semantic-threshold <0-1>`: Minimum similarity score (default: 0.3)
- `--semantic-top-k <n>`: Maximum results to return (default: 10)

### Engine Tiers

| Tier | Engine | Speed | Use Case |
|------|--------|-------|----------|
| 1 | cheerio | ~50ms | Static HTML pages |
| 2 | jsdom | ~150-300ms | Pages with simple JS |
| 3 | Playwright | ~500-2000ms | Complex SPAs (React, Vue) |

```bash
# Force a specific tier
light-browser https://react-app.com --tier 3

# Default is tier 1 (fastest)
```

### Token Budget

Limit output size for LLM consumption:

```bash
# Limit to ~1000 tokens
light-browser https://example.com --max-tokens 1000
```

### Batch Processing

Process multiple URLs at once:

```bash
# Create URL list
cat > urls.txt << EOF
https://example.com
https://example.org
https://news.ycombinator.com
EOF

# Process all URLs
light-browser --batch urls.txt --batch-output results.json

# With parallel processing
light-browser --batch urls.txt --batch-concurrency 3 --batch-output results.csv
```

### All CLI Options

```
Usage: light-browser [options] [command] [url]

Options:
  -f, --format <format>         markdown, text, json (default: markdown)
  -t, --tier <tier>             Engine tier: 1, 2, or 3 (default: 1)
  --timeout <ms>                Request timeout (default: 30000)
  -s, --selector <selector...>  CSS selectors to extract
  -k, --keyword <keyword...>    Keywords for exact filtering
  --query <text>                Semantic search query
  --semantic-threshold <0-1>    Similarity threshold (default: 0.3)
  --semantic-top-k <n>          Max semantic results (default: 10)
  --max-tokens <n>              Token budget limit
  -q, --quiet                   Suppress status messages
  -v, --verbose                 Show timing details
  --download-media              Process images/videos
  --batch <file>                Process URLs from file
  --batch-output <file>         Write results to file
  --batch-concurrency <n>       Parallel requests (default: 1)
  --stealth                     Browser-like fingerprint
  --json                        Shorthand for --format json

Commands:
  tui [url]                     Interactive terminal UI
  serve                         Start MCP server
```

## TUI (Terminal User Interface)

```bash
light-browser tui https://example.com
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `↓` | Scroll down |
| `k` / `↑` | Scroll up |
| `d` / `PgDn` | Page down |
| `u` / `PgUp` | Page up |
| `g` | Go to top |
| `G` | Go to bottom |
| `1-9` | Follow link by number |
| `/` | Search in page |
| `n` / `N` | Next/previous result |
| `:` | Command mode |
| `q` | Quit |

### Commands

- `:open <url>` - Navigate to URL
- `:links` - Show all links
- `:forms` - Show all forms
- `:refresh` - Reload page
- `:quit` - Exit

---

# For AI Agents (MCP)

Light Browser provides a **Model Context Protocol (MCP) server** for AI agent integration.

## Setup

Add to your MCP client configuration (e.g., `~/.config/claude/claude_desktop_config.json`):

### Option A: Using bunx (Simplest - requires Bun)

No installation or cloning needed. Downloads automatically on first use:

```json
{
  "mcpServers": {
    "light-browser": {
      "command": "bunx",
      "args": ["github:danilop/light-browser", "serve"]
    }
  }
}
```

### Option B: Using Global Install (requires Bun)

After running `bun add -g github:danilop/light-browser`:

```json
{
  "mcpServers": {
    "light-browser": {
      "command": "light-browser",
      "args": ["serve"]
    }
  }
}
```

### Option C: Using Compiled Binary (no Bun needed)

After downloading the binary for your platform:

```json
{
  "mcpServers": {
    "light-browser": {
      "command": "/usr/local/bin/light-browser",
      "args": ["serve"]
    }
  }
}
```

## MCP Tools

### `browse` - High-Level Fetch (Recommended)

The simplest way to get web content:

```json
{
  "name": "browse",
  "arguments": {
    "url": "https://example.com",
    "format": "markdown",
    "query": "find pricing information",
    "maxTokens": 5000
  }
}
```

**Parameters:**
- `url` (required): URL to fetch
- `format`: `"markdown"` | `"text"` | `"json"` (default: markdown)
- `query`: Semantic search to filter content
- `keywords`: Array of exact-match keywords
- `selectors`: Array of CSS selectors
- `maxTokens`: Limit output size
- `maxTier`: Maximum engine tier (1-3)
- `includeMedia`: Include processed images

### `navigate` - Create Session

For multi-step interactions:

```json
{
  "name": "navigate",
  "arguments": { "url": "https://example.com" }
}
// Returns: { "sessionId": "session-abc123" }
```

### `snapshot` - Get Page Content

```json
{
  "name": "snapshot",
  "arguments": {
    "sessionId": "session-abc123",
    "format": "markdown",
    "query": "contact info"
  }
}
```

### `get_links` / `get_forms`

```json
{
  "name": "get_links",
  "arguments": {
    "sessionId": "session-abc123",
    "filter": "pricing"
  }
}
```

### `fill_form` / `submit_form`

```json
{
  "name": "fill_form",
  "arguments": {
    "sessionId": "session-abc123",
    "formId": "login-form",
    "fields": { "username": "user", "password": "pass" }
  }
}
```

```json
{
  "name": "submit_form",
  "arguments": {
    "sessionId": "session-abc123",
    "formId": "login-form"
  }
}
```

### `click_link`

```json
{
  "name": "click_link",
  "arguments": {
    "sessionId": "session-abc123",
    "linkText": "Products"
  }
}
```

### `session_list` / `session_close`

```json
{ "name": "session_list", "arguments": {} }
{ "name": "session_close", "arguments": { "sessionId": "session-abc123" } }
```

## Example Workflows

### Simple Fetch
```
browse({ url: "https://store.com", query: "product prices" })
```

### Multi-Step Navigation
```
1. navigate({ url: "https://store.com" })
   → { sessionId: "session-123" }

2. get_links({ sessionId: "session-123", filter: "products" })

3. click_link({ sessionId: "session-123", linkText: "Products" })

4. session_close({ sessionId: "session-123" })
```

### Form Submission
```
1. navigate({ url: "https://example.com/login" })

2. get_forms({ sessionId: "session-123" })

3. fill_form({
     sessionId: "session-123",
     formId: "login-form",
     fields: { username: "user", password: "pass" }
   })

4. submit_form({ sessionId: "session-123", formId: "login-form" })
   → Returns resulting page content
```

---

# Technical Details

## Media Processing

With `--download-media`:
- **Images**: Resized to max 640×480, converted to WebP
- **Videos**: Frames extracted at intervals (requires ffmpeg)
- **Output**: Base64-encoded MCP-compatible content

## PDF Support

PDFs are automatically detected and extracted:

```bash
light-browser https://example.com/document.pdf
```

## Text Extraction

Light Browser extracts ALL visible text from any HTML structure, regardless of semantic markup. This means it works on:
- Tables used for layout
- Nested divs and spans
- Non-semantic HTML
- Any website, not just those using proper HTML5 semantics

## Development

```bash
# Install dependencies
bun install

# Run tests (180 tests)
bun test

# Type check
bun run typecheck

# Lint & format
bun run lint
bun run format

# Build for current platform
bun run build

# Build for all platforms
bun run build:all
```

## Building Binaries

```bash
# Current platform
bun run build
# → dist/light-browser

# All platforms
bun run build:all
# → dist/light-browser-darwin-arm64
# → dist/light-browser-darwin-x64
# → dist/light-browser-linux-arm64
# → dist/light-browser-linux-x64
# → dist/light-browser-windows-x64.exe
```

## License

MIT
