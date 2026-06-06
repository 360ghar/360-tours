/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { API_BASE_URL } from '@/constants';
import { supabaseAuth } from '@/lib/supabaseAuth';

function buildWebSocketBaseUrl(): string {
  try {
    const apiUrl = new URL(API_BASE_URL, window.location.origin);
    const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${apiUrl.host}`;
  } catch {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${window.location.host}`;
  }
}

export interface AIJobUpdate {
  type: 'job_update' | 'notification' | 'heartbeat' | 'connected' | 'error';
  job_id?: string;
  data?: {
    status: string;
    progress: number;
    result?: Record<string, unknown>;
    error_message?: string;
  };
  message?: string;
}

export type WebSocketState = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseAIJobWebSocketOptions {
  onUpdate?: (update: AIJobUpdate) => void;
  onComplete?: (result: Record<string, unknown>) => void;
  onError?: (message: string) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

const PING_INTERVAL = 25000;
const DEFAULT_RECONNECT_DELAY = 3000;

export function useAIJobWebSocket(
  jobId: string | null,
  options: UseAIJobWebSocketOptions = {}
) {
  const { onUpdate, onComplete, onError, autoReconnect = true, reconnectDelay = 3000 } = options;

  const stateRef = useRef<WebSocketState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = useRef(0);
  const { isAuthenticated } = useAuthStore();
  const [state, setState] = useState<WebSocketState>('disconnected');

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
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
    if (!jobId || !isAuthenticated) return;

    connectionIdRef.current += 1;
    const connectionId = connectionIdRef.current;
    cleanup();

    setState('connecting');
    stateRef.current = 'connecting';

    void (async () => {
      const accessToken = await supabaseAuth.getAccessToken();
      if (connectionIdRef.current !== connectionId) return;
      if (!accessToken) {
        setState('disconnected');
        stateRef.current = 'disconnected';
        return;
      }

      const wsBaseUrl = buildWebSocketBaseUrl();
      const wsUrl = `${wsBaseUrl}/ws/jobs/${jobId}?token=${encodeURIComponent(accessToken)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (connectionIdRef.current !== connectionId) return;
        setState('connected');
        stateRef.current = 'connected';

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          if (event.data === 'pong') return;
          const data = JSON.parse(event.data) as AIJobUpdate;

          if (data.type === 'job_update' && data.data) {
            onUpdate?.(data);

            if (data.data.status === 'completed' && data.data.result) {
              onComplete?.(data.data.result);
              disconnect();
            } else if (data.data.status === 'failed') {
              onError?.(data.data.error_message || 'Job failed');
              disconnect();
            }
          } else if (data.type === 'error') {
            onError?.(data.message || 'WebSocket error');
          }
        } catch (e) {
          if (event.data !== 'pong') {
            console.error('Failed to parse WebSocket message:', e);
          }
        }
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

        if (autoReconnect && jobId) {
          reconnectTimeoutRef.current = setTimeout(() => {
            void (async () => {
              const nextToken = await supabaseAuth.getAccessToken();
              if (!nextToken) return;
              setState('connecting');
              stateRef.current = 'connecting';

              const wsBaseUrl2 = buildWebSocketBaseUrl();
              const wsUrl2 = `${wsBaseUrl2}/ws/jobs/${jobId}?token=${encodeURIComponent(nextToken)}`;
              const ws2 = new WebSocket(wsUrl2);
              wsRef.current = ws2;

              ws2.onopen = () => {
                setState('connected');
                stateRef.current = 'connected';
                pingIntervalRef.current = setInterval(() => {
                  if (ws2.readyState === WebSocket.OPEN) ws2.send('ping');
                }, PING_INTERVAL);
              };

              ws2.onmessage = ws.onmessage;
              ws2.onerror = ws.onerror;
              ws2.onclose = ws.onclose;
            })();
          }, reconnectDelay);
        }
      };
    })();
  }, [jobId, isAuthenticated, onUpdate, onComplete, onError, autoReconnect, reconnectDelay, cleanup, disconnect]);

  useEffect(() => {
    if (jobId && isAuthenticated) connect();
    return () => { cleanup(); };
  }, [jobId, isAuthenticated, connect, cleanup]);

  return {
    state,
    disconnect,
    reconnect: connect,
    isConnected: state === 'connected',
  };
}

export function useUserNotifications(
  options: {
    onNotification?: (notification: Record<string, unknown>) => void;
    autoReconnect?: boolean;
  } = {}
) {
  const { onNotification, autoReconnect = true } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = useRef(0);
  const { isAuthenticated } = useAuthStore();
  const [state, setState] = useState<WebSocketState>('disconnected');

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
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

  const connect = useCallback(() => {
    if (!isAuthenticated) return;

    connectionIdRef.current += 1;
    const connectionId = connectionIdRef.current;
    cleanup();

    setState('connecting');

    void (async () => {
      const accessToken = await supabaseAuth.getAccessToken();
      if (connectionIdRef.current !== connectionId) return;
      if (!accessToken) {
        setState('disconnected');
        return;
      }

      const wsBaseUrl = buildWebSocketBaseUrl();
      const wsUrl = `${wsBaseUrl}/ws/user?token=${encodeURIComponent(accessToken)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (connectionIdRef.current !== connectionId) return;
        setState('connected');

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'notification' && data.data) {
            onNotification?.(data.data);
          }
        } catch (e) {
          if (event.data !== 'pong') {
            console.error('Failed to parse notification:', e);
          }
        }
      };

      ws.onerror = () => {
        if (connectionIdRef.current !== connectionId) return;
        setState('error');
      };

      ws.onclose = () => {
        if (connectionIdRef.current !== connectionId) return;

        cleanup();
        setState('disconnected');

        if (autoReconnect && isAuthenticated) {
          reconnectTimeoutRef.current = setTimeout(() => {
            void (async () => {
              const nextToken = await supabaseAuth.getAccessToken();
              if (!nextToken) return;
              setState('connecting');

              const wsBaseUrl2 = buildWebSocketBaseUrl();
              const wsUrl2 = `${wsBaseUrl2}/ws/user?token=${encodeURIComponent(nextToken)}`;
              const ws2 = new WebSocket(wsUrl2);
              wsRef.current = ws2;

              ws2.onopen = ws.onopen;
              ws2.onmessage = ws.onmessage;
              ws2.onerror = ws.onerror;
              ws2.onclose = ws.onclose;
            })();
          }, DEFAULT_RECONNECT_DELAY);
        }
      };
    })();
  }, [isAuthenticated, onNotification, autoReconnect, cleanup]);

  useEffect(() => {
    if (isAuthenticated) connect();
    return cleanup;
  }, [isAuthenticated, connect, cleanup]);

  return {
    state,
    isConnected: state === 'connected',
    reconnect: connect,
    disconnect: () => {
      connectionIdRef.current += 1;
      cleanup();
      setState('disconnected');
    },
  };
}
