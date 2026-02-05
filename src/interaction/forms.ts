/**
 * Light Browser - Form Interaction Module
 *
 * Handles form filling and submission via HTTP requests.
 * Works with both static (Tier 1) and JS-enabled (Tier 2/3) pages.
 */

import type { Form as ExtractedForm, FormField } from '../core/types.ts';

/**
 * Form state for tracking filled values
 */
export interface FormState {
  formId?: string;
  formIndex?: number;
  action: string;
  method: 'GET' | 'POST';
  enctype: string;
  fields: Map<string, string>;
  baseUrl: string;
}

/**
 * Form submission result
 */
export interface FormSubmitResult {
  success: boolean;
  url: string;
  statusCode: number;
  html: string;
  redirected: boolean;
  finalUrl: string;
  error?: string;
}

/**
 * Options for form submission
 */
export interface FormSubmitOptions {
  /** Custom headers to include */
  headers?: Record<string, string>;
  /** User agent string */
  userAgent?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Follow redirects */
  followRedirects?: boolean;
  /** Maximum redirects to follow */
  maxRedirects?: number;
}

/**
 * Create a form state from extracted form data
 */
export function createFormState(form: ExtractedForm, baseUrl: string): FormState {
  const fields = new Map<string, string>();

  // Initialize fields with default values
  for (const field of form.fields) {
    if (field.value !== undefined) {
      fields.set(field.name, field.value);
    } else if (field.type === 'checkbox' || field.type === 'radio') {
      // Don't set a default for checkboxes/radios
    } else {
      fields.set(field.name, '');
    }
  }

  return {
    formId: form.id,
    formIndex: form.index,
    action: form.action,
    method: (form.method?.toUpperCase() || 'GET') as 'GET' | 'POST',
    enctype: form.enctype || 'application/x-www-form-urlencoded',
    fields,
    baseUrl,
  };
}

/**
 * Fill a form field with a value
 */
export function fillField(state: FormState, fieldName: string, value: string): FormState {
  const newFields = new Map(state.fields);
  newFields.set(fieldName, value);
  return { ...state, fields: newFields };
}

/**
 * Fill multiple form fields at once
 */
export function fillFields(state: FormState, values: Record<string, string>): FormState {
  const newFields = new Map(state.fields);
  for (const [name, value] of Object.entries(values)) {
    newFields.set(name, value);
  }
  return { ...state, fields: newFields };
}

/**
 * Clear a form field
 */
export function clearField(state: FormState, fieldName: string): FormState {
  const newFields = new Map(state.fields);
  newFields.delete(fieldName);
  return { ...state, fields: newFields };
}

/**
 * Resolve a relative URL to an absolute URL
 */
function resolveUrl(relativeUrl: string, baseUrl: string): string {
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }
  return new URL(relativeUrl, baseUrl).href;
}

/**
 * Build the request body for form submission
 */
export function buildRequestBody(state: FormState): {
  body: string | FormData;
  contentType: string;
} {
  if (state.enctype === 'multipart/form-data') {
    const formData = new FormData();
    for (const [name, value] of state.fields) {
      formData.append(name, value);
    }
    // FormData sets its own content-type with boundary
    return { body: formData, contentType: '' };
  }

  // Default: application/x-www-form-urlencoded
  const params = new URLSearchParams();
  for (const [name, value] of state.fields) {
    params.append(name, value);
  }
  return { body: params.toString(), contentType: 'application/x-www-form-urlencoded' };
}

/**
 * Submit a form via HTTP request
 */
export async function submitForm(
  state: FormState,
  options?: FormSubmitOptions
): Promise<FormSubmitResult> {
  const actionUrl = resolveUrl(state.action || '', state.baseUrl);
  const timeout = options?.timeout ?? 30000;

  const headers: Record<string, string> = {
    ...options?.headers,
  };

  if (options?.userAgent) {
    headers['User-Agent'] = options.userAgent;
  }

  try {
    let response: Response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    if (state.method === 'GET') {
      // For GET, append fields to URL
      const url = new URL(actionUrl);
      for (const [name, value] of state.fields) {
        url.searchParams.set(name, value);
      }

      response = await fetch(url.href, {
        method: 'GET',
        headers,
        redirect: options?.followRedirects !== false ? 'follow' : 'manual',
        signal: controller.signal,
      });
    } else {
      // For POST, build request body
      const { body, contentType } = buildRequestBody(state);

      if (contentType) {
        headers['Content-Type'] = contentType;
      }

      response = await fetch(actionUrl, {
        method: 'POST',
        headers,
        body,
        redirect: options?.followRedirects !== false ? 'follow' : 'manual',
        signal: controller.signal,
      });
    }

    clearTimeout(timeoutId);

    const html = await response.text();

    return {
      success: response.ok,
      url: actionUrl,
      statusCode: response.status,
      html,
      redirected: response.redirected,
      finalUrl: response.url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      url: actionUrl,
      statusCode: 0,
      html: '',
      redirected: false,
      finalUrl: actionUrl,
      error: message,
    };
  }
}

/**
 * Find a form by ID or index
 */
export function findForm(
  forms: ExtractedForm[],
  identifier: string | number
): ExtractedForm | undefined {
  if (typeof identifier === 'number') {
    return forms[identifier];
  }
  // Try ID first
  let form = forms.find((f) => f.id === identifier);
  if (form) return form;
  // Try name
  form = forms.find((f) => f.name === identifier);
  return form;
}

/**
 * Find a field in a form by name
 */
export function findField(form: ExtractedForm, fieldName: string): FormField | undefined {
  return form.fields.find((f: FormField) => f.name === fieldName || f.id === fieldName);
}

/**
 * Get all field names in a form
 */
export function getFieldNames(form: ExtractedForm): string[] {
  return form.fields.map((f: FormField) => f.name).filter(Boolean);
}

/**
 * Validate required fields are filled
 */
export function validateRequired(
  form: ExtractedForm,
  state: FormState
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const field of form.fields) {
    if (field.required) {
      const value = state.fields.get(field.name);
      if (!value || value.trim() === '') {
        missing.push(field.name);
      }
    }
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Get form submission preview
 */
export function getSubmitPreview(state: FormState): {
  method: string;
  url: string;
  fields: Array<{ name: string; value: string }>;
} {
  const actionUrl = resolveUrl(state.action || '', state.baseUrl);
  let url = actionUrl;

  if (state.method === 'GET') {
    const urlObj = new URL(actionUrl);
    for (const [name, value] of state.fields) {
      urlObj.searchParams.set(name, value);
    }
    url = urlObj.href;
  }

  return {
    method: state.method,
    url,
    fields: Array.from(state.fields.entries()).map(([name, value]) => ({ name, value })),
  };
}
