/**
 * Browser storage for data that belongs to the signed-in account.
 *
 * Every key carries the store name, a schema version and the account id:
 * `360viewer:acct:<store>:v<version>:<userId>[:<suffix>]`.
 *
 * - A new schema version reads as a miss, so an old payload is never parsed.
 * - Another account reads as a miss, so a shared browser never mixes accounts.
 * - `purgeAccountStorage()` removes every such key (and the unscoped keys of
 *   earlier builds). It runs on sign-out and when the account changes.
 *
 * Storage can be blocked or full, so every call swallows its error.
 */

const PREFIX = '360viewer:acct:';

/** Raise a version when the shape stored under that name changes. */
export const ACCOUNT_STORE_VERSION = {
  /** Id of the AI tour job still running when the wizard was closed. */
  aiPendingJob: 1,
  /** Frames captured in the guided capture page, one key per capture session. */
  captureFrames: 1,
} as const;

export type AccountStoreName = keyof typeof ACCOUNT_STORE_VERSION;

/** Keys written before keys carried an account id. They are removed, never read. */
const LEGACY_KEYS: readonly string[] = ['360viewer_ai_pending_job'];
const LEGACY_PREFIXES: readonly string[] = ['360viewer_capture_frames_'];

export function accountKey(name: AccountStoreName, userId: number, suffix?: string): string {
  const base = `${PREFIX}${name}:v${ACCOUNT_STORE_VERSION[name]}:${userId}`;
  return suffix ? `${base}:${suffix}` : base;
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function readAccountItem(
  name: AccountStoreName,
  userId: number | null | undefined,
  suffix?: string
): string | null {
  if (userId == null) return null;
  try {
    return storage()?.getItem(accountKey(name, userId, suffix)) ?? null;
  } catch {
    return null;
  }
}

export function writeAccountItem(
  name: AccountStoreName,
  userId: number | null | undefined,
  value: string,
  suffix?: string
): void {
  if (userId == null) return;
  try {
    storage()?.setItem(accountKey(name, userId, suffix), value);
  } catch {
    // Storage is blocked or full: the data stays in memory only.
  }
}

export function removeAccountItem(
  name: AccountStoreName,
  userId: number | null | undefined,
  suffix?: string
): void {
  if (userId == null) return;
  try {
    storage()?.removeItem(accountKey(name, userId, suffix));
  } catch {
    // Nothing to do.
  }
}

/** Remove every account-scoped key, and the unscoped keys of earlier builds. */
export function purgeAccountStorage(): void {
  const store = storage();
  if (!store) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (
        key &&
        (key.startsWith(PREFIX) ||
          LEGACY_KEYS.includes(key) ||
          LEGACY_PREFIXES.some(prefix => key.startsWith(prefix)))
      ) {
        doomed.push(key);
      }
    }
    doomed.forEach(key => store.removeItem(key));
  } catch {
    // Nothing to do.
  }
}
