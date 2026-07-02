import { useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useWebSocket, buildWebSocketBaseUrl } from './useWebSocket';
import type { WebSocketState } from './useWebSocket';

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

export type { WebSocketState };

interface UseAIJobWebSocketOptions {
  onUpdate?: (update: AIJobUpdate) => void;
  onComplete?: (result: Record<string, unknown>) => void;
  onError?: (message: string) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

const DEFAULT_RECONNECT_DELAY = 3000;

export function useAIJobWebSocket(
  jobId: string | null,
  options: UseAIJobWebSocketOptions = {}
) {
  const { onUpdate, onComplete, onError, autoReconnect = true, reconnectDelay = DEFAULT_RECONNECT_DELAY } = options;
  const { isAuthenticated } = useAuthStore();

  const onUpdateRef = useRef(onUpdate);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  });

  const urlBuilder = useCallback(
    (token: string) => {
      const wsBaseUrl = buildWebSocketBaseUrl();
      return `${wsBaseUrl}/ws/jobs/${jobId}?token=${encodeURIComponent(token)}`;
    },
    [jobId]
  );

  const { state, disconnect, connect } = useWebSocket(urlBuilder, {
    autoReconnect,
    reconnectDelay,
    enabled: !!jobId && isAuthenticated,
    onMessage: (event, disconnect) => {
      try {
        const data = JSON.parse(event.data) as AIJobUpdate;

        if (data.type === 'job_update' && data.data) {
          if (data.job_id && data.job_id !== jobId) return; // ignore messages for other jobs
          onUpdateRef.current?.(data);

          if (data.data.status === 'completed') {
            onCompleteRef.current?.(data.data.result ?? {});
            disconnect();
          } else if (data.data.status === 'failed') {
            onErrorRef.current?.(data.data.error_message || 'Job failed');
            disconnect();
          }
        } else if (data.type === 'error') {
          onErrorRef.current?.(data.message || 'WebSocket error');
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    },
  });

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
  const { isAuthenticated } = useAuthStore();

  const onNotificationRef = useRef(onNotification);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  });

  const urlBuilder = useCallback(
    (token: string) => {
      const wsBaseUrl = buildWebSocketBaseUrl();
      return `${wsBaseUrl}/ws/user?token=${encodeURIComponent(token)}`;
    },
    []
  );

  const { state, connect, disconnect } = useWebSocket(urlBuilder, {
    autoReconnect,
    enabled: isAuthenticated,
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification' && data.data) {
          onNotificationRef.current?.(data.data);
        }
      } catch (e) {
        if (event.data !== 'pong') {
          console.error('Failed to parse notification:', e);
        }
      }
    },
  });

  return {
    state,
    isConnected: state === 'connected',
    reconnect: connect,
    disconnect,
  };
}
