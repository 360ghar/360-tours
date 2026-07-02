import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import type { Scene } from '@/types';

// --- Photo Sphere Viewer mocks -------------------------------------------
// The real viewer needs WebGL/canvas; mock the minimum surface the component
// touches so we can assert on construct/destroy lifecycle.

const psv = vi.hoisted(() => {
  const constructorSpy = vi.fn();
  const destroySpy = vi.fn();
  const addEventListenerSpy = vi.fn();
  const instances: Array<{
    setPanorama: ReturnType<typeof vi.fn>;
  }> = [];

  const createPluginMock = () => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    clearMarkers: vi.fn(),
    addMarker: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  });

  class MockViewer {
    constructor(options: unknown) {
      constructorSpy(options);
      instances.push(this);
    }
    addEventListener = addEventListenerSpy;
    removeEventListener = vi.fn();
    destroy = destroySpy;
    getPlugin = vi.fn(() => createPluginMock());
    setPanorama = vi.fn().mockResolvedValue(undefined);
    getPosition = vi.fn(() => ({ yaw: 0, pitch: 0 }));
    rotate = vi.fn();
  }

  return { constructorSpy, destroySpy, addEventListenerSpy, instances, MockViewer };
});

vi.mock('@photo-sphere-viewer/core', () => ({
  Viewer: psv.MockViewer,
}));
vi.mock('@photo-sphere-viewer/core/index.css', () => ({}));
vi.mock('@photo-sphere-viewer/markers-plugin', () => ({
  MarkersPlugin: class MarkersPlugin {},
}));
vi.mock('@photo-sphere-viewer/markers-plugin/index.css', () => ({}));
vi.mock('@photo-sphere-viewer/gyroscope-plugin', () => ({
  GyroscopePlugin: class GyroscopePlugin {},
}));
vi.mock('@photo-sphere-viewer/stereo-plugin', () => ({
  StereoPlugin: class StereoPlugin {},
}));

import { PanoramaViewer } from '@/components/features/PanoramaViewer';

const createScene = (overrides?: Partial<Scene>): Scene => ({
  id: 'scene-1',
  tour_id: 'tour-1',
  title: 'Test Scene',
  description: null,
  image_url: 'https://example.com/scene-1.jpg',
  thumbnail_url: null,
  vr_url: null,
  order_index: 0,
  metadata: undefined,
  is_processed: true,
  processing_error: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

async function waitForViewerInit() {
  await act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });
}

describe('PanoramaViewer viewer lifecycle stability', () => {
  beforeEach(() => {
    psv.constructorSpy.mockClear();
    psv.destroySpy.mockClear();
    psv.addEventListenerSpy.mockClear();
    psv.instances.length = 0;
  });

  it('does not destroy/recreate the viewer when callback or scene changes', async () => {
    const sceneA = createScene();
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    const { rerender } = render(
      <PanoramaViewer scene={sceneA} hotspots={[]} isEditor onPositionClick={fn1} />
    );
    await waitForViewerInit();

    expect(psv.constructorSpy).toHaveBeenCalledTimes(1);
    expect(psv.destroySpy).not.toHaveBeenCalled();

    // Changing only the onPositionClick callback must NOT rebuild the viewer
    // (it is read via a ref inside the component).
    rerender(<PanoramaViewer scene={sceneA} hotspots={[]} isEditor onPositionClick={fn2} />);

    expect(psv.destroySpy).not.toHaveBeenCalled();
    expect(psv.constructorSpy).toHaveBeenCalledTimes(1);

    // Scene changes are loaded through setPanorama instead of rebuilding the
    // viewer, which avoids aborting in-flight panorama loads.
    const sceneB = createScene({
      id: 'scene-2',
      image_url: 'https://example.com/scene-2.jpg',
    });
    rerender(<PanoramaViewer scene={sceneB} hotspots={[]} isEditor onPositionClick={fn2} />);

    expect(psv.destroySpy).not.toHaveBeenCalled();
    expect(psv.constructorSpy).toHaveBeenCalledTimes(1);

    const readyCall = psv.addEventListenerSpy.mock.calls.find(([event]) => event === 'ready');
    expect(readyCall).toBeDefined();

    await act(async () => {
      (readyCall![1] as () => void)();
      await Promise.resolve();
    });

    expect(psv.instances[0].setPanorama).toHaveBeenCalledWith(
      'https://example.com/scene-2.jpg',
      expect.objectContaining({ transition: true })
    );
  });

  it('invokes the latest onPositionClick callback without rebuilding the viewer', async () => {
    const sceneA = createScene();
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    const { rerender } = render(
      <PanoramaViewer scene={sceneA} hotspots={[]} isEditor onPositionClick={fn1} />
    );
    await waitForViewerInit();

    // Grab the editor click handler registered on the viewer.
    const clickCall = psv.addEventListenerSpy.mock.calls.find(([event]) => event === 'click');
    expect(clickCall).toBeDefined();
    const clickHandler = clickCall![1] as (e: { data: { yaw: number; pitch: number } }) => void;

    rerender(<PanoramaViewer scene={sceneA} hotspots={[]} isEditor onPositionClick={fn2} />);

    // The original viewer instance (and its click listener) is still alive;
    // it must dispatch to the NEW callback.
    clickHandler({ data: { yaw: 1, pitch: 0.5 } });

    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledWith({
      yaw: expect.any(Number),
      pitch: expect.any(Number),
    });
  });
});
