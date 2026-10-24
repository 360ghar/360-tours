import type { AIJobStatus } from '@/types';
import type {
  JobUpdateFrame,
  ServerFrame,
  UserNotificationFrame,
} from '@/types/realtime';

const JOB_STATUSES: ReadonlySet<string> = new Set<AIJobStatus>([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJobStatus(value: unknown): value is AIJobStatus {
  return typeof value === 'string' && JOB_STATUSES.has(value);
}

/** An unknown status maps to null: it is never turned into a real status. */
export function toJobStatus(value: unknown): AIJobStatus | null {
  return isJobStatus(value) ? value : null;
}

function parseJobUpdate(frame: UnknownRecord): JobUpdateFrame | null {
  if (typeof frame.job_id !== 'string' || !isRecord(frame.data)) return null;
  const { status, progress, error_message, result } = frame.data;
  return {
    type: 'job_update',
    job_id: frame.job_id,
    data: {
      status: toJobStatus(status),
      progress: typeof progress === 'number' ? progress : null,
      error_message: typeof error_message === 'string' ? error_message : null,
      result: isRecord(result) ? result : null,
    },
  };
}

function parseNotification(frame: UnknownRecord): UserNotificationFrame | null {
  const data = frame.data;
  if (!isRecord(data)) return null;
  if (
    typeof data.id !== 'string' ||
    typeof data.type !== 'string' ||
    typeof data.title !== 'string' ||
    typeof data.message !== 'string' ||
    typeof data.created_at !== 'string'
  ) {
    return null;
  }
  return {
    type: 'notification',
    data: {
      id: data.id,
      type: data.type,
      title: data.title,
      message: data.message,
      created_at: data.created_at,
    },
  };
}

/**
 * Parse one text frame from the server. Returns null for a frame that is not
 * JSON, has an unknown `type`, or lacks the keys of its type. The bare text
 * `pong` is not a frame.
 */
export function parseServerFrame(raw: unknown): ServerFrame | null {
  if (typeof raw !== 'string') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'connected':
    case 'heartbeat':
      return {
        type: value.type,
        message: typeof value.message === 'string' ? value.message : null,
      };
    case 'job_update':
      return parseJobUpdate(value);
    case 'notification':
      return parseNotification(value);
    default:
      return null;
  }
}
