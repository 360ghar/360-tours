import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmbedTourPage } from '@/pages/EmbedTourPage';
import { toursApi } from '@/api';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import type { Tour, Scene } from '@/types';

vi.mock('@/components/features/PanoramaViewer', () => ({
  PanoramaViewer: () => null,
}));

vi.mock('@/components/features/FloorPlanOverlay', () => ({
  FloorPlanOverlay: () => null,
}));

vi.mock('@/components/features/HotspotContentModal', () => ({
  HotspotContentModal: () => null,
}));

vi.mock('@/api', () => ({
  toursApi: {
    getPublicTour: vi.fn(),
    getPublicFloorPlans: vi.fn(),
    trackEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockScene: Scene = {
  id: 'scene-1',
  tour_id: 'tour-1',
  title: 'Living Room',
  description: null,
  image_url: 'https://example.com/pano.jpg',
  thumbnail_url: null,
  vr_url: null,
  order_index: 0,
  is_processed: true,
  processing_error: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  hotspots: [],
};

const mockTour: Tour = {
  id: 'tour-1',
  user_id: 'user-1',
  title: 'Embed Test Tour',
  description: null,
  status: 'published',
  visibility: 'public',
  is_featured: false,
  view_count: 0,
  like_count: 0,
  share_count: 0,
  settings: { ...DEFAULT_TOUR_SETTINGS },
  thumbnail_url: null,
  published_at: null,
  archived_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  scenes: [mockScene],
};

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
    vi.mocked(toursApi.getPublicFloorPlans).mockReset();
    vi.mocked(toursApi.trackEvent).mockReset().mockResolvedValue(undefined);

    vi.mocked(toursApi.getPublicTour).mockResolvedValue(mockTour);
    vi.mocked(toursApi.getPublicFloorPlans).mockResolvedValue([]);

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
        sceneCount: 1,
        scene_count: 1,
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

  it('posts tour_error when the tour is missing entirely', async () => {
    vi.mocked(toursApi.getPublicTour).mockResolvedValue({
      ...mockTour,
      scenes: undefined,
    } as unknown as Tour);

    renderPage();

    await waitFor(() => {
      const errorCall = messageListener.mock.calls.find(call => {
        const event = call[0] as MessageEvent;
        return event?.data?.type === 'tour_error';
      });
      expect(errorCall).toBeDefined();
    });
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
});
