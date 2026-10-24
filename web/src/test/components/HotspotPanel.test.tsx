import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent, waitFor } from '../test-utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { HotspotPanel } from '@/components/features/HotspotPanel';
import { useTourEditorStore } from '@/stores/tourEditorStore';
import { makeHotspot, makeScene } from '@/test/fixtures';
import type { Hotspot, Scene } from '@/types';

const toursApiMock = vi.hoisted(() => ({
  deleteHotspot: vi.fn(),
  createHotspot: vi.fn(),
  updateHotspot: vi.fn(),
}));

vi.mock('@/api', () => ({
  toursApi: toursApiMock,
}));

const scene: Scene = makeScene({
  id: 'scene-1',
  title: 'Living Room',
  image_url: 'https://example.com/living.jpg',
});

const hotspot: Hotspot = makeHotspot({
  id: 'hotspot-1',
  type: 'info',
  position: { yaw: 12, pitch: -4 },
  title: 'Fireplace',
  description: 'Corner hearth',
  icon_name: 'info',
  icon_color: '#FF5733',
  content: { text: 'Corner hearth' },
});

describe('HotspotPanel delete', () => {
  beforeEach(() => {
    toursApiMock.deleteHotspot.mockReset().mockResolvedValue(undefined);
  });

  it('calls toursApi.deleteHotspot after the creator confirms', async () => {
    render(
      <>
        <ConfirmDialog />
        <HotspotPanel sceneId="scene-1" hotspots={[hotspot]} scenes={[scene]} />
      </>
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Fireplace', hidden: true })
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(toursApiMock.deleteHotspot).toHaveBeenCalledWith('hotspot-1');
    });
  });
});

describe('HotspotPanel position', () => {
  it('shows the position of the selected hotspot, or Not set when the server sent none', () => {
    const noPosition: Hotspot = { ...hotspot, id: 'hotspot-2', title: 'Unplaced', position: null };
    useTourEditorStore.getState().selectHotspot('hotspot-2');

    render(<HotspotPanel sceneId="scene-1" hotspots={[hotspot, noPosition]} scenes={[scene]} />);

    expect(screen.getByText(/Not set/)).toBeInTheDocument();
    useTourEditorStore.getState().selectHotspot(null);
  });
});
