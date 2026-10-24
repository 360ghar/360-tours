import { API_LIMITS } from '@/lib/api/limits.gen';
import type { HotspotType } from '@/types';

const HTTP_PROTOCOLS = ['http:', 'https:'];
/** Schemes the backend accepts for a link hotspot URL (`ALLOWED_LINK_SCHEMES`). */
export const SAFE_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

export function isHttpUrl(value: string): boolean {
  if (!value.trim()) return false;

  try {
    const url = new URL(value);
    return HTTP_PROTOCOLS.includes(url.protocol);
  } catch {
    return false;
  }
}

export function isSafeLinkUrl(value: string): boolean {
  if (!value.trim()) return false;

  try {
    const url = new URL(value);
    return SAFE_LINK_PROTOCOLS.includes(url.protocol);
  } catch {
    return false;
  }
}

export function getHotspotValidationError({
  type,
  targetSceneId,
  hasAvailableTargetScene,
  title,
  description,
  audioUrl,
  videoUrl,
  linkUrl,
  customHtml,
}: {
  type: HotspotType;
  targetSceneId: string;
  hasAvailableTargetScene: boolean;
  title: string;
  description: string;
  audioUrl: string;
  videoUrl: string;
  linkUrl: string;
  customHtml: string;
}): string | null {
  const { hotspot: limits } = API_LIMITS;
  if (title.length > limits.titleMax) {
    return `The title can have at most ${limits.titleMax} characters.`;
  }
  if (description.length > limits.descriptionMax) {
    return `The description can have at most ${limits.descriptionMax} characters.`;
  }

  if (type === 'navigation') {
    if (!hasAvailableTargetScene) return 'Add another scene before creating a navigation hotspot.';
    if (!targetSceneId) return 'Select a target scene for this navigation hotspot.';
  }

  if (type === 'info' && !title.trim() && !description.trim()) {
    return 'Add a title or description for this info hotspot.';
  }

  if (type === 'audio' && !isHttpUrl(audioUrl)) {
    return 'Enter a valid audio URL that starts with http:// or https://.';
  }
  if (type === 'audio' && audioUrl.length > limits.mediaUrlMax) {
    return `The audio URL can have at most ${limits.mediaUrlMax} characters.`;
  }

  if (type === 'video' && !isHttpUrl(videoUrl)) {
    return 'Enter a valid video URL that starts with http:// or https://.';
  }
  if (type === 'video' && videoUrl.length > limits.mediaUrlMax) {
    return `The video URL can have at most ${limits.mediaUrlMax} characters.`;
  }

  if (type === 'link' && !isSafeLinkUrl(linkUrl)) {
    return 'Enter a valid link URL using http, https, mailto, or tel.';
  }
  if (type === 'link' && linkUrl.length > limits.linkUrlMax) {
    return `The link URL can have at most ${limits.linkUrlMax} characters.`;
  }

  if (type === 'custom' && !customHtml.trim()) {
    return 'Add custom HTML before saving this hotspot.';
  }
  if (type === 'custom' && customHtml.length > limits.customHtmlMax) {
    return `The custom HTML can have at most ${limits.customHtmlMax} characters.`;
  }

  return null;
}
