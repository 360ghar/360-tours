/**
 * True when `path` is a same-origin relative path that is safe to hand to
 * `navigate()` / `history.replaceState()`.
 *
 * A `startsWith('/') && !startsWith('//')` check is NOT enough: the URL parser
 * normalizes backslashes to slashes for special schemes, so `/\evil.com`
 * resolves to `https://evil.com/`. Cross-origin there throws a SecurityError
 * out of `replaceState` (stranding a signed-in user on /login) and works as an
 * open redirect on any code path that reaches `window.location.assign`.
 *
 * Resolving against the current origin and comparing is the authoritative
 * check — it covers `//host`, `/\host`, `\\host`, absolute URLs and any future
 * parser quirk.
 */
export function isSameOriginPath(path: string | null | undefined): path is string {
  if (!path || !path.startsWith('/')) return false;
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  try {
    return new URL(path, origin).origin === origin;
  } catch {
    return false;
  }
}

export function parseBooleanParam(value: string | null): boolean | undefined {
  if (value == null) return undefined;

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 't', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'f', 'no', 'n', 'off'].includes(normalized)) return false;

  return undefined;
}

