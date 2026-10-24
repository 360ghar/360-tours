import { create } from 'zustand';
import type { User, AuthTokens } from '@/types';
import { authApi } from '@/api';
import type { IdentifierChannel } from '@/api/auth';
import { sessionReady, supabaseAuth, type SupabaseSession } from '@/lib/supabaseAuth';
import { setLastAuthMethod, type AuthMethod } from '@/lib/lastAuthMethod';
import { ERROR_MESSAGES } from '@/constants';
import { mapSupabaseAuthError } from '@/lib/authErrors';
import { purgeAccountCaches } from '@/lib/accountCache';

/**
 * Determine whether an error represents a genuine authentication failure
 * (invalid/expired credentials) versus a transient backend problem (5xx,
 * network down). The Axios interceptor rewrites 401s into a plain
 * `Error(SESSION_EXPIRED)` (no `.response`), so we match either the explicit
 * status code or that canonical message. Server/network errors keep their
 * Axios shape and must NOT trigger a sign-out — otherwise a temporary backend
 * outage nukes every active session.
 */
function isAuthError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 401 || status === 403) return true;
  }
  if (error instanceof Error && error.message === ERROR_MESSAGES.SESSION_EXPIRED) {
    return true;
  }
  return false;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : e);

/**
 * After a failed /users/me: sign out on a genuine auth error, keep the session
 * on a transient one (5xx/network). Returns true when it signed out.
 */
async function signOutOnAuthError(
  error: unknown,
  context: string,
  clearAuth: () => void
): Promise<boolean> {
  if (!isAuthError(error)) {
    console.error(`Transient error ${context} (session preserved):`, errText(error));
    return false;
  }
  console.error(`Auth error ${context}, signing out:`, errText(error));
  try {
    await authApi.logout();
  } catch (logoutError) {
    console.error(`Logout ${context} failed:`, errText(logoutError));
  }
  clearAuth();
  return true;
}

function passwordMethodFor(channel: IdentifierChannel): AuthMethod {
  return channel === 'email' ? 'email_password' : 'phone_password';
}

function otpMethodFor(channel: IdentifierChannel): AuthMethod {
  return channel === 'email' ? 'email_otp' : 'phone_otp';
}

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  /** Local error override used by the auth pages' state machines (cleared by
   *  every action that starts a request). */
  setError: (error: string | null) => void;
  login: (phone: string, password: string) => Promise<void>;
  /** Password login for the identifier state-machine (email or phone channel). */
  loginWithPassword: (
    channel: IdentifierChannel,
    identifier: string,
    password: string
  ) => Promise<void>;
  /** Verify an OTP (email or phone channel) to establish a session and load the user. */
  verifyLoginOtp: (channel: IdentifierChannel, identifier: string, token: string) => Promise<void>;
  /**
   * Set a password on the current (OTP-authenticated) session, then record the
   * password-based last_auth_method. Used by the mandatory set-password step
   * after OTP when the account had no password.
   */
  setPasswordAndComplete: (
    channel: IdentifierChannel,
    identifier: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearAuth: () => void;
}

type AuthStore = AuthState & AuthActions;

let authListenerUnsubscribe: (() => void) | null = null;
let authListenerInitialized = false;

export const useAuthStore = create<AuthStore>()((set, get) => {
  const recordSuccessfulAuthMethod = (method: AuthMethod, identifier: string) => {
    setLastAuthMethod(method, identifier);
    void authApi.recordLastMethod(method);
  };

  const commitCompletedSession = (
    auth: { user: User; tokens: AuthTokens },
    method: AuthMethod,
    identifier: string
  ) => {
    // A different account signing in on the same tab must not see the cached
    // data of the previous one.
    const previous = get().user;
    if (previous && previous.id !== auth.user.id) purgeAccountCaches();
    set({
      user: auth.user,
      tokens: auth.tokens,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    recordSuccessfulAuthMethod(method, identifier);
  };

  const completeSupabaseSession = async (
    session: SupabaseSession,
    method: AuthMethod,
    identifier: string
  ) => {
    const auth = await authApi.completeSession(session);
    commitCompletedSession(auth, method, identifier);
  };

  /**
   * Compensation for a failed login. Only a genuine auth error (bad
   * credentials, 401/403, session expired) justifies destroying the session:
   * the credential step may already have succeeded and a transient 5xx/network
   * failure from `completeSession`'s GET /users/me must NOT revoke a valid
   * refresh token — the same invariant `fetchCurrentUser`/`checkAuth` hold.
   */
  const discardSessionOnAuthError = async (error: unknown) => {
    // Supabase rejects credentials with its own AuthApiError (marked
    // `__isAuthError`, status 400/401/403 — never wrapped in an Axios
    // `.response`), so accept those alongside the shared isAuthError check.
    const supabaseStatus =
      error && typeof error === 'object' && '__isAuthError' in error
        ? (error as { status?: unknown }).status
        : undefined;
    const isCredentialRejection =
      typeof supabaseStatus === 'number' && supabaseStatus >= 400 && supabaseStatus < 500;

    if (!isAuthError(error) && !isCredentialRejection) {
      console.error(
        'Transient error completing login (session preserved):',
        error instanceof Error ? error.message : error
      );
      // The Supabase session may already belong to the NEW account while the
      // store still holds the previous user: drop that identity (the session
      // itself is kept and restored on the next checkAuth).
      if (get().user) get().clearAuth();
      return;
    }
    try {
      await authApi.logout();
    } catch {
      // Best-effort: clear any dangling partial session after failed login.
    }
    get().clearAuth();
  };

  return {
    user: null,
    tokens: null,
    isAuthenticated: false,
    // Boot starts in the "checking" state so auth-dependent routes can wait for
    // checkAuth to settle the restored session: ProtectedRoute and RootRedirect
    // render a PageLoader while this is true. Initial false here caused a
    // cold-load race that dumped users with valid sessions on the login page.
    // The router itself is NOT gated on this — public viewer routes must render
    // without waiting on the session (see App.tsx).
    isLoading: true,
    error: null,

    setUser: user => {
      set({ user, isAuthenticated: !!user });
    },
    setError: (error: string | null) => {
      set({ error });
    },

    login: async (phone, password) => {
      set({ isLoading: true, error: null });
      try {
        const auth = await authApi.login({ phone, password });
        commitCompletedSession(auth, 'phone_password', phone);
      } catch (error) {
        const message = mapSupabaseAuthError(error);
        await discardSessionOnAuthError(error);
        set({ isLoading: false, error: message });
        throw error;
      }
    },

    loginWithPassword: async (channel, identifier, password) => {
      set({ isLoading: true, error: null });
      try {
        const session =
          channel === 'email'
            ? await supabaseAuth.signInWithEmailPassword({ email: identifier, password })
            : await supabaseAuth.signInWithPassword({ phone: identifier, password });

        await completeSupabaseSession(session, passwordMethodFor(channel), identifier);
      } catch (error) {
        const message = mapSupabaseAuthError(error);
        await discardSessionOnAuthError(error);
        set({ isLoading: false, error: message });
        throw error;
      }
    },

    verifyLoginOtp: async (channel, identifier, token) => {
      set({ isLoading: true, error: null });
      try {
        const session = await supabaseAuth.verifyOtpFor(channel, identifier, token);

        await completeSupabaseSession(session, otpMethodFor(channel), identifier);
      } catch (error) {
        const message = mapSupabaseAuthError(error, 'otp');
        set({ isLoading: false, error: message });
        throw error;
      }
    },

    setPasswordAndComplete: async (channel, identifier, password) => {
      set({ isLoading: true, error: null });
      try {
        // Session is already established by the preceding OTP verification.
        await supabaseAuth.updatePassword(password);
        set({ isLoading: false, error: null });

        // The account now logs in by password — record that as the last method.
        recordSuccessfulAuthMethod(passwordMethodFor(channel), identifier);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to set password';
        set({ isLoading: false, error: message });
        throw error;
      }
    },

    logout: async () => {
      try {
        await authApi.logout();
      } catch (error) {
        console.error(
          'Logout API call failed (non-critical):',
          error instanceof Error ? error.message : error
        );
      } finally {
        get().clearAuth();
      }
    },

    fetchCurrentUser: async () => {
      if (!supabaseAuth.getTokens()) return;

      set({ isLoading: true });
      try {
        const user = await authApi.getCurrentUser();
        set({ user, isAuthenticated: true, isLoading: false });
      } catch (error) {
        // Only sign out on genuine auth errors (401/403 or session-expired).
        // A 5xx server error or network outage must NOT wipe the session —
        // the user may still have a valid token once the backend recovers.
        if (!(await signOutOnAuthError(error, 'fetching current user', get().clearAuth))) {
          set({ isLoading: false });
        }
      }
    },

    checkAuth: async () => {
      if (!authListenerInitialized) {
        authListenerInitialized = true;

        if (authListenerUnsubscribe) {
          authListenerUnsubscribe();
        }

        const { unsubscribe } = supabaseAuth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_OUT') {
            get().clearAuth();
            return;
          }

          if (session) {
            set({
              tokens: {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                expires_in: session.expires_in,
                token_type: session.token_type,
              },
            });
          }

          // Hydrate user profile after Supabase sign-in. Login methods also call
          // completeSession — if they already set isAuthenticated, skip to avoid
          // a second /users/me race that can 401 and wipe the session.
          if (event === 'SIGNED_IN' && session && !get().isAuthenticated) {
            try {
              const user = await authApi.getCurrentUser();
              // Re-check: a concurrent loginWithPassword may have finished.
              if (!get().isAuthenticated) {
                set({ user, isAuthenticated: true, isLoading: false });
              }
            } catch (error) {
              // If login already succeeded, ignore this parallel failure.
              if (get().isAuthenticated) {
                return;
              }
              await signOutOnAuthError(error, 'on SIGNED_IN', get().clearAuth);
            }
          }
        });

        authListenerUnsubscribe = unsubscribe;
      }

      // If the store already has a fully-hydrated session (user + tokens +
      // isAuthenticated), skip the re-fetch to avoid a race that could wipe the
      // session when a concurrent login action (e.g. verifyLoginOtp) has just
      // established it.
      const { isAuthenticated, user } = get();
      const tokens = supabaseAuth.getTokens();
      if (isAuthenticated && user && tokens) {
        set({ isLoading: false });
        return;
      }

      set({ isLoading: true, error: null });

      // Wait for the boot-time session restore to settle before reading the
      // tokens: the restore is async and losing this race silently signs a
      // stored-session user out on every cold load.
      await sessionReady;

      const restoredTokens = supabaseAuth.getTokens();
      if (!restoredTokens) {
        set({ isLoading: false, isAuthenticated: false, user: null, tokens: null });
        return;
      }

      set({ tokens: restoredTokens });

      try {
        const user = await authApi.getCurrentUser();
        set({ user, isAuthenticated: true, isLoading: false });
      } catch (error) {
        await signOutOnAuthError(error, 'during checkAuth', get().clearAuth);
        set({ isLoading: false });
      }
    },

    clearAuth: () => {
      // Sign-out purges the account's caches: query data and account-scoped storage.
      // An anonymous visit has nothing to purge, and clearing the query cache then
      // would drop the public viewer's in-flight request.
      const wasSignedIn = get().user !== null || get().tokens !== null;
      if (wasSignedIn) purgeAccountCaches();
      set({
        user: null,
        tokens: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    },
  };
});
