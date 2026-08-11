import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, userEvent } from '../test-utils';
import { SpatialNavigationPanel } from '@/components/features/ai/SpatialNavigationPanel';
import type { AIProcessingJob } from '@/types';

const getJobsMock = vi.hoisted(() => vi.fn());
const requestSpatialGenerationMock = vi.hoisted(() => vi.fn());
const getJobStatusMock = vi.hoisted(() => vi.fn());
const useAIJobWebSocketMock = vi.hoisted(() => vi.fn());

vi.mock('@/api', () => ({
  aiApi: {
    getJobs: (...args: unknown[]) => getJobsMock(...args),
    requestSpatialGeneration: (...args: unknown[]) => requestSpatialGenerationMock(...args),
    getJobStatus: (...args: unknown[]) => getJobStatusMock(...args),
    cancelJob: vi.fn(),
  },
}));

vi.mock('@/hooks', () => ({
  useAIJobWebSocket: (...args: unknown[]) => useAIJobWebSocketMock(...args),
}));

const spatialJob = (overrides: Partial<AIProcessingJob> = {}): AIProcessingJob => ({
  id: 'spatial-1',
  tour_id: 'tour-1',
  user_id: 'user-1',
  job_type: 'spatial_generation',
  status: 'processing',
  progress: 45,
  input_data: {},
  output_data: {},
  error_message: null,
  estimated_duration: null,
  actual_duration: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const completedJob = spatialJob({ status: 'completed', progress: 100 });

const completedResult = {
  tour_id: 'tour-1',
  generator: 'spatial-ai-v1',
  quality: {
    version: 1,
    overall_score: 88.4,
    dimensions: {
      panorama_coverage: 96.2,
      seam_score: 81.0,
      exposure_score: 88.0,
      sharpness_score: 60.0,
      low_quality_ratio: 91.7,
      skipped_angle_ratio: 95.8,
      scene_connectivity: 100.0,
      ai_detection_confidence: 87.5,
    },
    warnings: ['Visible seam discontinuities detected (mean 81/100)'],
  },
  graph: { scene_count: 3, edge_count: 4, reciprocal_edge_count: 4, reachable_scenes: 3 },
  applied: { created_hotspots: ['a', 'b', 'c', 'd'], removed_ai_spatial_hotspots: 0 },
  scenes: [
    { scene_id: 's1', room_type: 'hallway', room_confidence: 0.95, opening_count: 2, hotspot_count: 2 },
    { scene_id: 's2', room_type: 'kitchen', room_confidence: 0.9, opening_count: 1, hotspot_count: 1 },
    { scene_id: 's3', room_type: 'bedroom', room_confidence: 0.85, opening_count: 1, hotspot_count: 1 },
  ],
  unanalysed_scene_ids: [],
};

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('SpatialNavigationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAIJobWebSocketMock.mockReturnValue({
      state: 'disconnected',
      isConnected: false,
      disconnect: vi.fn(),
      reconnect: vi.fn(),
    });
  });

  it('shows the run CTA when no spatial job has ever run', async () => {
    getJobsMock.mockResolvedValue({ items: [], next_cursor: null });

    render(<SpatialNavigationPanel tourId="tour-1" sceneCount={3} tourStatus="published" />);
    await flushPromises();

    expect(await screen.findByRole('button', { name: /run ai navigation/i })).toBeInTheDocument();
    expect(screen.getByText(/never blocks viewing/i)).toBeInTheDocument();
  });

  it('explains that at least 2 scenes are required', async () => {
    getJobsMock.mockResolvedValue({ items: [], next_cursor: null });

    render(<SpatialNavigationPanel tourId="tour-1" sceneCount={1} />);
    await flushPromises();

    expect(
      await screen.findByText(/add at least 2 scenes to generate ai navigation/i)
    ).toBeInTheDocument();
  });

  it('starts a job and shows the processing state (reuses AIJobStatus)', async () => {
    getJobsMock.mockResolvedValue({ items: [], next_cursor: null });
    requestSpatialGenerationMock.mockResolvedValue({
      job: spatialJob({ status: 'pending', progress: 0 }),
    });
    getJobStatusMock.mockResolvedValue({ job: spatialJob({ status: 'pending', progress: 0 }) });

    render(<SpatialNavigationPanel tourId="tour-1" sceneCount={3} />);

    await userEvent.click(await screen.findByRole('button', { name: /run ai navigation/i }));
    await flushPromises();

    expect(requestSpatialGenerationMock).toHaveBeenCalledWith('tour-1');
    expect(await screen.findByText(/waiting to start/i)).toBeInTheDocument();
  });

  it('shows success state with quality score and warnings after completion', async () => {
    getJobsMock.mockResolvedValue({ items: [completedJob], next_cursor: null });
    getJobStatusMock.mockResolvedValue({ job: completedJob, result: completedResult });

    render(<SpatialNavigationPanel tourId="tour-1" sceneCount={3} tourStatus="published" />);
    await flushPromises();

    expect(await screen.findByText(/tour navigation ready/i)).toBeInTheDocument();
    expect(await screen.findByText('88.4')).toBeInTheDocument();
    expect(screen.getByText(/seam discontinuities/i)).toBeInTheDocument();
    expect(screen.getByText(/hallway/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
    // The viewer-blocking copy must NOT be present in the success state.
    expect(screen.queryByText(/never blocks viewing/i)).not.toBeInTheDocument();
  });

  it('shows failure state with retry while the tour stays available', async () => {
    const failedJob = spatialJob({
      status: 'failed',
      error_message: 'AI provider unavailable',
    });
    getJobsMock.mockResolvedValue({ items: [failedJob], next_cursor: null });

    render(<SpatialNavigationPanel tourId="tour-1" sceneCount={3} tourStatus="published" />);
    await flushPromises();

    expect(await screen.findByText(/ai navigation couldn't be generated/i)).toBeInTheDocument();
    expect(screen.getByText(/your tour is ready and remains available/i)).toBeInTheDocument();
    expect(screen.getByText('AI provider unavailable')).toBeInTheDocument();

    requestSpatialGenerationMock.mockResolvedValue({
      job: spatialJob({ status: 'pending', progress: 0 }),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: /retry ai processing/i })
    );
    await flushPromises();
    expect(requestSpatialGenerationMock).toHaveBeenCalledWith('tour-1');
  });

  it('keeps the panel usable when starting fails (network error)', async () => {
    getJobsMock.mockResolvedValue({ items: [], next_cursor: null });
    requestSpatialGenerationMock.mockRejectedValue(new Error('network down'));

    render(<SpatialNavigationPanel tourId="tour-1" sceneCount={3} />);

    await userEvent.click(await screen.findByRole('button', { name: /run ai navigation/i }));
    await flushPromises();

    expect(await screen.findByText('network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run ai navigation/i })).toBeInTheDocument();
  });

  it('surfaces partial success (unanalysed scenes still listed)', async () => {
    const partialResult = {
      ...completedResult,
      unanalysed_scene_ids: ['s4'],
    };
    getJobsMock.mockResolvedValue({ items: [completedJob], next_cursor: null });
    getJobStatusMock.mockResolvedValue({ job: completedJob, result: partialResult });

    render(<SpatialNavigationPanel tourId="tour-1" sceneCount={4} />);
    await flushPromises();

    expect(await screen.findByText(/1 scene\(s\) could not be analysed/i)).toBeInTheDocument();
  });
});
