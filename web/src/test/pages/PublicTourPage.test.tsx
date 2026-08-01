import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicTourPage } from '@/pages/PublicTourPage';
import { toursApi } from '@/api';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import type { Tour, Scene } from '@/types';

vi.mock('@/components/features/PanoramaViewer', () => ({
  PanoramaViewer: () => null,
}));
vi.mock('@/components/features/ShareModal', () => ({
  ShareModal: () => null,
}));
vi.mock('@/components/features/FloorPlanOverlay', () => ({
  FloorPlanOverlay: () => null,
}));
vi.mock('@/components/features/HotspotContentModal', () => ({
  HotspotContentModal: () => null,
}));
vi.mock('@/hooks/usePublicTourTracking', () => ({
  usePublicTourTracking: () => ({ trackEvent: vi.fn(), sessionId: 'test-session' }),
}));

vi.mock('@/api', () => ({
  toursApi: {
    getPublicTour: vi.fn(),
    getPublicFloorPlans: vi.fn(),
    trackEvent: vi.fn().mockResolvedValue(undefined),
    likePublicTour: vi.fn().mockResolvedValue({ like_count: 8 }),
    unlikePublicTour: vi.fn().mockResolvedValue({ like_count: 6 }),
  },
}));

const makeScene = (id: string, title: string, order: number): Scene => ({
  id,
  tour_id: 'tour-1',
  title,
  description: null,
  image_url: `https://example.com/${id}.jpg`,
  thumbnail_url: `https://example.com/${id}-thumb.jpg`,
  vr_url: null,
  order_index: order,
  is_processed: true,
  processing_error: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  hotspots: [],
});

const makeTour = (overrides: Partial<Tour> = {}): Tour => ({
  id: 'tour-1',
  user_id: 'user-1',
  title: 'Lakeside Villa',
  description: null,
  status: 'published',
  visibility: 'public',
  is_featured: false,
  view_count: 0,
  like_count: 3,
  share_count: 0,
  settings: { ...DEFAULT_TOUR_SETTINGS, floor_plans: [] },
  thumbnail_url: null,
  published_at: null,
  archived_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  scenes: [makeScene('scene-a', 'Living Room', 0), makeScene('scene-b', 'Bedroom', 1)],
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
    vi.mocked(toursApi.getPublicFloorPlans).mockReset().mockResolvedValue([]);
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

  it('hydrates like state and renders the like count from the fetched tour', async () => {
    // The public endpoint includes the visitor's is_liked flag + like_count.
    const likedTour = makeTour();
    (likedTour as Tour & { is_liked?: boolean }).is_liked = true;
    likedTour.like_count = 7;
    vi.mocked(toursApi.getPublicTour).mockResolvedValue(likedTour);

    renderPage();

    const likeButton = await screen.findByRole('button', { name: 'Unlike this tour' });
    await waitFor(() => expect(likeButton).toHaveAttribute('aria-pressed', 'true'));
    expect(withinLikeButtonCount()).toBe('7');
  });
});

function withinLikeButtonCount(): string | null {
  // The count is rendered as a span inside the like button.
  const button = document.querySelector('button[aria-label="Unlike this tour"]');
  if (!button) return null;
  return button.querySelector('span')?.textContent ?? null;
}
