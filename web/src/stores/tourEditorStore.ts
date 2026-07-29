import { create } from 'zustand';
import type { Tour, Scene, Hotspot } from '@/types';

interface TourEditorState {
  // Current tour being edited
  currentTour: Tour | null;
  currentSceneId: string | null;
  selectedHotspotId: string | null;

  // Editor UI state
  isEditing: boolean;
  isPreviewing: boolean;
  showScenePanel: boolean;
  showHotspotPanel: boolean;
  showSettingsPanel: boolean;

  // Pending Save payloads. TourEditPage's Save action only persists tour
  // fields; scene and hotspot create/update/delete flows persist directly in
  // their feature components and are intentionally not exposed here as drafts.
  hasUnsavedChanges: boolean;
  pendingChanges: {
    tour?: Partial<Tour>;
  };

  // Undo/redo history
  past: EditorSnapshot[];
  future: EditorSnapshot[];
}

interface TourEditorActions {
  // Tour actions
  setCurrentTour: (tour: Tour | null) => void;
  updateTourDraft: (updates: Partial<Tour>) => void;

  // Scene actions
  setCurrentScene: (sceneId: string | null) => void;
  /**
   * @deprecated Compatibility-only local editor mutation. Scene changes persist
   * through toursApi scene endpoints, not through TourEditPage Save.
   */
  addSceneDraft: (scene: Scene) => void;
  /**
   * @deprecated Compatibility-only local editor mutation. Scene changes persist
   * through toursApi scene endpoints, not through TourEditPage Save.
   */
  updateSceneDraft: (sceneId: string, updates: Partial<Scene>) => void;
  /**
   * @deprecated Compatibility-only local editor mutation. Scene changes persist
   * through toursApi scene endpoints, not through TourEditPage Save.
   */
  removeSceneDraft: (sceneId: string) => void;
  /**
   * @deprecated Compatibility-only local editor mutation. Scene ordering persists
   * through toursApi.reorderScenes, not through TourEditPage Save.
   */
  reorderScenes: (sceneIds: string[]) => void;

  // Hotspot actions
  selectHotspot: (hotspotId: string | null) => void;
  /**
   * @deprecated Compatibility-only local editor mutation. Hotspot changes persist
   * through toursApi hotspot endpoints, not through TourEditPage Save.
   */
  addHotspotDraft: (sceneId: string, hotspot: Hotspot) => void;
  /**
   * @deprecated Compatibility-only local editor mutation. Hotspot changes persist
   * through toursApi hotspot endpoints, not through TourEditPage Save.
   */
  updateHotspotDraft: (hotspotId: string, updates: Partial<Hotspot>) => void;
  /**
   * @deprecated Compatibility-only local editor mutation. Hotspot changes persist
   * through toursApi hotspot endpoints, not through TourEditPage Save.
   */
  removeHotspotDraft: (hotspotId: string) => void;

  // UI actions
  setEditing: (isEditing: boolean) => void;
  setPreviewing: (isPreviewing: boolean) => void;
  toggleScenePanel: () => void;
  toggleHotspotPanel: () => void;
  toggleSettingsPanel: () => void;

  // Save actions
  markAsSaved: () => void;
  discardChanges: () => void;
  reset: () => void;

  // Undo/redo actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

type TourEditorStore = TourEditorState & TourEditorActions;

interface EditorSnapshot {
  currentTour: Tour | null;
  currentSceneId: string | null;
  selectedHotspotId: string | null;
  pendingChanges: TourEditorState['pendingChanges'];
  hasUnsavedChanges: boolean;
}

const HISTORY_LIMIT = 50;

const initialState: TourEditorState = {
  currentTour: null,
  currentSceneId: null,
  selectedHotspotId: null,
  isEditing: false,
  isPreviewing: false,
  showScenePanel: true,
  showHotspotPanel: false,
  showSettingsPanel: false,
  hasUnsavedChanges: false,
  pendingChanges: {},
  past: [],
  future: [],
};

export const useTourEditorStore = create<TourEditorStore>()((set, get) => {
  // Helper that snapshots the current data-state before applying a mutation,
  // pushes it onto `past` (capped at HISTORY_LIMIT), and clears `future`.
  // Only used for DATA-mutating actions; UI-only actions skip history.
  // No-op mutations (e.g. early-return `{}` from a guard when no tour is
  // loaded) must NOT clobber the redo stack — only commit history when the
  // returned patch actually changes something.
  const withHistory = (mutation: (state: TourEditorState) => Partial<TourEditorState>) => {
    const state = get();
    const next = mutation(state);
    if (!next || Object.keys(next).length === 0) {
      // Guard early-return: nothing changed, preserve history.
      return;
    }
    const snapshot: EditorSnapshot = {
      currentTour: state.currentTour,
      currentSceneId: state.currentSceneId,
      selectedHotspotId: state.selectedHotspotId,
      pendingChanges: state.pendingChanges,
      hasUnsavedChanges: state.hasUnsavedChanges,
    };
    set({
      ...next,
      past: [...state.past, snapshot].slice(-HISTORY_LIMIT),
      future: [],
    });
  };

  return {
    ...initialState,

    // Tour actions
    setCurrentTour: tour => {
      set({
        currentTour: tour,
        currentSceneId: tour?.scenes?.[0]?.id || null,
        hasUnsavedChanges: false,
        pendingChanges: {},
        past: [],
        future: [],
      });
    },

    updateTourDraft: updates => {
      withHistory(state => {
        const currentTour = state.currentTour;
        return {
          // Optimistically apply to currentTour so the UI reflects the change
          // immediately (survives refetch failures too).
          currentTour: currentTour ? { ...currentTour, ...updates } : currentTour,
          pendingChanges: {
            ...state.pendingChanges,
            tour: { ...state.pendingChanges.tour, ...updates },
          },
          hasUnsavedChanges: true,
        };
      });
    },

    // Scene actions
    setCurrentScene: sceneId => {
      set({ currentSceneId: sceneId, selectedHotspotId: null });
    },

    addSceneDraft: scene => {
      set(state => {
        const currentTour = state.currentTour;
        if (!currentTour) return {};
        return {
          currentTour: {
            ...currentTour,
            scenes: [...(currentTour.scenes ?? []), scene],
          },
        };
      });
    },

    updateSceneDraft: (sceneId, updates) => {
      set(state => {
        const currentTour = state.currentTour;
        if (!currentTour?.scenes) return {};
        return {
          currentTour: {
            ...currentTour,
            scenes: currentTour.scenes.map(scene =>
              scene.id === sceneId ? { ...scene, ...updates } : scene
            ),
          },
        };
      });
    },

    removeSceneDraft: sceneId => {
      set(state => {
        const currentTour = state.currentTour;
        if (!currentTour?.scenes) return {};

        const removedScene = currentTour.scenes.find(scene => scene.id === sceneId);
        const updatedScenes = currentTour.scenes.filter(scene => scene.id !== sceneId);
        const selectedHotspotWasRemoved = removedScene?.hotspots?.some(
          hotspot => hotspot.id === state.selectedHotspotId
        );

        return {
          currentTour: { ...currentTour, scenes: updatedScenes },
          currentSceneId:
            state.currentSceneId === sceneId
              ? (updatedScenes[0]?.id ?? null)
              : state.currentSceneId,
          selectedHotspotId: selectedHotspotWasRemoved ? null : state.selectedHotspotId,
        };
      });
    },

    reorderScenes: sceneIds => {
      set(state => {
        const currentTour = state.currentTour;
        if (!currentTour?.scenes) return {};

        const sceneMap = new Map(currentTour.scenes.map(scene => [scene.id, scene]));
        const reorderedScenes = sceneIds
          .map((sceneId, index) => {
            const scene = sceneMap.get(sceneId);
            return scene ? { ...scene, order_index: index } : null;
          })
          .filter((scene): scene is Scene => scene !== null);

        return {
          currentTour: { ...currentTour, scenes: reorderedScenes },
        };
      });
    },

    // Hotspot actions
    selectHotspot: hotspotId => {
      set({ selectedHotspotId: hotspotId });
    },

    addHotspotDraft: (sceneId, hotspot) => {
      set(state => {
        const currentTour = state.currentTour;
        if (!currentTour?.scenes) return {};

        let didAdd = false;
        const updatedScenes = currentTour.scenes.map(scene => {
          if (scene.id !== sceneId) return scene;
          didAdd = true;
          return {
            ...scene,
            hotspots: [...(scene.hotspots ?? []), hotspot],
          };
        });

        if (!didAdd) return {};
        return {
          currentTour: { ...currentTour, scenes: updatedScenes },
          selectedHotspotId: hotspot.id,
        };
      });
    },

    updateHotspotDraft: (hotspotId, updates) => {
      set(state => {
        const currentTour = state.currentTour;
        if (!currentTour?.scenes) return {};

        let didUpdate = false;
        const updatedScenes = currentTour.scenes.map(scene => ({
          ...scene,
          hotspots: scene.hotspots?.map(hotspot => {
            if (hotspot.id !== hotspotId) return hotspot;
            didUpdate = true;
            return { ...hotspot, ...updates };
          }),
        }));

        if (!didUpdate) return {};
        return {
          currentTour: { ...currentTour, scenes: updatedScenes },
        };
      });
    },

    removeHotspotDraft: hotspotId => {
      set(state => {
        const currentTour = state.currentTour;
        if (!currentTour?.scenes) return {};

        let didRemove = false;
        const updatedScenes = currentTour.scenes.map(scene => {
          const hotspots = scene.hotspots ?? [];
          if (!hotspots.some(hotspot => hotspot.id === hotspotId)) return scene;
          didRemove = true;
          return {
            ...scene,
            hotspots: hotspots.filter(hotspot => hotspot.id !== hotspotId),
          };
        });

        if (!didRemove) return {};
        return {
          currentTour: { ...currentTour, scenes: updatedScenes },
          selectedHotspotId: state.selectedHotspotId === hotspotId ? null : state.selectedHotspotId,
        };
      });
    },

    // UI actions
    setEditing: isEditing => set({ isEditing }),
    setPreviewing: isPreviewing => set({ isPreviewing }),
    toggleScenePanel: () => set(state => ({ showScenePanel: !state.showScenePanel })),
    toggleHotspotPanel: () => set(state => ({ showHotspotPanel: !state.showHotspotPanel })),
    toggleSettingsPanel: () => set(state => ({ showSettingsPanel: !state.showSettingsPanel })),

    // Save actions
    markAsSaved: () => {
      // A save is a commit point; clear all pending changes and history so undo
      // cannot re-introduce changes that are already persisted to the server.
      set({ hasUnsavedChanges: false, pendingChanges: {}, past: [], future: [] });
    },

    discardChanges: () => {
      // Clear pending changes AND undo/redo history so undo cannot
      // re-introduce changes the user just discarded.
      set({ hasUnsavedChanges: false, pendingChanges: {}, past: [], future: [] });
    },

    reset: () => {
      set(initialState);
    },

    // Undo/redo actions
    undo: () => {
      const { past, future } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      const current: EditorSnapshot = {
        currentTour: get().currentTour,
        currentSceneId: get().currentSceneId,
        selectedHotspotId: get().selectedHotspotId,
        pendingChanges: get().pendingChanges,
        hasUnsavedChanges: get().hasUnsavedChanges,
      };
      set({
        ...previous,
        past: past.slice(0, -1),
        future: [current, ...future].slice(0, HISTORY_LIMIT),
      });
    },

    redo: () => {
      const { past, future } = get();
      if (future.length === 0) return;
      const next = future[0];
      const current: EditorSnapshot = {
        currentTour: get().currentTour,
        currentSceneId: get().currentSceneId,
        selectedHotspotId: get().selectedHotspotId,
        pendingChanges: get().pendingChanges,
        hasUnsavedChanges: get().hasUnsavedChanges,
      };
      set({
        ...next,
        past: [...past, current].slice(-HISTORY_LIMIT),
        future: future.slice(1),
      });
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
  };
});
