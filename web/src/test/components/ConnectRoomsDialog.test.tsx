import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, userEvent } from '../test-utils';
import { ConnectRoomsDialog } from '@/components/features/ai/ConnectRoomsDialog';
import { useAuthStore, useUIStore } from '@/stores';
import { makeUser } from '@/test/fixtures';

const aiApiMock = vi.hoisted(() => ({
  connectSpatial: vi.fn(),
  getJobStatus: vi.fn(),
  cancelJob: vi.fn(),
}));

// Keep the real result readers; replace only the network client.
vi.mock('@/api', async importActual => {
  const actual = await importActual<typeof import('@/api')>();
  return { ...actual, aiApi: aiApiMock };
});

vi.mock('@/hooks', async importActual => {
  const actual = await importActual<typeof import('@/hooks')>();
  return {
    ...actual,
    useAIJobWebSocket: () => ({ state: 'disconnected', isConnected: false }),
  };
});

const TIME = '2024-01-01T00:00:00Z';

function job(status: 'processing' | 'completed' | 'failed', extra = {}) {
  return {
    id: 'job-1',
    job_type: 'spatial_connect' as const,
    status,
    progress: status === 'completed' ? 100 : 30,
    tour_id: 'tour-1',
    scene_id: null,
    error_message: null,
    started_at: TIME,
    completed_at: null,
    created_at: TIME,
    updated_at: TIME,
    actual_duration: null,
    ...extra,
  };
}

/** `spatial_connect` result as the backend writes it (see SpatialConnectResult). */
const connectResult = {
  tour_id: 'tour-1',
  hotspots_created: 2,
  spatial_summary: {
    scene_count: 3,
    link_count: 2,
    rooms_without_links: ['bathroom'],
    one_way_links: [],
    unreachable_scenes: ['bathroom'],
    unmatched_openings: [],
    unlinked_openings: [],
    warnings: ['1 room(s) have no doorway links yet: bathroom'],
  },
};

function renderDialog(onApplied = vi.fn()) {
  render(
    <ConnectRoomsDialog
      open
      onOpenChange={vi.fn()}
      tourId="tour-1"
      sceneCount={3}
      onApplied={onApplied}
    />
  );
  return { onApplied };
}

describe('ConnectRoomsDialog', () => {
  beforeEach(() => {
    Object.values(aiApiMock).forEach(fn => fn.mockReset());
    useAuthStore.setState({ user: makeUser({ id: 5 }), isAuthenticated: true });
    useUIStore.setState({ toasts: [] });
    aiApiMock.connectSpatial.mockResolvedValue({ job: job('processing'), result: null });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('starts the linking job for the tour when the user confirms', async () => {
    aiApiMock.getJobStatus.mockReturnValue(new Promise(() => {}));

    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /connect rooms/i }));

    expect(aiApiMock.connectSpatial).toHaveBeenCalledWith('tour-1');
  });

  it('reports the link count and one line per warning, then lets the user re-run', async () => {
    aiApiMock.getJobStatus.mockResolvedValue({ job: job('completed'), result: connectResult });
    const { onApplied } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: /connect rooms/i }));

    expect(await screen.findByText('Rooms linked')).toBeInTheDocument();
    expect(screen.getByText(/2 doorway connections across 3 rooms/)).toBeInTheDocument();
    expect(screen.getByText('1 room(s) have no doorway links yet: bathroom')).toBeInTheDocument();
    expect(onApplied).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /re-run/i })).toBeInTheDocument();
  });

  it('says the run produced no report instead of falling back to the pre-run screen', async () => {
    aiApiMock.getJobStatus.mockResolvedValue({
      job: job('completed'),
      result: { tour_id: 'tour-1', hotspots_created: 0 },
    });

    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /connect rooms/i }));

    expect(await screen.findByText(/finished without a linking report/i)).toBeInTheDocument();
    // The pre-run screen would claim a fresh run is about to start.
    expect(screen.queryByText(/will be analysed/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /re-run/i })).toBeInTheDocument();
  });

  it('treats a report of zero analysed rooms as no report', async () => {
    aiApiMock.getJobStatus.mockResolvedValue({
      job: job('completed'),
      result: {
        tour_id: 'tour-1',
        hotspots_created: 0,
        spatial_summary: {
          scene_count: 0,
          link_count: 0,
          rooms_without_links: [],
          one_way_links: [],
          unreachable_scenes: [],
          unmatched_openings: [],
          unlinked_openings: [],
          warnings: [],
        },
      },
    });

    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /connect rooms/i }));

    expect(await screen.findByText(/finished without a linking report/i)).toBeInTheDocument();
    expect(screen.queryByText('Rooms linked')).not.toBeInTheDocument();
  });

  it('shows the server reason of a failed job with a retry', async () => {
    aiApiMock.getJobStatus.mockResolvedValue({
      job: job('failed', { error_message: 'Vision service is down' }),
      result: null,
    });

    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /connect rooms/i }));

    expect(await screen.findByText('Vision service is down')).toBeInTheDocument();
  });
});
