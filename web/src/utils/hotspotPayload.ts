/**
 * Request bodies for hotspot create and update, built from the editor form.
 *
 * Rules from the backend contract:
 * - `content` holds exactly the keys of the hotspot type (no `kind`, no aliases).
 * - PATCH sets only the keys it sends; an explicit `null` clears a nullable field
 *   (`title`, `description`, `target_scene_id`, `content`, ...). An omitted key
 *   keeps the stored value, so a cleared input must be sent as `null`.
 * - `position`, `type` and `icon_size` are never null.
 * - Video content carries exactly one of `youtube_id`, `vimeo_id`, `video_url`.
 */
import { API_LIMITS } from '@/lib/api/limits.gen';
import { parseVideoUrl } from '@/utils/videoUrl';
import {
  parseAudioHotspotContent,
  parseCustomHotspotContent,
  parseInfoHotspotContent,
  parseLinkHotspotContent,
  parseVideoHotspotFields,
} from '@/types/hotspotContent';
import type {
  HotspotContent,
  HotspotCreateInput,
  HotspotPosition,
  HotspotType,
  HotspotUpdateInput,
} from '@/types';

export interface HotspotFormValues {
  type: HotspotType;
  title: string;
  description: string;
  targetSceneId: string;
  position: Pick<HotspotPosition, 'yaw' | 'pitch'>;
  iconName: string;
  iconColor: string;
  iconSize: number;
  audioUrl: string;
  videoUrl: string;
  linkUrl: string;
  linkNewTab: boolean;
  customHtml: string;
}

function hasKeys(value: object): boolean {
  return Object.keys(value).length > 0;
}

/** A copy of `value` without `keys`; null reads as an empty object. */
function without<T extends object, K extends keyof T>(value: T | null, keys: K[]): Omit<T, K> {
  const copy: Partial<T> = { ...value };
  keys.forEach(key => delete copy[key]);
  return { ...copy } as Omit<T, K>;
}

/**
 * Content for the form values, or null when the hotspot has none. `stored` is
 * the content of the hotspot being edited when its type is unchanged: the keys
 * the form does not edit (autoplay, poster_url, label, html of an info hotspot,
 * ...) are carried over instead of being erased by the replace.
 */
export function buildHotspotContent(
  values: HotspotFormValues,
  stored: unknown
): HotspotContent | null {
  switch (values.type) {
    case 'navigation':
      // The label is the hotspot title; navigation content is empty.
      return null;

    case 'info': {
      const kept = without(parseInfoHotspotContent(stored), ['text']);
      const text = values.description.trim();
      const content = { ...kept, ...(text ? { text } : {}) };
      return hasKeys(content) ? content : null;
    }

    case 'audio': {
      const url = values.audioUrl.trim();
      if (!url) return null;
      const kept = without(parseAudioHotspotContent(stored), ['audio_url']);
      return { ...kept, audio_url: url };
    }

    case 'video': {
      const raw = values.videoUrl.trim();
      if (!raw) return null;
      const kept = without(parseVideoHotspotFields(stored), [
        'youtube_id',
        'vimeo_id',
        'video_url',
      ]);
      const parsed = parseVideoUrl(raw);
      if (parsed.youtubeId) return { ...kept, youtube_id: parsed.youtubeId };
      if (parsed.vimeoId) return { ...kept, vimeo_id: parsed.vimeoId };
      return { ...kept, video_url: parsed.url || raw };
    }

    case 'link': {
      const url = values.linkUrl.trim();
      if (!url) return null;
      const kept = without(parseLinkHotspotContent(stored), ['url', 'target']);
      return { ...kept, url, target: values.linkNewTab ? '_blank' : '_self' };
    }

    case 'custom': {
      const html = values.customHtml.trim();
      if (!html) return null;
      const kept = without(parseCustomHotspotContent(stored), ['html']);
      return { ...kept, html };
    }
  }
}

function clampPosition(position: Pick<HotspotPosition, 'yaw' | 'pitch'>) {
  // Keep manual entry inside the panorama's coordinate space (the server rejects the rest).
  return {
    yaw: Math.max(-180, Math.min(180, Number(position.yaw) || 0)),
    pitch: Math.max(-90, Math.min(90, Number(position.pitch) || 0)),
  };
}

function clampIconSize(size: number): number {
  return Math.max(
    API_LIMITS.hotspot.iconSizeMin,
    Math.min(API_LIMITS.hotspot.iconSizeMax, Math.round(size) || API_LIMITS.hotspot.iconSizeMin)
  );
}

/** Body of `POST /scenes/{id}/hotspots`: empty optional fields are left out. */
export function buildHotspotCreate(
  values: HotspotFormValues,
  content: HotspotContent | null
): HotspotCreateInput {
  const title = values.title.trim();
  const description = values.description.trim();
  const target = values.targetSceneId;
  return {
    type: values.type,
    position: clampPosition(values.position),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(values.type === 'navigation' && target ? { target_scene_id: target } : {}),
    icon_name: values.iconName,
    icon_color: values.iconColor,
    icon_size: clampIconSize(values.iconSize),
    ...(content ? { content } : {}),
  };
}

/**
 * Body of `PATCH /hotspots/{id}`. A cleared title, description, target or
 * content is sent as an explicit `null`; sending nothing would keep the old value.
 */
export function buildHotspotUpdate(
  values: HotspotFormValues,
  content: HotspotContent | null
): HotspotUpdateInput {
  return {
    type: values.type,
    position: clampPosition(values.position),
    title: values.title.trim() || null,
    description: values.description.trim() || null,
    target_scene_id: values.type === 'navigation' ? values.targetSceneId || null : null,
    icon_name: values.iconName,
    icon_color: values.iconColor,
    icon_size: clampIconSize(values.iconSize),
    content,
  };
}
