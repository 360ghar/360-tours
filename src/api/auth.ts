import { apiClient } from './client';
import { supabaseAuth, type SupabaseSession } from '@/lib/supabaseAuth';
import type { User, AuthTokens, LoginCredentials, RegisterCredentials } from '@/types';
import type { AuthMethod } from '@/lib/lastAuthMethod';

/** Channel the identifier resolves to (frozen backend contract). */
export type IdentifierChannel = 'phone' | 'email';

/** Next step the login state-machine should take. */
export type IdentifierNextStep = 'password' | 'otp';

/** Response shape of POST /api/v1/auth/identifier-status (neutral, rate-limited). */
export interface IdentifierStatus {
  exists: boolean;
  verified: boolean;
  has_password: boolean;
  channel: IdentifierChannel;
  next_step: IdentifierNextStep;
}

function tokensFromSession(session: SupabaseSession): AuthTokens {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    token_type: session.token_type,
  };
}

async function completeAuthSession(session: SupabaseSession): Promise<{
  user: User;
  tokens: AuthTokens;
}> {
  const response = await apiClient.get<User>('/users/me');
  return {
    user: response.data,
    tokens: tokensFromSession(session),
  };
}

export const authApi = {
  /**
   * Convert an established Supabase session into the app's canonical auth
   * payload by loading the backend user and extracting browser-safe tokens.
   */
  completeSession: completeAuthSession,

  /**
   * Login with phone and password
   */
  async login(credentials: LoginCredentials): Promise<{ user: User; tokens: AuthTokens }> {
    const session = await supabaseAuth.signInWithPassword(credentials);
    return completeAuthSession(session);
  },

  /**
   * Register a new user with phone
   */
  async register(
    data: RegisterCredentials
  ): Promise<{ user: User | null; tokens: AuthTokens | null }> {
    const { session } = await supabaseAuth.signUp({
      phone: data.phone,
      password: data.password,
      data: {
        full_name: data.full_name ?? null,
        email: data.email ?? null,
      },
    });

    if (!session) {
      return { user: null, tokens: null };
    }

    return completeAuthSession(session);
  },

  /**
   * Logout the current user
   */
  async logout(): Promise<void> {
    await supabaseAuth.signOut();
  },

  /**
   * Get the current authenticated user
   */
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>('/users/me');
    return response.data;
  },

  /**
   * Login state-machine: resolve an identifier (email or phone) to its auth
   * status. PUBLIC endpoint — no session required. Drives the
   * identifier -> password|OTP branching.
   */
  async checkIdentifierStatus(identifier: string): Promise<IdentifierStatus> {
    const response = await apiClient.post<IdentifierStatus>('/auth/identifier-status', {
      identifier,
    });
    return response.data;
  },

  /**
   * Record the last successful auth method on the backend (mirrors Supabase
   * state). AUTH endpoint — requires an established session. Best-effort:
   * never block the UI on this call.
   */
  async recordLastMethod(method: AuthMethod): Promise<void> {
    try {
      await apiClient.post('/auth/last-method', { method }, { _skipAuthExpiry: true } as Record<
        string,
        unknown
      >);
    } catch (error) {
      console.warn(
        'Failed to record last auth method (non-critical):',
        error instanceof Error ? error.message : error
      );
    }
  },

  /**
   * Send an OTP for phone-based password reset (best-effort; avoids user enumeration).
   */
  async requestPasswordResetOTP(phone: string): Promise<void> {
    // Do not create users via OTP in a reset flow.
    await supabaseAuth.requestOtp({ phone, shouldCreateUser: false });
  },

  /**
   * Verify a phone OTP to establish a session.
   */
  async verifyPasswordResetOTP(phone: string, token: string): Promise<AuthTokens> {
    const session = await supabaseAuth.verifyOtp({ phone, token, type: 'sms' });
    return tokensFromSession(session);
  },

  /**
   * Send an OTP for email-based password reset (best-effort; avoids user enumeration).
   */
  async requestPasswordResetEmailOTP(email: string): Promise<void> {
    await supabaseAuth.requestEmailOtp({ email, shouldCreateUser: false });
  },

  /**
   * Verify an email OTP to establish a session for password reset.
   */
  async verifyPasswordResetEmailOTP(email: string, token: string): Promise<AuthTokens> {
    const session = await supabaseAuth.verifyEmailOtp({ email, token, type: 'email' });
    return tokensFromSession(session);
  },

  /**
   * Update the current user's password (requires an authenticated session).
   */
  async updatePassword(newPassword: string): Promise<void> {
    await supabaseAuth.updatePassword(newPassword);
  },

  /**
   * Change password by re-authenticating with current password, then updating to a new password.
   */
  async changePassword(payload: {
    phone?: string;
    email?: string;
    current_password: string;
    new_password: string;
  }): Promise<void> {
    if (payload.email) {
      await supabaseAuth.signInWithEmailPassword({
        email: payload.email,
        password: payload.current_password,
      });
    } else if (payload.phone) {
      await supabaseAuth.signInWithPassword({
        phone: payload.phone,
        password: payload.current_password,
      });
    } else {
      throw new Error('Missing phone or email on your profile');
    }
    await supabaseAuth.updatePassword(payload.new_password);
  },
};
