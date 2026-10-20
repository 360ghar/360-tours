/**
 * Embed Code Generator Utility
 * Generates iframe and JavaScript embed codes for tours
 */

import { API_BASE_URL } from '@/constants';
import { escapeHtml } from './escapeHtml';

// Not exposed here (internal tooling only): `editmode=1` turns the embed into an
// editor surface — panorama clicks are posted to the parent window as
// `{ type: 'panoramaClick', tourId, data: { yaw, pitch, sceneId } }` (degrees).
// See docs/features/player-embed.md and src/types/embedMessages.ts.
export interface EmbedOptions {
  width?: number | string;
  height?: number | string;
  autoplay?: boolean;
  showNavbar?: boolean;
  minimal?: boolean;
  autoHideControls?: boolean;
  enableFullscreen?: boolean;
  enableVR?: boolean;
  startSceneId?: string;
  autoRotate?: boolean;
  branding?: boolean;
}

const DEFAULT_OPTIONS: Required<EmbedOptions> = {
  width: '100%',
  height: 500,
  autoplay: true,
  showNavbar: true,
  minimal: false,
  autoHideControls: false,
  enableFullscreen: true,
  enableVR: true,
  startSceneId: '',
  autoRotate: false,
  branding: true,
};

// Security contract: public/embed.js mirrors these literal values because it
// cannot import this TypeScript module. Update both files together.
export const EMBED_IFRAME_ALLOW = 'fullscreen; xr-spatial-tracking; accelerometer; gyroscope';
export const EMBED_IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-forms';
export const EMBED_IFRAME_REFERRER_POLICY = 'strict-origin-when-cross-origin';

/**
 * Get the base URL for embedding
 */
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  // Fallback for SSR or tests
  return import.meta.env.VITE_APP_URL || 'https://tours.360ghar.com';
}

function getBackendBaseUrl(): string | null {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    if (typeof window !== 'undefined') {
      try {
        return new URL(API_BASE_URL, window.location.origin).origin;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Build query parameters from options
 */
function buildQueryParams(options: EmbedOptions): string {
  const params = new URLSearchParams();

  if (options.startSceneId) {
    params.set('scene', options.startSceneId);
  }

  if (options.autoplay !== undefined) {
    params.set('autoplay', options.autoplay ? 'true' : 'false');
  }
  if (options.showNavbar !== undefined) {
    params.set('navbar', options.showNavbar ? 'true' : 'false');
  }
  if (options.minimal !== undefined) {
    params.set('minimal', options.minimal ? 'true' : 'false');
  }
  if (options.autoHideControls !== undefined) {
    params.set('autohide', options.autoHideControls ? 'true' : 'false');
  }
  if (options.enableFullscreen !== undefined) {
    params.set('fullscreen', options.enableFullscreen ? 'true' : 'false');
  }
  if (options.enableVR !== undefined) {
    params.set('vr', options.enableVR ? 'true' : 'false');
  }
  if (options.autoRotate !== undefined) {
    params.set('rotate', options.autoRotate ? 'true' : 'false');
  }
  if (options.branding !== undefined) {
    params.set('branding', options.branding ? 'true' : 'false');
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Format dimension value (number to px, string as-is)
 */
function formatDimension(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * Generate the embed URL for a tour
 */
export function generateEmbedUrl(tourId: string, options: EmbedOptions = {}): string {
  const baseUrl = getBaseUrl();
  const queryParams = buildQueryParams(options);
  // URL-encode the tour id so it can never inject path/query content; a no-op
  // for the server-minted UUIDs the golden-fixture parity tests use.
  return `${baseUrl}/embed/${encodeURIComponent(tourId)}${queryParams}`;
}

/**
 * Generate an iframe embed code
 */
export function generateIframeCode(tourId: string, options: EmbedOptions = {}): string {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const embedUrl = generateEmbedUrl(tourId, mergedOptions);
  const width = formatDimension(mergedOptions.width);
  const height = formatDimension(mergedOptions.height);

  return `<iframe
  src="${embedUrl}"
  width="${escapeHtml(width)}"
  height="${escapeHtml(height)}"
  frameborder="0"
  allow="${EMBED_IFRAME_ALLOW}"
  allowfullscreen
  loading="lazy"
  sandbox="${EMBED_IFRAME_SANDBOX}"
  referrerpolicy="${EMBED_IFRAME_REFERRER_POLICY}"
  style="border: none; border-radius: 8px;"
></iframe>`;
}

/**
 * Generate a JavaScript SDK embed code
 */
export function generateJsCode(tourId: string, options: EmbedOptions = {}): string {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const configJson = JSON.stringify(
    {
      tourId,
      width: mergedOptions.width,
      height: mergedOptions.height,
      autoplay: mergedOptions.autoplay,
      navbar: mergedOptions.showNavbar,
      minimal: mergedOptions.minimal,
      autohide: mergedOptions.autoHideControls,
      fullscreen: mergedOptions.enableFullscreen,
      vr: mergedOptions.enableVR,
      startScene: mergedOptions.startSceneId || undefined,
      autoRotate: mergedOptions.autoRotate,
      branding: mergedOptions.branding,
    },
    null,
    2
  );

  // JSON inside an inline <script> must not be able to close it: an id (or a
  // start-scene id) containing `</script>` would otherwise end the block and
  // inject markup into the customer's page. `<` keeps the JSON valid and
  // parses back to the same string.
  const inlineConfigJson = configJson.replace(/</g, '\\u003c');

  return `<!-- 360 Viewer Embed -->
<div id="viewer-${escapeHtml(tourId)}"></div>
<script src="${getBaseUrl()}/embed.js"></script>
<script>
  Viewer360.create('#viewer-${escapeHtml(tourId)}', ${inlineConfigJson});
</script>`;
}

/**
 * Generate a responsive embed code
 */
export function generateResponsiveCode(tourId: string, options: EmbedOptions = {}): string {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const embedUrl = generateEmbedUrl(tourId, mergedOptions);

  return `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; border-radius: 8px;">
  <iframe
    src="${embedUrl}"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
    allow="${EMBED_IFRAME_ALLOW}"
    allowfullscreen
    loading="lazy"
    sandbox="${EMBED_IFRAME_SANDBOX}"
    referrerpolicy="${EMBED_IFRAME_REFERRER_POLICY}"
  ></iframe>
</div>`;
}

/**
 * Generate shareable link for a tour
 */
export function generateShareUrl(tourId: string, options: EmbedOptions = {}): string {
  const baseUrl = getBaseUrl();
  const queryParams = buildQueryParams(options);
  // Encode the id for the same reason generateEmbedUrl does — a no-op for the
  // server-minted UUIDs, but it can never inject path or query content.
  const viewerUrl = `${baseUrl}/view/${encodeURIComponent(tourId)}${queryParams}`;

  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) return viewerUrl;

  const shareUrl = new URL(`/share/tours/${encodeURIComponent(tourId)}`, backendBaseUrl);
  shareUrl.searchParams.set('redirect', viewerUrl);
  return shareUrl.toString();
}

/**
 * Generate social sharing links
 */
export interface SocialShareLinks {
  facebook: string;
  twitter: string;
  linkedin: string;
  whatsapp: string;
  email: string;
}

export function generateSocialShareLinks(
  tourId: string,
  title: string,
  description?: string
): SocialShareLinks {
  const shareUrl = encodeURIComponent(generateShareUrl(tourId));
  const shareTitle = encodeURIComponent(title);
  const shareDescription = encodeURIComponent(
    description || `Check out this virtual tour: ${title}`
  );

  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`,
    twitter: `https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`,
    whatsapp: `https://wa.me/?text=${shareTitle}%20${shareUrl}`,
    email: `mailto:?subject=${shareTitle}&body=${shareDescription}%0A%0A${shareUrl}`,
  };
}

/**
 * Copy text to clipboard — delegates to the centralized utility.
 */
export { copyToClipboard } from './copyToClipboard';
