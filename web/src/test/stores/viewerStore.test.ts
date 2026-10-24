import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { getViewerSceneScope, useViewerStore } from '@/stores/viewerStore';

// Mock the @/api module used by usePublicTourTracking
const mockTrackEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('@/api', () => ({
  toursApi: {
    trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  },
}));

// Mock @/constants to provide API_BASE_URL
vi.mock('@/constants', () => ({
  API_BASE_URL: 'http://localhost:3600/api/v1',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_PUBLISHABLE_KEY: 'test-key',
}));

// Mock @/lib/supabaseAuth so usePublicTourTracking's unload beacon can read a
// session synchronously without initialising a real Supabase client.
vi.mock('@/lib/supabaseAuth', () => ({
  supabaseAuth: {
    getSession: () => null,
  },
}));

// ─── viewerStore ────────────────────────────────────────────────────────────────

describe('viewerStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useViewerStore.setState({ currentSceneIdsByScope: {} });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with no scoped scene selections', () => {
      const state = useViewerStore.getState();
      expect(state.currentSceneIdsByScope).toEqual({});
    });
  });

  describe('setCurrentSceneForScope', () => {
    it('keeps public and embed scene selections isolated for the same tour', () => {
      const publicScope = getViewerSceneScope('public', 'tour-1');
      const embedScope = getViewerSceneScope('embed', 'tour-1');

      useViewerStore.getState().setCurrentSceneForScope(publicScope, 'scene-public');
      useViewerStore.getState().setCurrentSceneForScope(embedScope, 'scene-embed');

      expect(useViewerStore.getState().currentSceneIdsByScope[publicScope]).toBe(
        'scene-public'
      );
      expect(useViewerStore.getState().currentSceneIdsByScope[embedScope]).toBe('scene-embed');
    });

    it('clears only the requested scoped scene selection', () => {
      const publicScope = getViewerSceneScope('public', 'tour-1');
      const embedScope = getViewerSceneScope('embed', 'tour-1');

      useViewerStore.getState().setCurrentSceneForScope(publicScope, 'scene-public');
      useViewerStore.getState().setCurrentSceneForScope(embedScope, 'scene-embed');
      useViewerStore.getState().clearCurrentSceneScope(publicScope);

      expect(useViewerStore.getState().currentSceneIdsByScope[publicScope]).toBeUndefined();
      expect(useViewerStore.getState().currentSceneIdsByScope[embedScope]).toBe('scene-embed');
    });
  });
});

// ─── usePublicTourTracking ──────────────────────────────────────────────────────

// Import after mocks are defined
import { usePublicTourTracking } from '@/hooks/usePublicTourTracking';

describe('usePublicTourTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    // Mock navigator.sendBeacon
    Object.defineProperty(navigator, 'sendBeacon', {
      value: vi.fn(() => true),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a sessionId and trackEvent function', () => {
    const { result } = renderHook(() =>
      usePublicTourTracking({
        tourId: 'tour-1',
        tourLoaded: false,
        currentSceneId: undefined,
      })
    );

    expect(result.current.sessionId).toBeDefined();
    expect(typeof result.current.sessionId).toBe('string');
    expect(result.current.sessionId.length).toBeGreaterThan(0);
    expect(typeof result.current.trackEvent).toBe('function');
  });

  it('returns a sessionId when browser session storage is unavailable', () => {
    vi.mocked(sessionStorage.getItem).mockImplementationOnce(() => {
      throw new Error('storage blocked');
    });

    const { result } = renderHook(() =>
      usePublicTourTracking({
        tourId: 'tour-1',
        tourLoaded: false,
        currentSceneId: undefined,
      })
    );

    expect(result.current.sessionId).toBeDefined();
    expect(result.current.sessionId.length).toBeGreaterThan(0);
  });

  it('trackEvent fires a POST request via toursApi.trackEvent', async () => {
    const { result } = renderHook(() =>
      usePublicTourTracking({
        tourId: 'tour-1',
        tourLoaded: false,
        currentSceneId: undefined,
      })
    );

    await act(async () => {
      await result.current.trackEvent('hotspot_click', 'scene-1', 'hotspot-1');
    });

    expect(mockTrackEvent).toHaveBeenCalledWith('tour-1', {
      event_type: 'hotspot_click',
      scene_id: 'scene-1',
      hotspot_id: 'hotspot-1',
      session_id: result.current.sessionId,
    });
  });

  it('sends session_start once when tourLoaded becomes true and never sends tour_view', async () => {
    const { rerender } = renderHook(props => usePublicTourTracking(props), {
      initialProps: {
        tourId: 'tour-1',
        tourLoaded: false,
        currentSceneId: undefined,
      },
    });
    const eventTypes = () =>
      mockTrackEvent.mock.calls.map(
        (call: unknown[]) => (call[1] as { event_type?: string }).event_type
      );

    // Nothing is tracked while the tour is still loading.
    expect(eventTypes()).toEqual([]);

    await act(async () => {
      rerender({ tourId: 'tour-1', tourLoaded: true, currentSceneId: undefined });
    });
    // Same props again: no second session_start.
    await act(async () => {
      rerender({ tourId: 'tour-1', tourLoaded: true, currentSceneId: undefined });
    });

    // A page view is not an event: the server counts it on GET /public/tours/{id}.
    expect(eventTypes()).toEqual(['session_start']);
  });

  it('does not track events when tourId is undefined', async () => {
    const { result } = renderHook(() =>
      usePublicTourTracking({
        tourId: undefined,
        tourLoaded: true,
        currentSceneId: undefined,
      })
    );

    await act(async () => {
      await result.current.trackEvent('share');
    });

    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('tracks scene_view when currentSceneId changes', async () => {
    const { rerender } = renderHook(props => usePublicTourTracking(props), {
      initialProps: {
        tourId: 'tour-1',
        tourLoaded: true,
        currentSceneId: undefined as string | undefined,
      },
    });

    // Clear calls from initial mount (session_start, tour_view)
    mockTrackEvent.mockClear();

    await act(async () => {
      rerender({
        tourId: 'tour-1',
        tourLoaded: true,
        currentSceneId: 'scene-42',
      });
    });

    const sceneViewCalls = mockTrackEvent.mock.calls.filter(
      (call: unknown[]) =>
        (call[1] as { event_type?: string } | undefined)?.event_type === 'scene_view'
    );
    expect(sceneViewCalls.length).toBe(1);
    // The server requires numeric yaw and pitch on a scene_view (the heatmap reads them).
    expect(sceneViewCalls[0][1]).toMatchObject({
      event_type: 'scene_view',
      scene_id: 'scene-42',
      event_data: { yaw: 0, pitch: 0 },
    });
  });

  it('sends the scene initial view as the yaw and pitch of a scene_view', async () => {
    renderHook(() =>
      usePublicTourTracking({
        tourId: 'tour-1',
        tourLoaded: true,
        currentSceneId: 'scene-7',
        currentSceneView: { yaw: 45, pitch: -10 },
      })
    );

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'tour-1',
        expect.objectContaining({
          event_type: 'scene_view',
          scene_id: 'scene-7',
          event_data: { yaw: 45, pitch: -10 },
        })
      );
    });
  });

  it('persists sessionId across re-renders', () => {
    const { result, rerender } = renderHook(props => usePublicTourTracking(props), {
      initialProps: {
        tourId: 'tour-1',
        tourLoaded: false,
        currentSceneId: undefined,
      },
    });

    const firstSessionId = result.current.sessionId;

    rerender({
      tourId: 'tour-1',
      tourLoaded: true,
      currentSceneId: undefined,
    });

    expect(result.current.sessionId).toBe(firstSessionId);
  });

  it('sends session duration via keepalive fetch on unmount and ignores failures', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { unmount } = renderHook(() =>
      usePublicTourTracking({
        tourId: 'tour-1',
        tourLoaded: true,
        currentSceneId: undefined,
      })
    );

    unmount();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3600/api/v1/public/tours/tour-1/events',
        expect.objectContaining({
          method: 'POST',
          keepalive: true,
          body: expect.stringContaining('"session_duration"'),
        })
      );
    });
  });
});
