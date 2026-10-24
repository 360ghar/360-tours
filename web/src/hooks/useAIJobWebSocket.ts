import { useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useWebSocket, buildWebSocketBaseUrl } from './useWebSocket';
import type { WebSocketState } from './useWebSocket';
import { parseServerFrame } from '@/utils/realtimeFrames';
import type { JobUpdateFrame, UserNotificationPayload } from '@/types/realtime';

/** One `job_update` frame: `{type, job_id, data: {status, progress, error_message, result}}`. */
export type AIJobUpdate = JobUpdateFrame;

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
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  const onUpdateRef = useRef(onUpdate);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  });

  // The socket sends the token as its first frame (see useWebSocket). It is not in the URL.
  const urlBuilder = useCallback(() => {
    const wsBaseUrl = buildWebSocketBaseUrl();
    return `${wsBaseUrl}/ws/jobs/${jobId}`;
  }, [jobId]);

  const { state, disconnect, connect } = useWebSocket(urlBuilder, {
    autoReconnect,
    reconnectDelay,
    enabled: !!jobId && isAuthenticated,
    onMessage: (event, disconnect) => {
      const frame = parseServerFrame(event.data);
      if (!frame || frame.type !== 'job_update') return; // connected, heartbeat: nothing to do
      if (frame.job_id !== jobId) return; // ignore messages for other jobs
      onUpdateRef.current?.(frame);

      if (frame.data.status === 'completed') {
        onCompleteRef.current?.(frame.data.result ?? {});
        disconnect();
      } else if (frame.data.status === 'failed') {
        onErrorRef.current?.(frame.data.error_message || 'Job failed');
        disconnect();
      } else if (frame.data.status === 'cancelled') {
        // onUpdate carries the cancelled status; nothing more will arrive.
        disconnect();
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
    onNotification?: (notification: UserNotificationPayload) => void;
    autoReconnect?: boolean;
  } = {}
) {
  const { onNotification, autoReconnect = true } = options;
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  const onNotificationRef = useRef(onNotification);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  });

  const urlBuilder = useCallback(() => `${buildWebSocketBaseUrl()}/ws/user`, []);

  const { state, connect, disconnect } = useWebSocket(urlBuilder, {
    autoReconnect,
    enabled: isAuthenticated,
    onMessage: event => {
      const frame = parseServerFrame(event.data);
      if (frame?.type === 'notification') {
        onNotificationRef.current?.(frame.data);
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
