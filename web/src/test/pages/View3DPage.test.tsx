import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { View3DPage } from '@/pages/View3DPage';
import { toursApi } from '@/api';
import { useSkyboxRenderer } from '@/hooks/useSkyboxRenderer';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import type { Tour } from '@/types';

vi.mock('@/api', () => ({
  toursApi: {
    getPublicTour: vi.fn(),
  },
}));

// three.js needs WebGL; mock the renderer hook in jsdom.
vi.mock('@/hooks/useSkyboxRenderer', () => ({
  useSkyboxRenderer: vi.fn(() => 'ready'),
}));

const createMockTour = (settings: Tour['settings']): Tour => ({
  id: 'tour-1',
  user_id: 'user-1',
  title: 'Test Tour',
  description: null,
  status: 'published',
  visibility: 'public',
  is_featured: false,
  view_count: 0,
  like_count: 0,
  share_count: 0,
  settings,
  thumbnail_url: null,
  published_at: null,
  archived_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  scenes: [],
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/view3d/tour-1']}>
        <Routes>
          <Route path="/view3d/:id" element={<View3DPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('View3DPage', () => {
  beforeEach(() => {
    vi.mocked(toursApi.getPublicTour).mockReset();
  });

  it('renders the in-app canvas when settings.world_3d.mesh_url is present', async () => {
    vi.mocked(toursApi.getPublicTour).mockResolvedValue(
      createMockTour({
        ...DEFAULT_TOUR_SETTINGS,
        world_3d: {
          mesh_url: 'https://res.cloudinary.com/demo/world.glb',
          kind: 'skybox_mesh',
          scene_id: 'scene-1',
        },
      })
    );

    renderPage();

    const canvas = await screen.findByLabelText('3D world');
    expect(canvas.tagName).toBe('CANVAS');
    expect(useSkyboxRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ current: canvas }),
      'https://res.cloudinary.com/demo/world.glb'
    );
    expect(screen.queryByTitle('3D world')).not.toBeInTheDocument();
  });

  it('prefers the mesh canvas over a legacy viewer_url when both are present', async () => {
    vi.mocked(toursApi.getPublicTour).mockResolvedValue(
      createMockTour({
        ...DEFAULT_TOUR_SETTINGS,
        world_3d: {
          mesh_url: 'https://res.cloudinary.com/demo/world.glb',
          viewer_url: 'https://example.com/splat-viewer',
        },
      })
    );

    renderPage();

    expect((await screen.findByLabelText('3D world')).tagName).toBe('CANVAS');
    expect(screen.queryByTitle('3D world')).not.toBeInTheDocument();
  });

  it('renders the legacy 3D world iframe when only viewer_url is present', async () => {
    vi.mocked(toursApi.getPublicTour).mockResolvedValue(
      createMockTour({
        ...DEFAULT_TOUR_SETTINGS,
        world_3d: { viewer_url: 'https://example.com/splat-viewer' },
      })
    );

    renderPage();

    const iframe = await screen.findByTitle('3D world');
    expect(iframe).toHaveAttribute('src', 'https://example.com/splat-viewer');
    expect(iframe).toHaveAttribute('allow', 'fullscreen; xr-spatial-tracking');
  });

  it('renders the empty state with a link to the 360 tour when world_3d is missing', async () => {
    vi.mocked(toursApi.getPublicTour).mockResolvedValue(createMockTour(null));

    renderPage();

    expect(await screen.findByText('3D world not available for this tour')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /360° tour/i })).toHaveAttribute(
      'href',
      '/view/tour-1'
    );
    expect(screen.queryByTitle('3D world')).not.toBeInTheDocument();
  });

  it('renders a distinct error state when the tour query fails', async () => {
    vi.mocked(toursApi.getPublicTour).mockRejectedValue(new Error('network fail'));

    renderPage();

    expect(await screen.findByText("Couldn't load this tour.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /360° tour/i })).toHaveAttribute(
      'href',
      '/view/tour-1'
    );
    expect(screen.queryByText('3D world not available for this tour')).not.toBeInTheDocument();
  });
});
