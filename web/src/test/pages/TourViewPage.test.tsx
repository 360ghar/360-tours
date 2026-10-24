import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TourViewPage } from '@/pages/tours/TourViewPage';
import { toursApi } from '@/api';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import { makeScene, makeTourWithScenes } from '@/test/fixtures';
import type { Scene, TourWithScenes } from '@/types';

vi.mock('@/api', () => ({
  toursApi: {
    getTour: vi.fn(),
    getScenes: vi.fn(),
  },
}));

vi.mock('@/components/features/PanoramaViewer', () => ({
  PanoramaViewer: () => <div data-testid="panorama-viewer" />,
}));

vi.mock('@/components/features/ShareModal', () => ({
  ShareModal: () => null,
}));

vi.mock('@/components/features/HotspotContentModal', () => ({
  HotspotContentModal: () => null,
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

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/tours/tour-1']}>
        <Routes>
          <Route path="/tours/:id" element={<TourViewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TourViewPage draft preview', () => {
  beforeEach(() => {
    vi.mocked(toursApi.getTour).mockReset().mockResolvedValue(draftTour);
    vi.mocked(toursApi.getScenes).mockReset().mockResolvedValue([scene]);
  });

  it('plays a draft on the owner view and does not show Tour Not Found', async () => {
    renderView();

    expect(await screen.findByRole('heading', { name: 'Draft Preview Tour' })).toBeInTheDocument();
    expect(screen.getByText(/^draft$/)).toBeInTheDocument();
    expect(screen.getByTestId('panorama-viewer')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tour Not Found' })).not.toBeInTheDocument();
  });
});
