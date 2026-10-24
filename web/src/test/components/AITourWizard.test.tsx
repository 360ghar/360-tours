import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, userEvent, waitFor } from '../test-utils';
import { AITourWizard } from '@/components/features/ai/AITourWizard';
import { useAuthStore, useUIStore } from '@/stores';
import { readAccountItem, writeAccountItem } from '@/lib/accountStorage';
import { makeUser } from '@/test/fixtures';

const aiApiMock = vi.hoisted(() => ({
  generateTour: vi.fn(),
  getJobStatus: vi.fn(),
  cancelJob: vi.fn(),
}));

const generateFloorPlanMock = vi.hoisted(() => vi.fn());

// Keep the real result readers; replace only the network clients.
vi.mock('@/api', async importActual => {
  const actual = await importActual<typeof import('@/api')>();
  return {
    ...actual,
    aiApi: aiApiMock,
    toursApi: { ...actual.toursApi, generateFloorPlan: generateFloorPlanMock },
  };
});

vi.mock('@/hooks', async importActual => {
  const actual = await importActual<typeof import('@/hooks')>();
  return {
    ...actual,
    useAIJobWebSocket: () => ({ state: 'disconnected', isConnected: false }),
  };
});

const USER_ID = 5;
const TIME = '2024-01-01T00:00:00Z';

function job(status: 'processing' | 'completed' | 'failed' | 'cancelled', extra = {}) {
  return {
    id: 'job-1',
    job_type: 'generate_tour' as const,
    status,
    progress: status === 'completed' ? 100 : 40,
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

/** `generate_tour` result: the keys the backend writes (see TourGenerationResult). */
const generatedResult = {
  tour_id: 'tour-1',
  tour: { id: 'tour-1', title: 'Lakeside Villa' },
  scenes: [
    {
      id: 's1',
      title: 'Living Room',
      description: 'Bright room',
      image_url: 'https://cdn/s1.jpg',
      thumbnail_url: null,
      hotspot_count: 2,
    },
    {
      id: 's2',
      title: 'Kitchen',
      description: null,
      image_url: 'https://cdn/s2.jpg',
      thumbnail_url: null,
      hotspot_count: 1,
    },
  ],
  generated: [],
  created_hotspots: ['h1', 'h2', 'h3'],
};

describe('AITourWizard job result', () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.values(aiApiMock).forEach(fn => fn.mockReset());
    generateFloorPlanMock.mockReset();
    useAuthStore.setState({ user: makeUser({ id: USER_ID }), isAuthenticated: true });
    useUIStore.setState({ toasts: [] });
    writeAccountItem('aiPendingJob', USER_ID, 'job-1');
  });

  afterEach(() => {
    sessionStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('shows the generated tour and its scenes from the tour_id, tour and scenes keys, then hands over the tour id', async () => {
    aiApiMock.getJobStatus.mockResolvedValue({ job: job('completed'), result: generatedResult });
    const onComplete = vi.fn();

    render(<AITourWizard open onOpenChange={vi.fn()} onComplete={onComplete} />);

    expect(await screen.findByText('Tour Generated Successfully!')).toBeInTheDocument();
    expect(screen.getByText(/Created 2 scenes/)).toBeInTheDocument();
    expect(screen.getByText('Lakeside Villa')).toBeInTheDocument();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    // The pending job is no longer pending.
    expect(readAccountItem('aiPendingJob', USER_ID)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /complete/i }));
    expect(onComplete).toHaveBeenCalledWith('tour-1');
  });

  it('reports a completed job whose result has no tour_id or tour', async () => {
    aiApiMock.getJobStatus.mockResolvedValue({
      job: job('completed'),
      result: { scenes: [] },
    });

    render(<AITourWizard open onOpenChange={vi.fn()} onComplete={vi.fn()} />);

    expect(await screen.findByText(/finished without usable results/i)).toBeInTheDocument();
    expect(screen.queryByText('Tour Generated Successfully!')).not.toBeInTheDocument();
  });

  it('ends a cancelled job: the generated union has cancelled, and the user sees it', async () => {
    aiApiMock.getJobStatus.mockResolvedValue({ job: job('cancelled'), result: null });

    render(<AITourWizard open onOpenChange={vi.fn()} onComplete={vi.fn()} />);

    expect(await screen.findByText('Processing was cancelled')).toBeInTheDocument();
    await waitFor(() => expect(readAccountItem('aiPendingJob', USER_ID)).toBeNull());
  });

  it('shows the error message of a failed job', async () => {
    aiApiMock.getJobStatus.mockResolvedValue({
      job: job('failed', { error_message: 'Vision service is down' }),
      result: null,
    });

    render(<AITourWizard open onOpenChange={vi.fn()} onComplete={vi.fn()} />);

    expect(await screen.findByText('Vision service is down')).toBeInTheDocument();
  });

  it('reports the linking quality of a spatial run before the user completes', async () => {
    aiApiMock.getJobStatus.mockResolvedValue({
      job: job('completed'),
      result: {
        ...generatedResult,
        spatial_summary: {
          scene_count: 2,
          link_count: 1,
          warnings: ['Kitchen has no doorway link'],
        },
      },
    });

    render(<AITourWizard open onOpenChange={vi.fn()} onComplete={vi.fn()} />);

    expect(await screen.findByText('Room Connections')).toBeInTheDocument();
    expect(screen.getByText(/1 link across 2 rooms/)).toBeInTheDocument();
    expect(screen.getByText('Kitchen has no doorway link')).toBeInTheDocument();
  });

  it('sketches a floor plan for the generated tour from the review step', async () => {
    aiApiMock.getJobStatus.mockResolvedValue({ job: job('completed'), result: generatedResult });
    generateFloorPlanMock.mockResolvedValue({ id: 'plan-1' });

    render(<AITourWizard open onOpenChange={vi.fn()} onComplete={vi.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: /sketch plan/i }));

    await waitFor(() => expect(generateFloorPlanMock).toHaveBeenCalledWith('tour-1'));
    expect(await screen.findByText('Added')).toBeInTheDocument();
    // The wizard stays open so the user can read the result before completing.
    expect(screen.getByRole('button', { name: /complete/i })).toBeInTheDocument();
  });

  it('keeps the review step usable when the plan cannot be sketched', async () => {
    aiApiMock.getJobStatus.mockResolvedValue({ job: job('completed'), result: generatedResult });
    generateFloorPlanMock.mockRejectedValue(new Error('No analyzed rooms yet'));

    render(<AITourWizard open onOpenChange={vi.fn()} onComplete={vi.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: /sketch plan/i }));

    await waitFor(() =>
      expect(useUIStore.getState().toasts.at(-1)).toMatchObject({
        type: 'error',
        message: 'No analyzed rooms yet',
      })
    );
    // The action is offered again rather than being left in a loading state.
    expect(screen.queryByText('Added')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sketch plan/i })).toBeEnabled();
  });
});
