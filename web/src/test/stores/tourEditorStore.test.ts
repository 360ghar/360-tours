import { describe, it, expect, beforeEach } from 'vitest';
import { useTourEditorStore } from '@/stores/tourEditorStore';
import type { Tour, Scene, Hotspot } from '@/types';

const createMockScene = (overrides?: Partial<Scene>): Scene => ({
  id: 'scene-1',
  tour_id: 'tour-1',
  title: 'Scene 1',
  description: null,
  image_url: 'https://example.com/scene1.jpg',
  thumbnail_url: null,
  vr_url: null,
  order_index: 0,
  metadata: null,
  is_processed: true,
  processing_error: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  hotspots: [],
  ...overrides,
});

const createMockHotspot = (overrides?: Partial<Hotspot>): Hotspot => ({
  id: 'hotspot-1',
  scene_id: 'scene-1',
  type: 'info',
  position: { yaw: 0, pitch: 0 },
  target_scene_id: null,
  title: 'Test Hotspot',
  description: null,
  icon: null,
  icon_name: null,
  icon_color: null,
  icon_size: null,
  content: null,
  custom_data: {},
  order_index: 0,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

const createMockTour = (overrides?: Partial<Tour>): Tour => ({
  id: 'tour-1',
  user_id: '1',
  title: 'Test Tour',
  description: null,
  status: 'draft',
  visibility: 'private',
  is_featured: false,
  view_count: 0,
  like_count: 0,
  share_count: 0,
  settings: null,
  thumbnail_url: null,
  published_at: null,
  archived_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  scenes: [
    createMockScene({ id: 'scene-1', order_index: 0, title: 'Scene 1' }),
    createMockScene({ id: 'scene-2', order_index: 1, title: 'Scene 2' }),
  ],
  ...overrides,
});

describe('tourEditorStore', () => {
  beforeEach(() => {
    useTourEditorStore.getState().reset();
  });

  describe('initial state', () => {
    it('has correct initial state', () => {
      const state = useTourEditorStore.getState();
      expect(state.currentTour).toBeNull();
      expect(state.currentSceneId).toBeNull();
      expect(state.selectedHotspotId).toBeNull();
      expect(state.isEditing).toBe(false);
      expect(state.isPreviewing).toBe(false);
      expect(state.showScenePanel).toBe(true);
      expect(state.showHotspotPanel).toBe(false);
      expect(state.showSettingsPanel).toBe(false);
      expect(state.hasUnsavedChanges).toBe(false);
      expect(state.pendingChanges).toEqual({});
    });
  });

  describe('setCurrentTour', () => {
    it('sets tour and selects first scene', () => {
      const tour = createMockTour();
      useTourEditorStore.getState().setCurrentTour(tour);

      const state = useTourEditorStore.getState();
      expect(state.currentTour).toEqual(tour);
      expect(state.currentSceneId).toBe('scene-1');
      expect(state.hasUnsavedChanges).toBe(false);
      expect(state.pendingChanges).toEqual({});
    });

    it('sets currentSceneId to null when tour has no scenes', () => {
      const tour = createMockTour({ scenes: [] });
      useTourEditorStore.getState().setCurrentTour(tour);

      expect(useTourEditorStore.getState().currentSceneId).toBeNull();
    });

    it('clears tour when null', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().setCurrentTour(null);

      const state = useTourEditorStore.getState();
      expect(state.currentTour).toBeNull();
      expect(state.currentSceneId).toBeNull();
    });

    it('resets unsaved changes and pending changes', () => {
      const store = useTourEditorStore.getState();
      store.setCurrentTour(createMockTour());
      store.updateTourDraft({ title: 'Changed' });
      expect(useTourEditorStore.getState().hasUnsavedChanges).toBe(true);

      useTourEditorStore.getState().setCurrentTour(createMockTour());
      expect(useTourEditorStore.getState().hasUnsavedChanges).toBe(false);
      expect(useTourEditorStore.getState().pendingChanges).toEqual({});
    });
  });

  describe('updateTourDraft', () => {
    it('records tour changes in pendingChanges', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateTourDraft({ title: 'New Title' });

      const state = useTourEditorStore.getState();
      expect(state.pendingChanges.tour).toEqual({ title: 'New Title' });
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('merges multiple updates', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateTourDraft({ title: 'New Title' });
      useTourEditorStore.getState().updateTourDraft({ description: 'New Desc' });

      const state = useTourEditorStore.getState();
      expect(state.pendingChanges.tour).toEqual({
        title: 'New Title',
        description: 'New Desc',
      });
    });

    it('keeps pending changes scoped to the tour Save payload', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateTourDraft({ title: 'New Title' });

      expect(useTourEditorStore.getState().pendingChanges).toEqual({
        tour: { title: 'New Title' },
      });
    });
  });

  describe('scene and hotspot compatibility mutations', () => {
    it('keeps scene draft helpers local-only and outside the Save payload', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      const newScene = createMockScene({ id: 'scene-3', order_index: 2, title: 'Scene 3' });

      useTourEditorStore.getState().addSceneDraft(newScene);
      useTourEditorStore.getState().updateSceneDraft('scene-3', { title: 'Updated Scene 3' });
      useTourEditorStore.getState().removeSceneDraft('scene-1');

      const state = useTourEditorStore.getState();
      expect(state.currentTour?.scenes?.map(scene => scene.id)).toEqual(['scene-2', 'scene-3']);
      expect(state.currentTour?.scenes?.find(scene => scene.id === 'scene-3')?.title).toBe(
        'Updated Scene 3'
      );
      expect(state.currentSceneId).toBe('scene-2');
      expect(state.pendingChanges).toEqual({});
      expect(state.hasUnsavedChanges).toBe(false);
    });

    it('keeps scene reordering local-only and outside the Save payload', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());

      useTourEditorStore.getState().reorderScenes(['scene-2', 'scene-1']);

      const state = useTourEditorStore.getState();
      expect(state.currentTour?.scenes?.map(scene => scene.id)).toEqual(['scene-2', 'scene-1']);
      expect(state.currentTour?.scenes?.map(scene => scene.order_index)).toEqual([0, 1]);
      expect(state.pendingChanges).toEqual({});
      expect(state.hasUnsavedChanges).toBe(false);
    });

    it('keeps hotspot draft helpers local-only and outside the Save payload', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      const hotspot = createMockHotspot({ id: 'hotspot-1' });

      useTourEditorStore.getState().addHotspotDraft('scene-1', hotspot);
      useTourEditorStore.getState().updateHotspotDraft('hotspot-1', { title: 'Updated Hotspot' });

      let state = useTourEditorStore.getState();
      expect(state.currentTour?.scenes?.[0]?.hotspots).toEqual([
        { ...hotspot, title: 'Updated Hotspot' },
      ]);
      expect(state.selectedHotspotId).toBe('hotspot-1');
      expect(state.pendingChanges).toEqual({});
      expect(state.hasUnsavedChanges).toBe(false);

      useTourEditorStore.getState().removeHotspotDraft('hotspot-1');

      state = useTourEditorStore.getState();
      expect(state.currentTour?.scenes?.[0]?.hotspots).toEqual([]);
      expect(state.selectedHotspotId).toBeNull();
      expect(state.pendingChanges).toEqual({});
      expect(state.hasUnsavedChanges).toBe(false);
    });
  });

  describe('setCurrentScene', () => {
    it('sets current scene and clears selected hotspot', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().selectHotspot('hotspot-1');
      useTourEditorStore.getState().setCurrentScene('scene-2');

      const state = useTourEditorStore.getState();
      expect(state.currentSceneId).toBe('scene-2');
      expect(state.selectedHotspotId).toBeNull();
    });
  });

  describe('selectHotspot', () => {
    it('sets selected hotspot ID', () => {
      useTourEditorStore.getState().selectHotspot('hotspot-1');
      expect(useTourEditorStore.getState().selectedHotspotId).toBe('hotspot-1');
    });

    it('clears selected hotspot when null', () => {
      useTourEditorStore.getState().selectHotspot('hotspot-1');
      useTourEditorStore.getState().selectHotspot(null);
      expect(useTourEditorStore.getState().selectedHotspotId).toBeNull();
    });
  });

  describe('UI actions', () => {
    it('setEditing updates isEditing', () => {
      useTourEditorStore.getState().setEditing(true);
      expect(useTourEditorStore.getState().isEditing).toBe(true);
      useTourEditorStore.getState().setEditing(false);
      expect(useTourEditorStore.getState().isEditing).toBe(false);
    });

    it('setPreviewing updates isPreviewing', () => {
      useTourEditorStore.getState().setPreviewing(true);
      expect(useTourEditorStore.getState().isPreviewing).toBe(true);
    });

    it('toggleScenePanel toggles showScenePanel', () => {
      expect(useTourEditorStore.getState().showScenePanel).toBe(true);
      useTourEditorStore.getState().toggleScenePanel();
      expect(useTourEditorStore.getState().showScenePanel).toBe(false);
      useTourEditorStore.getState().toggleScenePanel();
      expect(useTourEditorStore.getState().showScenePanel).toBe(true);
    });

    it('toggleHotspotPanel toggles showHotspotPanel', () => {
      expect(useTourEditorStore.getState().showHotspotPanel).toBe(false);
      useTourEditorStore.getState().toggleHotspotPanel();
      expect(useTourEditorStore.getState().showHotspotPanel).toBe(true);
    });

    it('toggleSettingsPanel toggles showSettingsPanel', () => {
      expect(useTourEditorStore.getState().showSettingsPanel).toBe(false);
      useTourEditorStore.getState().toggleSettingsPanel();
      expect(useTourEditorStore.getState().showSettingsPanel).toBe(true);
    });
  });

  describe('save actions', () => {
    it('markAsSaved clears unsaved state', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateTourDraft({ title: 'Changed' });
      expect(useTourEditorStore.getState().hasUnsavedChanges).toBe(true);

      useTourEditorStore.getState().markAsSaved();
      expect(useTourEditorStore.getState().hasUnsavedChanges).toBe(false);
      expect(useTourEditorStore.getState().pendingChanges).toEqual({});
    });

    it('discardChanges clears unsaved state', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateTourDraft({ title: 'Changed' });

      useTourEditorStore.getState().discardChanges();
      expect(useTourEditorStore.getState().hasUnsavedChanges).toBe(false);
      expect(useTourEditorStore.getState().pendingChanges).toEqual({});
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const store = useTourEditorStore.getState();
      store.setCurrentTour(createMockTour());
      store.setEditing(true);
      store.setPreviewing(true);
      store.toggleHotspotPanel();
      store.toggleSettingsPanel();
      store.updateTourDraft({ title: 'Changed' });

      useTourEditorStore.getState().reset();

      const state = useTourEditorStore.getState();
      expect(state.currentTour).toBeNull();
      expect(state.currentSceneId).toBeNull();
      expect(state.selectedHotspotId).toBeNull();
      expect(state.isEditing).toBe(false);
      expect(state.isPreviewing).toBe(false);
      expect(state.showScenePanel).toBe(true);
      expect(state.showHotspotPanel).toBe(false);
      expect(state.showSettingsPanel).toBe(false);
      expect(state.hasUnsavedChanges).toBe(false);
      expect(state.pendingChanges).toEqual({});
    });
  });

  describe('undo/redo', () => {
    it('canUndo/canRedo are false initially', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      expect(useTourEditorStore.getState().canUndo()).toBe(false);
      expect(useTourEditorStore.getState().canRedo()).toBe(false);
    });

    it('undo restores the previous state after updateTourDraft', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateTourDraft({ title: 'Changed' });
      expect(useTourEditorStore.getState().pendingChanges.tour).toEqual({ title: 'Changed' });
      expect(useTourEditorStore.getState().canUndo()).toBe(true);

      useTourEditorStore.getState().undo();

      const state = useTourEditorStore.getState();
      expect(state.pendingChanges.tour).toBeUndefined();
      expect(state.hasUnsavedChanges).toBe(false);
    });

    it('redo re-applies the state after undo', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateTourDraft({ title: 'Changed' });
      useTourEditorStore.getState().undo();
      expect(useTourEditorStore.getState().pendingChanges.tour).toBeUndefined();
      expect(useTourEditorStore.getState().canRedo()).toBe(true);

      useTourEditorStore.getState().redo();

      const state = useTourEditorStore.getState();
      expect(state.pendingChanges.tour).toEqual({ title: 'Changed' });
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('canUndo/canRedo return correct booleans through a sequence', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      expect(useTourEditorStore.getState().canUndo()).toBe(false);

      useTourEditorStore.getState().updateTourDraft({ title: 'A' });
      expect(useTourEditorStore.getState().canUndo()).toBe(true);
      expect(useTourEditorStore.getState().canRedo()).toBe(false);

      useTourEditorStore.getState().undo();
      expect(useTourEditorStore.getState().canUndo()).toBe(false);
      expect(useTourEditorStore.getState().canRedo()).toBe(true);

      useTourEditorStore.getState().redo();
      expect(useTourEditorStore.getState().canUndo()).toBe(true);
      expect(useTourEditorStore.getState().canRedo()).toBe(false);
    });

    it('setCurrentTour clears history', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateTourDraft({ title: 'Changed' });
      expect(useTourEditorStore.getState().canUndo()).toBe(true);

      useTourEditorStore.getState().setCurrentTour(createMockTour());

      expect(useTourEditorStore.getState().canUndo()).toBe(false);
      expect(useTourEditorStore.getState().canRedo()).toBe(false);
      expect(useTourEditorStore.getState().past).toHaveLength(0);
      expect(useTourEditorStore.getState().future).toHaveLength(0);
    });

    it('a new data mutation clears the redo stack after an undo', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateTourDraft({ title: 'A' });
      useTourEditorStore.getState().undo();

      // New mutation should clear future
      useTourEditorStore.getState().updateTourDraft({ title: 'B' });

      expect(useTourEditorStore.getState().canRedo()).toBe(false);
      expect(useTourEditorStore.getState().pendingChanges.tour).toEqual({ title: 'B' });
    });

    it('undo is a no-op when history is empty', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().undo();
      expect(useTourEditorStore.getState().canUndo()).toBe(false);
    });

    it('redo is a no-op when future is empty', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateTourDraft({ title: 'A' });
      useTourEditorStore.getState().redo();
      expect(useTourEditorStore.getState().canRedo()).toBe(false);
    });
  });
});
