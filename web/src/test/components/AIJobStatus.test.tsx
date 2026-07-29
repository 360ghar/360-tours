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

const processingJob: AIProcessingJob = {
  id: 'job-1',
  tour_id: 'tour-1',
  user_id: 'user-1',
  job_type: 'tour_generation',
  status: 'processing',
  progress: 25,
  input_data: {},
  output_data: {},
  error_message: null,
  estimated_duration: null,
  actual_duration: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
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
    cancelJobMock.mockResolvedValue({ success: true });
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
});
