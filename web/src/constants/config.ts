// API Configuration
// VITE_API_BASE_URL is the canonical name across the 360ghar platform.
// VITE_API_URL is kept as a temporary back-compat fallback (deprecated).
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3600/api/v1';
export const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 30000;

// Supabase Configuration
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Upload Configuration
export const MAX_UPLOAD_SIZE_MB = Number(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB) || 50;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = (
  import.meta.env.VITE_ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp'
).split(',');

// App Configuration
export const APP_NAME = import.meta.env.VITE_APP_NAME || '360 Tours';
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';
