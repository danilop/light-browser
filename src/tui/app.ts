/**
 * Light Browser - TUI Application
 *
 * Terminal-based user interface for browsing the web.
 * Uses terminal-kit for rendering and input handling.
 */

import termkit from 'terminal-kit';
import { createEngine } from '../core/engine/index.ts';
import { loadConfig } from '../core/config.ts';
import { extractFromHtml } from '../extraction/html.ts';
import { formatAsText } from '../output/text.ts';
import type { PageSnapshot } from '../core/types.ts';
import { EngineTier } from '../core/types.ts';

const { terminal } = termkit;

// TUI State
interface TuiState {
  url: string;
  snapshot: PageSnapshot | null;
  scrollOffset: number;
  lines: string[];
  selectedLink: number;
  mode: 'normal' | 'command' | 'search' | 'form';
  commandBuffer: string;
  searchQuery: string;
  searchResults: number[];
  searchIndex: number;
  statusMessage: string;
  loading: boolean;
}

const state: TuiState = {
  url: '',
  snapshot: null,
  scrollOffset: 0,
  lines: [],
  selectedLink: -1,
  mode: 'normal',
  commandBuffer: '',
  searchQuery: '',
  searchResults: [],
  searchIndex: 0,
  statusMessage: 'Press : for commands, / for search, g for go to URL, q to quit',
  loading: false,
};

// Configuration
const config = loadConfig();
const engine = createEngine(config, {
  maxTier: EngineTier.PLAYWRIGHT,
  autoEscalate: true,
});

/**
 * Render the content area
 */
function renderContent(): void {
  const contentHeight = terminal.height - 3; // Leave room for status bar and command line

  terminal.moveTo(1, 2);

  if (state.loading) {
    terminal.eraseLine();
    terminal.yellow('Loading...');
    return;
  }

  if (state.lines.length === 0) {
    terminal.eraseLine();
    terminal.gray('No content. Press g to enter a URL.');
    return;
  }

  // Render visible lines
  for (let i = 0; i < contentHeight; i++) {
    terminal.moveTo(1, i + 2);
    terminal.eraseLine();

    const lineIndex = state.scrollOffset + i;
    if (lineIndex < state.lines.length) {
      const line = state.lines[lineIndex] ?? '';

      // Highlight search results
      if (state.searchResults.includes(lineIndex)) {
        terminal.bgYellow.black(line.substring(0, terminal.width));
      } else if (line.startsWith('[') && line.includes(']')) {
        // Highlight links
        terminal.cyan(line.substring(0, terminal.width));
      } else if (line.startsWith('#')) {
        // Highlight headings
        terminal.bold(line.substring(0, terminal.width));
      } else {
        terminal(line.substring(0, terminal.width));
      }
    }
  }
}

/**
 * Render the status bar
 */
function renderStatusBar(): void {
  terminal.moveTo(1, terminal.height - 1);
  terminal.eraseLine();
  terminal.bgBlue.white();

  const status = state.statusMessage.substring(0, terminal.width - 20);
  const position = state.lines.length > 0 ? ` ${state.scrollOffset + 1}/${state.lines.length}` : '';
  const modeIndicator = state.mode !== 'normal' ? ` [${state.mode}]` : '';

  terminal(
    ` ${status}${' '.repeat(Math.max(0, terminal.width - status.length - position.length - modeIndicator.length - 2))}${modeIndicator}${position} `
  );
  terminal.styleReset();
}

/**
 * Render the command/URL bar
 */
function renderCommandBar(): void {
  terminal.moveTo(1, terminal.height);
  terminal.eraseLine();

  switch (state.mode) {
    case 'command':
      terminal(':').cyan(state.commandBuffer);
      break;
    case 'search':
      terminal('/').yellow(state.searchQuery);
      break;
    default:
      terminal.gray(state.url || 'No URL');
  }
}

/**
 * Render the title bar
 */
function renderTitleBar(): void {
  terminal.moveTo(1, 1);
  terminal.eraseLine();
  terminal.bgCyan.black();

  const title = state.snapshot?.title || 'Light Browser';
  terminal(` ${title.substring(0, terminal.width - 2)} `);
  terminal.styleReset();
}

/**
 * Full screen render
 */
function render(): void {
  terminal.clear();
  renderTitleBar();
  renderContent();
  renderStatusBar();
  renderCommandBar();
}

/**
 * Navigate to a URL
 */
async function navigate(url: string): Promise<void> {
  // Add protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  state.url = url;
  state.loading = true;
  state.statusMessage = `Loading: ${url}`;
  render();

  try {
    const result = await engine.fetch(url);

    const extracted = extractFromHtml(result.html, result.url, {
      format: 'text',
      includeMedia: false,
    });

    state.snapshot = {
      url: result.url,
      title: result.title,
      content: extracted.content,
      links: extracted.links,
      forms: extracted.forms,
      media: extracted.media,
      metadata: extracted.metadata,
      tierUsed: result.tierUsed,
      timing: result.timing,
    };

    // Convert content to lines for display
    const text = formatAsText(state.snapshot);
    state.lines = text.split('\n');
    state.scrollOffset = 0;
    state.selectedLink = -1;
    state.statusMessage = `Loaded in ${result.timing.totalMs}ms (Tier ${result.tierUsed})`;
  } catch (error) {
    state.statusMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
    state.lines = [];
    state.snapshot = null;
  } finally {
    state.loading = false;
    render();
  }
}

/**
 * Scroll the content
 */
function scroll(delta: number): void {
  const maxScroll = Math.max(0, state.lines.length - (terminal.height - 3));
  state.scrollOffset = Math.max(0, Math.min(maxScroll, state.scrollOffset + delta));
  render();
}

/**
 * Search in content
 */
function search(query: string): void {
  state.searchQuery = query;
  state.searchResults = [];

  if (!query) return;

  const lowerQuery = query.toLowerCase();
  state.lines.forEach((line, index) => {
    if (line.toLowerCase().includes(lowerQuery)) {
      state.searchResults.push(index);
    }
  });

  state.searchIndex = 0;
  if (state.searchResults.length > 0) {
    state.scrollOffset = state.searchResults[0] ?? 0;
    state.statusMessage = `Found ${state.searchResults.length} matches`;
  } else {
    state.statusMessage = 'No matches found';
  }

  render();
}

/**
 * Go to next/previous search result
 */
function nextSearchResult(direction: 1 | -1): void {
  if (state.searchResults.length === 0) return;

  state.searchIndex =
    (state.searchIndex + direction + state.searchResults.length) % state.searchResults.length;
  state.scrollOffset = state.searchResults[state.searchIndex] ?? 0;
  state.statusMessage = `Match ${state.searchIndex + 1}/${state.searchResults.length}`;
  render();
}

/**
 * Follow a link by number
 */
function followLink(num: number): void {
  if (!state.snapshot || num < 1 || num > state.snapshot.links.length) {
    state.statusMessage = `Invalid link number: ${num}`;
    render();
    return;
  }

  const link = state.snapshot.links[num - 1];
  if (link) {
    navigate(link.resolvedUrl);
  }
}

/**
 * Execute a command
 */
function executeCommand(cmd: string): void {
  const parts = cmd.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (command) {
    case 'q':
    case 'quit':
    case 'exit':
      cleanup();
      process.exit(0);
      break;

    case 'o':
    case 'open':
      if (args) {
        navigate(args);
      } else {
        state.statusMessage = 'Usage: :open <url>';
        render();
      }
      break;

    case 'links':
      if (state.snapshot) {
        state.lines = state.snapshot.links.map((l, i) => `[${i + 1}] ${l.text} - ${l.resolvedUrl}`);
        state.scrollOffset = 0;
        state.statusMessage = `${state.snapshot.links.length} links`;
        render();
      }
      break;

    case 'forms':
      if (state.snapshot) {
        state.lines = state.snapshot.forms.map(
          (f, i) =>
            `Form ${i + 1}: ${f.id || 'unnamed'} (${f.method} ${f.action})\n  Fields: ${f.fields.map((fld) => fld.name).join(', ')}`
        );
        state.scrollOffset = 0;
        state.statusMessage = `${state.snapshot.forms.length} forms`;
        render();
      }
      break;

    case 'back':
    case 'refresh':
      if (state.url) {
        navigate(state.url);
      }
      break;

    case 'help':
      state.lines = [
        'Light Browser - Keyboard Commands',
        '',
        'Navigation:',
        '  j/↓     - Scroll down',
        '  k/↑     - Scroll up',
        '  d/PgDn  - Page down',
        '  u/PgUp  - Page up',
        '  g       - Go to top',
        '  G       - Go to bottom',
        '',
        'Actions:',
        '  Enter   - Follow link under cursor',
        '  1-9     - Follow link by number',
        '  g       - Enter URL mode',
        '  :       - Command mode',
        '  /       - Search mode',
        '  n       - Next search result',
        '  N       - Previous search result',
        '  q       - Quit',
        '',
        'Commands:',
        '  :open <url>  - Open URL',
        '  :links       - Show all links',
        '  :forms       - Show all forms',
        '  :refresh     - Reload page',
        '  :help        - Show this help',
        '  :quit        - Exit',
      ];
      state.scrollOffset = 0;
      state.statusMessage = 'Help';
      render();
      break;

    default: {
      // Try to interpret as a link number
      const linkNum = parseInt(cmd, 10);
      if (!isNaN(linkNum)) {
        followLink(linkNum);
      } else {
        state.statusMessage = `Unknown command: ${cmd}`;
        render();
      }
    }
  }
}

/**
 * Handle key input
 */
function handleKey(key: string): void {
  // Handle mode-specific input
  if (state.mode === 'command') {
    if (key === 'ENTER') {
      const cmd = state.commandBuffer;
      state.commandBuffer = '';
      state.mode = 'normal';
      executeCommand(cmd);
    } else if (key === 'ESCAPE') {
      state.commandBuffer = '';
      state.mode = 'normal';
      render();
    } else if (key === 'BACKSPACE') {
      state.commandBuffer = state.commandBuffer.slice(0, -1);
      renderCommandBar();
    } else if (key.length === 1) {
      state.commandBuffer += key;
      renderCommandBar();
    }
    return;
  }

  if (state.mode === 'search') {
    if (key === 'ENTER') {
      const query = state.searchQuery;
      state.mode = 'normal';
      search(query);
    } else if (key === 'ESCAPE') {
      state.searchQuery = '';
      state.searchResults = [];
      state.mode = 'normal';
      render();
    } else if (key === 'BACKSPACE') {
      state.searchQuery = state.searchQuery.slice(0, -1);
      renderCommandBar();
    } else if (key.length === 1) {
      state.searchQuery += key;
      renderCommandBar();
    }
    return;
  }

  // Normal mode keys
  switch (key) {
    case 'q':
      cleanup();
      process.exit(0);
      break;

    case 'j':
    case 'DOWN':
      scroll(1);
      break;

    case 'k':
    case 'UP':
      scroll(-1);
      break;

    case 'd':
    case 'PAGE_DOWN':
      scroll(terminal.height - 5);
      break;

    case 'u':
    case 'PAGE_UP':
      scroll(-(terminal.height - 5));
      break;

    case 'g':
      state.scrollOffset = 0;
      render();
      break;

    case 'G':
      state.scrollOffset = Math.max(0, state.lines.length - (terminal.height - 3));
      render();
      break;

    case ':':
      state.mode = 'command';
      state.commandBuffer = '';
      renderCommandBar();
      break;

    case '/':
      state.mode = 'search';
      state.searchQuery = '';
      renderCommandBar();
      break;

    case 'n':
      nextSearchResult(1);
      break;

    case 'N':
      nextSearchResult(-1);
      break;

    case 'ENTER':
      // Follow selected link or first link
      if (state.snapshot && state.snapshot.links.length > 0) {
        followLink(1);
      }
      break;

    default: {
      // Handle number keys for link following
      const num = parseInt(key, 10);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        followLink(num);
      }
    }
  }
}

/**
 * Cleanup before exit
 */
function cleanup(): void {
  terminal.grabInput(false);
  terminal.hideCursor(false);
  terminal.clear();
  terminal.processExit(0);
}

/**
 * Start the TUI application
 */
export async function startTui(initialUrl?: string): Promise<void> {
  // Initialize terminal
  terminal.clear();
  terminal.grabInput(true);
  terminal.hideCursor(true);

  // Handle terminal resize
  terminal.on('resize', () => {
    render();
  });

  // Handle key input
  terminal.on('key', (key: string) => {
    handleKey(key);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    cleanup();
  });

  // Initial render
  render();

  // Navigate to initial URL if provided
  if (initialUrl) {
    await navigate(initialUrl);
  }
}

// Export for testing
export { state, navigate, scroll, search, executeCommand };
