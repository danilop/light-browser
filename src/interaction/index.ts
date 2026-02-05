/**
 * Light Browser - Interaction Module
 *
 * Form filling, submission, and navigation via HTTP requests.
 */

export {
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
  type FormSubmitResult,
  type FormSubmitOptions,
} from './forms.ts';
