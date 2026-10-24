import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import axios from 'axios';
import { GlobalErrorHandler } from '@/components/common/GlobalErrorHandler';
import { useUIStore } from '@/stores';

const ORIGIN = 'http://localhost:3000';

// jsdom does not define PromiseRejectionEvent; stub a minimal polyfill so
// unhandledrejection can be dispatched in tests.
class PromiseRejectionEventPolyfill extends Event {
  readonly promise: Promise<unknown>;
  readonly reason: unknown;

  constructor(type: string, init: PromiseRejectionEventInit) {
    super(type);
    this.promise = init.promise;
    this.reason = init.reason;
  }
}

describe('GlobalErrorHandler 401 handling', () => {
  let replaceMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('PromiseRejectionEvent', PromiseRejectionEventPolyfill);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // Remove the own-property override so jsdom's real location is restored.
    delete (window as { location?: unknown }).location;
  });

  function mountAndDispatch(pathname: string) {
    replaceMock = vi.fn();
    const locationMock = {
      origin: ORIGIN,
      pathname,
      search: '',
      hash: '',
      href: `${ORIGIN}${pathname}`,
      replace: replaceMock,
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationMock,
    });

    render(<GlobalErrorHandler />);

    const error = new axios.AxiosError('Unauthorized', '401', undefined, undefined, {
      status: 401,
      data: {},
      statusText: 'Unauthorized',
      headers: {},
      config: {} as never,
    });
    const promise = Promise.reject(error);
    promise.catch(() => undefined); // avoid a native unhandled-rejection event
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', { promise, reason: error })
    );
  }

  it('redirects to /login?next=<current path> via location.replace on a 401', () => {
    mountAndDispatch('/tours/abc');

    expect(replaceMock).toHaveBeenCalledWith(`${ORIGIN}/login?next=%2Ftours%2Fabc`);
  });

  it('drops next= when already on an auth page', () => {
    mountAndDispatch('/login');

    expect(replaceMock).toHaveBeenCalledWith(`${ORIGIN}/login`);
  });
});

describe('GlobalErrorHandler error envelope', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('PromiseRejectionEvent', PromiseRejectionEventPolyfill);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useUIStore.setState({ toasts: [] });
  });

  function dispatchRejection(status: number, data: unknown) {
    cleanup();
    render(<GlobalErrorHandler />);
    const error = new axios.AxiosError('Request failed', String(status), undefined, undefined, {
      status,
      data,
      statusText: 'Error',
      headers: {},
      config: {} as never,
    });
    const promise = Promise.reject(error);
    promise.catch(() => undefined);
    act(() => {
      window.dispatchEvent(
        new PromiseRejectionEvent('unhandledrejection', { promise, reason: error })
      );
    });
  }

  it('lists the field errors of a 422 from error.details.fields', () => {
    dispatchRejection(422, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          fields: [{ field: 'body.title', msg: 'Field required', type: 'missing' }],
        },
      },
    });

    expect(useUIStore.getState().toasts.at(-1)).toMatchObject({
      title: 'Validation Error',
      message: 'title: Field required',
    });
  });

  it('shows the envelope message for another error and ignores the legacy {detail} body', () => {
    dispatchRejection(409, { error: { code: 'JOB_NOT_CANCELLABLE', message: 'Job already ended' } });
    expect(useUIStore.getState().toasts.at(-1)).toMatchObject({ message: 'Job already ended' });

    dispatchRejection(409, { detail: 'Legacy text' });
    expect(useUIStore.getState().toasts.at(-1)?.message).toBe('Request failed');
  });
});
