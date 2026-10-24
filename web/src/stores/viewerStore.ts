import { create } from 'zustand';

interface ViewerState {
  currentSceneIdsByScope: Record<string, string>;
}

interface ViewerActions {
  setCurrentSceneForScope: (scopeId: string, sceneId: string | null) => void;
  clearCurrentSceneScope: (scopeId: string) => void;
}

export function getViewerSceneScope(route: 'public' | 'embed', tourId: string): string {
  return `${route}:${tourId}`;
}

/**
 * Lightweight store for public tour viewer and embed pages.
 * Keeps scene navigation state separate from the editor store and scopes public
 * viewer state by route/tour, so public pages and embeds cannot share selection.
 */
export const useViewerStore = create<ViewerState & ViewerActions>()((set) => ({
  currentSceneIdsByScope: {},

  setCurrentSceneForScope: (scopeId, sceneId) =>
    set((state) => {
      const nextSceneIds = { ...state.currentSceneIdsByScope };
      if (sceneId) {
        nextSceneIds[scopeId] = sceneId;
      } else {
        delete nextSceneIds[scopeId];
      }
      return { currentSceneIdsByScope: nextSceneIds };
    }),

  clearCurrentSceneScope: (scopeId) =>
    set((state) => {
      if (!(scopeId in state.currentSceneIdsByScope)) return state;
      const nextSceneIds = { ...state.currentSceneIdsByScope };
      delete nextSceneIds[scopeId];
      return { currentSceneIdsByScope: nextSceneIds };
    }),
}));
