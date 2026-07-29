import { apiClient, extractData } from './client';
import type { ActivityItem } from '@/stores';

export interface Collaborator {
  id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  user?: {
    full_name: string | null;
    email: string | null;
    profile_image_url: string | null;
  };
  created_at: string;
}

export interface InviteCollaboratorInput {
  email: string;
  role: 'editor' | 'viewer';
}

export const collaborationApi = {
  async getActivities(tourId: string): Promise<ActivityItem[]> {
    const response = await apiClient.get<ActivityItem[]>(
      `/tours/${tourId}/activities`
    );
    return extractData(response);
  },

  async getCollaborators(tourId: string): Promise<Collaborator[]> {
    const response = await apiClient.get<Collaborator[]>(
      `/tours/${tourId}/collaborators`
    );
    return extractData(response);
  },

  async inviteCollaborator(
    tourId: string,
    data: InviteCollaboratorInput
  ): Promise<Collaborator> {
    const response = await apiClient.post<Collaborator>(
      `/tours/${tourId}/collaborators`,
      data
    );
    return extractData(response);
  },

  async removeCollaborator(
    tourId: string,
    userId: string
  ): Promise<void> {
    await apiClient.delete(`/tours/${tourId}/collaborators/${userId}`);
  },
};
