import { describe, it, expect } from 'vitest';
import { buildProfileUpdate, isBlankPhone } from '@/utils/profileUpdate';

const current = { full_name: 'Jane Doe', phone: '+919876543210' };

describe('buildProfileUpdate', () => {
  it('sends nothing when nothing changed', () => {
    expect(buildProfileUpdate(current, { full_name: 'Jane Doe', phone: '+919876543210' })).toEqual({});
  });

  it('sends the name when it changed', () => {
    expect(buildProfileUpdate(current, { full_name: ' Jane Q Doe ', phone: current.phone })).toEqual({
      full_name: 'Jane Q Doe',
    });
  });

  it('never sends an empty phone: the server rejects it, and a blank save must not clear it', () => {
    expect(buildProfileUpdate(current, { full_name: 'Jane Doe', phone: '' })).toEqual({});
    // The phone input holds only the dial code once the digits are cleared.
    expect(buildProfileUpdate(current, { full_name: 'Jane Doe', phone: '+91' })).toEqual({});
    expect(buildProfileUpdate({ full_name: null, phone: null }, { full_name: '', phone: '+91' })).toEqual({});
  });

  it('sends a changed phone only when it is in E.164 format', () => {
    expect(buildProfileUpdate(current, { full_name: 'Jane Doe', phone: '+14155550123' })).toEqual({
      phone: '+14155550123',
    });
    expect(buildProfileUpdate(current, { full_name: 'Jane Doe', phone: '98765' })).toEqual({});
  });

  it('never sends an empty name', () => {
    expect(buildProfileUpdate(current, { full_name: '  ', phone: current.phone })).toEqual({});
  });

  it('knows a blank phone', () => {
    expect(isBlankPhone('')).toBe(true);
    expect(isBlankPhone('+91')).toBe(true);
    expect(isBlankPhone('+919876543210')).toBe(false);
  });
});
