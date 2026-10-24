import { useCallback, useEffect, useRef, useState } from 'react';
import { toursApi } from '@/api';
import { API_BASE_URL } from '@/constants';
import type { TourEventPayload, ViewerEventType } from '@/types';
import type { ViewDirection } from '@/utils/publicViewer';

// Generate a session ID for analytics tracking
function getSessionId(): string {
  const fallbackSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    let sessionId = sessionStorage.getItem('tour_session_id');
    if (!sessionId) {
      sessionId = fallbackSessionId;
      sessionStorage.setItem('tour_session_id', sessionId);
    }
    return sessionId;
  } catch {
    // Storage can be blocked in private/embedded contexts; tracking must not
    // prevent the tour from loading.
    return fallbackSessionId;
  }
}

interface UsePublicTourTrackingOptions {
  tourId: string | undefined;
  /** Pass a truthy value once the tour data has loaded to trigger initial tracking */
  tourLoaded: boolean;
  currentSceneId: string | undefined;
  /**
   * Where the viewer looks when the current scene opens (the scene's initial
   * view). A `scene_view` event must carry numeric yaw and pitch; the server
   * builds the heatmap from them. Defaults to 0, 0.
   */
  currentSceneView?: ViewDirection;
}

/**
 * Shared analytics tracking hook for PublicTourPage and EmbedTourPage.
 *
 * Handles:
 * - Session ID generation
 * - session_start / session_duration (with a keepalive request on unmount)
 * - scene_view tracking on scene change, with numeric yaw and pitch
 *
 * A page view is not an event: the server counts it when the tour is fetched
 * (`GET /public/tours/{id}`, once per viewer per 30 minutes).
 *
 * Returns a `trackEvent` function for ad-hoc events (hotspot_click, fullscreen, etc.)
 * and the current `sessionId`.
 */
export function usePublicTourTracking({
  tourId,
  tourLoaded,
  currentSceneId,
  currentSceneView,
}: UsePublicTourTrackingOptions) {
  const [sessionId] = useState(getSessionId);
  const sessionIdRef = useRef<string>(sessionId);
  const sessionStartedAtRef = useRef<number | null>(null);
  const sceneYaw = currentSceneView?.yaw ?? 0;
  const scenePitch = currentSceneView?.pitch ?? 0;

  const trackEvent = useCallback(
    async (
      eventType: ViewerEventType,
      sceneId?: string,
      hotspotId?: string,
      eventData?: Record<string, unknown>
    ) => {
      if (!tourId) return;
      const event: TourEventPayload = {
        event_type: eventType,
        session_id: sessionIdRef.current,
        ...(sceneId ? { scene_id: sceneId } : {}),
        ...(hotspotId ? { hotspot_id: hotspotId } : {}),
        ...(eventData ? { event_data: eventData } : {}),
      };
      try {
        await toursApi.trackEvent(tourId, event);
      } catch (error) {
        // Silently fail analytics tracking
        console.debug('Analytics tracking failed:', error);
      }
    },
    [tourId]
  );

  // Session start + duration (sendBeacon on unmount)
  useEffect(() => {
    if (!tourLoaded || !tourId) return;

    const sessionId = sessionIdRef.current;
    sessionStartedAtRef.current = Date.now();
    trackEvent('session_start');

    return () => {
      const startedAt = sessionStartedAtRef.current;
      if (!startedAt) return;

      const durationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      const url = `${API_BASE_URL}/public/tours/${tourId}/events`;

      const payload: TourEventPayload = {
        event_type: 'session_duration',
        session_id: sessionId,
        event_data: { duration_seconds: durationSeconds },
      };

      // `/public/*` is anonymous by contract — api/client.ts strips the Bearer
      // token from these requests for exactly this reason (a stale session on a
      // public tour must not be able to trigger the 401 sign-out cascade). The
      // unload beacon has to honour the same contract, so it sends no token.
      // fetch+keepalive is preferred only because sendBeacon has no error path.
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      try {
        if (typeof Request !== 'undefined' && 'keepalive' in Request.prototype) {
          void fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(() => {
            // Ignore analytics failures during unload.
          });
        } else if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
        }
      } catch {
        // Ignore send failures during unload
      }
    };
  }, [tourId, tourLoaded, trackEvent]);

  // Track scene views. The server requires numeric yaw and pitch on a scene_view.
  useEffect(() => {
    if (tourLoaded && tourId && currentSceneId) {
      trackEvent('scene_view', currentSceneId, undefined, { yaw: sceneYaw, pitch: scenePitch });
    }
  }, [currentSceneId, sceneYaw, scenePitch, tourId, tourLoaded, trackEvent]);

  return {
    trackEvent,
    sessionId,
  };
}
