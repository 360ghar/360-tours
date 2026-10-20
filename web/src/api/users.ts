import { apiClient, extractData } from './client';
import type { User, UserUpdate } from '@/types';

export const usersApi = {
  /**
   * Update the current user's profile (`PUT /users/me`, returns `SelfUser`).
   * Send only the keys that changed: an unknown key, `email` or an empty
   * `phone` is rejected, and `notification_settings` takes the four contract
   * keys (`push_notifications`, `email_notifications`, `sms_notifications`,
   * `promotional_emails`), merged into the stored settings.
   */
  async updateProfile(data: UserUpdate): Promise<User> {
    const response = await apiClient.put<User>('/users/me', data);
    return extractData(response);
  },

  /**
   * Upload profile image
   */
  async uploadProfileImage(file: File): Promise<User> {
    const formData = new FormData();
    formData.append('file', file);
    // Content-Type is intentionally unset: the request interceptor clears it
    // for FormData so the browser emits the multipart boundary.
    const response = await apiClient.post<User>('/users/me/profile-image', formData);
    return extractData(response);
  },
};
