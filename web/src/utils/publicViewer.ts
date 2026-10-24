/**
 * Pure helpers shared by the public viewer routes (`/view/:id`, `/embed/:id`).
 * These lived as verbatim copies in PublicTourPage and EmbedTourPage — including
 * the protocol allowlist, which is exactly the kind of rule that must not be
 * able to drift between two surfaces that both render untrusted hotspot links.
 */

import type { PublicScene, TourSettings } from '@/types';

/** A view direction in degrees: yaw -180 to 180, pitch -90 to 90. */
export interface ViewDirection {
  yaw: number;
  pitch: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Where the viewer looks when a scene opens: the scene's initial view, then the
 * tour's, then straight ahead. The `scene_view` event carries it as yaw and pitch.
 */
export function sceneViewDirection(
  scene: Pick<PublicScene, 'scene_metadata'> | undefined,
  tourSettings: TourSettings | null | undefined
): ViewDirection {
  const view = scene?.scene_metadata?.initial_view ?? tourSettings?.initial_view;
  return {
    yaw: clamp(view?.yaw ?? 0, -180, 180),
    pitch: clamp(view?.pitch ?? 0, -90, 90),
  };
}

/** Protocols a hotspot link may open. Anything else (javascript:, data:, …) is refused. */
const HOTSPOT_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

/**
 * Open a link hotspot's URL. Returns false when the URL is unusable or its
 * protocol is not allowed, so the caller can fall back to the content modal.
 */
export function openHotspotLink(url: string, target: '_blank' | '_self'): boolean {
  try {
    const parsed = new URL(url, window.location.href);
    if (!HOTSPOT_LINK_PROTOCOLS.includes(parsed.protocol)) {
      return false;
    }

    const features = target === '_blank' ? 'noopener,noreferrer' : undefined;
    const openedWindow = window.open(parsed.href, target, features);
    if (target === '_blank' && openedWindow) {
      openedWindow.opener = null;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Watermark placement. The two surfaces use different insets — the embed sits
 * tighter and clears its own fullscreen button in the top-right.
 */
const WATERMARK_POSITIONS = {
  page: {
    'bottom-left': 'bottom-4 left-4',
    'top-left': 'top-20 left-4',
    'top-right': 'top-20 right-4',
    'bottom-right': 'bottom-4 right-4',
  },
  embed: {
    'bottom-left': 'bottom-2 left-2',
    'top-left': 'top-3 left-3',
    'top-right': 'top-3 right-12',
    'bottom-right': 'bottom-2 right-2',
  },
} as const;

export function watermarkPositionClass(
  position: string | undefined,
  variant: keyof typeof WATERMARK_POSITIONS
): string {
  const map = WATERMARK_POSITIONS[variant];
  return map[position as keyof typeof map] ?? map['bottom-right'];
}
