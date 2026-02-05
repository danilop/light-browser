/**
 * Light Browser - Form Interaction Tests
 *
 * Tests for the form interaction module using the local test server.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import {
  startTestServer,
  stopTestServer,
  getFormSubmissions,
  clearFormSubmissions,
} from './server/index.ts';
import { createEngine } from '../src/core/engine/index.ts';
import { loadConfig } from '../src/core/config.ts';
import { extractFromHtml } from '../src/extraction/html.ts';
import { EngineTier } from '../src/core/types.ts';
import {
  createFormState,
  fillField,
  fillFields,
  clearField,
  submitForm,
  findForm,
  findField,
  getFieldNames,
  validateRequired,
  getSubmitPreview,
  buildRequestBody,
  type FormState,
} from '../src/interaction/forms.ts';

let baseUrl: string;

beforeAll(async () => {
  baseUrl = await startTestServer(9877);
});

afterAll(() => {
  stopTestServer();
});

beforeEach(() => {
  clearFormSubmissions();
});

describe('Form State Management', () => {
  test('creates form state from extracted form', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      const result = await engine.fetch(`${baseUrl}/forms`);
      const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

      const loginForm = findForm(extracted.forms, 'login-form');
      expect(loginForm).toBeDefined();

      const state = createFormState(loginForm!, result.url);
      expect(state.method).toBe('POST');
      expect(state.action).toContain('/submit/login');
      expect(state.fields.has('username')).toBe(true);
      expect(state.fields.has('password')).toBe(true);
      expect(state.fields.get('csrf_token')).toBe('abc123'); // Hidden field with default value
    } finally {
      await engine.close();
    }
  });

  test('fills single field', () => {
    const state: FormState = {
      action: '/submit',
      method: 'POST',
      enctype: 'application/x-www-form-urlencoded',
      fields: new Map([['username', '']]),
      baseUrl: 'http://localhost',
    };

    const newState = fillField(state, 'username', 'testuser');
    expect(newState.fields.get('username')).toBe('testuser');
    // Original state unchanged
    expect(state.fields.get('username')).toBe('');
  });

  test('fills multiple fields', () => {
    const state: FormState = {
      action: '/submit',
      method: 'POST',
      enctype: 'application/x-www-form-urlencoded',
      fields: new Map([
        ['username', ''],
        ['password', ''],
      ]),
      baseUrl: 'http://localhost',
    };

    const newState = fillFields(state, {
      username: 'testuser',
      password: 'testpass',
    });

    expect(newState.fields.get('username')).toBe('testuser');
    expect(newState.fields.get('password')).toBe('testpass');
  });

  test('clears field', () => {
    const state: FormState = {
      action: '/submit',
      method: 'POST',
      enctype: 'application/x-www-form-urlencoded',
      fields: new Map([['username', 'testuser']]),
      baseUrl: 'http://localhost',
    };

    const newState = clearField(state, 'username');
    expect(newState.fields.has('username')).toBe(false);
  });
});

describe('Form Finding', () => {
  test('finds form by ID', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      const result = await engine.fetch(`${baseUrl}/forms`);
      const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

      const form = findForm(extracted.forms, 'login-form');
      expect(form).toBeDefined();
      expect(form!.id).toBe('login-form');
    } finally {
      await engine.close();
    }
  });

  test('finds form by index', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      const result = await engine.fetch(`${baseUrl}/forms`);
      const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

      const form = findForm(extracted.forms, 0);
      expect(form).toBeDefined();
    } finally {
      await engine.close();
    }
  });

  test('finds field in form', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      const result = await engine.fetch(`${baseUrl}/forms`);
      const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

      const form = findForm(extracted.forms, 'login-form');
      const field = findField(form!, 'username');
      expect(field).toBeDefined();
      expect(field!.type).toBe('text');
    } finally {
      await engine.close();
    }
  });

  test('gets field names', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      const result = await engine.fetch(`${baseUrl}/forms`);
      const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

      const form = findForm(extracted.forms, 'contact-form');
      const names = getFieldNames(form!);
      expect(names).toContain('name');
      expect(names).toContain('email');
      expect(names).toContain('message');
    } finally {
      await engine.close();
    }
  });
});

describe('Form Validation', () => {
  test('validates required fields', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      const result = await engine.fetch(`${baseUrl}/forms`);
      const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

      const form = findForm(extracted.forms, 'login-form');
      const state = createFormState(form!, result.url);

      // Empty fields should fail validation
      const validation = validateRequired(form!, state);
      expect(validation.valid).toBe(false);
      expect(validation.missing).toContain('username');
      expect(validation.missing).toContain('password');

      // Fill required fields
      const filledState = fillFields(state, {
        username: 'testuser',
        password: 'testpass',
      });

      const validation2 = validateRequired(form!, filledState);
      expect(validation2.valid).toBe(true);
      expect(validation2.missing.length).toBe(0);
    } finally {
      await engine.close();
    }
  });
});

describe('Request Body Building', () => {
  test('builds URL-encoded body', () => {
    const state: FormState = {
      action: '/submit',
      method: 'POST',
      enctype: 'application/x-www-form-urlencoded',
      fields: new Map([
        ['username', 'test user'],
        ['password', 'pass&word'],
      ]),
      baseUrl: 'http://localhost',
    };

    const { body, contentType } = buildRequestBody(state);
    expect(contentType).toBe('application/x-www-form-urlencoded');
    expect(body).toContain('username=test+user');
    expect(body).toContain('password=pass%26word');
  });

  test('builds multipart body', () => {
    const state: FormState = {
      action: '/submit',
      method: 'POST',
      enctype: 'multipart/form-data',
      fields: new Map([['field', 'value']]),
      baseUrl: 'http://localhost',
    };

    const { body, contentType } = buildRequestBody(state);
    expect(body).toBeInstanceOf(FormData);
    expect(contentType).toBe(''); // FormData sets its own
  });
});

describe('Submit Preview', () => {
  test('generates GET preview with query params', () => {
    const state: FormState = {
      action: '/search',
      method: 'GET',
      enctype: 'application/x-www-form-urlencoded',
      fields: new Map([
        ['q', 'test'],
        ['page', '1'],
      ]),
      baseUrl: 'http://localhost:8000',
    };

    const preview = getSubmitPreview(state);
    expect(preview.method).toBe('GET');
    expect(preview.url).toContain('/search?');
    expect(preview.url).toContain('q=test');
    expect(preview.url).toContain('page=1');
    expect(preview.fields).toHaveLength(2);
  });

  test('generates POST preview', () => {
    const state: FormState = {
      action: '/submit',
      method: 'POST',
      enctype: 'application/x-www-form-urlencoded',
      fields: new Map([['name', 'John']]),
      baseUrl: 'http://localhost:8000',
    };

    const preview = getSubmitPreview(state);
    expect(preview.method).toBe('POST');
    expect(preview.url).toBe('http://localhost:8000/submit');
    expect(preview.fields).toEqual([{ name: 'name', value: 'John' }]);
  });
});

describe('Form Submission', () => {
  test('submits login form (POST)', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      const result = await engine.fetch(`${baseUrl}/forms`);
      const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

      const form = findForm(extracted.forms, 'login-form');
      let state = createFormState(form!, result.url);
      state = fillFields(state, {
        username: 'myuser',
        password: 'mypassword',
      });

      const submitResult = await submitForm(state);

      expect(submitResult.success).toBe(true);
      expect(submitResult.statusCode).toBe(200);
      expect(submitResult.html).toContain('Form Submitted Successfully');
      expect(submitResult.html).toContain('myuser');

      // Verify server received the data
      const submissions = getFormSubmissions();
      expect(submissions.length).toBe(1);
      expect(submissions[0].data.username).toBe('myuser');
      expect(submissions[0].data.password).toBe('mypassword');
    } finally {
      await engine.close();
    }
  });

  test('submits search form (GET)', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      const result = await engine.fetch(`${baseUrl}/forms`);
      const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

      const form = findForm(extracted.forms, 'search-form');
      let state = createFormState(form!, result.url);
      state = fillFields(state, {
        q: 'browser testing',
        category: 'articles',
      });

      const submitResult = await submitForm(state);

      expect(submitResult.success).toBe(true);
      expect(submitResult.html).toContain('browser testing');
      expect(submitResult.html).toContain('articles');
      // GET request should have params in final URL
      expect(submitResult.finalUrl).toContain('q=browser');
    } finally {
      await engine.close();
    }
  });

  test('submits contact form with all field types', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      const result = await engine.fetch(`${baseUrl}/forms`);
      const extracted = extractFromHtml(result.html, result.url, { format: 'markdown' });

      const form = findForm(extracted.forms, 'contact-form');
      let state = createFormState(form!, result.url);
      state = fillFields(state, {
        name: 'Jane Doe',
        email: 'jane@example.com',
        subject: 'support',
        message: 'Need help with the product',
        newsletter: 'yes',
      });

      const submitResult = await submitForm(state);

      expect(submitResult.success).toBe(true);
      expect(submitResult.html).toContain('Jane Doe');
      expect(submitResult.html).toContain('jane@example.com');
      expect(submitResult.html).toContain('support');
    } finally {
      await engine.close();
    }
  });

  test('handles form submission timeout', async () => {
    const state: FormState = {
      action: `${baseUrl}/slow`,
      method: 'GET',
      enctype: 'application/x-www-form-urlencoded',
      fields: new Map(),
      baseUrl,
    };

    const submitResult = await submitForm(state, { timeout: 100 });
    expect(submitResult.success).toBe(false);
    expect(submitResult.error).toContain('abort');
  });
});

describe('Full Form Workflow', () => {
  test('complete login workflow', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      // Step 1: Navigate to forms page
      const page = await engine.fetch(`${baseUrl}/forms`);
      const extracted = extractFromHtml(page.html, page.url, { format: 'markdown' });

      // Step 2: Find the login form
      const loginForm = findForm(extracted.forms, 'login-form');
      expect(loginForm).toBeDefined();
      expect(loginForm!.fields.length).toBeGreaterThan(0);

      // Step 3: Check field names
      const fields = getFieldNames(loginForm!);
      expect(fields).toContain('username');
      expect(fields).toContain('password');

      // Step 4: Create form state and fill
      let state = createFormState(loginForm!, page.url);
      state = fillFields(state, {
        username: 'admin',
        password: 'secret123',
      });

      // Step 5: Validate before submit
      const validation = validateRequired(loginForm!, state);
      expect(validation.valid).toBe(true);

      // Step 6: Preview submission
      const preview = getSubmitPreview(state);
      expect(preview.method).toBe('POST');

      // Step 7: Submit
      const result = await submitForm(state);
      expect(result.success).toBe(true);

      // Step 8: Extract result page
      const resultExtracted = extractFromHtml(result.html, result.finalUrl, { format: 'markdown' });
      expect(resultExtracted.content).toContain('Form Submitted Successfully');
    } finally {
      await engine.close();
    }
  });

  test('search and navigate workflow', async () => {
    const config = loadConfig();
    const engine = createEngine(config, { maxTier: EngineTier.CHEERIO });

    try {
      // Step 1: Go to forms page
      const page = await engine.fetch(`${baseUrl}/forms`);
      const extracted = extractFromHtml(page.html, page.url, { format: 'markdown' });

      // Step 2: Find and submit search form
      const searchForm = findForm(extracted.forms, 'search-form');
      let state = createFormState(searchForm!, page.url);
      state = fillFields(state, { q: 'light browser', category: 'products' });

      const result = await submitForm(state);

      // Step 3: Parse search results
      const resultExtracted = extractFromHtml(result.html, result.finalUrl, { format: 'markdown' });
      expect(resultExtracted.content).toContain('Search Results');
      expect(resultExtracted.content).toContain('light browser');
    } finally {
      await engine.close();
    }
  });
});
