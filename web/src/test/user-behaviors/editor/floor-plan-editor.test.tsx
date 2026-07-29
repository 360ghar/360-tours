import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../../test-utils';
import { FloorPlanEditor } from '@/components/features/FloorPlanEditor';
import type { FloorPlan, Scene } from '@/types';

const uploadFileMock = vi.hoisted(() => vi.fn());

vi.mock('@/api', () => ({
  uploadApi: {
    uploadFile: (...args: unknown[]) => uploadFileMock(...args),
  },
}));

const floorPlans: FloorPlan[] = [
  {
    id: 'floor-1',
    name: 'Ground Floor',
    image_url: '',
    floor_number: 1,
    markers: [],
  },
];

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

describe('Floor plan editor behavior', () => {
  beforeEach(() => {
    uploadFileMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not persist a temporary blob URL when floor-plan image upload fails', async () => {
    uploadFileMock.mockRejectedValue(new Error('Upload unavailable'));
    const onSave = vi.fn();

    render(
      <FloorPlanEditor
        open
        onOpenChange={vi.fn()}
        floorPlans={floorPlans}
        scenes={scenes}
        onSave={onSave}
      />
    );

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput!, {
      target: {
        files: [new File(['floor-plan'], 'floor.png', { type: 'image/png' })],
      },
    });

    expect(await screen.findByText('Upload unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save floor plans/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const savedFloorPlans = onSave.mock.calls[0][0] as FloorPlan[];
    expect(savedFloorPlans[0].image_url).toBe('');
    expect(savedFloorPlans[0].image_url.startsWith('blob:')).toBe(false);
  });
});
