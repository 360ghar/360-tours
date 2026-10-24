/**
 * WebSocket frames. They are not part of OpenAPI, so they are declared here to
 * match `app/schemas/realtime.py` in the backend.
 *
 * Every channel starts the same way: the server accepts the socket, the client
 * sends `{type: 'auth', token}` as its first frame, and the server then sends a
 * `connected` frame or the first data frame. The token never goes in the URL.
 */
import type { AIJobStatus } from './index';

/** Close code: the auth frame was missing or the token invalid. Do not reconnect. */
export const WS_CLOSE_UNAUTHORIZED = 4001;
/** Close code: the job does not exist or is not visible to the caller. Do not reconnect. */
export const WS_CLOSE_NOT_FOUND = 4004;

/** First frame the client sends. */
export interface ClientAuthFrame {
  type: 'auth';
  token: string;
}

/** `connected` and `heartbeat`, sent on every channel. */
export interface ControlFrame {
  type: 'connected' | 'heartbeat';
  message?: string | null;
}

/** State of one AI job. `status` is null when the server sent a value outside the enum. */
export interface JobUpdateData {
  status: AIJobStatus | null;
  progress: number | null;
  error_message: string | null;
  /** Result model of the job type (see `AIJobResult`); read it with the `read*` helpers. */
  result: Record<string, unknown> | null;
}

/** `/ws/jobs/{job_id}`: one frame per state change. */
export interface JobUpdateFrame {
  type: 'job_update';
  job_id: string;
  data: JobUpdateData;
}

export interface UserNotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  /** UTC ISO 8601 with a `Z` suffix. */
  created_at: string;
}

/** `/ws/user`: a notification for the signed-in user. */
export interface UserNotificationFrame {
  type: 'notification';
  data: UserNotificationPayload;
}

export type ServerFrame = ControlFrame | JobUpdateFrame | UserNotificationFrame;
