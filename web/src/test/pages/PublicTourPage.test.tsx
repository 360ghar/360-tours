import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicTourPage } from '@/pages/PublicTourPage';
import { toursApi } from '@/api';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import {
  makeFloorPlan as makeFloorPlanFixture,
  makeHotspot,
  makePublicScene,
  makePublicTour,
} from '@/test/fixtures';
import type { FloorPlan, Hotspot, PublicScene, PublicTour } from '@/types';

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
vi.mock('@/components/features/ShareModal', () => ({
  ShareModal: () => null,
}));
vi.mock('@/components/features/FloorPlanOverlay', () => ({
  FloorPlanOverlay: ({ floorPlans }: { floorPlans: Array<{ id: string; name: string }> }) => (
    <div data-testid="floor-plan-overlay">{floorPlans.map(fp => fp.name).join(',')}</div>
  ),
}));
vi.mock('@/hooks/usePublicTourTracking', () => ({
  usePublicTourTracking: () => ({ trackEvent: vi.fn(), sessionId: 'test-session' }),
}));

vi.mock('@/api', () => ({
  toursApi: {
    getPublicTour: vi.fn(),
    trackEvent: vi.fn().mockResolvedValue(undefined),
    likePublicTour: vi.fn().mockResolvedValue({ like_count: 8 }),
    unlikePublicTour: vi.fn().mockResolvedValue({ like_count: 6 }),
  },
}));

const makeScene = (
  id: string,
  title: string,
  order: number,
  hotspots: Hotspot[] = []
): PublicScene =>
  makePublicScene({
    id,
    title,
    order_index: order,
    image_url: `https://example.com/${id}.jpg`,
    thumbnail_url: `https://example.com/${id}-thumb.jpg`,
    hotspots,
  });

const makeFloorPlan = (id: string, name: string, floorNumber: number): FloorPlan =>
  makeFloorPlanFixture({
    id,
    name,
    image_url: `https://example.com/${id}.png`,
    floor_number: floorNumber,
  });

const makeTour = (overrides: Partial<PublicTour> = {}): PublicTour =>
  makePublicTour({
    title: 'Lakeside Villa',
    like_count: 3,
    settings: { ...DEFAULT_TOUR_SETTINGS },
    scenes: [
      makeScene('scene-a', 'Living Room', 0, [
        makeHotspot({
          id: 'hs-info',
          scene_id: 'scene-a',
          type: 'info',
          title: 'About this room',
          content: { text: 'Sunny corner room with a fireplace' },
        }),
        makeHotspot({
          id: 'hs-nav',
          scene_id: 'scene-a',
          type: 'navigation',
          title: 'Go to Bedroom',
          target_scene_id: 'scene-b',
        }),
      ]),
      makeScene('scene-b', 'Bedroom', 1, [
        makeHotspot({
          id: 'hs-bedroom',
          scene_id: 'scene-b',
          type: 'info',
          title: 'Bedroom note',
          content: { text: 'Quiet street side' },
        }),
      ]),
    ],
    ...overrides,
  });

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/view/tour-1']}>
        <Routes>
          <Route path="/view/:id" element={<PublicTourPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const errorWithStatus = (status: number, message = 'Server error') =>
  Object.assign(new Error(message), { response: { status, data: {} } });

describe('PublicTourPage states', () => {
  beforeEach(() => {
    vi.mocked(toursApi.getPublicTour).mockReset();
    vi.mocked(toursApi.trackEvent).mockReset().mockResolvedValue(undefined);
    vi.mocked(toursApi.likePublicTour).mockClear();
    vi.mocked(toursApi.unlikePublicTour).mockClear();
  });

  it('renders an error state with retry for a non-404 fetch failure, then recovers', async () => {
    vi.mocked(toursApi.getPublicTour)
      .mockRejectedValueOnce(errorWithStatus(500, 'Server error'))
      .mockResolvedValueOnce(makeTour());

    renderPage();

    expect(
      await screen.findByRole('heading', { name: "Couldn't load this tour" })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tour Not Found' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Lakeside Villa' })).toBeInTheDocument();
    expect(toursApi.getPublicTour).toHaveBeenCalledTimes(2);
  });

  it('renders the not-found state with a homepage link for a 404', async () => {
    vi.mocked(toursApi.getPublicTour).mockRejectedValue(errorWithStatus(404, 'Not Found'));

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tour Not Found' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to homepage' })).toHaveAttribute('href', '/');
  });

  it('renders the like count from the fetched tour and takes the new count from the like answer', async () => {
    // The public tour carries no per-viewer flag: the server counts each viewer once.
    vi.mocked(toursApi.getPublicTour).mockResolvedValue(makeTour({ like_count: 7 }));

    renderPage();

    const likeButton = await screen.findByRole('button', { name: 'Like this tour' });
    expect(likeButton).toHaveAttribute('aria-pressed', 'false');
    expect(withinLikeButtonCount('Like this tour')).toBe('7');

    await userEvent.click(likeButton);

    const unlikeButton = await screen.findByRole('button', { name: 'Unlike this tour' });
    expect(unlikeButton).toHaveAttribute('aria-pressed', 'true');
    // The count comes from the `{like_count}` answer of POST /like.
    await waitFor(() => expect(withinLikeButtonCount('Unlike this tour')).toBe('8'));
    expect(toursApi.likePublicTour).toHaveBeenCalledWith('tour-1');
  });

  it('opens the info card and navigates when hotspot markers are clicked', async () => {
    vi.mocked(toursApi.getPublicTour).mockResolvedValue(makeTour());

    renderPage();

    await userEvent.click(await screen.findByTestId('hotspot-hs-info'));
    expect(await screen.findByRole('heading', { name: 'About this room' })).toBeInTheDocument();
    expect(screen.getByText('Sunny corner room with a fireplace')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    await userEvent.click(screen.getByTestId('hotspot-hs-nav'));

    expect(await screen.findByTestId('hotspot-hs-bedroom')).toBeInTheDocument();
    expect(screen.queryByTestId('hotspot-hs-nav')).not.toBeInTheDocument();
  });

  it('renders the floor plan overlay from the top-level tour.floor_plans', async () => {
    vi.mocked(toursApi.getPublicTour).mockResolvedValue(
      makeTour({
        floor_plans: [
          makeFloorPlan('fp-1', 'Ground floor', 1),
          makeFloorPlan('fp-2', 'First floor', 2),
        ],
      })
    );

    renderPage();

    expect(await screen.findByTestId('floor-plan-overlay')).toHaveTextContent(
      'Ground floor,First floor'
    );
  });

  it('ignores a settings.floor_plans key and renders no overlay without top-level plans', async () => {
    // The backend never sends settings.floor_plans. A stale key must not feed the overlay.
    const staleSettings = { floor_plans: [makeFloorPlan('fp-old', 'Stale plan', 1)] };
    vi.mocked(toursApi.getPublicTour).mockResolvedValue(
      makeTour({
        settings: { ...DEFAULT_TOUR_SETTINGS, ...staleSettings },
        floor_plans: [],
      })
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Lakeside Villa' })).toBeInTheDocument();
    expect(screen.queryByTestId('floor-plan-overlay')).not.toBeInTheDocument();
  });

  it('does not play an unpublished or private tour as a public viewer', async () => {
    vi.mocked(toursApi.getPublicTour).mockResolvedValue(
      makeTour({ status: 'draft', visibility: 'private' })
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tour Not Found' })).toBeInTheDocument();
    expect(screen.queryByTestId('panorama-viewer')).not.toBeInTheDocument();
  });
});

function withinLikeButtonCount(label: string): string | null {
  // The count is rendered as a span inside the like button.
  const button = document.querySelector(`button[aria-label="${label}"]`);
  if (!button) return null;
  return button.querySelector('span')?.textContent ?? null;
}
