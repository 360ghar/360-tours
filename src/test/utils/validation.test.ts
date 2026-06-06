import { describe, it, expect } from 'vitest';
import {
  emailSchema,
  optionalEmailSchema,
  passwordSchema,
  phoneSchema,
  optionalPhoneSchema,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  otpSchema,
  resetPasswordSchema,
  tourSchema,
  sceneSchema,
  hotspotSchema,
  profileSchema,
  changePasswordSchema,
  validateImageFile,
  isValidUrl,
  isValidUUID,
} from '@/utils/validation';

// ---------------------------------------------------------------------------
// emailSchema
// ---------------------------------------------------------------------------
describe('emailSchema', () => {
  it('accepts a valid email', () => {
    expect(emailSchema.safeParse('user@example.com').success).toBe(true);
  });

  it('accepts emails with subdomains', () => {
    expect(emailSchema.safeParse('user@mail.example.co.uk').success).toBe(true);
  });

  it('accepts emails with plus addressing', () => {
    expect(emailSchema.safeParse('user+tag@example.com').success).toBe(true);
  });

  it('rejects an empty string', () => {
    const result = emailSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('rejects a string without @', () => {
    const result = emailSchema.safeParse('userexample.com');
    expect(result.success).toBe(false);
  });

  it('rejects a string without domain', () => {
    const result = emailSchema.safeParse('user@');
    expect(result.success).toBe(false);
  });

  it('rejects a string with spaces', () => {
    const result = emailSchema.safeParse('user @example.com');
    expect(result.success).toBe(false);
  });

  it('provides correct error message', () => {
    const result = emailSchema.safeParse('invalid');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Please enter a valid email address');
    }
  });
});

// ---------------------------------------------------------------------------
// optionalEmailSchema
// ---------------------------------------------------------------------------
describe('optionalEmailSchema', () => {
  it('accepts a valid email', () => {
    expect(optionalEmailSchema.safeParse('user@example.com').success).toBe(true);
  });

  it('accepts an empty string', () => {
    expect(optionalEmailSchema.safeParse('').success).toBe(true);
  });

  it('accepts undefined', () => {
    expect(optionalEmailSchema.safeParse(undefined).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(optionalEmailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// passwordSchema
// ---------------------------------------------------------------------------
describe('passwordSchema', () => {
  it('accepts a valid password', () => {
    expect(passwordSchema.safeParse('Password1').success).toBe(true);
  });

  it('accepts a long complex password', () => {
    expect(passwordSchema.safeParse('MyStr0ngP@ssw0rd!').success).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = passwordSchema.safeParse('Pass1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Password must be at least 8 characters');
    }
  });

  it('accepts exactly 8 characters', () => {
    expect(passwordSchema.safeParse('Abcdefg1').success).toBe(true);
  });

  it('rejects a password without uppercase', () => {
    const result = passwordSchema.safeParse('password1');
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages).toContain('Password must contain at least one uppercase letter');
    }
  });

  it('rejects a password without lowercase', () => {
    const result = passwordSchema.safeParse('PASSWORD1');
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages).toContain('Password must contain at least one lowercase letter');
    }
  });

  it('rejects a password without a number', () => {
    const result = passwordSchema.safeParse('Passwordd');
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages).toContain('Password must contain at least one number');
    }
  });

  it('rejects an empty string', () => {
    const result = passwordSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// phoneSchema
// ---------------------------------------------------------------------------
describe('phoneSchema', () => {
  it('accepts a valid E.164 phone number', () => {
    expect(phoneSchema.safeParse('+919876543210').success).toBe(true);
  });

  it('accepts a short valid E.164 number (7 digits after country code)', () => {
    expect(phoneSchema.safeParse('+1234567').success).toBe(true);
  });

  it('accepts a long valid E.164 number (15 digits total)', () => {
    expect(phoneSchema.safeParse('+123456789012345').success).toBe(true);
  });

  it('rejects an empty string', () => {
    const result = phoneSchema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Phone number is required');
    }
  });

  it('rejects a number without leading +', () => {
    expect(phoneSchema.safeParse('919876543210').success).toBe(false);
  });

  it('rejects a number starting with +0', () => {
    expect(phoneSchema.safeParse('+0123456789').success).toBe(false);
  });

  it('rejects a number that is too short (less than 7 digits after +)', () => {
    expect(phoneSchema.safeParse('+12345').success).toBe(false);
  });

  it('rejects a number that is too long (more than 15 digits total)', () => {
    expect(phoneSchema.safeParse('+1234567890123456').success).toBe(false);
  });

  it('rejects phone with letters', () => {
    expect(phoneSchema.safeParse('+1234abcdef').success).toBe(false);
  });

  it('rejects phone with spaces', () => {
    expect(phoneSchema.safeParse('+91 9876 543210').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// optionalPhoneSchema
// ---------------------------------------------------------------------------
describe('optionalPhoneSchema', () => {
  it('accepts a valid E.164 phone number', () => {
    expect(optionalPhoneSchema.safeParse('+919876543210').success).toBe(true);
  });

  it('accepts an empty string', () => {
    expect(optionalPhoneSchema.safeParse('').success).toBe(true);
  });

  it('accepts undefined', () => {
    expect(optionalPhoneSchema.safeParse(undefined).success).toBe(true);
  });

  it('rejects an invalid phone number', () => {
    expect(optionalPhoneSchema.safeParse('12345').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------
describe('loginSchema', () => {
  it('accepts valid login data', () => {
    const result = loginSchema.safeParse({
      phone: '+919876543210',
      password: 'anything',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing phone', () => {
    const result = loginSchema.safeParse({ password: 'anything' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      phone: '+919876543210',
      password: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages).toContain('Password is required');
    }
  });

  it('rejects invalid phone format', () => {
    const result = loginSchema.safeParse({
      phone: '12345',
      password: 'anything',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// registerSchema
// ---------------------------------------------------------------------------
describe('registerSchema', () => {
  const validData = {
    phone: '+919876543210',
    password: 'Password1',
    confirm_password: 'Password1',
    full_name: 'John Doe',
    email: 'john@example.com',
  };

  it('accepts valid registration data', () => {
    expect(registerSchema.safeParse(validData).success).toBe(true);
  });

  it('accepts without optional fields', () => {
    const result = registerSchema.safeParse({
      phone: '+919876543210',
      password: 'Password1',
      confirm_password: 'Password1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty string for full_name and email', () => {
    const result = registerSchema.safeParse({
      phone: '+919876543210',
      password: 'Password1',
      confirm_password: 'Password1',
      full_name: '',
      email: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when passwords do not match', () => {
    const result = registerSchema.safeParse({
      ...validData,
      confirm_password: 'Different1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages).toContain('Passwords do not match');
    }
  });

  it('rejects a weak password', () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: 'weak',
      confirm_password: 'weak',
    });
    expect(result.success).toBe(false);
  });

  it('rejects full_name shorter than 2 characters when provided', () => {
    const result = registerSchema.safeParse({
      ...validData,
      full_name: 'A',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email when provided', () => {
    const result = registerSchema.safeParse({
      ...validData,
      email: 'not-valid',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// forgotPasswordSchema
// ---------------------------------------------------------------------------
describe('forgotPasswordSchema', () => {
  it('accepts a valid phone', () => {
    expect(forgotPasswordSchema.safeParse({ phone: '+919876543210' }).success).toBe(true);
  });

  it('rejects an invalid phone', () => {
    expect(forgotPasswordSchema.safeParse({ phone: '12345' }).success).toBe(false);
  });

  it('rejects empty phone', () => {
    expect(forgotPasswordSchema.safeParse({ phone: '' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// otpSchema
// ---------------------------------------------------------------------------
describe('otpSchema', () => {
  it('accepts a 6-digit OTP', () => {
    expect(otpSchema.safeParse({ token: '123456' }).success).toBe(true);
  });

  it('accepts a 4-digit OTP (minimum)', () => {
    expect(otpSchema.safeParse({ token: '1234' }).success).toBe(true);
  });

  it('accepts a 12-digit OTP (maximum)', () => {
    expect(otpSchema.safeParse({ token: '123456789012' }).success).toBe(true);
  });

  it('rejects OTP shorter than 4 digits', () => {
    const result = otpSchema.safeParse({ token: '123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('OTP is required');
    }
  });

  it('rejects OTP longer than 12 digits', () => {
    const result = otpSchema.safeParse({ token: '1234567890123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('OTP is too long');
    }
  });

  it('rejects non-numeric OTP', () => {
    const result = otpSchema.safeParse({ token: '12ab56' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages).toContain('OTP must be numeric');
    }
  });

  it('rejects empty token', () => {
    expect(otpSchema.safeParse({ token: '' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resetPasswordSchema
// ---------------------------------------------------------------------------
describe('resetPasswordSchema', () => {
  it('accepts matching valid passwords', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'Password1',
      confirm_password: 'Password1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'Password1',
      confirm_password: 'Password2',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages).toContain('Passwords do not match');
    }
  });

  it('rejects a weak password even when matching', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'weak',
      confirm_password: 'weak',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tourSchema
// ---------------------------------------------------------------------------
describe('tourSchema', () => {
  it('accepts a valid tour with only title', () => {
    expect(tourSchema.safeParse({ title: 'My Tour' }).success).toBe(true);
  });

  it('accepts a full tour object', () => {
    const result = tourSchema.safeParse({
      title: 'My Tour',
      description: 'A nice tour',
      status: 'published',
      visibility: 'public',
      settings: {
        auto_rotate: true,
        auto_rotate_speed: 2.5,
        show_navbar: true,
        enable_fullscreen: true,
        enable_vr: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty title', () => {
    const result = tourSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Title is required');
    }
  });

  it('rejects a title longer than 255 characters', () => {
    const result = tourSchema.safeParse({ title: 'x'.repeat(256) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Title must be less than 255 characters');
    }
  });

  it('accepts a title of exactly 255 characters', () => {
    expect(tourSchema.safeParse({ title: 'x'.repeat(255) }).success).toBe(true);
  });

  it('rejects a description longer than 5000 characters', () => {
    const result = tourSchema.safeParse({ title: 'Tour', description: 'x'.repeat(5001) });
    expect(result.success).toBe(false);
  });

  it('accepts a description of exactly 5000 characters', () => {
    expect(tourSchema.safeParse({ title: 'Tour', description: 'x'.repeat(5000) }).success).toBe(true);
  });

  it('rejects an invalid status', () => {
    const result = tourSchema.safeParse({ title: 'Tour', status: 'deleted' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid visibility', () => {
    const result = tourSchema.safeParse({ title: 'Tour', visibility: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects auto_rotate_speed below 0.1', () => {
    const result = tourSchema.safeParse({
      title: 'Tour',
      settings: { auto_rotate_speed: 0.05 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects auto_rotate_speed above 10', () => {
    const result = tourSchema.safeParse({
      title: 'Tour',
      settings: { auto_rotate_speed: 11 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts auto_rotate_speed at boundaries (0.1 and 10)', () => {
    expect(
      tourSchema.safeParse({ title: 'T', settings: { auto_rotate_speed: 0.1 } }).success,
    ).toBe(true);
    expect(
      tourSchema.safeParse({ title: 'T', settings: { auto_rotate_speed: 10 } }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sceneSchema
// ---------------------------------------------------------------------------
describe('sceneSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(sceneSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a full scene object', () => {
    const result = sceneSchema.safeParse({
      title: 'Living Room',
      description: 'A cozy space',
      order_index: 0,
      metadata: {
        initial_view: { yaw: 45, pitch: -10, zoom: 1.5 },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects title longer than 255 characters', () => {
    expect(sceneSchema.safeParse({ title: 'x'.repeat(256) }).success).toBe(false);
  });

  it('rejects description longer than 2000 characters', () => {
    expect(sceneSchema.safeParse({ description: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('rejects negative order_index', () => {
    expect(sceneSchema.safeParse({ order_index: -1 }).success).toBe(false);
  });

  it('rejects non-integer order_index', () => {
    expect(sceneSchema.safeParse({ order_index: 1.5 }).success).toBe(false);
  });

  it('accepts order_index of 0', () => {
    expect(sceneSchema.safeParse({ order_index: 0 }).success).toBe(true);
  });

  it('accepts metadata without zoom (optional)', () => {
    const result = sceneSchema.safeParse({
      metadata: { initial_view: { yaw: 0, pitch: 0 } },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hotspotSchema
// ---------------------------------------------------------------------------
describe('hotspotSchema', () => {
  const validHotspot = {
    type: 'info' as const,
    position: { yaw: 45, pitch: -10 },
  };

  it('accepts a valid minimal hotspot', () => {
    expect(hotspotSchema.safeParse(validHotspot).success).toBe(true);
  });

  it('accepts a full hotspot object', () => {
    const result = hotspotSchema.safeParse({
      type: 'navigation',
      position: { yaw: 90, pitch: 45, radius: 5 },
      target_scene_id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Go to kitchen',
      description: 'Navigate to the kitchen area',
      icon: 'arrow-right',
      icon_color: '#FF5733',
      icon_size: 32,
      custom_data: { key: 'value' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid hotspot types', () => {
    const types = ['navigation', 'info', 'audio', 'video', 'custom'] as const;
    for (const type of types) {
      expect(hotspotSchema.safeParse({ ...validHotspot, type }).success).toBe(true);
    }
  });

  it('rejects an invalid hotspot type', () => {
    expect(hotspotSchema.safeParse({ ...validHotspot, type: 'link' }).success).toBe(false);
  });

  it('rejects yaw below -180', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, position: { yaw: -181, pitch: 0 } }).success,
    ).toBe(false);
  });

  it('rejects yaw above 180', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, position: { yaw: 181, pitch: 0 } }).success,
    ).toBe(false);
  });

  it('accepts yaw at boundaries (-180 and 180)', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, position: { yaw: -180, pitch: 0 } }).success,
    ).toBe(true);
    expect(
      hotspotSchema.safeParse({ ...validHotspot, position: { yaw: 180, pitch: 0 } }).success,
    ).toBe(true);
  });

  it('rejects pitch below -90', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, position: { yaw: 0, pitch: -91 } }).success,
    ).toBe(false);
  });

  it('rejects pitch above 90', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, position: { yaw: 0, pitch: 91 } }).success,
    ).toBe(false);
  });

  it('accepts pitch at boundaries (-90 and 90)', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, position: { yaw: 0, pitch: -90 } }).success,
    ).toBe(true);
    expect(
      hotspotSchema.safeParse({ ...validHotspot, position: { yaw: 0, pitch: 90 } }).success,
    ).toBe(true);
  });

  it('rejects non-positive radius', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, position: { yaw: 0, pitch: 0, radius: 0 } })
        .success,
    ).toBe(false);
    expect(
      hotspotSchema.safeParse({ ...validHotspot, position: { yaw: 0, pitch: 0, radius: -1 } })
        .success,
    ).toBe(false);
  });

  it('accepts null target_scene_id', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, target_scene_id: null }).success,
    ).toBe(true);
  });

  it('rejects non-UUID target_scene_id', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, target_scene_id: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('rejects invalid icon_color format', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, icon_color: 'red' }).success,
    ).toBe(false);
    expect(
      hotspotSchema.safeParse({ ...validHotspot, icon_color: '#GGG000' }).success,
    ).toBe(false);
    expect(
      hotspotSchema.safeParse({ ...validHotspot, icon_color: '#FFF' }).success,
    ).toBe(false);
  });

  it('accepts valid hex icon_color', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, icon_color: '#FF5733' }).success,
    ).toBe(true);
    expect(
      hotspotSchema.safeParse({ ...validHotspot, icon_color: '#aabbcc' }).success,
    ).toBe(true);
  });

  it('rejects icon_size below 16', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, icon_size: 15 }).success,
    ).toBe(false);
  });

  it('rejects icon_size above 100', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, icon_size: 101 }).success,
    ).toBe(false);
  });

  it('accepts icon_size at boundaries (16 and 100)', () => {
    expect(hotspotSchema.safeParse({ ...validHotspot, icon_size: 16 }).success).toBe(true);
    expect(hotspotSchema.safeParse({ ...validHotspot, icon_size: 100 }).success).toBe(true);
  });

  it('rejects non-integer icon_size', () => {
    expect(hotspotSchema.safeParse({ ...validHotspot, icon_size: 32.5 }).success).toBe(false);
  });

  it('rejects title longer than 255 characters', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, title: 'x'.repeat(256) }).success,
    ).toBe(false);
  });

  it('rejects description longer than 2000 characters', () => {
    expect(
      hotspotSchema.safeParse({ ...validHotspot, description: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// profileSchema
// ---------------------------------------------------------------------------
describe('profileSchema', () => {
  it('accepts a valid profile', () => {
    const result = profileSchema.safeParse({
      full_name: 'Jane Doe',
      phone: '+919876543210',
      date_of_birth: '1990-01-15',
      notification_settings: {
        email_notifications: true,
        push_notifications: false,
        marketing_emails: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (all fields optional)', () => {
    expect(profileSchema.safeParse({}).success).toBe(true);
  });

  it('accepts empty phone string', () => {
    expect(profileSchema.safeParse({ phone: '' }).success).toBe(true);
  });

  it('rejects full_name shorter than 2 characters', () => {
    expect(profileSchema.safeParse({ full_name: 'A' }).success).toBe(false);
  });

  it('accepts full_name of exactly 2 characters', () => {
    expect(profileSchema.safeParse({ full_name: 'AB' }).success).toBe(true);
  });

  it('rejects invalid phone format', () => {
    expect(profileSchema.safeParse({ phone: '12345' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// changePasswordSchema
// ---------------------------------------------------------------------------
describe('changePasswordSchema', () => {
  it('accepts valid change password data', () => {
    const result = changePasswordSchema.safeParse({
      current_password: 'oldpass',
      new_password: 'NewPass1',
      confirm_password: 'NewPass1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty current_password', () => {
    const result = changePasswordSchema.safeParse({
      current_password: '',
      new_password: 'NewPass1',
      confirm_password: 'NewPass1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages).toContain('Current password is required');
    }
  });

  it('rejects when new_password and confirm_password do not match', () => {
    const result = changePasswordSchema.safeParse({
      current_password: 'oldpass',
      new_password: 'NewPass1',
      confirm_password: 'NewPass2',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages).toContain('Passwords do not match');
    }
  });

  it('rejects a weak new_password', () => {
    const result = changePasswordSchema.safeParse({
      current_password: 'oldpass',
      new_password: 'weak',
      confirm_password: 'weak',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateImageFile
// ---------------------------------------------------------------------------
describe('validateImageFile', () => {
  function createMockFile(name: string, size: number, type: string): File {
    const blob = new Blob(['x'.repeat(size)], { type });
    return new File([blob], name, { type });
  }

  it('accepts a valid JPEG file', () => {
    const file = createMockFile('photo.jpg', 1024, 'image/jpeg');
    expect(validateImageFile(file)).toEqual({ valid: true });
  });

  it('accepts a valid PNG file', () => {
    const file = createMockFile('photo.png', 1024, 'image/png');
    expect(validateImageFile(file)).toEqual({ valid: true });
  });

  it('accepts a valid WebP file', () => {
    const file = createMockFile('photo.webp', 1024, 'image/webp');
    expect(validateImageFile(file)).toEqual({ valid: true });
  });

  it('rejects a GIF file', () => {
    const file = createMockFile('animation.gif', 1024, 'image/gif');
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid file type');
  });

  it('rejects a PDF file', () => {
    const file = createMockFile('doc.pdf', 1024, 'application/pdf');
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid file type');
  });

  it('rejects a file exceeding the size limit', () => {
    // MAX_UPLOAD_SIZE_BYTES defaults to 50 * 1024 * 1024 = 52428800
    const file = createMockFile('huge.jpg', 52428801, 'image/jpeg');
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('File size exceeds');
  });

  it('accepts a file at exactly the size limit', () => {
    const file = createMockFile('exact.jpg', 52428800, 'image/jpeg');
    expect(validateImageFile(file)).toEqual({ valid: true });
  });

  it('rejects invalid type even if size is fine', () => {
    const file = createMockFile('photo.bmp', 100, 'image/bmp');
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid file type');
  });
});

// ---------------------------------------------------------------------------
// isValidUrl
// ---------------------------------------------------------------------------
describe('isValidUrl', () => {
  it('returns true for a valid HTTPS URL', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
  });

  it('returns true for a valid HTTP URL', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('returns true for a URL with path and query', () => {
    expect(isValidUrl('https://example.com/path?q=1&r=2#hash')).toBe(true);
  });

  it('returns true for a URL with port', () => {
    expect(isValidUrl('http://localhost:3000')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('returns false for a string without protocol', () => {
    expect(isValidUrl('example.com')).toBe(false);
  });

  it('returns true for ftp protocol', () => {
    expect(isValidUrl('ftp://files.example.com')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidUUID
// ---------------------------------------------------------------------------
describe('isValidUUID', () => {
  it('returns true for a valid v4 UUID (lowercase)', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('returns true for a valid v4 UUID (uppercase)', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('returns true for a valid v4 UUID (mixed case)', () => {
    expect(isValidUUID('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isValidUUID('')).toBe(false);
  });

  it('returns false for a random string', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
  });

  it('returns false for a UUID without hyphens', () => {
    expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
  });

  it('returns false for a UUID v1 (version digit is 1 not 4)', () => {
    expect(isValidUUID('550e8400-e29b-11d4-a716-446655440000')).toBe(false);
  });

  it('returns false for an invalid variant (digit 5 in position 19)', () => {
    expect(isValidUUID('550e8400-e29b-41d4-5716-446655440000')).toBe(false);
  });

  it('returns false for a UUID with extra characters', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000x')).toBe(false);
  });

  it('returns false for a truncated UUID', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
  });
});
