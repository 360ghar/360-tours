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

  describe('mergeScenes', () => {
    it('replaces the scenes array with a new reference and preserves other tour fields', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      const previousTour = useTourEditorStore.getState().currentTour;
      const nextScenes = [
        createMockScene({ id: 'scene-2', order_index: 0, title: 'Scene 2' }),
        createMockScene({ id: 'scene-1', order_index: 1, title: 'Scene 1' }),
      ];

      useTourEditorStore.getState().mergeScenes(nextScenes);

      const state = useTourEditorStore.getState();
      expect(state.currentTour?.scenes).toBe(nextScenes);
      expect(state.currentTour?.scenes).not.toBe(previousTour?.scenes);
      // All other tour fields are preserved untouched.
      expect(state.currentTour?.title).toBe('Test Tour');
      expect(state.currentTour?.status).toBe('draft');
      expect(state.currentTour?.visibility).toBe('private');
      expect(state.currentTour?.settings).toBeNull();
    });

    it('updates hotspot arrays inside the merged scenes so viewer markers re-render', () => {
      const tour = createMockTour({
        scenes: [
          createMockScene({
            id: 'scene-1',
            hotspots: [createMockHotspot({ id: 'hotspot-1' })],
          }),
        ],
      });
      useTourEditorStore.getState().setCurrentTour(tour);

      const before = useTourEditorStore.getState().currentTour?.scenes?.[0]?.hotspots;
      const refetched = [
        createMockScene({
          id: 'scene-1',
          hotspots: [createMockHotspot({ id: 'hotspot-1' }), createMockHotspot({ id: 'hotspot-2' })],
        }),
      ];
      useTourEditorStore.getState().mergeScenes(refetched);

      const after = useTourEditorStore.getState().currentTour?.scenes?.[0]?.hotspots;
      expect(after).not.toBe(before);
      expect(after?.map(h => h.id)).toEqual(['hotspot-1', 'hotspot-2']);
    });

    it('does not touch draft/unsaved state', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateTourDraft({ title: 'Unsaved Title' });
      expect(useTourEditorStore.getState().hasUnsavedChanges).toBe(true);

      useTourEditorStore.getState().mergeScenes([
        createMockScene({ id: 'scene-2', order_index: 0, title: 'Scene 2' }),
      ]);

      const state = useTourEditorStore.getState();
      expect(state.hasUnsavedChanges).toBe(true);
      expect(state.pendingChanges.tour).toEqual({ title: 'Unsaved Title' });
      expect(state.currentTour?.title).toBe('Unsaved Title');
      expect(state.currentTour?.scenes?.map(s => s.id)).toEqual(['scene-2']);
    });

    it('is a no-op when no tour is loaded', () => {
      useTourEditorStore.getState().mergeScenes([
        createMockScene({ id: 'scene-1', order_index: 0, title: 'Scene 1' }),
      ]);
      expect(useTourEditorStore.getState().currentTour).toBeNull();
    });

    it('keeps currentSceneId and selection untouched', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().setCurrentScene('scene-2');
      useTourEditorStore.getState().selectHotspot('hotspot-1');

      useTourEditorStore.getState().mergeScenes([
        createMockScene({ id: 'scene-1', order_index: 0, title: 'Scene 1' }),
        createMockScene({ id: 'scene-2', order_index: 1, title: 'Scene 2' }),
      ]);

      const state = useTourEditorStore.getState();
      expect(state.currentSceneId).toBe('scene-2');
      expect(state.selectedHotspotId).toBe('hotspot-1');
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
});
