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
    useViewerStore.setState({ currentSceneId: null, currentSceneIdsByScope: {} });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has currentSceneId set to null', () => {
      const state = useViewerStore.getState();
      expect(state.currentSceneId).toBeNull();
      expect(state.currentSceneIdsByScope).toEqual({});
    });
  });

  describe('setCurrentScene', () => {
    it('sets the scene ID', () => {
      useViewerStore.getState().setCurrentScene('scene-123');
      expect(useViewerStore.getState().currentSceneId).toBe('scene-123');
    });

    it('can change the scene ID to a different value', () => {
      useViewerStore.getState().setCurrentScene('scene-1');
      useViewerStore.getState().setCurrentScene('scene-2');
      expect(useViewerStore.getState().currentSceneId).toBe('scene-2');
    });

    it('can set the scene ID to null', () => {
      useViewerStore.getState().setCurrentScene('scene-1');
      useViewerStore.getState().setCurrentScene(null);
      expect(useViewerStore.getState().currentSceneId).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears currentSceneId back to null', () => {
      useViewerStore.getState().setCurrentScene('scene-abc');
      expect(useViewerStore.getState().currentSceneId).toBe('scene-abc');

      useViewerStore.getState().reset();
      expect(useViewerStore.getState().currentSceneId).toBeNull();
      expect(useViewerStore.getState().currentSceneIdsByScope).toEqual({});
    });

    it('is idempotent when state is already initial', () => {
      useViewerStore.getState().reset();
      expect(useViewerStore.getState().currentSceneId).toBeNull();
      expect(useViewerStore.getState().currentSceneIdsByScope).toEqual({});
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
      event_data: undefined,
    });
  });

  it('tracks tour_view only once when tourLoaded becomes true', async () => {
    const { rerender } = renderHook(props => usePublicTourTracking(props), {
      initialProps: {
        tourId: 'tour-1',
        tourLoaded: false,
        currentSceneId: undefined,
      },
    });

    // No tour_view tracked yet because tourLoaded is false
    // The session_start is also not tracked yet
    const tourViewCalls = mockTrackEvent.mock.calls.filter(
      (call: unknown[]) =>
        (call[1] as { event_type?: string } | undefined)?.event_type === 'tour_view'
    );
    expect(tourViewCalls.length).toBe(0);

    // Set tourLoaded to true
    await act(async () => {
      rerender({
        tourId: 'tour-1',
        tourLoaded: true,
        currentSceneId: undefined,
      });
    });

    const tourViewCallsAfter = mockTrackEvent.mock.calls.filter(
      (call: unknown[]) =>
        (call[1] as { event_type?: string } | undefined)?.event_type === 'tour_view'
    );
    expect(tourViewCallsAfter.length).toBe(1);

    // Re-render again with same props - should NOT fire tour_view again
    await act(async () => {
      rerender({
        tourId: 'tour-1',
        tourLoaded: true,
        currentSceneId: undefined,
      });
    });

    const tourViewCallsFinal = mockTrackEvent.mock.calls.filter(
      (call: unknown[]) =>
        (call[1] as { event_type?: string } | undefined)?.event_type === 'tour_view'
    );
    expect(tourViewCallsFinal.length).toBe(1);
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
      await result.current.trackEvent('some_event');
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
    expect(sceneViewCalls[0][1]).toMatchObject({
      event_type: 'scene_view',
      scene_id: 'scene-42',
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
