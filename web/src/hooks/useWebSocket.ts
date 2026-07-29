/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabaseAuth } from '@/lib/supabaseAuth';
import { API_BASE_URL } from '@/constants';

export type WebSocketState = 'connecting' | 'connected' | 'disconnected' | 'error';

const PING_INTERVAL = 25000;
const DEFAULT_RECONNECT_DELAY = 3000;
const DEFAULT_CONNECTION_TIMEOUT = 10000;

export function buildWebSocketBaseUrl(): string {
  try {
    const apiUrl = new URL(API_BASE_URL, window.location.origin);
    const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${apiUrl.host}`;
  } catch {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${window.location.host}`;
  }
}

interface UseWebSocketOptions {
  onMessage?: (event: MessageEvent, disconnect: () => void) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  connectionTimeoutMs?: number;
  enabled?: boolean;
}

export function useWebSocket(
  urlBuilder: (token: string) => string,
  options: UseWebSocketOptions = {}
) {
  const { isAuthenticated } = useAuthStore();
  const [state, setState] = useState<WebSocketState>('disconnected');
  const stateRef = useRef<WebSocketState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectionIdRef = useRef(0);
  const {
    onMessage,
    autoReconnect = true,
    reconnectDelay = DEFAULT_RECONNECT_DELAY,
    connectionTimeoutMs = DEFAULT_CONNECTION_TIMEOUT,
    enabled = true,
  } = options;

  const onMessageRef = useRef(onMessage);
  const urlBuilderRef = useRef(urlBuilder);
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    urlBuilderRef.current = urlBuilder;
  });

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    connectionIdRef.current += 1;
    cleanup();
    setState('disconnected');
    stateRef.current = 'disconnected';
  }, [cleanup]);

  const connect = useCallback(() => {
    if (!enabled || !isAuthenticated) return;

    connectionIdRef.current += 1;
    const connectionId = connectionIdRef.current;
    cleanup();

    setState('connecting');
    stateRef.current = 'connecting';

    if (connectionTimeoutMs > 0) {
      connectionTimeoutRef.current = setTimeout(() => {
        if (connectionIdRef.current !== connectionId || stateRef.current !== 'connecting') return;

        connectionIdRef.current += 1;
        connectionTimeoutRef.current = null;

        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }

        setState('error');
        stateRef.current = 'error';

        if (autoReconnect && enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current();
          }, reconnectDelay);
        }
      }, connectionTimeoutMs);
    }

    void (async () => {
      let accessToken: string | null = null;
      try {
        accessToken = await supabaseAuth.getAccessToken();
      } catch {
        if (connectionIdRef.current !== connectionId) return;
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setState('error');
        stateRef.current = 'error';
        return;
      }

      if (connectionIdRef.current !== connectionId) return;
      if (!accessToken) {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setState('disconnected');
        stateRef.current = 'disconnected';
        return;
      }

      const wsUrl = urlBuilderRef.current(accessToken);
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        if (connectionIdRef.current !== connectionId) return;
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setState('error');
        stateRef.current = 'error';
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (connectionIdRef.current !== connectionId) return;
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setState('connected');
        stateRef.current = 'connected';

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send('ping');
            } catch {
              setState('error');
              stateRef.current = 'error';
            }
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = event => {
        if (event.data === 'pong') return;
        onMessageRef.current?.(event, disconnect);
      };

      ws.onerror = () => {
        if (connectionIdRef.current !== connectionId) return;
        setState('error');
        stateRef.current = 'error';
      };

      ws.onclose = () => {
        if (connectionIdRef.current !== connectionId) return;

        cleanup();
        setState('disconnected');
        stateRef.current = 'disconnected';

        if (autoReconnect && enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current();
          }, reconnectDelay);
        }
      };
    })();
  }, [
    enabled,
    isAuthenticated,
    autoReconnect,
    reconnectDelay,
    connectionTimeoutMs,
    cleanup,
    disconnect,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  });

  // urlBuilder is read via ref inside connect(), but we still depend on its
  // identity here so a changed URL (e.g. a new jobId) tears down the old socket
  // and reconnects. Callers MUST memoize urlBuilder or this reconnects every render.
  useEffect(() => {
    if (enabled && isAuthenticated) connect();
    return () => {
      cleanup();
    };
  }, [enabled, isAuthenticated, connect, cleanup, urlBuilder]);

  return {
    state,
    isConnected: state === 'connected',
    connect,
    disconnect,
  };
}
