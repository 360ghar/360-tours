import { describe, expect, it } from 'vitest';
import type { User } from '@/types';

/**
 * Structural contract: backend User.id is int. This test fails typecheck
 * if someone reverts User.id to string (via assignability of a number).
 */
describe('User.id contract', () => {
  it('accepts numeric user ids from /users/me', () => {
    const user: User = {
      id: 42,
      supabase_user_id: 'supa-uuid',
      email: 'a@b.com',
      phone: null,
      full_name: 'Numeric Id',
      date_of_birth: null,
      profile_image_url: null,
      role: 'user',
      is_active: true,
      is_verified: true,
      preferences: {},
      notification_settings: {},
      privacy_settings: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: null,
    };
    expect(typeof user.id).toBe('number');
    expect(user.id).toBe(42);
  });
});
