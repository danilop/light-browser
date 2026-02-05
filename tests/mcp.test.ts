/**
 * Light Browser - MCP Server Tests
 *
 * End-to-end tests using the actual MCP client library.
 * Spawns the MCP server as a subprocess and communicates via stdio.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  startTestServer,
  stopTestServer,
  clearFormSubmissions,
  getFormSubmissions,
} from './server/index.ts';
import { spawn, type Subprocess } from 'bun';

let baseUrl: string;
let mcpClient: Client;
let mcpProcess: Subprocess;

beforeAll(async () => {
  // Start local web server for testing
  baseUrl = await startTestServer(9879);

  // Spawn MCP server as subprocess
  mcpProcess = spawn({
    cmd: ['bun', 'run', 'src/mcp/index.ts'],
    cwd: process.cwd(),
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Create MCP client with stdio transport
  const transport = new StdioClientTransport({
    command: 'bun',
    args: ['run', 'src/mcp/index.ts'],
    cwd: process.cwd(),
  });

  mcpClient = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

  await mcpClient.connect(transport);
}, 30000); // 30s timeout for startup

afterAll(async () => {
  try {
    await mcpClient?.close();
  } catch {
    // Ignore close errors
  }
  mcpProcess?.kill();
  stopTestServer();
});

/**
 * Count words in a string
 */
function countWords(text: string): number {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/**
 * Count all words in tool descriptions (tool-level + property-level)
 */
function countToolDocumentationWords(
  tools: {
    name: string;
    description?: string;
    inputSchema?: { properties?: Record<string, { description?: string }> };
  }[]
): {
  total: number;
  byTool: Record<string, number>;
  toolDescriptions: number;
  propertyDescriptions: number;
} {
  let total = 0;
  let toolDescriptions = 0;
  let propertyDescriptions = 0;
  const byTool: Record<string, number> = {};

  for (const tool of tools) {
    let toolWords = 0;

    // Count tool description
    if (tool.description) {
      const words = countWords(tool.description);
      toolWords += words;
      toolDescriptions += words;
    }

    // Count property descriptions
    const props = tool.inputSchema?.properties;
    if (props) {
      for (const prop of Object.values(props)) {
        if (prop.description) {
          const words = countWords(prop.description);
          toolWords += words;
          propertyDescriptions += words;
        }
      }
    }

    byTool[tool.name] = toolWords;
    total += toolWords;
  }

  return { total, byTool, toolDescriptions, propertyDescriptions };
}

describe('MCP Client-Server Tests', () => {
  describe('Tool Discovery', () => {
    test('lists all available tools', async () => {
      const result = await mcpClient.listTools();

      expect(result.tools.length).toBeGreaterThanOrEqual(10);

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain('browse');
      expect(toolNames).toContain('navigate');
      expect(toolNames).toContain('snapshot');
      expect(toolNames).toContain('get_links');
      expect(toolNames).toContain('get_forms');
      expect(toolNames).toContain('fill_form');
      expect(toolNames).toContain('submit_form');
      expect(toolNames).toContain('click_link');
      expect(toolNames).toContain('session_list');
      expect(toolNames).toContain('session_close');
    });

    test('reports tool documentation word count', async () => {
      const result = await mcpClient.listTools();
      const stats = countToolDocumentationWords(result.tools);

      // Log the documentation stats for visibility
      console.log('\n=== MCP Tool Documentation Stats ===');
      console.log(`Total tools: ${result.tools.length}`);
      console.log(`Total words: ${stats.total}`);
      console.log(`  - Tool descriptions: ${stats.toolDescriptions} words`);
      console.log(`  - Property descriptions: ${stats.propertyDescriptions} words`);
      console.log('\nWords by tool:');
      for (const [name, words] of Object.entries(stats.byTool).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${name}: ${words} words`);
      }
      console.log('====================================\n');

      // Assert reasonable documentation size
      // Total should be meaningful but not excessive (balance between clarity and token usage)
      expect(stats.total).toBeGreaterThan(50); // At least some documentation
      expect(stats.total).toBeLessThan(1000); // Not excessive for AI context

      // Every tool should have at least a description
      for (const tool of result.tools) {
        expect(tool.description).toBeDefined();
        expect(tool.description!.length).toBeGreaterThan(10);
      }
    });
  });

  describe('browse tool', () => {
    test('fetches URL and returns content', async () => {
      const result = await mcpClient.callTool({
        name: 'browse',
        arguments: {
          url: `${baseUrl}/`,
          format: 'markdown',
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain('Test Home Page');
    });

    test('fetches with semantic query filter', async () => {
      const result = await mcpClient.callTool({
        name: 'browse',
        arguments: {
          url: `${baseUrl}/`,
          format: 'markdown',
          query: 'pricing costs',
        },
      });

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('$99.99');
    });
  });

  describe('navigate + session workflow', () => {
    let sessionId: string;

    test('navigate creates session', async () => {
      const result = await mcpClient.callTool({
        name: 'navigate',
        arguments: {
          url: `${baseUrl}/`,
        },
      });

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent).toBeDefined();

      const data = JSON.parse(textContent!.text as string);
      expect(data.sessionId).toBeDefined();
      expect(data.title).toBe('Test Home Page');

      sessionId = data.sessionId;
    });

    test('session_list shows active session', async () => {
      const result = await mcpClient.callTool({
        name: 'session_list',
        arguments: {},
      });

      const textContent = result.content.find((c) => c.type === 'text');
      const sessions = JSON.parse(textContent!.text as string);

      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.some((s: { id: string }) => s.id === sessionId)).toBe(true);
    });

    test('get_links returns page links', async () => {
      const result = await mcpClient.callTool({
        name: 'get_links',
        arguments: {
          sessionId,
        },
      });

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('About');
      expect(textContent?.text).toContain('Products');
    });

    test('snapshot returns page content', async () => {
      const result = await mcpClient.callTool({
        name: 'snapshot',
        arguments: {
          sessionId,
          format: 'markdown',
        },
      });

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('Test Home Page');
    });

    test('session_close removes session', async () => {
      const result = await mcpClient.callTool({
        name: 'session_close',
        arguments: {
          sessionId,
        },
      });

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('closed');

      // Verify session is gone
      const listResult = await mcpClient.callTool({
        name: 'session_list',
        arguments: {},
      });

      const sessions = JSON.parse(listResult.content[0].text as string);
      expect(sessions.some((s: { id: string }) => s.id === sessionId)).toBe(false);
    });
  });

  describe('Form interaction workflow', () => {
    let sessionId: string;

    beforeAll(() => {
      clearFormSubmissions();
    });

    test('navigate to forms page', async () => {
      const result = await mcpClient.callTool({
        name: 'navigate',
        arguments: {
          url: `${baseUrl}/forms`,
        },
      });

      const data = JSON.parse(result.content[0].text as string);
      sessionId = data.sessionId;
      expect(data.forms).toBeGreaterThan(0);
    });

    test('get_forms shows available forms', async () => {
      const result = await mcpClient.callTool({
        name: 'get_forms',
        arguments: {
          sessionId,
        },
      });

      const textContent = result.content[0].text as string;
      expect(textContent).toContain('login-form');
      expect(textContent).toContain('username');
      expect(textContent).toContain('password');
    });

    test('fill_form sets field values', async () => {
      const result = await mcpClient.callTool({
        name: 'fill_form',
        arguments: {
          sessionId,
          formId: 'login-form',
          fields: {
            username: 'mcp_test_user',
            password: 'mcp_test_pass',
          },
        },
      });

      const data = JSON.parse(result.content[0].text as string);
      expect(data.fieldsSet).toContain('username');
      expect(data.fieldsSet).toContain('password');
    });

    test('submit_form sends request and returns result', async () => {
      const result = await mcpClient.callTool({
        name: 'submit_form',
        arguments: {
          sessionId,
          formId: 'login-form',
          format: 'markdown',
        },
      });

      const textContent = result.content[0].text as string;
      expect(textContent).toContain('Form submitted successfully');
      expect(textContent).toContain('Form Submitted Successfully');
      expect(textContent).toContain('mcp_test_user');

      // Verify the local web server received the form data
      const submissions = getFormSubmissions();
      expect(submissions.some((s) => s.data.username === 'mcp_test_user')).toBe(true);
    });

    test('cleanup session', async () => {
      await mcpClient.callTool({
        name: 'session_close',
        arguments: { sessionId },
      });
    });
  });

  describe('click_link navigation', () => {
    let sessionId: string;

    test('navigate to home', async () => {
      const result = await mcpClient.callTool({
        name: 'navigate',
        arguments: {
          url: `${baseUrl}/`,
        },
      });

      sessionId = JSON.parse(result.content[0].text as string).sessionId;
    });

    test('click_link by text navigates', async () => {
      const result = await mcpClient.callTool({
        name: 'click_link',
        arguments: {
          sessionId,
          linkText: 'Products',
        },
      });

      const data = JSON.parse(result.content[0].text as string);
      expect(data.title).toBe('Products');
    });

    test('session now shows products page', async () => {
      const result = await mcpClient.callTool({
        name: 'snapshot',
        arguments: {
          sessionId,
          format: 'text',
        },
      });

      const textContent = result.content[0].text as string;
      expect(textContent).toContain('Product A');
      expect(textContent).toContain('$49.99');
    });

    test('cleanup', async () => {
      await mcpClient.callTool({
        name: 'session_close',
        arguments: { sessionId },
      });
    });
  });

  describe('Error handling', () => {
    test('returns error for invalid session', async () => {
      const result = await mcpClient.callTool({
        name: 'get_forms',
        arguments: {
          sessionId: 'nonexistent-session-id',
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    test('returns error for unfilled form submission', async () => {
      // Navigate first
      const navResult = await mcpClient.callTool({
        name: 'navigate',
        arguments: { url: `${baseUrl}/forms` },
      });
      const sessionId = JSON.parse(navResult.content[0].text as string).sessionId;

      // Try to submit without filling
      const result = await mcpClient.callTool({
        name: 'submit_form',
        arguments: {
          sessionId,
          formId: 'login-form',
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not been filled');

      // Cleanup
      await mcpClient.callTool({
        name: 'session_close',
        arguments: { sessionId },
      });
    });
  });
});
