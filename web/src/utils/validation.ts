import { z } from 'zod';
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_SIZE_BYTES } from '@/constants';

// Email validation (optional for registration)
export const emailSchema = z.string().email('Please enter a valid email address');
export const optionalEmailSchema = z.string().email('Please enter a valid email address').optional().or(z.literal(''));

// Password validation
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// Phone validation (required, E.164 format)
export const phoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format (e.g., +919876543210)');

// Optional phone schema for profile
export const optionalPhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format (e.g., +919876543210)')
  .optional()
  .or(z.literal(''));

// Identifier step of the login state-machine: email OR phone (channel-aware).
export const emailIdentifierSchema = z.object({
  identifier: emailSchema,
});
export const phoneIdentifierSchema = z.object({
  identifier: phoneSchema,
});

// Set-password step (channel-agnostic — identifier captured in a prior step).
// Enforces the same strength rules as registration (passwordSchema) so the
// mandatory set-password step cannot accept a weak password.
export const passwordStepSchema = z.object({
  password: passwordSchema,
});

// Login password step: only require non-empty. Existing accounts may have
// passwords that predate the strength rules — validating strength here would
// lock those users out before the request is ever sent.
export const loginPasswordSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

// OTP verification schema
export const otpSchema = z.object({
  token: z
    .string()
    .min(4, 'OTP is required')
    .max(12, 'OTP is too long')
    .regex(/^\d+$/, 'OTP must be numeric'),
});

// Reset password schema
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine(data => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

// Tour creation/update schema
export const tourSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be less than 255 characters'),
  description: z.string().max(5000, 'Description must be less than 5000 characters').optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  visibility: z.enum(['private', 'unlisted', 'public']).optional(),
  settings: z
    .object({
      auto_rotate: z.boolean().optional(),
      auto_rotate_speed: z.number().min(0.1).max(10).optional(),
      show_navbar: z.boolean().optional(),
      enable_fullscreen: z.boolean().optional(),
      enable_vr: z.boolean().optional(),
    })
    .optional(),
});

// Scene schema
export const sceneSchema = z.object({
  title: z.string().max(255, 'Title must be less than 255 characters').optional(),
  description: z.string().max(2000, 'Description must be less than 2000 characters').optional(),
  order_index: z.number().int().min(0).optional(),
  metadata: z
    .object({
      initial_view: z
        .object({
          yaw: z.number(),
          pitch: z.number(),
          zoom: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

// Hotspot schema
export const hotspotSchema = z.object({
  type: z.enum(['navigation', 'info', 'audio', 'video', 'link', 'custom']),
  position: z.object({
    yaw: z.number().min(-180).max(180),
    pitch: z.number().min(-90).max(90),
    radius: z.number().positive().optional(),
  }),
  target_scene_id: z.string().uuid().optional().nullable(),
  title: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().optional(),
  icon_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format')
    .optional(),
  icon_size: z.number().int().min(16).max(100).optional(),
  custom_data: z.record(z.string(), z.unknown()).optional(),
});

// Profile update schema
export const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  phone: optionalPhoneSchema,
  date_of_birth: z.string().optional(),
  notification_settings: z
    .object({
      email_notifications: z.boolean().optional(),
      push_notifications: z.boolean().optional(),
      marketing_emails: z.boolean().optional(),
    })
    .optional(),
});

// Change password schema
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine(data => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

// File validation
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
    };
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the maximum limit of ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB`,
    };
  }

  return { valid: true };
}

// URL validation
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// UUID validation
export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// Type exports
export type OTPFormData = z.infer<typeof otpSchema>;
export type PasswordStepFormData = z.infer<typeof passwordStepSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type TourFormData = z.infer<typeof tourSchema>;
export type SceneFormData = z.infer<typeof sceneSchema>;
export type HotspotFormData = z.infer<typeof hotspotSchema>;
export type ProfileFormData = z.infer<typeof profileSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
