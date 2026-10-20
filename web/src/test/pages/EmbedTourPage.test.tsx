import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmbedTourPage } from '@/pages/EmbedTourPage';
import { toursApi } from '@/api';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import { makeHotspot, makePublicScene, makePublicTour, makeFloorPlan } from '@/test/fixtures';
import type { PublicScene, PublicTour } from '@/types';

vi.mock('@/components/features/PanoramaViewer', () => ({
  PanoramaViewer: ({
    hotspots,
    onHotspotClick,
    onSceneChange,
  }: {
    hotspots: Array<{
      id: string;
      type: string;
      title: string | null;
      target_scene_id: string | null;
    }>;
    onHotspotClick?: (hotspot: unknown) => void;
    onSceneChange?: (sceneId: string) => void;
  }) => (
    <div data-testid="panorama-viewer">
      {hotspots.map(hotspot => (
        <button
          key={hotspot.id}
          type="button"
          data-testid={`hotspot-${hotspot.id}`}
          onClick={() => {
            if (hotspot.type === 'navigation' && hotspot.target_scene_id) {
              onSceneChange?.(hotspot.target_scene_id);
            }
            onHotspotClick?.(hotspot);
          }}
        >
          {hotspot.title || hotspot.type}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/features/FloorPlanOverlay', () => ({
  FloorPlanOverlay: ({ floorPlans }: { floorPlans: Array<{ id: string; name: string }> }) => (
    <div data-testid="floor-plan-overlay">{floorPlans.map(fp => fp.name).join(',')}</div>
  ),
}));

vi.mock('@/api', () => ({
  toursApi: {
    getPublicTour: vi.fn(),
    trackEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockScene: PublicScene = makePublicScene({
  id: 'scene-1',
  title: 'Living Room',
  image_url: 'https://example.com/pano.jpg',
  hotspots: [
    makeHotspot({
      id: 'hs-info',
      type: 'info',
      title: 'About this room',
      content: { text: 'Sunny corner room with a fireplace' },
    }),
    makeHotspot({
      id: 'hs-nav',
      type: 'navigation',
      title: 'Go to Kitchen',
      target_scene_id: 'scene-2',
    }),
  ],
});

const kitchenScene: PublicScene = makePublicScene({
  id: 'scene-2',
  title: 'Kitchen',
  image_url: 'https://example.com/pano.jpg',
  order_index: 1,
  hotspots: [
    makeHotspot({
      id: 'hs-kitchen',
      scene_id: 'scene-2',
      type: 'info',
      title: 'Kitchen tip',
      content: { text: 'New quartz countertops' },
    }),
  ],
});

const mockTour: PublicTour = makePublicTour({
  title: 'Embed Test Tour',
  settings: { ...DEFAULT_TOUR_SETTINGS },
  scenes: [mockScene, kitchenScene],
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/embed/tour-1']}>
        <Routes>
          <Route path="/embed/:id" element={<EmbedTourPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('EmbedTourPage postMessage', () => {
  let messageListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.mocked(toursApi.getPublicTour).mockReset();
    vi.mocked(toursApi.trackEvent).mockReset().mockResolvedValue(undefined);

    vi.mocked(toursApi.getPublicTour).mockResolvedValue(mockTour);

    // jsdom default: window.parent === window (top-level, not in iframe)
    expect(window.parent).toBe(window);

    messageListener = vi.fn();
    window.addEventListener('message', messageListener);
  });

  afterEach(() => {
    window.removeEventListener('message', messageListener);
  });

  it('delivers ready to window when the embed page is the top window', async () => {
    renderPage();

    await waitFor(() => {
      const readyCall = messageListener.mock.calls.find(call => {
        const event = call[0] as MessageEvent;
        return event?.data?.type === 'ready';
      });
      expect(readyCall).toBeDefined();
    });

    const readyEvent = messageListener.mock.calls.find(call => {
      const event = call[0] as MessageEvent;
      return event?.data?.type === 'ready';
    })?.[0] as MessageEvent;

    expect(readyEvent.data).toMatchObject({
      type: 'ready',
      tourId: 'tour-1',
      tour_id: 'tour-1',
      data: {
        title: 'Embed Test Tour',
        sceneCount: 2,
        scene_count: 2,
        currentSceneId: 'scene-1',
        current_scene_id: 'scene-1',
      },
    });
  });

  it('posts tour_error when the tour exists but has zero scenes', async () => {
    vi.mocked(toursApi.getPublicTour).mockResolvedValue({ ...mockTour, scenes: [] });

    renderPage();

    await screen.findByText('Tour not available');

    await waitFor(() => {
      const errorCall = messageListener.mock.calls.find(call => {
        const event = call[0] as MessageEvent;
        return event?.data?.type === 'tour_error';
      });
      expect(errorCall).toBeDefined();
    });

    // No `ready` is posted when there is nothing to render.
    const readyCall = messageListener.mock.calls.find(call => {
      const event = call[0] as MessageEvent;
      return event?.data?.type === 'ready';
    });
    expect(readyCall).toBeUndefined();
  });

  it('posts error on fetch failure and recovers via the Retry button', async () => {
    vi.mocked(toursApi.getPublicTour)
      .mockRejectedValueOnce(new Error('network fail'))
      .mockResolvedValueOnce(mockTour);

    renderPage();

    await screen.findByText('Failed to load tour');

    await waitFor(() => {
      const errorCall = messageListener.mock.calls.find(call => {
        const event = call[0] as MessageEvent;
        return event?.data?.type === 'error';
      });
      expect(errorCall).toBeDefined();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      const readyCall = messageListener.mock.calls.find(call => {
        const event = call[0] as MessageEvent;
        return event?.data?.type === 'ready';
      });
      expect(readyCall).toBeDefined();
    });
    expect(screen.queryByText('Failed to load tour')).not.toBeInTheDocument();
  });

  it('opens info content and switches scenes from hotspot clicks', async () => {
    renderPage();

    await userEvent.click(await screen.findByTestId('hotspot-hs-info'));
    expect(await screen.findByRole('heading', { name: 'About this room' })).toBeInTheDocument();
    expect(screen.getByText('Sunny corner room with a fireplace')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByTestId('hotspot-hs-nav'));
    expect(await screen.findByTestId('hotspot-hs-kitchen')).toBeInTheDocument();
  });

  it('renders the floor plan overlay from the top-level tour.floor_plans', async () => {
    vi.mocked(toursApi.getPublicTour).mockResolvedValue({
      ...mockTour,
      floor_plans: [makeFloorPlan({ name: 'Ground floor' })],
    });

    renderPage();

    expect(await screen.findByTestId('floor-plan-overlay')).toHaveTextContent('Ground floor');
  });

  it('does not play an unpublished draft as an embed', async () => {
    vi.mocked(toursApi.getPublicTour).mockResolvedValue({
      ...mockTour,
      status: 'draft',
      visibility: 'private',
    });

    renderPage();

    expect(await screen.findByText('Tour not available')).toBeInTheDocument();
    expect(screen.queryByTestId('panorama-viewer')).not.toBeInTheDocument();

    await waitFor(() => {
      const errorCall = messageListener.mock.calls.find(call => {
        const event = call[0] as MessageEvent;
        return event?.data?.type === 'tour_error';
      });
      expect(errorCall).toBeDefined();
    });

    const readyCall = messageListener.mock.calls.find(call => {
      const event = call[0] as MessageEvent;
      return event?.data?.type === 'ready';
    });
    expect(readyCall).toBeUndefined();
  });
});
