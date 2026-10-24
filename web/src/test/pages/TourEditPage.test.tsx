import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TourEditPage } from '@/pages/tours/TourEditPage';
import { toursApi } from '@/api';
import { useTourEditorStore } from '@/stores/tourEditorStore';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import { makeScene, makeTourWithScenes } from '@/test/fixtures';
import type { Scene, TourWithScenes } from '@/types';

vi.mock('@/api', () => ({
  toursApi: {
    getTour: vi.fn(),
    getScenes: vi.fn(),
    getFloorPlans: vi.fn(),
    createFloorPlan: vi.fn(),
    updateFloorPlan: vi.fn(),
    deleteFloorPlan: vi.fn(),
    updateTour: vi.fn(),
    publishTour: vi.fn(),
    unpublishTour: vi.fn(),
    duplicateTour: vi.fn(),
    deleteTour: vi.fn(),
    createHotspot: vi.fn(),
    updateHotspot: vi.fn(),
    deleteHotspot: vi.fn(),
    updateHotspotPosition: vi.fn(),
    createScene: vi.fn(),
    updateScene: vi.fn(),
    deleteScene: vi.fn(),
    reorderScenes: vi.fn(),
  },
  uploadApi: { uploadFile: vi.fn() },
  aiApi: {},
}));

vi.mock('@/components/features/PanoramaViewer', () => ({
  PanoramaViewer: () => <div data-testid="panorama-viewer" />,
}));

const scene: Scene = makeScene({
  id: 'scene-1',
  title: 'Living Room',
  image_url: 'https://example.com/living.jpg',
});

const draftTour: TourWithScenes = makeTourWithScenes({
  title: 'Draft Preview Tour',
  settings: { ...DEFAULT_TOUR_SETTINGS },
  scenes: [scene],
});

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  const router = createMemoryRouter(
    [{ path: '/tours/:id/edit', element: <TourEditPage /> }],
    { initialEntries: ['/tours/tour-1/edit'] }
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe('TourEditPage Preview', () => {
  const openSpy = vi.fn();

  beforeEach(() => {
    openSpy.mockReset();
    vi.stubGlobal('open', openSpy);
    useTourEditorStore.getState().reset();
    vi.mocked(toursApi.getTour).mockReset().mockResolvedValue(draftTour);
    vi.mocked(toursApi.getScenes).mockReset().mockResolvedValue([scene]);
    vi.mocked(toursApi.getFloorPlans).mockReset().mockResolvedValue([]);
    vi.mocked(toursApi.updateTour).mockReset();
    vi.mocked(toursApi.publishTour).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useTourEditorStore.getState().reset();
  });

  it('opens the authenticated owner view for a draft, not the public /view route', async () => {
    renderEditor();

    await screen.findByTestId('toolbar');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled();
    });
    expect(openSpy).toHaveBeenCalledWith('/tours/tour-1', '_blank');
    expect(openSpy.mock.calls[0][0]).not.toContain('/view/');
  });
});

describe('TourEditPage save and publish contract', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
    useTourEditorStore.getState().reset();
    vi.mocked(toursApi.getTour).mockReset().mockResolvedValue(draftTour);
    vi.mocked(toursApi.getScenes).mockReset().mockResolvedValue([scene]);
    vi.mocked(toursApi.getFloorPlans).mockReset().mockResolvedValue([]);
    vi.mocked(toursApi.updateTour).mockReset().mockResolvedValue(draftTour);
    vi.mocked(toursApi.publishTour)
      .mockReset()
      .mockResolvedValue({ ...draftTour, status: 'published' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useTourEditorStore.getState().reset();
  });

  it('saves with PATCH fields only: no status, no is_featured', async () => {
    renderEditor();
    await screen.findByTestId('toolbar');
    await waitFor(() => expect(useTourEditorStore.getState().currentTour?.id).toBe('tour-1'));

    act(() => {
      useTourEditorStore.getState().updateTourDraft({ title: 'Renamed Tour' });
    });
    await userEvent.click(screen.getByTestId('save-button'));

    await waitFor(() => expect(toursApi.updateTour).toHaveBeenCalledTimes(1));
    const [tourId, body] = vi.mocked(toursApi.updateTour).mock.calls[0];
    expect(tourId).toBe('tour-1');
    expect(body).toMatchObject({ title: 'Renamed Tour', visibility: 'private' });
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('is_featured');
    // Floor plans are not part of the settings payload: they live in their own table.
    expect(body.settings).not.toHaveProperty('floor_plans');
  });

  it('publishes through POST /publish, not through a status write', async () => {
    renderEditor();
    await screen.findByTestId('toolbar');
    await waitFor(() => expect(useTourEditorStore.getState().currentTour?.id).toBe('tour-1'));

    await userEvent.click(await screen.findByTestId('publish-button'));

    await waitFor(() => expect(toursApi.publishTour).toHaveBeenCalledWith('tour-1'));
    expect(toursApi.updateTour).not.toHaveBeenCalled();
  });

  it('reads floor plans from the floor-plan routes', async () => {
    renderEditor();
    await screen.findByTestId('toolbar');

    await waitFor(() => expect(toursApi.getFloorPlans).toHaveBeenCalledWith('tour-1'));
  });
});
