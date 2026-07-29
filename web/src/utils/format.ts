import { format, formatDistanceToNow, parseISO } from 'date-fns';

const OFFSET_OR_Z_SUFFIX = /([zZ]|[+-]\d{2}:\d{2})$/;

const padDatePart = (value: number): string => String(value).padStart(2, '0');

function normalizeServerTimestamp(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('T') && !OFFSET_OR_Z_SUFFIX.test(trimmed)) {
    return `${trimmed}Z`;
  }
  return trimmed;
}

export function parseServerTimestamp(value: string | Date): Date {
  if (value instanceof Date) {
    return value;
  }
  return parseISO(normalizeServerTimestamp(value));
}

export function serverTimestampToLocalInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const parsed = parseServerTimestamp(value);

  const date = [
    parsed.getFullYear(),
    padDatePart(parsed.getMonth() + 1),
    padDatePart(parsed.getDate()),
  ].join('-');

  const time = `${padDatePart(parsed.getHours())}:${padDatePart(parsed.getMinutes())}`;
  return `${date}T${time}`;
}

export function localInputToServerTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function formatDateOnlyForApi(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return [
    parsed.getFullYear(),
    padDatePart(parsed.getMonth() + 1),
    padDatePart(parsed.getDate()),
  ].join('-');
}

export function getLocalDateKey(value: string | Date): string {
  return format(parseServerTimestamp(value), 'yyyy-MM-dd');
}

/**
 * Format a date string to a human-readable format
 */
export function formatDate(date: string | Date, formatStr: string = 'MMM d, yyyy'): string {
  const dateObj = parseServerTimestamp(date);
  return format(dateObj, formatStr);
}

/**
 * Format a date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const dateObj = parseServerTimestamp(date);
  return formatDistanceToNow(dateObj, { addSuffix: true });
}

/**
 * Format a date to a datetime string (e.g., "Jan 1, 2024 at 12:00 PM")
 */
export function formatDateTime(date: string | Date): string {
  const dateObj = parseServerTimestamp(date);
  return format(dateObj, "MMM d, yyyy 'at' h:mm a");
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format a number with thousand separators
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Format a number as a compact string (e.g., 1.2K, 3.4M)
 */
export function formatCompactNumber(num: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(num);
}

/**
 * Format a percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format duration in seconds to human-readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Generate initials from a name
 */
export function getInitials(name: string): string {
  if (!name) return '';

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Slugify a string for URLs
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
