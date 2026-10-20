import { describe, it, expect } from 'vitest';
import { isSameOriginPath, parseBooleanParam } from '@/utils/url';

/**
 * `isSameOriginPath` gates every post-login redirect (LoginPage `?next=`, the
 * OAuth stash in supabaseAuth, and App.tsx's auth-expired return path). The
 * naive `startsWith('/') && !startsWith('//')` form it replaced let
 * `/\evil.com` through: the URL parser normalizes the backslash, so the value
 * resolves cross-origin — a SecurityError out of history.replaceState on the
 * replace path, and a working open redirect on the assign path.
 */
describe('isSameOriginPath', () => {
  it('accepts ordinary in-app paths', () => {
    expect(isSameOriginPath('/')).toBe(true);
    expect(isSameOriginPath('/dashboard')).toBe(true);
    expect(isSameOriginPath('/tours/123?tab=scenes#hotspot-4')).toBe(true);
  });

  it('rejects protocol-relative and backslash-escaped hosts', () => {
    expect(isSameOriginPath('//evil.com')).toBe(false);
    expect(isSameOriginPath('/\\evil.com')).toBe(false);
    expect(isSameOriginPath('/\\\\evil.com')).toBe(false);
    expect(isSameOriginPath('/\\/evil.com')).toBe(false);
  });

  it('rejects absolute URLs and non-path values', () => {
    expect(isSameOriginPath('https://evil.com')).toBe(false);
    expect(isSameOriginPath('http://localhost:3000/dashboard')).toBe(false);
    expect(isSameOriginPath('javascript:alert(1)')).toBe(false);
    expect(isSameOriginPath('dashboard')).toBe(false);
    expect(isSameOriginPath('')).toBe(false);
    expect(isSameOriginPath(null)).toBe(false);
    expect(isSameOriginPath(undefined)).toBe(false);
  });
});

describe('parseBooleanParam', () => {
  it('parses the accepted truthy and falsy spellings', () => {
    expect(parseBooleanParam('true')).toBe(true);
    expect(parseBooleanParam('YES')).toBe(true);
    expect(parseBooleanParam('0')).toBe(false);
    expect(parseBooleanParam('off')).toBe(false);
  });

  it('returns undefined for absent or unrecognized values', () => {
    expect(parseBooleanParam(null)).toBeUndefined();
    expect(parseBooleanParam('maybe')).toBeUndefined();
  });
});
