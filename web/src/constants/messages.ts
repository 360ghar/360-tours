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
