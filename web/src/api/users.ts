import { apiClient, extractData } from './client';
import type { User } from '@/types';

export interface UpdateProfileData {
  full_name?: string;
  phone?: string;
  date_of_birth?: string;
  notification_settings?: Record<string, boolean>;
  privacy_settings?: Record<string, boolean>;
  preferences?: Record<string, unknown>;
}

export const usersApi = {
  /**
   * Get the current user's profile
   */
  async getProfile(): Promise<User> {
    const response = await apiClient.get<User>('/users/me');
    return extractData(response);
  },

  /**
   * Update the current user's profile
   */
  async updateProfile(data: UpdateProfileData): Promise<User> {
    const response = await apiClient.put<User>('/users/me', data);
    return extractData(response);
  },

  /**
   * Upload profile image
   */
  async uploadProfileImage(file: File): Promise<User> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<User>(
      '/users/me/profile-image',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return extractData(response);
  },
};
