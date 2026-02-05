# Light Browser - Specification Document

> **Note on naming**: "Light Browser" is a working title. The final product name may differ. All references to the name should be centralized for easy replacement. The internal identifier (e.g., `lightbrowser`) may differ from the public display name (e.g., "Light Browser").

## Status: COMPLETE - Requirements Specification Finalized

**Date:** 2026-02-05
**Version:** 1.0

This document captures the complete functional requirements for Light Browser. It intentionally contains no technology implementation decisions - those will be made in a separate design phase.

---

## 1. Vision & Purpose

### 1.1 What We're Building
A lightweight web browser designed to serve two distinct but overlapping user groups:
1. **Human users** - via a text-based interface (TUI/CLI)
2. **AI agents** - via MCP (Model Context Protocol) server interface

The browser prioritizes **content extraction over visual fidelity**, making web content accessible in bandwidth-constrained environments and to systems that process text more efficiently than pixels.

### 1.2 Why This Matters

**For AI Agents:**
- Reduces token/processing cost (text vs. screenshots)
- Accessibility tree often more semantically meaningful than rendered pixels
- Structured output enables better reasoning about page content
- Configurable fidelity allows cost/quality tradeoffs per request
- **Targeted extraction**: Get only the content that matches specific criteria (keywords, patterns, selectors)

**For Humans:**
- Low-bandwidth browsing (remote servers, slow connections, metered data)
- Keyboard-driven navigation
- Privacy (reduced tracking surface, no unnecessary resource loading)
- Focus (content without visual noise)
- Automation-friendly (scriptable, pipeable)

### 1.3 Design Philosophy
- **Content-first**: Extract meaning, not just pixels
- **Configurable fidelity**: Every resource type has tunable quality/size
- **Dual-interface**: Same engine, two frontends (human TUI + MCP API)
- **Graceful degradation**: Handle failures without crashing; report what went wrong
- **Minimal footprint**: Light on resources, fast to start
- **Extensible architecture**: Design for future plugin system, even if not implemented initially

---

## 2. User Interfaces

### 2.1 Human Interface (TUI/CLI)

#### 2.1.1 Modes of Operation
- **Interactive TUI**: Full-screen terminal interface with navigation
- **CLI one-shot**: `lightbrowser <url>` → output to stdout
- **Pipe-friendly**: Accept URLs from stdin, output structured content

#### 2.1.2 TUI Capabilities
- Keyboard-driven navigation (vim-like bindings as default, configurable)
- Link following by label/number
- Form filling with field navigation
- Split view for iframes/frames (nested content)
- Status bar showing: URL, page title, loading state, JS status, media stats
- Command mode for URL entry, settings, search

#### 2.1.3 Visual Content in Terminal
- **Images**: Render via Sixel, Kitty graphics protocol, or ASCII art fallback
- **Configuration**: Max resolution, disable entirely, or ASCII-only mode
- **Inline vs. reference**: Show inline or as `[img:1]` references with URLs

### 2.2 AI Agent Interface (MCP Server)

#### 2.2.1 Core Operations
- `navigate(url, options)` - Load a page with configurable settings
- `snapshot()` - Get current page state (text, a11y tree, media refs)
- `interact(action, target, value?)` - Click, type, select, scroll
- `evaluate(script)` - Run JS and get result (when JS enabled)
- `wait_for(condition)` - Wait for element, text, network idle
- `get_media(ref, options)` - Retrieve specific media at configured quality
- `session_*` - Manage cookies, storage, multiple sessions

#### 2.2.2 Challenge Handling (CAPTCHA, OAuth)
- Return challenge content (image/text) to the agent
- Agent responds with solution
- Browser relays solution and continues flow

#### 2.2.3 Response Formats
- **Structured JSON**: Full page model with elements, attributes, text
- **Markdown**: Human-readable with link references
- **Plain text**: Just the content, no markup
- **Accessibility tree**: Semantic structure as used by screen readers

---

## 3. Content Processing Pipeline

### 3.1 HTML Processing

#### 3.1.1 Text Extraction
- Preserve semantic structure: headings (h1-h6), lists, tables, blockquotes
- Handle `<article>`, `<main>`, `<aside>` landmarks
- Strip non-content elements: ads, nav (configurable), footers (configurable)
- Readability mode: Extract main content, strip boilerplate

#### 3.1.2 Link Handling
- Extract all links with: text, href, rel, target
- Number links for easy reference: `[1] Link text`
- Distinguish: navigation, content, external, download links

#### 3.1.3 Form Handling
- Enumerate form fields with: name, type, current value, options (for select)
- Support: text, password, checkbox, radio, select, textarea, file upload
- Hidden fields: capture but mark as hidden
- Form actions: capture method, action URL, enctype

#### 3.1.4 Table Handling
- Preserve table structure in output
- Handle complex tables: colspan, rowspan, nested tables
- Option to linearize tables for simpler output

#### 3.1.5 Frame/Iframe Handling
- Flatten into main document with markers: `[frame:name]` ... `[/frame:name]`
- Or present as separate addressable content units
- Handle same-origin and cross-origin differently (security)

### 3.2 Media Processing

#### 3.2.1 Images
- **Extraction**: Identify all images (img, picture, background-image in CSS)
- **Downscaling**: Configurable max dimensions (e.g., 640x480)
- **Format conversion**: Convert to efficient format (WebP, JPEG at quality level)
- **Alt text**: Always extract, use as fallback when image disabled
- **Lazy images**: Trigger loading or extract data-src URLs
- **Output options**:
  - Inline base64 (for small images)
  - Reference with URL
  - Omit entirely (text description only)

#### 3.2.2 Video
- **Metadata extraction**: Duration, dimensions, format, poster image
- **Thumbnail/poster**: Extract or generate at configured resolution
- **Frame extraction**: Option to extract N frames as low-res images
- **Transcript**: Extract if available (subtitles, captions)
- **No playback**: This is not a video player (clear scope boundary)

#### 3.2.3 Audio
- **Metadata**: Duration, format, title, artist if available
- **Transcript**: Extract if available
- **No playback**: Return metadata and source URL only

#### 3.2.4 Canvas/WebGL
- **Snapshot**: Capture as image at configured resolution
- **Limitations**: Dynamic content only captured at moment of snapshot

### 3.3 PDF Processing

- **Text extraction**: Full text with structure preservation
- **Image extraction**: Embedded images at configured resolution
- **Page markers**: `[page:1]` etc.
- **Table extraction**: Attempt to preserve table structure
- **Metadata**: Title, author, page count, creation date
- **Links**: Extract internal and external links

### 3.4 Other Document Types

- **Office documents**: Convert to text + images (if converter available)
- **Plain text**: Pass through with encoding detection
- **JSON/XML**: Format and return as text
- **Binary**: Return metadata only (size, type, download URL)

---

## 4. JavaScript Execution

### 4.1 Execution Modes
- **Disabled**: No JS execution, fastest, most predictable
- **Enabled**: Full JS execution with configurable limits
- **Selective**: Block specific scripts (tracking, ads) while allowing others

### 4.2 Execution Limits (when enabled)
- **Timeout**: Max time for initial page load/hydration (configurable)
- **Idle detection**: Consider page "ready" after network idle + DOM stable
- **Memory limit**: Cap memory usage for JS heap
- **Infinite loop protection**: Detect and terminate runaway scripts

### 4.3 Interaction with JS-Heavy Pages (SPAs)
- Wait for framework hydration (React, Vue, Angular patterns)
- Handle client-side routing (pushState, hash changes)
- Re-snapshot after interactions that trigger JS updates

---

## 5. Network & Session Management

### 5.1 HTTP Handling
- **Methods**: GET, POST, PUT, DELETE, etc.
- **Headers**: Custom headers, User-Agent configuration
- **Redirects**: Follow with configurable limit, expose redirect chain
- **Timeouts**: Connect, read, total request timeouts
- **Retries**: Configurable retry policy for transient failures

### 5.2 Cookie Management
- **Storage**: Persist cookies across requests within session
- **Modes**:
  - Accept all
  - Accept session only (no persistent cookies)
  - Accept none
  - Custom rules (per-domain)
- **Export/Import**: Save and restore cookie jars
- **Inspection**: List all cookies for current session

### 5.3 WebSocket Support
- **Connection**: Establish and maintain WebSocket connections
- **Message handling**:
  - Buffer messages with configurable limit
  - Stream to output (for TUI)
  - Return batch on request (for MCP)
- **Lifecycle**: Connect, send, receive, close
- **Multiple connections**: Handle pages with multiple WS connections

### 5.4 Session Management
- **Multiple sessions**: Run isolated sessions (different cookies, storage)
- **Persistence**: Option to persist sessions to disk
- **Profiles**: Named session profiles for different identities/purposes

### 5.5 Proxy Support
- **HTTP/HTTPS proxy**: Standard proxy configuration
- **SOCKS4/5**: For Tor or other SOCKS proxies
- **Per-request proxy**: Different proxy per request if needed
- **Authentication**: Proxy auth support

---

## 6. Security & Privacy

### 6.1 Certificate Handling
- **Strict mode**: Reject invalid/self-signed certificates
- **Permissive mode**: Accept with warning (for testing)
- **Custom CA**: Add custom certificate authorities

### 6.2 Privacy Features
- **Tracking protection**: Block known trackers (configurable lists)
- **Fingerprint reduction**: Minimize browser fingerprint
- **Referrer policy**: Configurable referrer header behavior
- **Do Not Track**: Send DNT header (configurable)

### 6.3 Content Security
- **Mixed content**: Handle HTTP resources on HTTPS pages
- **CSP**: Respect or ignore Content-Security-Policy (configurable)
- **Sandboxing**: Isolate JS execution from host system

### 6.4 Data Handling
- **No telemetry**: Never phone home
- **Local only**: All data stays on user's machine
- **Secure deletion**: Option to securely wipe session data

---

## 7. Output & Formatting

### 7.1 Output Formats

#### 7.1.1 Structured JSON
```
{
  "url": "...",
  "title": "...",
  "content": { /* structured content tree */ },
  "links": [ /* link objects */ ],
  "forms": [ /* form objects */ ],
  "media": [ /* media references */ ],
  "metadata": { /* page metadata */ }
}
```

#### 7.1.2 Markdown
- Headings, lists, tables, links preserved
- Images as references: `![alt](url)` or `[img:1]`
- Forms as description blocks

#### 7.1.3 Plain Text
- Just readable text, minimal formatting
- Links as inline or footnote references

#### 7.1.4 Accessibility Tree
- Full a11y tree as used by assistive technologies
- Role, name, value, state for each element
- Relationships (labelledby, describedby, etc.)

### 7.2 Content Filtering
- **Include/exclude selectors**: CSS selectors to keep/remove
- **Readability mode**: Auto-extract main content
- **Custom extractors**: User-defined extraction rules

---

## 8. Error Handling & Resilience

### 8.1 Error Categories
- **Network errors**: DNS, connection, timeout, SSL
- **HTTP errors**: 4xx, 5xx responses
- **Page errors**: JS exceptions, resource load failures
- **Processing errors**: Parsing failures, encoding issues

### 8.2 Error Reporting
- Structured error objects with: type, message, recoverable flag
- Partial results: Return what was extracted before error
- Suggestions: What the user/agent might try differently

### 8.3 Graceful Degradation
- JS fails → Return non-JS version
- Image fails → Return alt text and broken reference
- Timeout → Return partial content with warning

---

## 9. Configuration & Extensibility

### 9.1 Configuration Levels
- **Global defaults**: System-wide settings
- **Per-session**: Override for specific session
- **Per-request**: Override for single request (MCP)

### 9.2 Configuration Options (Summary)
- Media: max resolution, format, enable/disable per type
- JS: enable/disable, timeout, memory limit
- Network: timeouts, retries, proxy, user-agent
- Privacy: cookies, tracking protection, referrer
- Output: format, content filtering, structure depth

### 9.3 Extensibility Points
- **Custom extractors**: Plugins for specific site patterns
- **Output transformers**: Post-process content
- **Event hooks**: On page load, before request, etc.

---

## 10. Confirmed Design Decisions

Based on our discussion:

| Area | Decision |
|------|----------|
| **Deployment** | Both modes: long-running daemon AND on-demand process |
| **MCP Pattern** | Both: stateless requests AND stateful sessions |
| **Anti-bot** | Configurable: honest mode, stealth mode, or custom fingerprint |
| **Streaming** | Full streaming support for WebSocket and real-time content |
| **Video** | Frame extraction: N frames at configurable intervals + metadata + transcript if available |
| **Extensions** | Design for future extensibility, but no full plugin system in v1 |
| **Doc Formats** | HTML, PDF, plain text, JSON, XML, Markdown (common web formats) |
| **Auth Flows** | Both: manual relay (for agents) + browser handoff option (for humans) |
| **Lazy Content** | Three modes: viewport only, full extraction, OR custom targeted extraction |
| **TUI Accessibility** | Basic keyboard navigation (not full screen reader support) |
| **Archiving** | No built-in archiving (users can pipe output to files) |
| **Concurrency** | One page at a time (simpler, predictable resource usage) |

### 10.1 Custom Targeted Extraction (Detail)

A key differentiator: Allow users/agents to specify extraction criteria so only relevant content is returned.

**Extraction Modes:**

| Mode | Parameter | Description |
|------|-----------|-------------|
| **Keyword filtering** | `keywords` | Plain text matching - return content containing specified words |
| **Semantic search** | `query` | Vector-based similarity - return content semantically related to natural language query |
| **CSS selector** | `selectors` | Extract specific elements by CSS selector |
| **Regex patterns** | `pattern` | Match content against regular expressions |
| **Combination** | Multiple | Filters applied together (AND/OR logic) |

**Keyword vs Query:**
- `keywords: ["price", "shipping"]` → Exact text matching, fast, no model needed
- `query: "find pricing information"` → Semantic similarity using local embedding model

**Semantic Search Implementation:**
- Uses local embedding model (e.g., `all-MiniLM-L6-v2` via transformers.js)
- Generates vectors for page content chunks
- Cosine similarity search against query embedding
- Returns top-K most semantically relevant content
- No external API calls - fully local/offline

**Benefits for AI Agents:**
- Dramatically reduced token count
- Only relevant content = better signal-to-noise
- Can request different extractions from same page without reloading
- Semantic search understands intent, not just keywords

### 10.2 Token Budget Awareness

Two complementary mechanisms for controlling output size:

**1. Extraction (WHAT to include)** - Semantic filtering
- Keywords, selectors, patterns filter content by meaning/structure
- Agent controls signal-to-noise ratio
- Example: `extract: { selectors: ["main article"], keywords: ["price", "shipping"] }`

**2. Explicit Budget (HOW MUCH to return)** - Size constraint
- `max_output_tokens: 5000` limits total response size
- Works AFTER extraction filters are applied
- When budget exceeded: truncate with `[truncated, N more items]` indicator
- Optional: prioritization hints (e.g., "headings first, then paragraphs")

**Combined Usage Examples:**

```javascript
// Keyword filtering (exact match)
{
  "selectors": ["main article"],
  "keywords": ["price", "shipping"],
  "max_output_tokens": 2000
}

// Semantic search (natural language query)
{
  "selectors": ["main article"],
  "query": "find information about pricing and delivery options",
  "max_output_tokens": 2000
}

// Combined: selector + semantic search
{
  "selectors": [".product-details"],
  "query": "what are the technical specifications?"
}
```

**CLI Usage:**
```bash
# Keyword filtering
light-browser https://example.com -k "price" -k "shipping"

# Semantic search
light-browser https://example.com --query "find pricing information"

# Combined
light-browser https://example.com -s ".product" --query "technical specs"
```

### 10.3 Additional Confirmed Decisions

| Area | Decision |
|------|----------|
| **Cross-platform** | Windows, macOS, Linux - all three from initial version |
| **Headed mode** | Yes, optional headed/visible browser mode for debugging |
| **Robots.txt** | Respect by default, can override per-request |
| **Extensions** | Design architecture for future extensibility |
| **Config format** | YAML for configuration files |
| **Streaming output** | Yes, stream content for large pages |
| **License** | Open source, permissive (MIT or Apache 2.0) |
| **Batch processing** | Yes, in both CLI (`--batch urls.txt`) and MCP (`batch_navigate([urls])`) |
| **Image output (MCP)** | File path - save to temp file, return path (agent needs file access) |
| **Startup time** | Critical: must be <500ms cold start |

### 10.4 Performance Implications

The <500ms startup constraint has significant implications:
- Rules out heavy runtimes (Electron)
- Favors compiled languages (Go, Rust) or highly optimized JS
- Daemon mode becomes important: cold start is rare if daemon is running
- Lazy initialization: don't load browser engine until first navigate
- Pre-warming: option to warm up browser engine on daemon start

### 10.5 Environment & Identity

| Area | Decision |
|------|----------|
| **Timezone/Locale** | Use system locale by default (inherit from host) |
| **User-Agent** | Configurable in global config. Default TBD (honest vs. mimicry). Name placeholder for easy replacement. |
| **Naming** | Product name not final. All name references centralized for easy change. Internal ID may differ from public name. |

---

## 11. Areas Requiring Further Definition

The following areas need more thought:

### 11.1 Internationalization
- Character encoding detection and handling
- Right-to-left (RTL) language support
- Non-Latin scripts in TUI rendering

### 11.2 Caching Strategy
- Should fetched resources be cached locally?
- Cache invalidation rules
- Cache size limits

### 11.3 Rate Limiting & Politeness
- Self-imposed rate limiting to avoid overwhelming target sites
- Handling when target site rate-limits us
- Robots.txt: respect it? configurable?

### 11.4 Browser Storage APIs
- LocalStorage / SessionStorage handling
- IndexedDB handling
- Service Workers / PWA support (or explicit non-support)

### 11.5 Navigation Behavior
- Popups / new windows (target="_blank", window.open)
- Meta refresh / HTTP refresh headers
- Back/forward navigation in TUI

### 11.6 Permission APIs
- Geolocation, notifications, camera, microphone requests
- Default behavior: auto-deny? configurable?

### 11.7 File Downloads
- Direct file download handling
- Size limits for downloads
- Binary content handling

### 11.8 Resource Limits
- Maximum page size to process
- Maximum time per request
- Memory limits for processing

### 11.9 Debugging & Observability
- Verbose logging mode
- HAR export for debugging
- Network request inspection

### 11.10 Protocol Support
- HTTP/2 and HTTP/3 support
- DNS-over-HTTPS option
- Custom DNS servers

### 11.11 CLI Specifics
- Exit codes: Standard codes for different error conditions
- Batch mode: Process list of URLs from file?
- Quiet/verbose modes: -q and -v flags?
- Progress output destination: stderr vs. status file?

### 11.12 MCP API Evolution
- API versioning scheme
- Backwards compatibility policy
- Deprecation process

### 11.13 Performance Targets
- What does "light" mean quantitatively?
  - Startup time target?
  - Memory footprint target?
  - CPU usage ceiling?
- These should be defined to guide implementation choices

### 11.14 Distribution & Installation
- Package managers: npm, brew, apt, chocolatey?
- Binary releases: Standalone executables?
- System dependencies: What must user have installed?
- Update mechanism: Auto-update? Manual?

### 11.15 Output Schema
- JSON Schema for structured output?
- Versioned schema for API stability?
- Schema documentation

### 11.16 TUI Text Selection
- How do users copy text from the TUI?
- Rely on terminal's selection?
- Built-in "yank" command?

### 11.17 Image Output Format
- When returning images to agents: base64 inline? File path? URL?
- Different modes for different use cases?

---

## 12. Usability Considerations

### 12.1 For Human Users (TUI/CLI)

#### Discoverability
- Built-in help system (`?` or `:help`)
- Command completion in command mode
- Contextual hints in status bar

#### Feedback
- Progress indication for long operations (loading, scrolling)
- Clear error messages with suggested actions
- Visual distinction between content, links, forms, errors

#### Efficiency
- Minimal keystrokes for common operations
- Jump-to-link by number
- Search within page (`/pattern`)
- Command history

#### Interruption
- Cancel current operation (Ctrl+C)
- Stop page loading
- Abort form submission

### 12.2 For AI Agents (MCP)

#### Element Referencing
- Stable element references that survive re-snapshots (when possible)
- Clear addressing scheme: CSS selectors, XPath, or unique IDs
- Reference by visible text, role, or accessibility name

#### State Awareness
- Clear indication of page state: loading, ready, error
- Notification when page content changes (mutation observer equivalent)
- Session state introspection (cookies, storage)

#### Context Preservation
- Session objects that maintain state across calls
- Ability to query "what happened since last snapshot"
- Form state tracking (what's been filled)

#### Pagination & Infinite Content
- Detection of pagination patterns
- "Load next page" operation
- Configurable scroll-and-capture loops with termination conditions

#### AJAX / Dynamic Content
- Wait-for-content operations with timeout
- Mutation detection: "wait until element appears"
- Network idle detection

#### Result Handling
- Form submission: capture resulting page state
- Navigation: capture redirect chain
- Downloads: report file info without downloading (optional)

### 12.3 Shared Usability Patterns

#### Consistent Mental Model
- Same content extraction logic for TUI and MCP
- Same configuration options available to both
- Same error codes and messages

#### Progressive Disclosure
- Simple operations are simple
- Advanced features don't clutter basic use
- Sensible defaults that work for 80% of cases

---

## 13. Non-Goals (Explicit Scope Boundaries)

- **Not a full browser replacement**: No tabs, bookmarks, history UI beyond basic session
- **Not a media player**: No video/audio playback
- **Not a download manager**: Basic file download only, no queuing/resuming
- **Not a web scraping framework**: No scheduling, no distributed crawling, no data pipelines
- **Not a testing framework**: No assertions, no test runners, no Selenium compatibility
- **Not a screen reader**: Provides accessibility data but is not itself assistive technology
- **Not an archiver**: No WARC/MHTML output (users can build this on top)

---

## 14. Technical Considerations (Pre-Implementation)

### 14.1 Shadow DOM & Web Components
- Custom elements may hide content in shadow DOM
- Need to traverse open shadow roots
- Closed shadow roots: cannot access (browser security)

### 14.2 Canvas & Dynamic Content
- Text rendered in canvas is not extractable as text
- OCR could be applied to canvas snapshots (future feature?)
- WebGL content: snapshot only

### 14.3 SVG Handling
- SVG with embedded text: extract text
- SVG as image: treat as image, downscale
- Inline SVG vs. external SVG

### 14.4 Data URLs & Blobs
- data: URLs should be processed inline
- blob: URLs exist only in page context, must be captured during snapshot

### 14.5 Encoding & Character Sets
- Auto-detect encoding from headers, BOM, meta tags
- Fallback encoding strategy
- Mojibake detection and recovery

### 14.6 Memory Management
- Long-running daemon: prevent memory leaks
- Large page handling: streaming processing vs. full DOM
- Resource cleanup after each request

### 14.7 Process Management
- Graceful shutdown (SIGTERM, SIGINT handling)
- Crash recovery for daemon mode
- Zombie process prevention

---

## Appendix A: Glossary

- **TUI**: Text User Interface (terminal-based)
- **MCP**: Model Context Protocol (AI agent communication standard)
- **A11y tree**: Accessibility tree (semantic structure for assistive tech)
- **SPA**: Single Page Application (JS-heavy dynamic sites)
- **Hydration**: Process of JS framework making static HTML interactive
- **Shadow DOM**: Encapsulated DOM tree attached to an element, used by Web Components
- **Mojibake**: Garbled text resulting from incorrect character encoding interpretation
- **HAR**: HTTP Archive format, standard for logging HTTP transactions

---

## Appendix B: MCP API Surface (Draft)

### Navigation
- `navigate(url, options?)` - Load URL
- `reload(options?)` - Reload current page
- `go_back()` / `go_forward()` - History navigation

### Content Retrieval
- `snapshot(options?)` - Get page content in specified format
- `get_element(selector)` - Get specific element content
- `get_links()` - List all links
- `get_forms()` - List all forms
- `get_media()` - List all media references
- `extract(criteria)` - Custom extraction with filters

### Interaction
- `click(target)` - Click element
- `type(target, text)` - Type into element
- `select(target, value)` - Select dropdown option
- `check(target, checked)` - Check/uncheck checkbox
- `submit(form_target)` - Submit form
- `scroll(direction, amount)` - Scroll page
- `hover(target)` - Hover over element

### Waiting
- `wait_for_element(selector, options?)` - Wait for element
- `wait_for_text(text, options?)` - Wait for text to appear
- `wait_for_network_idle(options?)` - Wait for network to settle
- `wait(ms)` - Fixed delay

### Session Management
- `session_create(name?)` - Create new session
- `session_list()` - List sessions
- `session_switch(id)` - Switch to session
- `session_destroy(id)` - Destroy session
- `cookies_get(filter?)` - Get cookies
- `cookies_set(cookies)` - Set cookies
- `cookies_clear(filter?)` - Clear cookies

### WebSocket
- `ws_list()` - List active WebSocket connections
- `ws_messages(connection_id, options?)` - Get messages
- `ws_send(connection_id, message)` - Send message
- `ws_close(connection_id)` - Close connection

### JavaScript
- `evaluate(script)` - Execute JS, return result

### Challenge Handling
- `challenges_pending()` - List pending challenges (CAPTCHA, auth)
- `challenge_get(id)` - Get challenge content
- `challenge_solve(id, solution)` - Submit solution

### Configuration
- `config_get()` - Get current config
- `config_set(options)` - Update config for session

### Batch Operations
- `batch_navigate([urls], options?)` - Process multiple URLs
- `batch_status()` - Get progress of batch operation
- `batch_results()` - Get results of completed batch

---

## Appendix C: Specification Completeness Self-Check

### Fully Defined Areas ✓
- [x] Core vision and purpose
- [x] Dual-interface architecture (TUI + MCP)
- [x] Content extraction pipeline (HTML, PDF, media)
- [x] JavaScript execution modes and limits
- [x] Session and cookie management
- [x] WebSocket support with full streaming
- [x] Privacy and security features
- [x] Output formats (JSON, Markdown, plain text, a11y tree)
- [x] Custom targeted extraction with keyword filtering
- [x] Token budget awareness for AI agents
- [x] Challenge handling (CAPTCHA, OAuth)
- [x] Deployment modes (daemon + on-demand)
- [x] MCP patterns (stateless + stateful)
- [x] Cross-platform requirement (Win/Mac/Linux)
- [x] Performance targets (<500ms startup)
- [x] Licensing (MIT/Apache permissive open source)

### Requires Definition During Design Phase
- [ ] Specific exit codes and their meanings
- [ ] Exact JSON schema for output formats
- [ ] MCP API versioning scheme
- [ ] Caching strategy and invalidation
- [ ] Rate limiting implementation
- [ ] Browser storage APIs handling (localStorage, IndexedDB)
- [ ] Service Worker behavior
- [ ] Popup/new window handling
- [ ] Permission API responses
- [ ] HTTP/2 and HTTP/3 support scope
- [ ] Installation methods (package managers, binaries)
- [ ] Logging format and destinations
- [ ] Terminal compatibility matrix

### Explicitly Deferred (Not in v1)
- [ ] Full plugin/extension system (architecture designed, not implemented)
- [ ] Office document conversion (Word, Excel, etc.)
- [ ] Archiving/WARC output
- [ ] Full screen reader accessibility
- [ ] Distributed crawling
- [ ] Test framework features

### Usability Checklist

**For Humans (TUI/CLI):**
- [x] Keyboard navigation defined
- [x] Help system mentioned
- [x] Error feedback approach defined
- [x] Progress indication mentioned
- [x] Search in page (`/pattern`)
- [x] CLI piping and batch mode
- [ ] Copy/paste: relies on terminal selection (acceptable)
- [ ] Specific keybindings: define during implementation

**For AI Agents (MCP):**
- [x] Full API surface drafted
- [x] Element referencing approach defined
- [x] Session management defined
- [x] Error reporting defined
- [x] Token budget mechanisms defined
- [x] Batch operations defined
- [x] Challenge handling defined
- [x] Streaming output defined
- [ ] Exact response schemas: define during implementation

---

## Appendix D: Key Differentiators

What makes Light Browser unique compared to existing tools:

1. **Dual-purpose design**: Same engine serves both humans and AI agents
2. **Targeted extraction**: Keyword/selector filtering reduces noise for agents
3. **Token-aware**: Built with LLM context limits in mind
4. **Configurable fidelity**: Every resource type has quality/size controls
5. **Challenge relay**: CAPTCHA/OAuth challenges returned to user/agent for solving
6. **Full streaming**: Real-time WebSocket and content streaming
7. **Tiered engine**: Fast when possible, full browser when needed
8. **Privacy-conscious**: Tracking protection, configurable fingerprint, no telemetry

---

## Appendix E: Tiered Engine Architecture

Light Browser uses a three-tier engine that auto-escalates based on page requirements:

### Tier 1: HTTP + cheerio (fastest)
- Simple HTTP fetch
- HTML parsing with cheerio
- No JavaScript execution
- Speed: ~50ms
- Use for: Static HTML pages, documentation, articles

### Tier 2: jsdom/happy-dom (fast)
- In-process JavaScript execution
- Simulated DOM environment
- Limited Web API support
- Speed: ~100-200ms
- Use for: Pages with simple JS, basic interactivity

### Tier 3: Playwright/Chromium (full)
- Full browser engine
- Complete Web API support
- All modern features work
- Speed: ~500ms+
- Use for: SPAs, React/Vue/Angular, complex interactions

### Auto-Escalation Logic

1. Start at configured max tier (default: Tier 3)
2. If lower tier is sufficient, use it (faster)
3. Detect escalation triggers:
   - Page has `<script>` tags with significant code
   - Content appears incomplete after extraction
   - jsdom throws errors or timeouts
   - Explicit user/agent request for higher tier

### Configuration

```yaml
# Global config
engine:
  maxTier: 3          # 1=cheerio, 2=jsdom, 3=playwright
  autoEscalate: true  # Try lower tiers first
  preferSpeed: false  # If true, default to tier 1
```

```typescript
// Per-request (MCP)
browse(url, {
  maxTier: 2,           // Don't use Playwright
  requireJs: false,     // Hint: page is static
})
```

### Tier Selection Matrix

| Content Type | Recommended Tier | Reason |
|--------------|------------------|--------|
| Static HTML, docs | 1 | No JS needed |
| Blog with comments | 1-2 | May need basic JS |
| News article | 1-2 | Readability works |
| Search results | 2-3 | Often JS-rendered |
| React/Vue SPA | 3 | Requires full browser |
| Web app (Gmail, etc.) | 3 | Complex interactions |

---

## Appendix F: Competitive Positioning

### vs. Lynx/w3m (for Humans)

**When to use Lynx/w3m:**
- Simple static HTML pages
- Ultra-low bandwidth situations
- Need absolute minimal resource usage
- Page is known to be static

**When to use Light Browser:**
- Modern websites requiring JavaScript
- Need images in terminal
- Interacting with forms/SPAs
- Want readability mode extraction
- Need to handle authentication flows

### vs. Playwright MCP (for AI Agents)

**When to use Playwright MCP:**
- Need pixel-perfect screenshots
- Need exact DOM representation
- Complex multi-step browser automation
- Testing/QA workflows

**When to use Light Browser:**
- Want extracted content (not screenshots)
- Need token-efficient output
- Want keyword/selector filtering
- Simple "get page content" operations
- Cost-sensitive (fewer tokens = cheaper)

