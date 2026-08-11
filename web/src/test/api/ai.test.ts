import { beforeEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.hoisted(() => vi.fn());
const getMock = vi.hoisted(() => vi.fn());

vi.mock('@/api/client', () => ({
  apiClient: {
    post: postMock,
    get: getMock,
  },
}));

import { generateTour, requestSpatialGeneration, getJobs } from '@/api/ai';

describe('AI API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the created tour ID and allows large panorama uploads', async () => {
    postMock.mockResolvedValue({
      data: {
        job: { id: 'job-1' },
        tour_id: 'tour-1',
        scene_ids: ['scene-1'],
      },
    });

    const progress = vi.fn();
    const result = await generateTour(
      {
        images: [new File(['panorama'], 'living-room.jpg', { type: 'image/jpeg' })],
        auto_detect_rooms: true,
        auto_place_hotspots: true,
        auto_generate_descriptions: true,
      },
      progress
    );

    const [path, body, config] = postMock.mock.calls[0] as [
      string,
      FormData,
      { timeout: number; onUploadProgress: (event: { loaded: number; total?: number }) => void },
    ];

    expect(path).toBe('/ai/tours/generate');
    expect(body.getAll('images')).toHaveLength(1);
    expect(body.get('auto_place_hotspots')).toBe('true');
    expect(config.timeout).toBe(180000);

    config.onUploadProgress({ loaded: 25, total: 100 });
    expect(progress).toHaveBeenCalledWith(25);
    expect(result.tour_id).toBe('tour-1');
  });

  it('requests AI spatial navigation with optional capture metrics', async () => {
    postMock.mockResolvedValue({
      data: { job: { id: 'spatial-job-1', job_type: 'spatial_generation' } },
    });

    const result = await requestSpatialGeneration('tour-9', [
      {
        scene_id: 'scene-1',
        coverage_percent: 96.5,
        low_quality: { total: 24, low_quality: 2 },
        skipped: { total: 24, skipped: 1 },
      },
    ]);

    const [path, body] = postMock.mock.calls[0] as [string, { capture_metrics: unknown }];
    expect(path).toBe('/ai/tours/tour-9/spatial');
    expect(body.capture_metrics).toHaveLength(1);
    expect(result.job.job_type).toBe('spatial_generation');
  });

  it('requests AI spatial navigation without a payload body', async () => {
    postMock.mockResolvedValue({ data: { job: { id: 'spatial-job-2' } } });

    await requestSpatialGeneration('tour-9');

    const [, body] = postMock.mock.calls[0] as [string, unknown];
    expect(body).toBeUndefined();
  });

  it('lists AI jobs filtered by tour', async () => {
    getMock.mockResolvedValue({
      data: { items: [{ id: 'job-1', tour_id: 'tour-9' }], next_cursor: null },
    });

    await getJobs({ tour_id: 'tour-9', limit: 10 });

    const [path, config] = getMock.mock.calls[0] as [string, { params: Record<string, unknown> }];
    expect(path).toBe('/ai/jobs');
    expect(config.params.tour_id).toBe('tour-9');
    expect(config.params.limit).toBe(10);
  });
});
