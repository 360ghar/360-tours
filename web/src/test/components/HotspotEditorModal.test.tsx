import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, userEvent, waitFor } from '../test-utils';
import { Dialog } from '@/components/ui';
import { HotspotEditorModal } from '@/components/features/HotspotEditorModal';
import { useTourEditorStore } from '@/stores/tourEditorStore';
import { QUERY_KEYS } from '@/constants';
import type { Scene, Tour, Hotspot } from '@/types';

// Stub VideoUploader: exposes the upload result so the test can verify the
// video URL field is filled on completion (no network, no real dropzone).
vi.mock('@/components/features/VideoUploader', () => ({
  VideoUploader: ({
    onUploadComplete,
  }: {
    onUploadComplete: (video: {
      url: string;
      thumbnail_url: string;
      duration: number;
      title: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onUploadComplete({
          url: 'https://cdn.example.com/uploads/walkthrough.mp4',
          thumbnail_url: 'https://cdn.example.com/uploads/walkthrough-thumb.jpg',
          duration: 42,
          title: 'walkthrough',
        })
      }
    >
      MockCompleteUpload
    </button>
  ),
}));

// Mock the API surface used by the mutation-sync contract tests below. The
// video-upload tests never call the API, so this stub is inert for them.
const toursApiMock = vi.hoisted(() => ({
  createHotspot: vi.fn(),
  updateHotspot: vi.fn(),
  getScenes: vi.fn(),
}));

vi.mock('@/api', () => ({
  toursApi: toursApiMock,
  uploadApi: { uploadFile: vi.fn() },
}));

const scene: Scene = {
  id: 'scene-1',
  tour_id: 'tour-1',
  title: 'Living Room',
  description: null,
  image_url: 'https://example.com/scene.jpg',
  thumbnail_url: null,
  vr_url: null,
  order_index: 0,
  metadata: {},
  is_processed: true,
  processing_error: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

function renderEditor() {
  return render(
    <Dialog open onOpenChange={() => undefined}>
      <HotspotEditorModal
        open
        onOpenChange={() => undefined}
        hotspot={null}
        sceneId="scene-1"
        scenes={[scene]}
        mode="create"
        initialPosition={{ yaw: 0, pitch: 0 }}
      />
    </Dialog>
  );
}

describe('HotspotEditorModal video upload', () => {
  it('shows the Upload video button for video hotspots', async () => {
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Video' }));

    expect(screen.getByLabelText('Video URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload video' })).toBeInTheDocument();
  });

  it('fills the video URL field with the uploaded file URL on completion', async () => {
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Video' }));
    await userEvent.click(screen.getByRole('button', { name: 'Upload video' }));

    // The mocked VideoUploader's completion button fires onUploadComplete.
    await userEvent.click(screen.getByRole('button', { name: 'MockCompleteUpload' }));

    const urlInput = screen.getByLabelText('Video URL') as HTMLInputElement;
    expect(urlInput.value).toBe('https://cdn.example.com/uploads/walkthrough.mp4');
  });

  it('keeps the manual URL input as a fallback', async () => {
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Video' }));

    const urlInput = await screen.findByLabelText('Video URL');
    await userEvent.type(urlInput, 'https://youtube.com/watch?v=abc123');

    await waitFor(() =>
      expect(urlInput).toHaveValue('https://youtube.com/watch?v=abc123')
    );
  });
});

const createMockScene = (overrides?: Partial<Scene>): Scene => ({
  id: 'scene-1',
  tour_id: 'tour-1',
  title: 'Living Room',
  description: null,
  image_url: 'https://example.com/living.jpg',
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
  title: 'Existing Hotspot',
  description: null,
  icon: null,
  icon_name: 'info',
  icon_color: '#FF5733',
  icon_size: 32,
  content: null,
  custom_data: {},
  order_index: 0,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

const scene1 = createMockScene({ id: 'scene-1', order_index: 0 });
const scene2 = createMockScene({ id: 'scene-2', order_index: 1, title: 'Kitchen' });

const tour: Tour = {
  id: 'tour-1',
  user_id: 'user-1',
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
  scenes: [scene1, scene2],
};

// Mirrors TourEditPage's sync effect: watches the [SCENES, tourId] query and
// merges fresh data into the editor store, so a modal mutation that only
// invalidates the query still lands in the store (the mutation-sync contract).
function ScenesSync({ tourId }: { tourId: string }) {
  const { data: scenes } = useQuery({
    queryKey: [QUERY_KEYS.SCENES, tourId],
    queryFn: () => toursApiMock.getScenes(tourId),
    enabled: !!tourId,
  });

  useEffect(() => {
    if (!scenes) return;
    const state = useTourEditorStore.getState();
    if (!state.currentTour || state.currentTour.id !== tourId) return;
    state.mergeScenes(scenes);
  }, [scenes, tourId]);

  return null;
}

describe('HotspotEditorModal mutation-sync contract', () => {
  beforeEach(() => {
    toursApiMock.createHotspot.mockReset();
    toursApiMock.updateHotspot.mockReset();
    toursApiMock.getScenes.mockReset();
    useTourEditorStore.getState().reset();
  });

  it('stores the created hotspot in the store after a successful save', async () => {
    toursApiMock.getScenes.mockResolvedValue([scene1, scene2]);

    const createdHotspot = createMockHotspot({
      id: 'hotspot-new',
      title: 'New Info Hotspot',
      description: 'Freshly created',
    });

    toursApiMock.createHotspot.mockImplementation(async () => {
      // After the mutation succeeds, refetched scenes include the new hotspot.
      toursApiMock.getScenes.mockResolvedValue([
        { ...scene1, hotspots: [createdHotspot] },
        scene2,
      ]);
      return createdHotspot;
    });

    useTourEditorStore.getState().setCurrentTour(tour);

    render(
      <>
        <ScenesSync tourId="tour-1" />
        <HotspotEditorModal
          open
          onOpenChange={vi.fn()}
          hotspot={null}
          sceneId="scene-1"
          scenes={[scene1, scene2]}
          mode="create"
        />
      </>
    );

    // Use an info hotspot so no navigation target select is needed.
    fireEvent.click(screen.getByRole('button', { name: 'Info' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'New Info Hotspot' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Hotspot' }));

    await waitFor(() => {
      const storeTour = useTourEditorStore.getState().currentTour;
      expect(storeTour?.scenes?.[0]?.hotspots?.map(h => h.id)).toContain('hotspot-new');
    });
    // The new hotspot is selected so the user sees context after saving.
    expect(useTourEditorStore.getState().selectedHotspotId).toBe('hotspot-new');
  });

  it('stores the updated hotspot in the store after a successful edit', async () => {
    const existing = createMockHotspot({ id: 'hotspot-1', title: 'Old Title' });
    const scene1WithHotspot = { ...scene1, hotspots: [existing] };
    toursApiMock.getScenes.mockResolvedValue([scene1WithHotspot, scene2]);

    const updated = createMockHotspot({ id: 'hotspot-1', title: 'New Title' });

    toursApiMock.updateHotspot.mockImplementation(async () => {
      toursApiMock.getScenes.mockResolvedValue([
        { ...scene1, hotspots: [updated] },
        scene2,
      ]);
      return updated;
    });

    useTourEditorStore
      .getState()
      .setCurrentTour({ ...tour, scenes: [scene1WithHotspot, scene2] });

    render(
      <>
        <ScenesSync tourId="tour-1" />
        <HotspotEditorModal
          open
          onOpenChange={vi.fn()}
          hotspot={existing}
          sceneId="scene-1"
          scenes={[scene1WithHotspot, scene2]}
          mode="edit"
        />
      </>
    );

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    expect(titleInput.value).toBe('Old Title');

    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      const storeTour = useTourEditorStore.getState().currentTour;
      expect(storeTour?.scenes?.[0]?.hotspots?.[0]?.title).toBe('New Title');
    });
    // The edited hotspot stays selected after saving.
    expect(useTourEditorStore.getState().selectedHotspotId).toBe('hotspot-1');
  });
});
