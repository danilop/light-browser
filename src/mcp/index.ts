#!/usr/bin/env bun
/**
 * Light Browser - MCP Server Entry Point
 *
 * Run with: bun run src/mcp/index.ts
 * Or configure as MCP server in your AI assistant's config.
 */

import { startMcpServer } from './server.ts';

startMcpServer().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
