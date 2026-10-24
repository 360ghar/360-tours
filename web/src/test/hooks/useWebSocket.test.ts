import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/supabaseAuth', () => ({
  sessionReady: Promise.resolve(),
  supabaseAuth: {
    getAccessToken: vi.fn().mockResolvedValue('test-access-token'),
    getTokens: vi.fn(() => null),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
  },
}));

import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuthStore } from '@/stores/authStore';

/**
 * Minimal WebSocket double. Instances are recorded so a test can assert that
 * unmounting does NOT spawn a replacement socket.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    // A real socket ignores close() once it is closed, so onclose fires once.
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    // Real sockets fire onclose asynchronously after close().
    queueMicrotask(() => this.onclose?.({ code: 1000 }));
  }

  /** The server closed the socket with this code. */
  serverClose(code: number) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

const originalWebSocket = globalThis.WebSocket;

describe('useWebSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = originalWebSocket;
  });

  it('does not reconnect after the hook unmounts', async () => {
    const urlBuilder = vi.fn(() => 'ws://localhost/ws/jobs/job-1');

    const { unmount } = renderHook(() => useWebSocket(urlBuilder, { reconnectDelay: 3000 }));

    // Let the async token fetch inside connect() settle and open the socket.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => FakeWebSocket.instances[0].open());

    unmount();

    // The socket's own onclose fires after teardown; without the connection-id
    // bump in the effect cleanup it passed the stale-connection guard and
    // scheduled a reconnect that built a brand-new socket ~3s later.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('sends the token as the first frame and keeps it out of the URL', async () => {
    const urlBuilder = vi.fn(() => 'ws://localhost/ws/user');
    renderHook(() => useWebSocket(urlBuilder, { reconnectDelay: 3000 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => FakeWebSocket.instances[0].open());

    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('ws://localhost/ws/user');
    expect(socket.url).not.toContain('test-access-token');
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'auth', token: 'test-access-token' });
  });

  it('does not reconnect after the server closes with 4001 (bad token)', async () => {
    const urlBuilder = vi.fn(() => 'ws://localhost/ws/user');
    renderHook(() => useWebSocket(urlBuilder, { reconnectDelay: 3000 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => FakeWebSocket.instances[0].open());
    act(() => FakeWebSocket.instances[0].serverClose(4001));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('does not reconnect after the server closes with 4004 (unknown job)', async () => {
    const urlBuilder = vi.fn(() => 'ws://localhost/ws/jobs/job-404');
    renderHook(() => useWebSocket(urlBuilder, { reconnectDelay: 3000 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => FakeWebSocket.instances[0].open());
    act(() => FakeWebSocket.instances[0].serverClose(4004));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('reconnects after an abnormal close', async () => {
    const urlBuilder = vi.fn(() => 'ws://localhost/ws/user');
    renderHook(() => useWebSocket(urlBuilder, { reconnectDelay: 3000 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => FakeWebSocket.instances[0].open());
    act(() => FakeWebSocket.instances[0].serverClose(1006));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_500);
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
