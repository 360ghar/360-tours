import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import axios from 'axios';
import { GlobalErrorHandler } from '@/components/common/GlobalErrorHandler';

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
