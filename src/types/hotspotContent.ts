import type {
  AudioHotspotContent,
  CustomHotspotContent,
  Hotspot,
  InfoHotspotContent,
  LinkHotspotContent,
  LinkHotspotTarget,
  NavigationHotspotContent,
  VideoHotspotContent,
} from './index';

type UnknownObject = { [key: string]: unknown };

function isObject(value: unknown): value is UnknownObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: UnknownObject, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(source: UnknownObject, key: string): boolean | undefined {
  const value = source[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readLinkTarget(source: UnknownObject): LinkHotspotTarget | undefined {
  const value = source.target;
  return value === '_blank' || value === '_self' ? value : undefined;
}

function hasParsedFields(value: UnknownObject): boolean {
  return Object.keys(value).length > 0;
}

export function parseNavigationHotspotContent(
  content: Hotspot<'navigation'>['content'] | unknown
): NavigationHotspotContent | null {
  if (!isObject(content)) return null;

  const parsed: NavigationHotspotContent = {};
  const label = readString(content, 'label');
  const sceneId = readString(content, 'scene_id');
  const targetSceneId = readString(content, 'target_scene_id');

  if (label !== undefined) parsed.label = label;
  if (sceneId !== undefined) parsed.scene_id = sceneId;
  if (targetSceneId !== undefined) parsed.target_scene_id = targetSceneId;

  return hasParsedFields(parsed) ? parsed : null;
}

export function parseInfoHotspotContent(
  content: Hotspot<'info'>['content'] | unknown
): InfoHotspotContent | null {
  if (!isObject(content)) return null;

  const parsed: InfoHotspotContent = {};
  const html = readString(content, 'html');
  const text = readString(content, 'text');
  const imageUrl = readString(content, 'image_url');

  if (html !== undefined) parsed.html = html;
  if (text !== undefined) parsed.text = text;
  if (imageUrl !== undefined) parsed.image_url = imageUrl;

  return hasParsedFields(parsed) ? parsed : null;
}

export function parseAudioHotspotContent(
  content: Hotspot<'audio'>['content'] | unknown
): AudioHotspotContent | null {
  if (!isObject(content)) return null;

  const parsed: AudioHotspotContent = {};
  const audioUrl = readString(content, 'audio_url');
  const autoplay = readBoolean(content, 'autoplay');

  if (audioUrl !== undefined) parsed.audio_url = audioUrl;
  if (autoplay !== undefined) parsed.autoplay = autoplay;

  return hasParsedFields(parsed) ? parsed : null;
}

export function parseVideoHotspotContent(
  content: Hotspot<'video'>['content'] | unknown
): VideoHotspotContent | null {
  if (!isObject(content)) return null;

  const parsed: VideoHotspotContent = {};
  const videoUrl = readString(content, 'video_url');
  const youtubeId = readString(content, 'youtube_id');
  const vimeoId = readString(content, 'vimeo_id');
  const autoplay = readBoolean(content, 'autoplay');
  const poster = readString(content, 'poster');
  const posterUrl = readString(content, 'poster_url');

  if (videoUrl !== undefined) parsed.video_url = videoUrl;
  if (youtubeId !== undefined) parsed.youtube_id = youtubeId;
  if (vimeoId !== undefined) parsed.vimeo_id = vimeoId;
  if (autoplay !== undefined) parsed.autoplay = autoplay;
  if (poster !== undefined) parsed.poster = poster;
  if (posterUrl !== undefined) parsed.poster_url = posterUrl;

  return hasParsedFields(parsed) ? parsed : null;
}

export function parseLinkHotspotContent(
  content: Hotspot<'link'>['content'] | unknown
): LinkHotspotContent | null {
  if (!isObject(content)) return null;

  const parsed: LinkHotspotContent = {};
  const url = readString(content, 'url');
  const linkUrl = readString(content, 'link_url');
  const target = readLinkTarget(content);
  const linkNewTab = readBoolean(content, 'link_new_tab');
  const label = readString(content, 'label');

  if (url !== undefined) parsed.url = url;
  if (linkUrl !== undefined) parsed.link_url = linkUrl;
  if (target !== undefined) parsed.target = target;
  if (linkNewTab !== undefined) parsed.link_new_tab = linkNewTab;
  if (label !== undefined) parsed.label = label;

  return hasParsedFields(parsed) ? parsed : null;
}

export function parseCustomHotspotContent(
  content: Hotspot<'custom'>['content'] | unknown
): CustomHotspotContent | null {
  if (!isObject(content)) return null;

  const parsed: CustomHotspotContent = {};
  const html = readString(content, 'html');
  const customHtml = readString(content, 'custom_html');
  const component = readString(content, 'component');

  if (html !== undefined) parsed.html = html;
  if (customHtml !== undefined) parsed.custom_html = customHtml;
  if (component !== undefined) parsed.component = component;

  return hasParsedFields(parsed) ? parsed : null;
}
