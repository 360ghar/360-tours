import type { ValidationFieldError } from '@/types';

/** The parts of a non-2xx body that the UI reads. */
export interface ParsedApiError {
  /** Domain code such as `VALIDATION_ERROR`, `TOKEN_INVALID`, `JOB_NOT_CANCELLABLE`. */
  code: string | null;
  message: string | null;
  /** Field errors of a 422. Always a list; empty for every other status. */
  fields: ValidationFieldError[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFieldError(value: unknown): value is ValidationFieldError {
  return (
    isRecord(value) &&
    typeof value.field === 'string' &&
    typeof value.msg === 'string' &&
    typeof value.type === 'string'
  );
}

/**
 * Read the error envelope `{"error": {"code", "message", "details"}}`. A 422
 * carries `details.fields[{field, msg, type}]`. No other body shape is read.
 */
export function readErrorEnvelope(body: unknown): ParsedApiError {
  const error = isRecord(body) ? body.error : undefined;
  if (!isRecord(error)) return { code: null, message: null, fields: [] };

  const details = isRecord(error.details) ? error.details : null;
  const rawFields = details?.fields;
  return {
    code: typeof error.code === 'string' ? error.code : null,
    message: typeof error.message === 'string' && error.message ? error.message : null,
    fields: Array.isArray(rawFields) ? rawFields.filter(isFieldError) : [],
  };
}

/** `body.title` -> `title`, `query.limit` -> `limit`. */
export function fieldLabel(field: string): string {
  return field.replace(/^(body|query|path|header|form)\./, '');
}

/** One readable line for a 422: `title: String should have at most 255 characters`. */
export function describeFieldErrors(fields: ValidationFieldError[]): string {
  return fields.map(f => `${fieldLabel(f.field)}: ${f.msg}`).join('; ');
}

/**
 * Parse the body of a failed Axios request (`error.response?.data`). Accepts
 * `unknown` so a caller can pass a caught value without a cast.
 */
export function parseApiError(error: unknown): ParsedApiError {
  const response = isRecord(error) ? error.response : undefined;
  const data = isRecord(response) ? response.data : undefined;
  return readErrorEnvelope(data);
}

/** Message for a 422 (the field list), else the envelope message, else null. */
export function envelopeMessage(parsed: ParsedApiError): string | null {
  if (parsed.fields.length > 0) return describeFieldErrors(parsed.fields);
  return parsed.message;
}

/**
 * Text for a toast after a failed call: what the server said (its message, or the
 * field errors of a 422), else `fallback`. A network error or an ended session has no body.
 */
export function errorText(error: unknown, fallback: string): string {
  return envelopeMessage(parseApiError(error)) ?? fallback;
}
