/**
 * Light Browser - MCP Server
 *
 * Model Context Protocol server for AI agents.
 * Provides browse(), navigate(), snapshot(), and interact() operations.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { createEngine } from '../core/engine/index.ts';
import { loadConfig } from '../core/config.ts';
import { extractFromHtml } from '../extraction/html.ts';
import { extractFromPdfUrl, isPdfUrl } from '../extraction/pdf.ts';
import { filterByQuery } from '../extraction/semantic.ts';
import { truncate } from '../utils/tokens.ts';
import { formatAsMarkdown } from '../output/markdown.ts';
import { formatAsJson } from '../output/json.ts';
import { formatAsText } from '../output/text.ts';
import { processAllMedia, getMCPContent, type ProcessedMedia } from '../utils/media-proc.ts';
import {
  EngineTier,
  type PageSnapshot,
  type MediaRef,
  type ExtractionOptions,
} from '../core/types.ts';
import { PRODUCT_NAME, VERSION } from '../core/config.ts';
import {
  createFormState,
  fillFields,
  submitForm,
  findForm,
  getFieldNames,
  validateRequired,
  getSubmitPreview,
  type FormState,
} from '../interaction/forms.ts';

// Session storage for stateful operations
const sessions = new Map<
  string,
  {
    url: string;
    snapshot: PageSnapshot;
    createdAt: Date;
    formStates: Map<string, FormState>;
  }
>();

/**
 * MCP Tool definitions
 */
const tools: Tool[] = [
  {
    name: 'browse',
    description:
      'Fetch a URL and return its content. High-level operation that handles most use cases.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        format: {
          type: 'string',
          enum: ['markdown', 'text', 'json'],
          description: 'Output format (default: markdown)',
        },
        maxTier: {
          type: 'number',
          enum: [1, 2, 3],
          description: 'Maximum engine tier: 1=static, 2=jsdom, 3=playwright (default: 3)',
        },
        query: {
          type: 'string',
          description: 'Semantic search query to filter content',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords to filter content (exact match)',
        },
        selectors: {
          type: 'array',
          items: { type: 'string' },
          description: 'CSS selectors to extract specific elements',
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens in output (truncates if exceeded)',
        },
        includeMedia: {
          type: 'boolean',
          description: 'Whether to download and include media (default: false)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'navigate',
    description: 'Navigate to a URL and create a session for subsequent operations.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        sessionId: { type: 'string', description: 'Session ID (generated if not provided)' },
        maxTier: { type: 'number', enum: [1, 2, 3], description: 'Maximum engine tier' },
      },
      required: ['url'],
    },
  },
  {
    name: 'snapshot',
    description: 'Get the current page snapshot from a session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        format: {
          type: 'string',
          enum: ['markdown', 'text', 'json'],
          description: 'Output format',
        },
        query: { type: 'string', description: 'Semantic search query' },
        maxTokens: { type: 'number', description: 'Maximum tokens in output' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_links',
    description: 'Get all links from the current page.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        filter: { type: 'string', description: 'Filter links by text or URL pattern' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_forms',
    description: 'Get all forms from the current page.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'session_list',
    description: 'List all active sessions.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'session_close',
    description: 'Close a session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to close' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'fill_form',
    description: 'Fill fields in a form. Call get_forms first to see available forms and fields.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        formId: { type: 'string', description: 'Form ID or name (or use formIndex)' },
        formIndex: { type: 'number', description: 'Form index (0-based), alternative to formId' },
        fields: {
          type: 'object',
          description: 'Object mapping field names to values',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['sessionId', 'fields'],
    },
  },
  {
    name: 'submit_form',
    description:
      'Submit a form that was previously filled with fill_form. Returns the resulting page.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        formId: { type: 'string', description: 'Form ID or name (or use formIndex)' },
        formIndex: { type: 'number', description: 'Form index (0-based), alternative to formId' },
        format: {
          type: 'string',
          enum: ['markdown', 'text', 'json'],
          description: 'Output format for result page (default: markdown)',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'click_link',
    description: 'Click a link on the page. The session is updated with the new page.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        linkIndex: { type: 'number', description: 'Link index (1-based, as shown by get_links)' },
        linkText: { type: 'string', description: 'Link text to click (alternative to linkIndex)' },
        linkUrl: {
          type: 'string',
          description: 'Link URL pattern to click (alternative to linkIndex)',
        },
      },
      required: ['sessionId'],
    },
  },
];

/**
 * Handle the browse tool
 */
async function handleBrowse(args: Record<string, unknown>): Promise<CallToolResult> {
  const url = args.url as string;
  const format = (args.format as string) || 'markdown';
  const maxTier = (args.maxTier as number) || 3;
  const query = args.query as string | undefined;
  const keywords = args.keywords as string[] | undefined;
  const selectors = args.selectors as string[] | undefined;
  const maxTokens = args.maxTokens as number | undefined;
  const includeMedia = (args.includeMedia as boolean) || false;

  // Load config and create engine
  const config = loadConfig();
  const engine = createEngine(config, {
    maxTier: maxTier as EngineTier,
    autoEscalate: true,
  });

  try {
    // Handle PDF URLs
    if (isPdfUrl(url)) {
      const pdfResult = await extractFromPdfUrl(url, {
        timeout: config.browser.timeout,
      });

      let content = pdfResult.text;
      if (maxTokens) {
        const truncated = truncate(content, maxTokens);
        content = truncated.content as string;
      }

      return {
        content: [
          { type: 'text', text: `# ${pdfResult.metadata.title || 'PDF Document'}\n\n${content}` },
        ],
      };
    }

    // Fetch page
    const result = await engine.fetch(url);

    // Extract content
    const extractionOptions: ExtractionOptions = {
      format: format as 'markdown' | 'text' | 'json',
      selectors,
      keywords,
      includeMedia,
    };

    const extracted = extractFromHtml(result.html, result.url, extractionOptions);

    // Process media if requested
    let processedMedia: (MediaRef | ProcessedMedia)[] = extracted.media;
    if (includeMedia && extracted.media.length > 0) {
      processedMedia = await processAllMedia(extracted.media, config.media, {
        skipDisabled: true,
      });
    }

    // Apply semantic search if query provided
    let finalContent = extracted.content;
    if (query) {
      const searchResults = await filterByQuery(extracted.content, query);
      finalContent = searchResults.filteredContent;
    }

    // Apply token budget
    if (maxTokens) {
      const truncated = truncate(finalContent, maxTokens);
      finalContent = truncated.content;
    }

    // Build snapshot
    const snapshot: PageSnapshot = {
      url: result.url,
      title: result.title,
      content: finalContent,
      links: extracted.links,
      forms: extracted.forms,
      media: processedMedia,
      metadata: extracted.metadata,
      tierUsed: result.tierUsed,
      timing: result.timing,
    };

    // Format output
    let output: string;
    switch (format) {
      case 'json':
        output = formatAsJson(snapshot);
        break;
      case 'text':
        output = formatAsText(snapshot);
        break;
      case 'markdown':
      default:
        output = formatAsMarkdown(snapshot, {
          linkStyle: 'numbered',
          includeMetadata: true,
        });
    }

    // Build response with media content if available
    const contentItems: CallToolResult['content'] = [{ type: 'text', text: output }];

    // Add media as image content
    if (includeMedia && processedMedia.length > 0) {
      const mcpContent = getMCPContent(processedMedia as ProcessedMedia[]);
      for (const item of mcpContent) {
        if (item.type === 'image') {
          contentItems.push({
            type: 'image',
            data: item.data,
            mimeType: item.mimeType,
          });
        }
      }
    }

    return { content: contentItems };
  } finally {
    await engine.close();
  }
}

/**
 * Handle the navigate tool
 */
async function handleNavigate(args: Record<string, unknown>): Promise<CallToolResult> {
  const url = args.url as string;
  const sessionId = (args.sessionId as string) || `session-${Date.now()}`;
  const maxTier = (args.maxTier as number) || 3;

  const config = loadConfig();
  const engine = createEngine(config, {
    maxTier: maxTier as EngineTier,
    autoEscalate: true,
  });

  try {
    const result = await engine.fetch(url);
    const extracted = extractFromHtml(result.html, result.url, {
      format: 'markdown',
      includeMedia: true,
    });

    const snapshot: PageSnapshot = {
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

    // Store session
    sessions.set(sessionId, {
      url: result.url,
      snapshot,
      createdAt: new Date(),
      formStates: new Map(),
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId,
              url: result.url,
              title: result.title,
              tierUsed: result.tierUsed,
              links: extracted.links.length,
              forms: extracted.forms.length,
            },
            null,
            2
          ),
        },
      ],
    };
  } finally {
    await engine.close();
  }
}

/**
 * Handle the snapshot tool
 */
async function handleSnapshot(args: Record<string, unknown>): Promise<CallToolResult> {
  const sessionId = args.sessionId as string;
  const format = (args.format as string) || 'markdown';
  const query = args.query as string | undefined;
  const maxTokens = args.maxTokens as number | undefined;

  const session = sessions.get(sessionId);
  if (!session) {
    return {
      content: [{ type: 'text', text: `Error: Session '${sessionId}' not found` }],
      isError: true,
    };
  }

  let content = session.snapshot.content;

  // Apply semantic search
  if (query) {
    const searchResults = await filterByQuery(content, query);
    content = searchResults.filteredContent;
  }

  // Apply token budget
  if (maxTokens) {
    const truncated = truncate(content, maxTokens);
    content = truncated.content;
  }

  const snapshot = { ...session.snapshot, content };

  // Format output
  let output: string;
  switch (format) {
    case 'json':
      output = formatAsJson(snapshot);
      break;
    case 'text':
      output = formatAsText(snapshot);
      break;
    case 'markdown':
    default:
      output = formatAsMarkdown(snapshot, {
        linkStyle: 'numbered',
        includeMetadata: true,
      });
  }

  return { content: [{ type: 'text', text: output }] };
}

/**
 * Handle the get_links tool
 */
async function handleGetLinks(args: Record<string, unknown>): Promise<CallToolResult> {
  const sessionId = args.sessionId as string;
  const filter = args.filter as string | undefined;

  const session = sessions.get(sessionId);
  if (!session) {
    return {
      content: [{ type: 'text', text: `Error: Session '${sessionId}' not found` }],
      isError: true,
    };
  }

  let links = session.snapshot.links;

  // Apply filter
  if (filter) {
    const filterLower = filter.toLowerCase();
    links = links.filter(
      (link) =>
        link.text.toLowerCase().includes(filterLower) ||
        link.href.toLowerCase().includes(filterLower)
    );
  }

  const output = links.map((link, i) => `[${i + 1}] ${link.text} - ${link.resolvedUrl}`).join('\n');

  return { content: [{ type: 'text', text: output || 'No links found' }] };
}

/**
 * Handle the get_forms tool
 */
async function handleGetForms(args: Record<string, unknown>): Promise<CallToolResult> {
  const sessionId = args.sessionId as string;

  const session = sessions.get(sessionId);
  if (!session) {
    return {
      content: [{ type: 'text', text: `Error: Session '${sessionId}' not found` }],
      isError: true,
    };
  }

  const forms = session.snapshot.forms;

  if (forms.length === 0) {
    return { content: [{ type: 'text', text: 'No forms found on this page' }] };
  }

  const output = forms
    .map((form, i) => {
      const fields = form.fields
        .map((f) => `  - ${f.name} (${f.type})${f.required ? ' *required' : ''}`)
        .join('\n');
      return `Form ${i + 1}: ${form.id || 'unnamed'}\n  Action: ${form.action}\n  Method: ${form.method}\n  Fields:\n${fields}`;
    })
    .join('\n\n');

  return { content: [{ type: 'text', text: output }] };
}

/**
 * Handle the session_list tool
 */
async function handleSessionList(): Promise<CallToolResult> {
  const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
    id,
    url: session.url,
    createdAt: session.createdAt.toISOString(),
  }));

  return {
    content: [{ type: 'text', text: JSON.stringify(sessionList, null, 2) }],
  };
}

/**
 * Handle the session_close tool
 */
async function handleSessionClose(args: Record<string, unknown>): Promise<CallToolResult> {
  const sessionId = args.sessionId as string;

  if (sessions.delete(sessionId)) {
    return { content: [{ type: 'text', text: `Session '${sessionId}' closed` }] };
  }

  return {
    content: [{ type: 'text', text: `Session '${sessionId}' not found` }],
    isError: true,
  };
}

/**
 * Handle the fill_form tool
 */
async function handleFillForm(args: Record<string, unknown>): Promise<CallToolResult> {
  const sessionId = args.sessionId as string;
  const formId = args.formId as string | undefined;
  const formIndex = args.formIndex as number | undefined;
  const fields = args.fields as Record<string, string>;

  const session = sessions.get(sessionId);
  if (!session) {
    return {
      content: [{ type: 'text', text: `Error: Session '${sessionId}' not found` }],
      isError: true,
    };
  }

  // Find the form
  const form = formId
    ? findForm(session.snapshot.forms, formId)
    : formIndex !== undefined
      ? findForm(session.snapshot.forms, formIndex)
      : session.snapshot.forms[0];

  if (!form) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Form not found (formId: ${formId}, formIndex: ${formIndex})`,
        },
      ],
      isError: true,
    };
  }

  // Create or update form state
  const formKey = form.id || `form-${formIndex ?? 0}`;
  let state = session.formStates.get(formKey);

  if (!state) {
    state = createFormState(form, session.url);
  }

  // Fill fields
  state = fillFields(state, fields);
  session.formStates.set(formKey, state);

  // Validate and return status
  const validation = validateRequired(form, state);
  const preview = getSubmitPreview(state);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            formId: formKey,
            fieldsSet: Object.keys(fields),
            allFields: getFieldNames(form),
            validation: {
              valid: validation.valid,
              missing: validation.missing,
            },
            preview: {
              method: preview.method,
              url: preview.url,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handle the submit_form tool
 */
async function handleSubmitForm(args: Record<string, unknown>): Promise<CallToolResult> {
  const sessionId = args.sessionId as string;
  const formId = args.formId as string | undefined;
  const formIndex = args.formIndex as number | undefined;
  const format = (args.format as string) || 'markdown';

  const session = sessions.get(sessionId);
  if (!session) {
    return {
      content: [{ type: 'text', text: `Error: Session '${sessionId}' not found` }],
      isError: true,
    };
  }

  // Find the form
  const form = formId
    ? findForm(session.snapshot.forms, formId)
    : formIndex !== undefined
      ? findForm(session.snapshot.forms, formIndex)
      : session.snapshot.forms[0];

  if (!form) {
    return {
      content: [{ type: 'text', text: `Error: Form not found` }],
      isError: true,
    };
  }

  // Get form state
  const formKey = form.id || `form-${formIndex ?? 0}`;
  const state = session.formStates.get(formKey);

  if (!state) {
    return {
      content: [{ type: 'text', text: `Error: Form has not been filled. Use fill_form first.` }],
      isError: true,
    };
  }

  // Submit the form
  const result = await submitForm(state);

  if (!result.success) {
    return {
      content: [{ type: 'text', text: `Error: Form submission failed - ${result.error}` }],
      isError: true,
    };
  }

  // Extract content from result page
  const extracted = extractFromHtml(result.html, result.finalUrl, {
    format: format as 'markdown' | 'text' | 'json',
    includeMedia: false,
  });

  // Update session with new page
  // Extract title from metadata or fallback
  const pageTitle = (extracted.metadata as Record<string, unknown>).title as string | undefined;
  const newSnapshot: PageSnapshot = {
    url: result.finalUrl,
    title: pageTitle || 'Form Result',
    content: extracted.content,
    links: extracted.links,
    forms: extracted.forms,
    media: extracted.media,
    metadata: extracted.metadata,
    tierUsed: session.snapshot.tierUsed,
    timing: { fetchMs: 0, totalMs: 0 },
  };

  session.url = result.finalUrl;
  session.snapshot = newSnapshot;
  session.formStates.clear();

  // Format output
  let output: string;
  switch (format) {
    case 'json':
      output = formatAsJson(newSnapshot);
      break;
    case 'text':
      output = formatAsText(newSnapshot);
      break;
    case 'markdown':
    default:
      output = formatAsMarkdown(newSnapshot, {
        linkStyle: 'numbered',
        includeMetadata: true,
      });
  }

  return {
    content: [
      {
        type: 'text',
        text: `Form submitted successfully. Redirected to: ${result.finalUrl}\n\n${output}`,
      },
    ],
  };
}

/**
 * Handle the click_link tool
 */
async function handleClickLink(args: Record<string, unknown>): Promise<CallToolResult> {
  const sessionId = args.sessionId as string;
  const linkIndex = args.linkIndex as number | undefined;
  const linkText = args.linkText as string | undefined;
  const linkUrl = args.linkUrl as string | undefined;

  const session = sessions.get(sessionId);
  if (!session) {
    return {
      content: [{ type: 'text', text: `Error: Session '${sessionId}' not found` }],
      isError: true,
    };
  }

  // Find the link
  let link;
  if (linkIndex !== undefined) {
    // 1-based index
    link = session.snapshot.links[linkIndex - 1];
  } else if (linkText) {
    const textLower = linkText.toLowerCase();
    link = session.snapshot.links.find((l) => l.text.toLowerCase().includes(textLower));
  } else if (linkUrl) {
    const urlLower = linkUrl.toLowerCase();
    link = session.snapshot.links.find(
      (l) =>
        l.href.toLowerCase().includes(urlLower) || l.resolvedUrl.toLowerCase().includes(urlLower)
    );
  }

  if (!link) {
    return {
      content: [{ type: 'text', text: `Error: Link not found` }],
      isError: true,
    };
  }

  // Navigate to the link
  const config = loadConfig();
  const engine = createEngine(config, {
    maxTier: session.snapshot.tierUsed,
    autoEscalate: true,
  });

  try {
    const result = await engine.fetch(link.resolvedUrl);
    const extracted = extractFromHtml(result.html, result.url, {
      format: 'markdown',
      includeMedia: true,
    });

    // Update session with new page
    const newSnapshot: PageSnapshot = {
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

    session.url = result.url;
    session.snapshot = newSnapshot;
    session.formStates.clear();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              navigatedTo: result.url,
              title: result.title,
              links: extracted.links.length,
              forms: extracted.forms.length,
            },
            null,
            2
          ),
        },
      ],
    };
  } finally {
    await engine.close();
  }
}

/**
 * Create and start the MCP server
 */
export async function startMcpServer(): Promise<void> {
  const server = new Server(
    {
      name: PRODUCT_NAME,
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Handle call tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'browse':
          return await handleBrowse(args || {});
        case 'navigate':
          return await handleNavigate(args || {});
        case 'snapshot':
          return await handleSnapshot(args || {});
        case 'get_links':
          return await handleGetLinks(args || {});
        case 'get_forms':
          return await handleGetForms(args || {});
        case 'session_list':
          return await handleSessionList();
        case 'session_close':
          return await handleSessionClose(args || {});
        case 'fill_form':
          return await handleFillForm(args || {});
        case 'submit_form':
          return await handleSubmitForm(args || {});
        case 'click_link':
          return await handleClickLink(args || {});
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${PRODUCT_NAME} MCP server running`);
}

// Export for CLI integration
export { tools };
