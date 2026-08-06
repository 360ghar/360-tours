import { beforeEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.hoisted(() => vi.fn());

vi.mock('@/api/client', () => ({
  apiClient: {
    post: postMock,
  },
}));

import { generateTour } from '@/api/ai';

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
});
