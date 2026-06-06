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
  user_id: 1,
  title: 'Test Tour',
  description: null,
  status: 'draft',
  is_public: false,
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

  describe('addSceneDraft', () => {
    it('adds scene to currentTour and pendingChanges', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      const newScene = createMockScene({ id: 'scene-3', order_index: 2, title: 'Scene 3' });
      useTourEditorStore.getState().addSceneDraft(newScene);

      const state = useTourEditorStore.getState();
      expect(state.currentTour!.scenes).toHaveLength(3);
      expect(state.currentTour!.scenes![2].id).toBe('scene-3');
      expect(state.pendingChanges.scenes?.['scene-3']).toEqual(newScene);
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('does nothing when no current tour', () => {
      const newScene = createMockScene({ id: 'scene-3' });
      useTourEditorStore.getState().addSceneDraft(newScene);

      expect(useTourEditorStore.getState().currentTour).toBeNull();
    });
  });

  describe('updateSceneDraft', () => {
    it('records scene changes in pendingChanges', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateSceneDraft('scene-1', { title: 'Updated Scene' });

      const state = useTourEditorStore.getState();
      expect(state.pendingChanges.scenes?.['scene-1']).toEqual({ title: 'Updated Scene' });
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('merges updates for the same scene', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateSceneDraft('scene-1', { title: 'Updated' });
      useTourEditorStore.getState().updateSceneDraft('scene-1', { description: 'Desc' });

      expect(useTourEditorStore.getState().pendingChanges.scenes?.['scene-1']).toEqual({
        title: 'Updated',
        description: 'Desc',
      });
    });
  });

  describe('removeSceneDraft', () => {
    it('removes scene from currentTour', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().removeSceneDraft('scene-1');

      const state = useTourEditorStore.getState();
      expect(state.currentTour!.scenes).toHaveLength(1);
      expect(state.currentTour!.scenes![0].id).toBe('scene-2');
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('selects next scene when active scene is removed', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      // currentSceneId is 'scene-1' (auto-selected)
      useTourEditorStore.getState().removeSceneDraft('scene-1');

      expect(useTourEditorStore.getState().currentSceneId).toBe('scene-2');
    });

    it('keeps currentSceneId when different scene is removed', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().setCurrentScene('scene-2');
      useTourEditorStore.getState().removeSceneDraft('scene-1');

      expect(useTourEditorStore.getState().currentSceneId).toBe('scene-2');
    });

    it('sets currentSceneId to null when last scene is removed', () => {
      const tour = createMockTour({ scenes: [createMockScene({ id: 'only-scene' })] });
      useTourEditorStore.getState().setCurrentTour(tour);
      useTourEditorStore.getState().removeSceneDraft('only-scene');

      expect(useTourEditorStore.getState().currentSceneId).toBeNull();
    });

    it('marks removed scene as deleted in pendingChanges', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().removeSceneDraft('scene-1');

      const pending = useTourEditorStore.getState().pendingChanges.scenes?.['scene-1'];
      expect(pending).toEqual({ id: 'scene-1', deleted: true });
    });

    it('does nothing when no current tour', () => {
      useTourEditorStore.getState().removeSceneDraft('scene-1');
      expect(useTourEditorStore.getState().hasUnsavedChanges).toBe(false);
    });
  });

  describe('reorderScenes', () => {
    it('reorders scenes according to provided IDs', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().reorderScenes(['scene-2', 'scene-1']);

      const scenes = useTourEditorStore.getState().currentTour!.scenes!;
      expect(scenes[0].id).toBe('scene-2');
      expect(scenes[0].order_index).toBe(0);
      expect(scenes[1].id).toBe('scene-1');
      expect(scenes[1].order_index).toBe(1);
      expect(useTourEditorStore.getState().hasUnsavedChanges).toBe(true);
    });

    it('filters out unknown scene IDs', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().reorderScenes(['scene-1', 'nonexistent', 'scene-2']);

      const scenes = useTourEditorStore.getState().currentTour!.scenes!;
      expect(scenes).toHaveLength(2);
    });

    it('does nothing when no current tour', () => {
      useTourEditorStore.getState().reorderScenes(['scene-1', 'scene-2']);
      expect(useTourEditorStore.getState().hasUnsavedChanges).toBe(false);
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

  describe('addHotspotDraft', () => {
    it('adds hotspot to the correct scene', () => {
      const tour = createMockTour();
      useTourEditorStore.getState().setCurrentTour(tour);
      const hotspot = createMockHotspot({ id: 'new-hotspot' });
      useTourEditorStore.getState().addHotspotDraft('scene-1', hotspot);

      const state = useTourEditorStore.getState();
      const scene = state.currentTour!.scenes!.find((s) => s.id === 'scene-1');
      expect(scene!.hotspots).toHaveLength(1);
      expect(scene!.hotspots![0].id).toBe('new-hotspot');
      expect(state.selectedHotspotId).toBe('new-hotspot');
      expect(state.pendingChanges.hotspots?.['new-hotspot']).toEqual(hotspot);
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('does not modify other scenes', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      const hotspot = createMockHotspot({ id: 'new-hotspot' });
      useTourEditorStore.getState().addHotspotDraft('scene-1', hotspot);

      const scene2 = useTourEditorStore.getState().currentTour!.scenes!.find((s) => s.id === 'scene-2');
      expect(scene2!.hotspots).toHaveLength(0);
    });

    it('does nothing when no current tour', () => {
      const hotspot = createMockHotspot();
      useTourEditorStore.getState().addHotspotDraft('scene-1', hotspot);
      expect(useTourEditorStore.getState().selectedHotspotId).toBeNull();
    });
  });

  describe('updateHotspotDraft', () => {
    it('records hotspot changes in pendingChanges', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateHotspotDraft('hotspot-1', { title: 'Updated' });

      const state = useTourEditorStore.getState();
      expect(state.pendingChanges.hotspots?.['hotspot-1']).toEqual({ title: 'Updated' });
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('merges updates for the same hotspot', () => {
      useTourEditorStore.getState().setCurrentTour(createMockTour());
      useTourEditorStore.getState().updateHotspotDraft('hotspot-1', { title: 'Updated' });
      useTourEditorStore.getState().updateHotspotDraft('hotspot-1', { description: 'Desc' });

      expect(useTourEditorStore.getState().pendingChanges.hotspots?.['hotspot-1']).toEqual({
        title: 'Updated',
        description: 'Desc',
      });
    });
  });

  describe('removeHotspotDraft', () => {
    it('removes hotspot from scene', () => {
      const scene = createMockScene({
        id: 'scene-1',
        hotspots: [createMockHotspot({ id: 'h1' }), createMockHotspot({ id: 'h2' })],
      });
      useTourEditorStore.getState().setCurrentTour(createMockTour({ scenes: [scene] }));
      useTourEditorStore.getState().removeHotspotDraft('h1');

      const updatedScene = useTourEditorStore.getState().currentTour!.scenes![0];
      expect(updatedScene.hotspots).toHaveLength(1);
      expect(updatedScene.hotspots![0].id).toBe('h2');
      expect(useTourEditorStore.getState().hasUnsavedChanges).toBe(true);
    });

    it('clears selectedHotspotId when active hotspot is removed', () => {
      const scene = createMockScene({
        id: 'scene-1',
        hotspots: [createMockHotspot({ id: 'h1' })],
      });
      useTourEditorStore.getState().setCurrentTour(createMockTour({ scenes: [scene] }));
      useTourEditorStore.getState().selectHotspot('h1');
      useTourEditorStore.getState().removeHotspotDraft('h1');

      expect(useTourEditorStore.getState().selectedHotspotId).toBeNull();
    });

    it('keeps selectedHotspotId when different hotspot is removed', () => {
      const scene = createMockScene({
        id: 'scene-1',
        hotspots: [createMockHotspot({ id: 'h1' }), createMockHotspot({ id: 'h2' })],
      });
      useTourEditorStore.getState().setCurrentTour(createMockTour({ scenes: [scene] }));
      useTourEditorStore.getState().selectHotspot('h2');
      useTourEditorStore.getState().removeHotspotDraft('h1');

      expect(useTourEditorStore.getState().selectedHotspotId).toBe('h2');
    });

    it('marks removed hotspot as deleted in pendingChanges', () => {
      const scene = createMockScene({
        id: 'scene-1',
        hotspots: [createMockHotspot({ id: 'h1' })],
      });
      useTourEditorStore.getState().setCurrentTour(createMockTour({ scenes: [scene] }));
      useTourEditorStore.getState().removeHotspotDraft('h1');

      expect(useTourEditorStore.getState().pendingChanges.hotspots?.['h1']).toEqual({
        id: 'h1',
        deleted: true,
      });
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
});
