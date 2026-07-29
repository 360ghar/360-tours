/**
 * Remembers the last successful authentication method (and a masked identifier
 * hint) so the login screen can pre-select / highlight it. Stored in
 * localStorage under the platform-wide key "360ghar:lastAuthMethod".
 *
 * Never store the raw identifier — only a masked hint suitable for display.
 */

export type AuthMethod =
  | 'google'
  | 'email_password'
  | 'phone_password'
  | 'phone_otp'
  | 'email_otp';

export interface LastAuthMethod {
  method: AuthMethod;
  /** Masked identifier for display only (e.g. "+9198•••••210", "jo•••@gmail.com"). */
  identifierHint: string | null;
  /** Epoch milliseconds when this method last succeeded. */
  ts: number;
}

const STORAGE_KEY = '360ghar:lastAuthMethod';

const VALID_METHODS: ReadonlySet<AuthMethod> = new Set<AuthMethod>([
  'google',
  'email_password',
  'phone_password',
  'phone_otp',
  'email_otp',
]);

/** Mask a phone number, keeping the dial prefix and last 3 digits. */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 5) return '•'.repeat(trimmed.length);
  const head = trimmed.slice(0, Math.min(4, trimmed.length - 3));
  const tail = trimmed.slice(-3);
  return `${head}${'•'.repeat(Math.max(3, trimmed.length - head.length - tail.length))}${tail}`;
}

/** Mask an email, keeping the first 2 chars of the local part and the domain. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '•'.repeat(email.length);
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'•'.repeat(Math.max(3, local.length - visible.length))}${domain}`;
}

/** Build a masked hint from a raw identifier, auto-detecting email vs phone. */
export function maskIdentifier(identifier: string | null | undefined): string | null {
  if (!identifier) return null;
  return identifier.includes('@') ? maskEmail(identifier) : maskPhone(identifier);
}

/** Read the last-used auth method, or null if absent / malformed. */
export function getLastAuthMethod(): LastAuthMethod | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastAuthMethod>;
    if (!parsed || typeof parsed.method !== 'string' || !VALID_METHODS.has(parsed.method as AuthMethod)) {
      return null;
    }
    return {
      method: parsed.method as AuthMethod,
      identifierHint: typeof parsed.identifierHint === 'string' ? parsed.identifierHint : null,
      ts: typeof parsed.ts === 'number' ? parsed.ts : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Persist the last-used auth method with a masked identifier hint. */
export function setLastAuthMethod(method: AuthMethod, rawIdentifier?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: LastAuthMethod = {
      method,
      identifierHint: maskIdentifier(rawIdentifier),
      ts: Date.now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable (private mode / quota) — non-fatal.
  }
}

/** Forget the last-used auth method (e.g. on explicit "use a different method"). */
export function clearLastAuthMethod(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // non-fatal
  }
}
