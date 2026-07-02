import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../../test-utils';
import { SceneAnalysis } from '@/components/features/ai/SceneAnalysis';
import type { Scene } from '@/types';

const aiApiMock = vi.hoisted(() => ({
  analyzeScenes: vi.fn(),
  getJobStatus: vi.fn(),
  cancelJob: vi.fn(),
}));

vi.mock('@/api', () => ({
  aiApi: aiApiMock,
}));

vi.mock('@/hooks', async importActual => {
  const actual = await importActual<typeof import('@/hooks')>();
  return {
    ...actual,
    useAIJobWebSocket: () => ({
      state: 'disconnected',
      isConnected: false,
    }),
  };
});

const scenes: Scene[] = [
  {
    id: 'scene-1',
    tour_id: 'tour-1',
    title: 'Living Room',
    description: null,
    image_url: 'https://example.com/living.jpg',
    thumbnail_url: null,
    vr_url: null,
    order_index: 0,
    metadata: undefined,
    is_processed: true,
    processing_error: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

describe('AI scene analysis behavior', () => {
  beforeEach(() => {
    aiApiMock.analyzeScenes.mockReset();
    aiApiMock.getJobStatus.mockReset();
    aiApiMock.cancelJob.mockReset();
  });

  it('toggles result selection from the visible checkbox control', async () => {
    aiApiMock.analyzeScenes.mockResolvedValue({ job: { id: 'job-1' } });
    aiApiMock.getJobStatus.mockResolvedValue({
      job: {
        id: 'job-1',
        job_type: 'scene_detection',
        status: 'completed',
        progress: 100,
        input_data: null,
        result_data: null,
        error_message: null,
        estimated_duration: null,
        actual_duration: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      result: {
        analysis: [
          {
            scene_id: 'scene-1',
            room_type: 'living_room',
            room_confidence: 0.93,
            suggested_title: 'Living Room',
            suggested_description: 'A bright living room.',
            quality_score: 91,
            quality_issues: [],
            features_detected: ['windows'],
          },
        ],
      },
    });

    render(
      <SceneAnalysis
        open
        onOpenChange={vi.fn()}
        tourId="tour-1"
        scenes={scenes}
        onApply={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /start analysis/i }));

    const checkbox = await screen.findByRole('checkbox', {
      name: /select living room/i,
      checked: true,
    });
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', {
          name: /select living room/i,
          checked: false,
        })
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /apply to 0 scenes/i })).toBeDisabled();
  });
});
