import { useCallback, useEffect, useRef, useState } from 'react';
import { toursApi } from '@/api';
import { API_BASE_URL } from '@/constants';
import { supabaseAuth } from '@/lib/supabaseAuth';

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
}

/**
 * Shared analytics tracking hook for PublicTourPage and EmbedTourPage.
 *
 * Handles:
 * - Session ID generation
 * - tour_view tracking (once per mount)
 * - session_start / session_duration (with sendBeacon on unmount)
 * - scene_view tracking on scene change
 *
 * Returns a `trackEvent` function for ad-hoc events (hotspot_click, fullscreen, etc.)
 * and the current `sessionId`.
 */
export function usePublicTourTracking({
  tourId,
  tourLoaded,
  currentSceneId,
}: UsePublicTourTrackingOptions) {
  const [sessionId] = useState(getSessionId);
  const sessionIdRef = useRef<string>(sessionId);
  const sessionStartedAtRef = useRef<number | null>(null);
  const hasTrackedViewRef = useRef(false);

  const trackEvent = useCallback(
    async (
      eventType: string,
      sceneId?: string,
      hotspotId?: string,
      eventData?: Record<string, unknown>
    ) => {
      if (!tourId) return;
      try {
        await toursApi.trackEvent(tourId, {
          event_type: eventType,
          scene_id: sceneId,
          hotspot_id: hotspotId,
          session_id: sessionIdRef.current,
          event_data: eventData,
        });
      } catch (error) {
        // Silently fail analytics tracking
        console.debug('Analytics tracking failed:', error);
      }
    },
    [tourId]
  );

  // Track tour_view once
  useEffect(() => {
    if (!tourLoaded || !tourId || hasTrackedViewRef.current) return;
    hasTrackedViewRef.current = true;
    trackEvent('tour_view');
  }, [tourId, tourLoaded, trackEvent]);

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

      const payload = {
        event_type: 'session_duration',
        session_id: sessionId,
        event_data: { duration_seconds: durationSeconds },
      };

      // sendBeacon cannot set custom headers; prefer fetch with keepalive
      // (the modern equivalent that supports Authorization) and fall back to
      // sendBeacon only when keepalive is unsupported.
      const accessToken = supabaseAuth.getSession()?.access_token ?? null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

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
          // Legacy fallback: no Authorization header possible.
          const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
        }
      } catch {
        // Ignore send failures during unload
      }
    };
  }, [tourId, tourLoaded, trackEvent]);

  // Track scene views
  useEffect(() => {
    if (tourLoaded && tourId && currentSceneId) {
      trackEvent('scene_view', currentSceneId);
    }
  }, [currentSceneId, tourId, tourLoaded, trackEvent]);

  return {
    trackEvent,
    sessionId,
  };
}
