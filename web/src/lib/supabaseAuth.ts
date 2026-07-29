import { createClient, type AuthChangeEvent, type Session } from '@supabase/supabase-js';
import { STORAGE_KEYS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/constants';
import { mapSupabaseAuthError, type AuthErrorContext } from '@/lib/authErrors';
import type { AuthTokens } from '@/types';

function mappedError(error: unknown, context: AuthErrorContext = 'login'): Error {
  return new Error(mapSupabaseAuthError(error, context));
}

export type SupabaseAuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';

export interface SupabaseSession extends AuthTokens {
  expires_at: number;
  user?: Record<string, unknown> | null;
}

type AuthStateListener = (event: SupabaseAuthEvent, session: SupabaseSession | null) => void;
const IS_TEST_MODE = import.meta.env.MODE === 'test' || import.meta.env.VITEST === 'true';

if (!IS_TEST_MODE && (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

const supabase =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
          storageKey: STORAGE_KEYS.AUTH_TOKENS,
        },
      })
    : null;

let cachedSession: SupabaseSession | null = null;

if (supabase) {
  void supabase.auth.getSession().then(({ data }) => {
    cachedSession = normalizeSession(data.session);
  });
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function normalizeSession(session: Session | null): SupabaseSession | null {
  if (!session) return null;
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    token_type: session.token_type,
    expires_at: session.expires_at ?? nowEpochSeconds() + session.expires_in,
    user: session.user as unknown as Record<string, unknown>,
  };
}

function requireClient() {
  if (!supabase) {
    throw new Error(
      'Missing Supabase configuration (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)'
    );
  }
  return supabase;
}

/** sessionStorage key for post-OAuth relative path (not put on redirectTo). */
export const OAUTH_NEXT_STORAGE_KEY = STORAGE_KEYS.OAUTH_NEXT;

/**
 * Same-site relative path predicate (rejects absolute URLs and protocol-relative
 * `//host` strings that would escape the origin). Shared by stash/consume.
 */
function isSafeSameSitePath(path: string | null | undefined): path is string {
  return !!path && path.startsWith('/') && !path.startsWith('//');
}

/**
 * Clean allowlist-stable callback URL for Supabase redirectTo.
 * Never includes query params — those break exact allowlist matching.
 */
export function buildCleanOAuthCallbackUrl(): string {
  const isProd = import.meta.env.PROD;
  const base =
    !isProd && import.meta.env.VITE_AUTH_REDIRECT_URL
      ? String(import.meta.env.VITE_AUTH_REDIRECT_URL)
      : window.location.origin;
  const url = new URL('/auth/callback', base);
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4);
  }
  url.search = '';
  url.hash = '';
  return url.toString();
}

/** Stash a safe same-site path for AuthCallbackPage after OAuth. */
export function stashOAuthNext(next?: string | null, fallback = '/'): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(OAUTH_NEXT_STORAGE_KEY, isSafeSameSitePath(next) ? next : fallback);
  } catch {
    // Private mode / quota
  }
}

/** Read and clear stashed path; fall back to URL next param then fallback. */
export function consumeOAuthNext(urlNext?: string | null, fallback = '/'): string {
  let stored: string | null = null;
  if (typeof sessionStorage !== 'undefined') {
    try {
      stored = sessionStorage.getItem(OAUTH_NEXT_STORAGE_KEY);
      sessionStorage.removeItem(OAUTH_NEXT_STORAGE_KEY);
    } catch {
      stored = null;
    }
  }
  const candidate = stored ?? urlNext ?? null;
  return isSafeSameSitePath(candidate) ? candidate : fallback;
}

function mapEvent(event: AuthChangeEvent): SupabaseAuthEvent {
  if (event === 'SIGNED_OUT') return 'SIGNED_OUT';
  if (event === 'TOKEN_REFRESHED') return 'TOKEN_REFRESHED';
  return 'SIGNED_IN';
}

export const supabaseAuth = {
  getSession(): SupabaseSession | null {
    return cachedSession;
  },

  getTokens(): AuthTokens | null {
    const session = this.getSession();
    if (!session) return null;
    const { access_token, refresh_token, expires_in, token_type } = session;
    return { access_token, refresh_token, expires_in, token_type };
  },

  onAuthStateChange(listener: AuthStateListener): { unsubscribe: () => void } {
    if (!supabase) {
      return { unsubscribe: () => undefined };
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      cachedSession = normalizeSession(session);
      listener(mapEvent(event), cachedSession);
    });
    return {
      unsubscribe: () => subscription.unsubscribe(),
    };
  },

  async getAccessToken(): Promise<string | null> {
    const client = requireClient();
    const { data } = await client.auth.getSession();
    cachedSession = normalizeSession(data.session);
    return cachedSession?.access_token ?? null;
  },

  async signInWithPassword(payload: { phone: string; password: string }): Promise<SupabaseSession> {
    const client = requireClient();
    const { data, error } = await client.auth.signInWithPassword({
      phone: payload.phone,
      password: payload.password,
    });
    if (error || !data.session) {
      throw mappedError(error);
    }
    cachedSession = normalizeSession(data.session);
    return cachedSession!;
  },

  async signInWithEmailPassword(payload: {
    email: string;
    password: string;
  }): Promise<SupabaseSession> {
    const client = requireClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });
    if (error || !data.session) {
      throw mappedError(error);
    }
    cachedSession = normalizeSession(data.session);
    return cachedSession!;
  },

  async signUp(payload: {
    phone: string;
    password: string;
    data?: Record<string, unknown>;
  }): Promise<{ session: SupabaseSession | null }> {
    const client = requireClient();
    const { data, error } = await client.auth.signUp({
      phone: payload.phone,
      password: payload.password,
      options: { data: payload.data ?? {} },
    });
    if (error) {
      throw mappedError(error);
    }
    cachedSession = normalizeSession(data.session);
    return { session: cachedSession };
  },

  async signOut(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
    cachedSession = null;
  },

  async requestOtp(payload: {
    phone: string;
    shouldCreateUser?: boolean;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.signInWithOtp({
      phone: payload.phone,
      options: { shouldCreateUser: payload.shouldCreateUser ?? false, data: payload.data },
    });
    if (error) {
      throw mappedError(error);
    }
  },

  /**
   * Send a 6-digit email OTP (channel: 'email'). Used by the verified/unverified
   * login state-machine and email-first signup.
   */
  async requestEmailOtp(payload: {
    email: string;
    shouldCreateUser?: boolean;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.signInWithOtp({
      email: payload.email,
      options: { shouldCreateUser: payload.shouldCreateUser ?? false, data: payload.data },
    });
    if (error) {
      throw mappedError(error);
    }
  },

  async verifyOtp(payload: {
    phone: string;
    token: string;
    type?: 'sms' | 'phone_change';
  }): Promise<SupabaseSession> {
    const client = requireClient();
    const { data, error } = await client.auth.verifyOtp({
      phone: payload.phone,
      token: payload.token,
      type: payload.type ?? 'sms',
    });
    if (error || !data.session) {
      throw mappedError(error, 'otp');
    }
    cachedSession = normalizeSession(data.session);
    return cachedSession!;
  },

  /**
   * Verify a 6-digit email OTP (type: 'email' for signup/login, 'email_change'
   * when adding/changing an email on an authenticated account).
   */
  async verifyEmailOtp(payload: {
    email: string;
    token: string;
    type?: 'email' | 'email_change';
  }): Promise<SupabaseSession> {
    const client = requireClient();
    const { data, error } = await client.auth.verifyOtp({
      email: payload.email,
      token: payload.token,
      type: payload.type ?? 'email',
    });
    if (error || !data.session) {
      throw mappedError(error, 'otp');
    }
    cachedSession = normalizeSession(data.session);
    return cachedSession!;
  },

  async updatePassword(newPassword: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
      throw mappedError(error);
    }
  },

  /**
   * Start the Google OAuth redirect flow. Redirects the browser to Google, which
   * returns to `${origin}/auth/callback?code=...` for exchangeCodeForSession().
   * INTERNAL tool: any Google user can authenticate, but the role guard bounces
   * non-staff after the session is established.
   *
   * `redirectTo` must be a clean origin callback with no query string (Supabase
   * allowlist). Pass the post-login path via {@link stashOAuthNext} instead.
   * In production the callback is always `window.location.origin/auth/callback`;
   * `VITE_AUTH_REDIRECT_URL` is dev-only.
   */
  async signInWithGoogle(redirectTo?: string): Promise<void> {
    const client = requireClient();
    const cleanRedirect =
      redirectTo ??
      buildCleanOAuthCallbackUrl();
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: cleanRedirect,
      },
    });
    if (error) {
      throw mappedError(error);
    }
  },

  /**
   * Exchange the OAuth `code` returned to /auth/callback for a session.
   * The Zustand store's onAuthStateChange listener picks up the new session.
   */
  async exchangeCodeForSession(code: string): Promise<SupabaseSession> {
    const client = requireClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.session) {
      throw mappedError(error);
    }
    cachedSession = normalizeSession(data.session);
    return cachedSession!;
  },
};
