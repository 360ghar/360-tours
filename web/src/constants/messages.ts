import { MAX_UPLOAD_SIZE_MB } from './config';

// Error Messages
export const ERROR_MESSAGES = {
  GENERIC: 'Something went wrong. Please try again.',
  NETWORK: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  VALIDATION: 'Please check your input and try again.',
  UPLOAD_SIZE: `File size exceeds the maximum limit of ${MAX_UPLOAD_SIZE_MB}MB.`,
  UPLOAD_TYPE: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  TOUR_CREATED: 'Tour created successfully!',
  TOUR_UPDATED: 'Tour updated successfully!',
  TOUR_DELETED: 'Tour deleted successfully!',
  TOUR_PUBLISHED: 'Tour published successfully!',
  SCENE_ADDED: 'Scene added successfully!',
  SCENE_UPDATED: 'Scene updated successfully!',
  SCENE_DELETED: 'Scene deleted successfully!',
  HOTSPOT_CREATED: 'Hotspot created successfully!',
  HOTSPOT_UPDATED: 'Hotspot updated successfully!',
  HOTSPOT_DELETED: 'Hotspot deleted successfully!',
  PROFILE_UPDATED: 'Profile updated successfully!',
  PASSWORD_CHANGED: 'Password changed successfully!',
} as const;
