import { create } from 'zustand';
import type { Tour, Scene } from '@/types';

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
}

interface TourEditorActions {
  // Tour actions
  setCurrentTour: (tour: Tour | null) => void;
  updateTourDraft: (updates: Partial<Tour>) => void;

  // Scene actions
  setCurrentScene: (sceneId: string | null) => void;
  /**
   * Replaces `currentTour.scenes` with fresh query data. Scene/hotspot
   * mutations (create/update/delete/reorder/AI applies) persist through
   * toursApi endpoints and only invalidate TanStack queries; TourEditPage
   * calls this from an effect watching the `[SCENES, tourId]` query so the
   * editor UI (viewer markers, ScenePanel, HotspotPanel, scene-delete
   * recovery) reflects the change without a full reload. Scenes live in a
   * separate array from tour-level draft edits, so a plain replacement never
   * clobbers unsaved tour changes. Always assigns a fresh array reference so
   * effects keyed on the scenes/hotspots array (viewer markers) re-run.
   */
  mergeScenes: (scenes: Scene[]) => void;

  // Hotspot actions
  selectHotspot: (hotspotId: string | null) => void;

  // UI actions
  setEditing: (isEditing: boolean) => void;
  setPreviewing: (isPreviewing: boolean) => void;
  toggleScenePanel: () => void;
  toggleHotspotPanel: () => void;
  toggleSettingsPanel: () => void;

  // Save actions
  markAsSaved: () => void;
  reset: () => void;
}

type TourEditorStore = TourEditorState & TourEditorActions;

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
};

export const useTourEditorStore = create<TourEditorStore>()(set => ({
  ...initialState,

  // Tour actions
  setCurrentTour: tour => {
    set({
      currentTour: tour,
      currentSceneId: tour?.scenes?.[0]?.id || null,
      hasUnsavedChanges: false,
      pendingChanges: {},
    });
  },

  updateTourDraft: updates => {
    set(state => ({
      // Optimistically apply to currentTour so the UI reflects the change
      // immediately (survives refetch failures too).
      currentTour: state.currentTour ? { ...state.currentTour, ...updates } : state.currentTour,
      pendingChanges: {
        ...state.pendingChanges,
        tour: { ...state.pendingChanges.tour, ...updates },
      },
      hasUnsavedChanges: true,
    }));
  },

  // Scene actions
  setCurrentScene: sceneId => {
    set({ currentSceneId: sceneId, selectedHotspotId: null });
  },

  mergeScenes: scenes => {
    set(state => {
      const currentTour = state.currentTour;
      if (!currentTour) return {};
      return {
        currentTour: {
          ...currentTour,
          scenes,
        },
      };
    });
  },

  // Hotspot actions
  selectHotspot: hotspotId => {
    set({ selectedHotspotId: hotspotId });
  },

  // UI actions
  setEditing: isEditing => set({ isEditing }),
  setPreviewing: isPreviewing => set({ isPreviewing }),
  toggleScenePanel: () => set(state => ({ showScenePanel: !state.showScenePanel })),
  toggleHotspotPanel: () => set(state => ({ showHotspotPanel: !state.showHotspotPanel })),
  toggleSettingsPanel: () => set(state => ({ showSettingsPanel: !state.showSettingsPanel })),

  // Save actions
  markAsSaved: () => {
    // A save is a commit point; clear all pending changes so the draft cannot
    // re-introduce changes that are already persisted to the server.
    set({ hasUnsavedChanges: false, pendingChanges: {} });
  },

  reset: () => {
    set(initialState);
  },
}));
