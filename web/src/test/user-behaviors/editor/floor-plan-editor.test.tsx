import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../../test-utils';
import { FloorPlanEditor } from '@/components/features/FloorPlanEditor';
import { makeFloorPlan, makeScene } from '@/test/fixtures';
import type { FloorPlan, Scene } from '@/types';

const uploadFileMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('@/api', () => ({
  uploadApi: {
    uploadFile: (...args: unknown[]) => uploadFileMock(...args),
  },
}));

// The real confirm() opens the app-wide dialog; here it answers directly.
vi.mock('@/stores', async importActual => {
  const actual = await importActual<typeof import('@/stores')>();
  return { ...actual, confirm: (...args: unknown[]) => confirmMock(...args) };
});

const floorPlans: FloorPlan[] = [
  makeFloorPlan({ id: 'floor-1', name: 'Ground Floor', image_url: '', floor_number: 1 }),
];

const scenes: Scene[] = [
  makeScene({
    id: 'scene-1',
    title: 'Living Room',
    image_url: 'https://example.com/living.jpg',
  }),
];

describe('Floor plan editor behavior', () => {
  beforeEach(() => {
    uploadFileMock.mockReset();
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
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

    // A plan with no uploaded image cannot be saved: the server rejects an empty
    // image_url, and a temporary blob URL is never sent in its place.
    const saveButton = screen.getByRole('button', { name: /save floor plans/i });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText(/Upload an image for Ground Floor before saving/)).toBeInTheDocument();

    fireEvent.click(saveButton);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the uploaded image URL and the markers it holds', async () => {
    uploadFileMock.mockResolvedValue({ public_url: 'https://cdn.example.com/floor.png' });
    const onSave = vi.fn().mockResolvedValue(undefined);

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
    fireEvent.change(fileInput!, {
      target: { files: [new File(['floor-plan'], 'floor.png', { type: 'image/png' })] },
    });

    const saveButton = screen.getByRole('button', { name: /save floor plans/i });
    await waitFor(() => expect(saveButton).toBeEnabled());
    // The image goes up as a generic upload with a folder type, not a `folder` string.
    expect(uploadFileMock.mock.calls[0][1]).toMatchObject({ folderType: 'generic' });

    fireEvent.click(saveButton);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as Array<{ id: string; image_url: string }>;
    expect(saved[0]).toMatchObject({
      id: 'floor-1',
      image_url: 'https://cdn.example.com/floor.png',
    });
  });

  it('hides the generate action when the caller does not offer one', () => {
    render(
      <FloorPlanEditor
        open
        onOpenChange={vi.fn()}
        floorPlans={floorPlans}
        scenes={scenes}
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByTestId('generate-floor-plan')).not.toBeInTheDocument();
  });

  it('draws a plan from the tour, and asks first when unsaved edits would be lost', async () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined);

    render(
      <FloorPlanEditor
        open
        onOpenChange={vi.fn()}
        floorPlans={floorPlans}
        scenes={scenes}
        onSave={vi.fn()}
        onGenerate={onGenerate}
      />
    );

    // Nothing has been edited, so the first click goes straight through.
    fireEvent.click(screen.getByTestId('generate-floor-plan'));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
    expect(confirmMock).not.toHaveBeenCalled();

    // A floor added here exists only in the dialog, so it needs a warning.
    fireEvent.click(screen.getByRole('button', { name: /add floor plan/i }));
    confirmMock.mockResolvedValue(false);
    fireEvent.click(screen.getByTestId('generate-floor-plan'));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(onGenerate).toHaveBeenCalledTimes(1);

    confirmMock.mockResolvedValue(true);
    fireEvent.click(screen.getByTestId('generate-floor-plan'));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(2));
  });
});
