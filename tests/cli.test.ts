/**
 * Light Browser - CLI Tests
 *
 * Tests the CLI interface by spawning subprocesses and verifying outputs.
 */

import { describe, it, expect } from 'bun:test';
import { spawn } from 'bun';

async function runCli(
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = spawn(['bun', 'run', 'src/index.ts', ...args], {
    cwd: import.meta.dir.replace('/tests', ''),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

describe('CLI Interface', () => {
  it('should show help when no URL provided', async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('light-browser');
  });

  it('should show version with --version flag', async () => {
    const result = await runCli(['--version']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('0.1.0');
  });

  it('should fetch URL and output markdown by default', async () => {
    const result = await runCli(['https://example.com', '-q']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('# Example Domain');
    expect(result.stdout).toContain('## Links');
  });

  it('should output JSON with --json flag', async () => {
    const result = await runCli(['https://example.com', '--json', '-q']);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.url).toBe('https://example.com/');
    expect(json.title).toBe('Example Domain');
    expect(json.tierUsed).toBe(1);
    expect(json.timing).toBeDefined();
  });

  it('should output text with --format text', async () => {
    const result = await runCli(['https://example.com', '--format', 'text', '-q']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('EXAMPLE DOMAIN');
    expect(result.stdout).toContain('Source:');
  });

  it('should show verbose output with -v flag', async () => {
    const result = await runCli(['https://example.com', '-v']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Fetching:');
    expect(result.stderr).toContain('Tier used:');
    expect(result.stderr).toContain('Fetch time:');
    expect(result.stderr).toContain('Total time:');
  });

  it('should handle invalid URL', async () => {
    const result = await runCli(['not-a-valid-url-at-all']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Error');
  });

  it('should reject invalid tier', async () => {
    const result = await runCli(['https://example.com', '--tier', '4']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Tier must be 1, 2, or 3');
  });

  it('should accept custom headers', async () => {
    const result = await runCli(['https://example.com', '-H', 'X-Custom-Header: test-value', '-q']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Example Domain');
  });

  it('should support quiet mode', async () => {
    const result = await runCli(['https://example.com', '-q']);

    expect(result.exitCode).toBe(0);
    // Filter out macOS objc runtime warnings about duplicate dylibs
    const filteredStderr = result.stderr
      .split('\n')
      .filter((line) => !line.includes('objc[') && !line.includes('GNotificationCenterDelegate'))
      .join('\n')
      .trim();
    expect(filteredStderr).toBe('');
    expect(result.stdout).not.toBe('');
  });
});

describe('CLI Error Handling', () => {
  it('should handle connection errors gracefully', async () => {
    const result = await runCli(['https://nonexistent.invalid.domain.test']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Error');
  });

  it('should handle timeout appropriately', async () => {
    // Using a very short timeout should cause failure on most real sites
    // But we'll just verify the timeout option is accepted
    const result = await runCli(['https://example.com', '--timeout', '30000', '-q']);

    expect(result.exitCode).toBe(0);
  });
});

describe('CLI Output Formats', () => {
  it('should output valid JSON that can be parsed', async () => {
    const result = await runCli(['https://example.com', '--format', 'json', '-q']);

    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();

    const json = JSON.parse(result.stdout);
    expect(json).toHaveProperty('url');
    expect(json).toHaveProperty('title');
    expect(json).toHaveProperty('content');
    expect(json).toHaveProperty('links');
    expect(json).toHaveProperty('timing');
  });

  it('should include link references in markdown output', async () => {
    const result = await runCli(['https://example.com', '-q']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\[\d+\]/); // Numbered link reference
  });
});
