import { create } from 'zustand';
import { collaborationApi } from '@/api';

// Activity item type for tour collaboration
export interface ActivityItem {
  id: string;
  tour_id: string;
  user_id: string;
  action: 'created' | 'updated' | 'deleted' | 'commented' | 'published' | 'invited' | 'left';
  target_type: 'tour' | 'scene' | 'hotspot' | 'comment' | 'collaborator';
  target_id?: string;
  target_title?: string;
  details?: Record<string, unknown>;
  user?: {
    id: string;
    full_name: string | null;
    profile_image_url: string | null;
  };
  created_at: string;
}

interface Collaborator {
  id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  user?: {
    full_name: string | null;
    email: string | null;
    profile_image_url: string | null;
  };
}

interface CollaborationState {
  activities: ActivityItem[];
  isLoadingActivities: boolean;
  collaborators: Collaborator[];
  isLoadingCollaborators: boolean;

  // Actions
  setActivities: (activities: ActivityItem[]) => void;
  addActivity: (activity: ActivityItem) => void;
  setLoadingActivities: (loading: boolean) => void;
  setCollaborators: (collaborators: Collaborator[]) => void;
  setLoadingCollaborators: (loading: boolean) => void;
  clearCollaboration: () => void;
  fetchActivities: (tourId: string) => Promise<void>;
  fetchCollaborators: (tourId: string) => Promise<void>;
  inviteCollaborator: (tourId: string, email: string, role: 'editor' | 'viewer') => Promise<void>;
  removeCollaborator: (tourId: string, userId: string) => Promise<void>;
}

export const useCollaborationStore = create<CollaborationState>((set) => ({
  activities: [],
  isLoadingActivities: false,
  collaborators: [],
  isLoadingCollaborators: false,

  setActivities: (activities) => set({ activities }),

  addActivity: (activity) =>
    set((state) => ({
      activities: [activity, ...state.activities],
    })),

  setLoadingActivities: (loading) => set({ isLoadingActivities: loading }),

  setCollaborators: (collaborators) => set({ collaborators }),

  setLoadingCollaborators: (loading) => set({ isLoadingCollaborators: loading }),

  clearCollaboration: () =>
    set({
      activities: [],
      isLoadingActivities: false,
      collaborators: [],
      isLoadingCollaborators: false,
    }),

  fetchActivities: async (tourId) => {
    set({ isLoadingActivities: true });
    try {
      const activities = await collaborationApi.getActivities(tourId);
      set({ activities });
    } finally {
      set({ isLoadingActivities: false });
    }
  },

  fetchCollaborators: async (tourId) => {
    set({ isLoadingCollaborators: true });
    try {
      const collaborators = await collaborationApi.getCollaborators(tourId);
      set({ collaborators });
    } finally {
      set({ isLoadingCollaborators: false });
    }
  },

  inviteCollaborator: async (tourId, email, role) => {
    const collaborator = await collaborationApi.inviteCollaborator(tourId, { email, role });
    set((state) => ({
      collaborators: [...state.collaborators, collaborator],
    }));
  },

  removeCollaborator: async (tourId, userId) => {
    await collaborationApi.removeCollaborator(tourId, userId);
    set((state) => ({
      collaborators: state.collaborators.filter((c) => c.user_id !== userId),
    }));
  },
}));
