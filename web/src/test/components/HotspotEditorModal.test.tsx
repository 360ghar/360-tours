import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, userEvent, waitFor } from '../test-utils';
import { Dialog } from '@/components/ui';
import { HotspotEditorModal } from '@/components/features/HotspotEditorModal';
import { useTourEditorStore } from '@/stores/tourEditorStore';
import { useUIStore } from '@/stores/uiStore';
import { QUERY_KEYS } from '@/constants';
import { makeHotspot, makeScene, makeTourWithScenes } from '@/test/fixtures';
import type { Scene, Hotspot } from '@/types';

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

const scene: Scene = makeScene({ id: 'scene-1', title: 'Living Room' });

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

const createMockScene = (overrides?: Partial<Scene>): Scene =>
  makeScene({ title: 'Living Room', image_url: 'https://example.com/living.jpg', ...overrides });

const createMockHotspot = (overrides?: Partial<Hotspot>): Hotspot =>
  makeHotspot({
    title: 'Existing Hotspot',
    icon_name: 'info',
    icon_color: '#FF5733',
    ...overrides,
  });

const scene1 = createMockScene({ id: 'scene-1', order_index: 0 });
const scene2 = createMockScene({ id: 'scene-2', order_index: 1, title: 'Kitchen' });

const tour = makeTourWithScenes({ scenes: [scene1, scene2] });

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

describe('HotspotEditorModal Kuula-core actions', () => {
  beforeEach(() => {
    toursApiMock.createHotspot.mockReset();
    toursApiMock.updateHotspot.mockReset();
    toursApiMock.getScenes.mockReset();
    useTourEditorStore.getState().reset();
  });

  it('blocks navigation save without a target scene and saves when one is selected', async () => {
    toursApiMock.createHotspot.mockResolvedValue(
      createMockHotspot({
        id: 'hotspot-nav',
        type: 'navigation',
        target_scene_id: 'scene-2',
      })
    );

    render(
      <HotspotEditorModal
        open
        onOpenChange={vi.fn()}
        hotspot={null}
        sceneId="scene-1"
        scenes={[scene1, scene2]}
        mode="create"
      />
    );

    const saveButton = screen.getByRole('button', { name: 'Add Hotspot' });
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Select a target scene/);

    await userEvent.click(screen.getByLabelText('Target Scene'));
    await userEvent.click(await screen.findByRole('option', { name: 'Kitchen' }));

    expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(toursApiMock.createHotspot).toHaveBeenCalledTimes(1);
    });
    expect(toursApiMock.createHotspot).toHaveBeenCalledWith(
      'scene-1',
      expect.objectContaining({
        type: 'navigation',
        target_scene_id: 'scene-2',
      })
    );
  });

  it('shows the server field errors of a 422 instead of a generic message', async () => {
    useUIStore.setState({ toasts: [] });
    toursApiMock.createHotspot.mockRejectedValue({
      response: {
        status: 422,
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: {
              fields: [
                {
                  field: 'body.content.url',
                  msg: 'URL scheme is not allowed',
                  type: 'value_error',
                },
              ],
            },
          },
        },
      },
    });

    render(
      <HotspotEditorModal
        open
        onOpenChange={vi.fn()}
        hotspot={null}
        sceneId="scene-1"
        scenes={[scene1, scene2]}
        mode="create"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Info' }));
    await userEvent.type(screen.getByLabelText('Description'), 'Sunny corner room');
    await userEvent.click(screen.getByRole('button', { name: 'Add Hotspot' }));

    await waitFor(() => {
      expect(useUIStore.getState().toasts.map(t => t.message)).toContain(
        'content.url: URL scheme is not allowed'
      );
    });
  });

  it('saves an info hotspot with card text via the create API', async () => {
    toursApiMock.createHotspot.mockResolvedValue(
      createMockHotspot({ id: 'hotspot-info', type: 'info', title: 'Fireplace' })
    );

    render(
      <HotspotEditorModal
        open
        onOpenChange={vi.fn()}
        hotspot={null}
        sceneId="scene-1"
        scenes={[scene1, scene2]}
        mode="create"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByRole('button', { name: 'Add Hotspot' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Description'), 'Sunny corner room');
    await userEvent.click(screen.getByRole('button', { name: 'Add Hotspot' }));

    await waitFor(() => {
      expect(toursApiMock.createHotspot).toHaveBeenCalledWith(
        'scene-1',
        expect.objectContaining({
          type: 'info',
          content: { text: 'Sunny corner room' },
        })
      );
    });
    // The content holds the keys of its type only: no `kind`.
    const [, body] = toursApiMock.createHotspot.mock.calls[0];
    expect(body.content).not.toHaveProperty('kind');
  });

  it('rejects disallowed link protocols and saves http links', async () => {
    toursApiMock.createHotspot.mockResolvedValue(
      createMockHotspot({ id: 'hotspot-link', type: 'link' })
    );

    render(
      <HotspotEditorModal
        open
        onOpenChange={vi.fn()}
        hotspot={null}
        sceneId="scene-1"
        scenes={[scene1, scene2]}
        mode="create"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    const urlInput = screen.getByLabelText('Link URL');
    await userEvent.type(urlInput, 'javascript:alert(1)');
    expect(screen.getByRole('button', { name: 'Add Hotspot' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/http, https, mailto, or tel/);

    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, 'https://360ghar.com/listing');
    await userEvent.click(screen.getByRole('button', { name: 'Add Hotspot' }));

    await waitFor(() => {
      expect(toursApiMock.createHotspot).toHaveBeenCalledWith(
        'scene-1',
        expect.objectContaining({
          type: 'link',
          content: { url: 'https://360ghar.com/listing', target: '_blank' },
        })
      );
    });
    const [, body] = toursApiMock.createHotspot.mock.calls[0];
    expect(body.content).not.toHaveProperty('kind');
    expect(body.content).not.toHaveProperty('link_url');
  });

  it.each(['mailto:sales@360ghar.com', 'tel:+911234567890'])(
    'saves a %s link: the backend accepts http, https, mailto and tel',
    async url => {
      toursApiMock.createHotspot.mockResolvedValue(
        createMockHotspot({ id: 'hotspot-link', type: 'link' })
      );

      render(
        <HotspotEditorModal
          open
          onOpenChange={vi.fn()}
          hotspot={null}
          sceneId="scene-1"
          scenes={[scene1, scene2]}
          mode="create"
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Link' }));
      await userEvent.type(screen.getByLabelText('Link URL'), url);
      await userEvent.click(screen.getByRole('button', { name: 'Add Hotspot' }));

      await waitFor(() => {
        expect(toursApiMock.createHotspot).toHaveBeenCalledWith(
          'scene-1',
          expect.objectContaining({ type: 'link', content: { url, target: '_blank' } })
        );
      });
    }
  );

  it('saves an audio hotspot with an http URL', async () => {
    toursApiMock.createHotspot.mockResolvedValue(
      createMockHotspot({ id: 'hotspot-audio', type: 'audio' })
    );

    render(
      <HotspotEditorModal
        open
        onOpenChange={vi.fn()}
        hotspot={null}
        sceneId="scene-1"
        scenes={[scene1, scene2]}
        mode="create"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Audio' }));
    expect(screen.getByRole('button', { name: 'Add Hotspot' })).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText('Audio URL'),
      'https://cdn.example.com/narration.mp3'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add Hotspot' }));

    await waitFor(() => {
      expect(toursApiMock.createHotspot).toHaveBeenCalledWith(
        'scene-1',
        expect.objectContaining({
          type: 'audio',
          content: { audio_url: 'https://cdn.example.com/narration.mp3' },
        })
      );
    });
    const [, body] = toursApiMock.createHotspot.mock.calls[0];
    expect(body.content).not.toHaveProperty('kind');
  });
});

describe('HotspotEditorModal limits and clearing', () => {
  beforeEach(() => {
    toursApiMock.createHotspot.mockReset();
    toursApiMock.updateHotspot.mockReset();
    toursApiMock.getScenes.mockReset();
    useTourEditorStore.getState().reset();
  });

  it('limits the title to 255 and the description to 2000 characters, as the schema does', async () => {
    render(
      <HotspotEditorModal
        open
        onOpenChange={vi.fn()}
        hotspot={null}
        sceneId="scene-1"
        scenes={[scene1, scene2]}
        mode="create"
      />
    );

    expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '255');
    await userEvent.click(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByLabelText('Description')).toHaveAttribute('maxlength', '2000');
  });

  it('sends an explicit null for a cleared title, description and content', async () => {
    const existing = createMockHotspot({
      id: 'hotspot-1',
      type: 'info',
      title: 'Old Title',
      description: 'Old text',
      content: { text: 'Old text' },
    });
    toursApiMock.updateHotspot.mockResolvedValue({ ...existing, title: null, content: null });

    render(
      <HotspotEditorModal
        open
        onOpenChange={vi.fn()}
        hotspot={existing}
        sceneId="scene-1"
        scenes={[scene1, scene2]}
        mode="edit"
      />
    );

    // An info hotspot needs a title or a description: clear the description, keep the title,
    // then clear the title and type a description. Here: clear the description only.
    await userEvent.clear(screen.getByLabelText('Description'));
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(toursApiMock.updateHotspot).toHaveBeenCalledTimes(1));
    const [id, body] = toursApiMock.updateHotspot.mock.calls[0];
    expect(id).toBe('hotspot-1');
    // A cleared value is null, never undefined: an omitted key keeps the stored text.
    expect(body.description).toBeNull();
    expect(body.content).toBeNull();
    expect(body.title).toBe('Old Title');
    expect(Object.keys(body)).toContain('description');
    expect(Object.keys(body)).toContain('content');
    expect(body).not.toHaveProperty('kind');
  });

  it('clears the title with an explicit null', async () => {
    const existing = createMockHotspot({
      id: 'hotspot-2',
      type: 'info',
      title: 'Old Title',
      description: 'Kept text',
      content: { text: 'Kept text' },
    });
    toursApiMock.updateHotspot.mockResolvedValue({ ...existing, title: null });

    render(
      <HotspotEditorModal
        open
        onOpenChange={vi.fn()}
        hotspot={existing}
        sceneId="scene-1"
        scenes={[scene1, scene2]}
        mode="edit"
      />
    );

    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(toursApiMock.updateHotspot).toHaveBeenCalledTimes(1));
    const [, body] = toursApiMock.updateHotspot.mock.calls[0];
    expect(body.title).toBeNull();
    expect(body.content).toEqual({ text: 'Kept text' });
  });
});
