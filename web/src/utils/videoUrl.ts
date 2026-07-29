/**
 * Shared video URL parsing utility.
 * Extracts YouTube and Vimeo video IDs from various URL formats.
 * Used by both HotspotEditorModal (save) and HotspotContentModal (display).
 */

export interface VideoUrlParseResult {
  youtubeId?: string;
  vimeoId?: string;
  url?: string;
}

/**
 * Parse a video URL and extract the platform-specific video ID.
 *
 * Supported YouTube formats:
 * - https://youtu.be/{id}
 * - https://www.youtube.com/watch?v={id}
 * - https://www.youtube.com/embed/{id}
 * - https://www.youtube.com/shorts/{id}
 *
 * Supported Vimeo formats:
 * - https://vimeo.com/{id}
 * - https://www.vimeo.com/{id}
 * - https://player.vimeo.com/video/{id}
 *
 * @param value - The video URL string to parse
 * @returns Object with youtubeId, vimeoId, or the original url if not a recognized platform
 */
export function parseVideoUrl(value: string): VideoUrlParseResult {
  const trimmed = value.trim();
  if (!trimmed) return {};

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    // YouTube
    if (hostname === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '');
      return id ? { youtubeId: id } : {};
    }

    if (hostname.endsWith('youtube.com')) {
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v') || '';
        return id ? { youtubeId: id } : {};
      }

      const match = parsed.pathname.match(/^\/(embed|shorts)\/([^/]+)/);
      if (match?.[2]) {
        return { youtubeId: match[2] };
      }
    }

    // Vimeo
    if (hostname.endsWith('vimeo.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'video' && parts[1] && /^\d+$/.test(parts[1])) {
        return { vimeoId: parts[1] };
      }
      if (parts[0] && /^\d+$/.test(parts[0])) {
        return { vimeoId: parts[0] };
      }
    }

    return { url: trimmed };
  } catch {
    return { url: trimmed };
  }
}

/**
 * Build an embed URL from a parsed video URL result.
 * Returns the appropriate embed URL for YouTube or Vimeo, or the original URL.
 */
export function buildVideoEmbedUrl(
  parsed: VideoUrlParseResult,
  options: { autoplay?: boolean } = {}
): string {
  const autoplayParam = options.autoplay ? 1 : 0;

  if (parsed.youtubeId) {
    return `https://www.youtube.com/embed/${parsed.youtubeId}?autoplay=${autoplayParam}&rel=0`;
  }

  if (parsed.vimeoId) {
    return `https://player.vimeo.com/video/${parsed.vimeoId}?autoplay=${autoplayParam}`;
  }

  return parsed.url || '';
}
