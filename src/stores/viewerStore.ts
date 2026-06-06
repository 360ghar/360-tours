import { create } from 'zustand';

interface ViewerState {
  currentSceneId: string | null;
}

interface ViewerActions {
  setCurrentScene: (sceneId: string | null) => void;
  reset: () => void;
}

/**
 * Lightweight store for public tour viewer and embed pages.
 * Keeps scene navigation state separate from the editor store
 * to prevent shared-state pollution.
 */
export const useViewerStore = create<ViewerState & ViewerActions>()((set) => ({
  currentSceneId: null,

  setCurrentScene: (sceneId) => set({ currentSceneId: sceneId }),

  reset: () => set({ currentSceneId: null }),
}));
