import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '../test-utils';
import type { AIProcessingJob } from '@/types';

const getJobStatusMock = vi.hoisted(() => vi.fn());
const cancelJobMock = vi.hoisted(() => vi.fn());
const useAIJobWebSocketMock = vi.hoisted(() => vi.fn());

vi.mock('@/api', () => ({
  aiApi: {
    getJobStatus: (...args: unknown[]) => getJobStatusMock(...args),
    cancelJob: (...args: unknown[]) => cancelJobMock(...args),
  },
}));

vi.mock('@/hooks', () => ({
  useAIJobWebSocket: (...args: unknown[]) => useAIJobWebSocketMock(...args),
}));

import { AIJobStatus } from '@/components/features/ai/AIJobStatus';

/** `AIJobBase` as the backend returns it (see `GET /ai/jobs/{id}`). */
const processingJob: AIProcessingJob = {
  id: 'job-1',
  tour_id: 'tour-1',
  scene_id: null,
  job_type: 'generate_tour',
  status: 'processing',
  progress: 25,
  error_message: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  actual_duration: null,
};

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('AIJobStatus polling fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getJobStatusMock.mockResolvedValue({ job: processingJob });
    cancelJobMock.mockResolvedValue({ job: { ...processingJob, status: 'cancelled' }, result: null });
    useAIJobWebSocketMock.mockReturnValue({
      state: 'connecting',
      isConnected: false,
      disconnect: vi.fn(),
      reconnect: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('starts polling when the websocket remains connecting past the grace period', async () => {
    render(<AIJobStatus jobId="job-1" />);
    await flushPromises();

    expect(getJobStatusMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    await flushPromises();
    expect(getJobStatusMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await flushPromises();
    expect(getJobStatusMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await flushPromises();
    expect(getJobStatusMock).toHaveBeenCalledTimes(3);
  });

  it('does not start interval polling while websocket is connected', async () => {
    useAIJobWebSocketMock.mockReturnValue({
      state: 'connected',
      isConnected: true,
      disconnect: vi.fn(),
      reconnect: vi.fn(),
    });

    render(<AIJobStatus jobId="job-1" />);
    await flushPromises();

    expect(getJobStatusMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    await flushPromises();

    expect(getJobStatusMock).toHaveBeenCalledTimes(1);
  });

  it('treats a cancelled job as final: it reports the cancel and stops polling', async () => {
    const onError = vi.fn();
    getJobStatusMock.mockResolvedValue({ job: { ...processingJob, status: 'cancelled' } });

    render(<AIJobStatus jobId="job-1" useWebSocket={false} onError={onError} />);
    await flushPromises();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
      'Processing was cancelled'
    );

    // Polling stops: a cancelled job never changes again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    await flushPromises();
    expect(getJobStatusMock).toHaveBeenCalledTimes(1);
  });

  it('hands the top-level result of a completed job to onComplete', async () => {
    const onComplete = vi.fn();
    const result = { tour_id: 'tour-1', scenes: [], generated: [], created_hotspots: [] };
    getJobStatusMock.mockResolvedValue({
      job: { ...processingJob, status: 'completed', progress: 100, actual_duration: 12.5 },
      result,
    });

    render(<AIJobStatus jobId="job-1" useWebSocket={false} onComplete={onComplete} />);
    await flushPromises();

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }), result);
  });
});
