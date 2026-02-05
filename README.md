# Light Browser

A lightweight web browser designed for **humans** (CLI/TUI) and **AI agents** (MCP). Prioritizes content extraction over visual fidelity, making web content accessible in bandwidth-constrained environments and to systems that process text more efficiently than pixels.

## Quick Start

```bash
# Install
bun install

# For humans: CLI
bun run src/index.ts https://example.com

# For humans: Interactive TUI
bun run tui https://example.com

# For AI agents: Start MCP server
bun run mcp
```

---

# For Humans

## CLI Usage

The CLI is the primary way for humans to use Light Browser from the command line.

### Basic Commands

```bash
# Fetch and display as markdown (default)
bun run src/index.ts https://example.com

# Output as JSON (great for piping to other tools)
bun run src/index.ts https://example.com --json

# Output as plain text
bun run src/index.ts https://example.com --format text

# Quiet mode (no status messages, just content)
bun run src/index.ts https://example.com -q
```

### Filtering Content

```bash
# Extract only specific CSS selectors
bun run src/index.ts https://example.com -s "main" -s "article"

# Filter by keywords (exact match)
bun run src/index.ts https://example.com -k "price" -k "shipping"

# Semantic search (AI-powered, finds related content)
bun run src/index.ts https://example.com --query "how much does it cost"

# Limit output size (token budget)
bun run src/index.ts https://example.com --max-tokens 1000
```

### Engine Tiers

Light Browser uses three engine tiers for different page types:

| Tier | Engine | Speed | Use Case |
|------|--------|-------|----------|
| 1 | cheerio | ~50ms | Static HTML pages |
| 2 | jsdom | ~150-300ms | Pages with simple JS |
| 3 | Playwright | ~500-2000ms | Complex SPAs (React, Vue, etc.) |

```bash
# Force a specific tier
bun run src/index.ts https://react-app.com --tier 3

# Auto-escalation is on by default (starts at tier 1, escalates if needed)
```

### Batch Processing

Process multiple URLs at once:

```bash
# Create a file with URLs (one per line)
cat > urls.txt << EOF
https://example.com
https://example.org
https://news.ycombinator.com
EOF

# Process all URLs
bun run src/index.ts --batch urls.txt --batch-output results.json

# With parallel processing (3 concurrent requests)
bun run src/index.ts --batch urls.txt --batch-concurrency 3 --batch-output results.json
```

### All CLI Options

```
Options:
  -f, --format <format>       Output format: markdown, text, json (default: "markdown")
  -t, --tier <tier>           Engine tier: 1, 2, or 3 (default: auto)
  --timeout <ms>              Request timeout (default: "30000")
  -s, --selector <selector>   CSS selectors to extract (can use multiple)
  -k, --keyword <keyword>     Keywords to filter (exact match, can use multiple)
  --query <text>              Semantic search query
  --max-tokens <n>            Maximum tokens in output
  -q, --quiet                 Suppress status messages
  -v, --verbose               Show detailed timing info
  --batch <file>              Process URLs from file
  --batch-output <file>       Write batch results to file
  --stealth                   Use browser-like fingerprint
  -h, --help                  Show all options
```

## TUI (Terminal User Interface)

For interactive browsing in the terminal:

```bash
bun run tui https://example.com
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
| `n` / `N` | Next/previous search result |
| `:` | Command mode |
| `q` | Quit |

### TUI Commands

In command mode (press `:`):
- `:open <url>` - Navigate to URL
- `:links` - Show all links
- `:forms` - Show all forms
- `:refresh` - Reload page
- `:help` - Show help
- `:quit` - Exit

---

# For AI Agents (MCP)

Light Browser provides an **MCP (Model Context Protocol) server** that allows AI agents to browse the web programmatically.

## Setting Up MCP Server

### 1. Start the Server

```bash
bun run mcp
```

### 2. Configure Your MCP Client

Add to your MCP client configuration (e.g., `~/.config/your-mcp-client/config.json`):

```json
{
  "mcpServers": {
    "light-browser": {
      "command": "bun",
      "args": ["run", "/path/to/light-browser/src/mcp/index.ts"]
    }
  }
}
```

**Example for a GitHub-cloned repo:**

```json
{
  "mcpServers": {
    "light-browser": {
      "command": "bun",
      "args": ["run", "/Users/danilop/Projects/light-browser/src/mcp/index.ts"]
    }
  }
}
```

### 3. Restart Your MCP Client

The `light-browser` tools will now be available to your AI assistant.

## MCP Tools Reference

### `browse` - High-Level Fetch (Recommended)

The simplest way to get web content. Handles everything automatically.

```json
{
  "name": "browse",
  "arguments": {
    "url": "https://example.com",
    "format": "markdown",
    "maxTokens": 5000,
    "query": "find pricing information"
  }
}
```

**Parameters:**
- `url` (required): URL to fetch
- `format`: `"markdown"` | `"text"` | `"json"` (default: `"markdown"`)
- `maxTier`: `1` | `2` | `3` - Maximum engine tier (default: `3`)
- `query`: Semantic search to filter content
- `keywords`: Array of keywords for exact filtering
- `selectors`: Array of CSS selectors to extract
- `maxTokens`: Limit output size
- `includeMedia`: Include processed images (default: `false`)

### `navigate` - Create a Session

For multi-step interactions with a page:

```json
{
  "name": "navigate",
  "arguments": {
    "url": "https://example.com"
  }
}
```

Returns a `sessionId` for subsequent operations.

### `snapshot` - Get Page Content

Get content from an existing session:

```json
{
  "name": "snapshot",
  "arguments": {
    "sessionId": "session-123456",
    "format": "markdown",
    "query": "find contact info"
  }
}
```

### `get_links` - List All Links

```json
{
  "name": "get_links",
  "arguments": {
    "sessionId": "session-123456",
    "filter": "pricing"
  }
}
```

### `get_forms` - List All Forms

```json
{
  "name": "get_forms",
  "arguments": {
    "sessionId": "session-123456"
  }
}
```

### `session_list` - List Active Sessions

```json
{
  "name": "session_list",
  "arguments": {}
}
```

### `session_close` - Close a Session

```json
{
  "name": "session_close",
  "arguments": {
    "sessionId": "session-123456"
  }
}
```

### `fill_form` - Fill Form Fields

Fill fields in a form before submission:

```json
{
  "name": "fill_form",
  "arguments": {
    "sessionId": "session-123456",
    "formId": "login-form",
    "fields": {
      "username": "myuser",
      "password": "mypassword"
    }
  }
}
```

**Parameters:**
- `sessionId` (required): Session ID
- `formId`: Form ID or name
- `formIndex`: Form index (0-based), alternative to formId
- `fields` (required): Object mapping field names to values

### `submit_form` - Submit a Form

Submit a form that was previously filled:

```json
{
  "name": "submit_form",
  "arguments": {
    "sessionId": "session-123456",
    "formId": "login-form",
    "format": "markdown"
  }
}
```

Returns the resulting page content. The session is updated with the new page.

### `click_link` - Click a Link

Navigate by clicking a link:

```json
{
  "name": "click_link",
  "arguments": {
    "sessionId": "session-123456",
    "linkIndex": 3
  }
}
```

**Parameters:**
- `sessionId` (required): Session ID
- `linkIndex`: Link index (1-based, as shown by get_links)
- `linkText`: Link text to click (alternative to linkIndex)
- `linkUrl`: Link URL pattern to click (alternative to linkIndex)

## Example: AI Agent Workflows

### Simple Fetch
```
browse({ url: "https://store.com", query: "find product prices" })
```

### Multi-Step Navigation
```
1. Create a session:
   navigate({ url: "https://store.com" })
   → Returns: { sessionId: "session-123" }

2. Explore links:
   get_links({ sessionId: "session-123", filter: "products" })

3. Click a link:
   click_link({ sessionId: "session-123", linkText: "Products" })

4. Clean up:
   session_close({ sessionId: "session-123" })
```

### Form Submission (Login, Search, etc.)
```
1. Navigate to page with form:
   navigate({ url: "https://example.com/login" })
   → Returns: { sessionId: "session-123" }

2. List available forms:
   get_forms({ sessionId: "session-123" })
   → Shows: Form 1: login-form, fields: username, password

3. Fill the form:
   fill_form({
     sessionId: "session-123",
     formId: "login-form",
     fields: { "username": "myuser", "password": "secret" }
   })

4. Submit the form:
   submit_form({ sessionId: "session-123", formId: "login-form" })
   → Returns the resulting page (e.g., dashboard)

5. Clean up:
   session_close({ sessionId: "session-123" })
```

## MCP Output Format

The `browse` tool returns content optimized for AI consumption:

```json
{
  "content": [
    {
      "type": "text",
      "text": "# Page Title\n\nExtracted content in markdown..."
    },
    {
      "type": "image",
      "data": "base64-encoded-image-data",
      "mimeType": "image/webp"
    }
  ]
}
```

---

# Technical Details

## Semantic Search

Light Browser includes local AI-powered semantic search using the `all-MiniLM-L6-v2` model.

- **`--keyword`**: Exact text matching
- **`--query`**: Semantic similarity (understands meaning)

```bash
# Exact: only returns content containing "price"
bun run src/index.ts https://store.com -k "price"

# Semantic: finds content about cost, pricing, fees, etc.
bun run src/index.ts https://store.com --query "how much does it cost"
```

The model (~23MB) downloads automatically on first use.

## Media Processing

With `--download-media`, Light Browser processes media for efficient transfer:

- **Images**: Resized to max 640×480, converted to WebP
- **Videos**: Frames extracted at intervals (requires ffmpeg)
- **Output**: Base64-encoded MCP-compatible content

## PDF Support

PDFs are automatically detected and extracted:

```bash
bun run src/index.ts https://example.com/document.pdf
```

## Development

```bash
bun test          # Run 169 tests
bun run typecheck # TypeScript check
bun run build     # Build standalone binary
```

## License

MIT
