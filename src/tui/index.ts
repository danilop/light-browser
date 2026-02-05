#!/usr/bin/env bun
/**
 * Light Browser - TUI Entry Point
 *
 * Run with: bun run src/tui/index.ts [url]
 */

import { startTui } from './app.ts';

const url = process.argv[2];
startTui(url).catch((error) => {
  console.error('TUI Error:', error);
  process.exit(1);
});
