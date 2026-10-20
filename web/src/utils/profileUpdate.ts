import type { UserUpdate } from '@/types';

/** International format, as the server checks it (`PHONE_INVALID` otherwise). */
export const E164_PHONE = /^\+[1-9]\d{6,14}$/;

/** The phone input holds just the dial code (for example +91) when the number is cleared. */
export function isBlankPhone(value: string): boolean {
  return value.replace(/\D/g, '').length <= 4;
}

/**
 * The profile update body: only the fields that changed. An empty phone is never
 * sent (the server rejects it with `PHONE_REQUIRED`: a number is changed, not
 * cleared, through this route), and an empty name is rejected by `NAME_LENGTH`.
 */
export function buildProfileUpdate(
  current: { full_name: string | null; phone: string | null },
  form: { full_name: string; phone: string }
): UserUpdate {
  const patch: UserUpdate = {};
  const fullName = form.full_name.trim();
  if (fullName && fullName !== (current.full_name ?? '')) patch.full_name = fullName;
  const phone = form.phone.trim();
  if (phone && !isBlankPhone(phone) && phone !== (current.phone ?? '') && E164_PHONE.test(phone)) {
    patch.phone = phone;
  }
  return patch;
}

