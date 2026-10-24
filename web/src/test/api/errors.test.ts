import { describe, it, expect } from 'vitest';
import {
  describeFieldErrors,
  envelopeMessage,
  errorText,
  fieldLabel,
  parseApiError,
  readErrorEnvelope,
} from '@/api/errors';

describe('error envelope reader', () => {
  it('reads code and message from {error: {code, message, details}}', () => {
    expect(
      readErrorEnvelope({ error: { code: 'TOUR_NOT_FOUND', message: 'Tour not found' } })
    ).toEqual({ code: 'TOUR_NOT_FOUND', message: 'Tour not found', fields: [] });
  });

  it('reads the field list of a 422 from details.fields', () => {
    const parsed = readErrorEnvelope({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          fields: [
            { field: 'body.title', msg: 'Field required', type: 'missing' },
            { field: 'query.limit', msg: 'Input should be at most 100', type: 'less_than_equal' },
            { field: 'body.bad' },
          ],
        },
      },
    });

    expect(parsed.code).toBe('VALIDATION_ERROR');
    // An entry without field, msg and type is dropped.
    expect(parsed.fields).toHaveLength(2);
    expect(describeFieldErrors(parsed.fields)).toBe(
      'title: Field required; limit: Input should be at most 100'
    );
    expect(envelopeMessage(parsed)).toBe('title: Field required; limit: Input should be at most 100');
  });

  it('accepts an empty details.fields list (a 422 that names no field)', () => {
    const parsed = readErrorEnvelope({
      error: { code: 'INVALID_CURSOR', message: 'Cursor is not valid', details: { fields: [] } },
    });
    expect(parsed.fields).toEqual([]);
    expect(envelopeMessage(parsed)).toBe('Cursor is not valid');
  });

  it('reads nothing from the legacy {detail} bodies or from a bare string', () => {
    expect(readErrorEnvelope({ detail: 'Not found' })).toEqual({
      code: null,
      message: null,
      fields: [],
    });
    expect(readErrorEnvelope({ detail: [{ loc: ['body', 'title'], msg: 'x', type: 'y' }] }).fields).toEqual(
      []
    );
    expect(readErrorEnvelope('oops')).toEqual({ code: null, message: null, fields: [] });
    expect(readErrorEnvelope(null)).toEqual({ code: null, message: null, fields: [] });
    expect(envelopeMessage(readErrorEnvelope({ detail: 'Not found' }))).toBeNull();
  });

  it('parses the body of a failed request without a cast', () => {
    const failure = {
      response: { status: 409, data: { error: { code: 'JOB_NOT_CANCELLABLE', message: 'Done' } } },
    };
    expect(parseApiError(failure).code).toBe('JOB_NOT_CANCELLABLE');
    expect(parseApiError(new Error('network')).code).toBeNull();
  });

  it('strips the source prefix of a field name', () => {
    expect(fieldLabel('body.title')).toBe('title');
    expect(fieldLabel('query.cursor')).toBe('cursor');
    expect(fieldLabel('path.tour_id')).toBe('tour_id');
    expect(fieldLabel('title')).toBe('title');
  });
});

describe('errorText', () => {
  const failed = (data: unknown) => ({ response: { status: 422, data } });

  it('shows the field errors of a 422 so the user can fix the input', () => {
    const error = failed({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          fields: [
            { field: 'body.title', msg: 'String should have at most 255 characters', type: 'string_too_long' },
          ],
        },
      },
    });
    expect(errorText(error, 'Something went wrong.')).toBe(
      'title: String should have at most 255 characters'
    );
  });

  it('shows the message of any other error envelope', () => {
    const error = failed({ error: { code: 'JOB_NOT_CANCELLABLE', message: 'The job already ended' } });
    expect(errorText(error, 'Something went wrong.')).toBe('The job already ended');
  });

  it('falls back when there is no body (network error, ended session)', () => {
    expect(errorText(new Error('Network Error'), 'Something went wrong.')).toBe('Something went wrong.');
    expect(errorText(failed({ detail: 'legacy' }), 'Something went wrong.')).toBe('Something went wrong.');
    expect(errorText(undefined, 'Something went wrong.')).toBe('Something went wrong.');
  });
});
