import { createClient, type AuthChangeEvent, type Session } from '@supabase/supabase-js';
import { STORAGE_KEYS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/constants';
import type { AuthTokens } from '@/types';

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

const supabase = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
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
      throw new Error(error?.message || 'Login failed. Please check your credentials and try again.');
    }
    cachedSession = normalizeSession(data.session);
    return cachedSession!;
  },

  async signInWithEmailPassword(payload: { email: string; password: string }): Promise<SupabaseSession> {
    const client = requireClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });
    if (error || !data.session) {
      throw new Error(error?.message || 'Login failed. Please check your credentials and try again.');
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
      throw new Error(error.message);
    }
    cachedSession = normalizeSession(data.session);
    return { session: cachedSession };
  },

  async signOut(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
    cachedSession = null;
  },

  async requestOtp(payload: { phone: string; shouldCreateUser?: boolean }): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.signInWithOtp({
      phone: payload.phone,
      options: { shouldCreateUser: payload.shouldCreateUser ?? true },
    });
    if (error) {
      throw new Error(error.message);
    }
  },

  /**
   * Send a 6-digit email OTP (channel: 'email'). Used by the verified/unverified
   * login state-machine and email-first signup.
   */
  async requestEmailOtp(payload: { email: string; shouldCreateUser?: boolean }): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.signInWithOtp({
      email: payload.email,
      options: { shouldCreateUser: payload.shouldCreateUser ?? true },
    });
    if (error) {
      throw new Error(error.message);
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
      throw new Error(error?.message || 'Invalid or expired OTP');
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
      throw new Error(error?.message || 'Invalid or expired OTP');
    }
    cachedSession = normalizeSession(data.session);
    return cachedSession!;
  },

  async updatePassword(newPassword: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message);
    }
  },

  /**
   * Start the Google OAuth redirect flow. Redirects the browser to Google, which
   * returns to `${origin}/auth/callback?code=...` for exchangeCodeForSession().
   * INTERNAL tool: any Google user can authenticate, but the role guard bounces
   * non-staff after the session is established.
   */
  async signInWithGoogle(redirectTo?: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo ?? `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      throw new Error(error.message);
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
      throw new Error(error?.message || 'Failed to complete sign-in');
    }
    cachedSession = normalizeSession(data.session);
    return cachedSession!;
  },
};
