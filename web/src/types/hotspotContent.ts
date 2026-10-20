/**
 * Readers for hotspot `content`. The backend stores one shape per hotspot type
 * and returns exactly those keys (no aliases):
 *
 * - navigation: `{}` (the label is the hotspot `title`)
 * - info: `text`, `html`, `image_url`
 * - audio: `audio_url`, `autoplay`, `loop`
 * - video: one of `youtube_id`, `vimeo_id`, `video_url`; `poster_url`, `autoplay`, `muted`, `loop`
 * - link: `url`, `target`, `label`
 * - custom: `html`, `component_key`, `props`
 *
 * Each reader takes `unknown` and keeps the keys it recognizes, so a stored
 * row that does not fit its type reads as null instead of breaking the viewer.
 */
import type {
  AudioHotspotContent,
  CustomHotspotContent,
  InfoHotspotContent,
  LinkHotspotContent,
  LinkHotspotTarget,
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

export function parseInfoHotspotContent(content: unknown): InfoHotspotContent | null {
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

export function parseAudioHotspotContent(content: unknown): AudioHotspotContent | null {
  if (!isObject(content)) return null;

  const audioUrl = readString(content, 'audio_url');
  if (audioUrl === undefined) return null;

  const parsed: AudioHotspotContent = { audio_url: audioUrl };
  const autoplay = readBoolean(content, 'autoplay');
  const loop = readBoolean(content, 'loop');

  if (autoplay !== undefined) parsed.autoplay = autoplay;
  if (loop !== undefined) parsed.loop = loop;

  return parsed;
}

export function parseVideoHotspotContent(content: unknown): VideoHotspotContent | null {
  if (!isObject(content)) return null;

  const parsed: VideoHotspotContent = {};
  const videoUrl = readString(content, 'video_url');
  const youtubeId = readString(content, 'youtube_id');
  const vimeoId = readString(content, 'vimeo_id');
  const posterUrl = readString(content, 'poster_url');
  const autoplay = readBoolean(content, 'autoplay');
  const muted = readBoolean(content, 'muted');
  const loop = readBoolean(content, 'loop');

  if (videoUrl !== undefined) parsed.video_url = videoUrl;
  if (youtubeId !== undefined) parsed.youtube_id = youtubeId;
  if (vimeoId !== undefined) parsed.vimeo_id = vimeoId;
  if (posterUrl !== undefined) parsed.poster_url = posterUrl;
  if (autoplay !== undefined) parsed.autoplay = autoplay;
  if (muted !== undefined) parsed.muted = muted;
  if (loop !== undefined) parsed.loop = loop;

  return hasParsedFields(parsed) ? parsed : null;
}

export function parseLinkHotspotContent(content: unknown): LinkHotspotContent | null {
  if (!isObject(content)) return null;

  const url = readString(content, 'url');
  if (url === undefined) return null;

  const parsed: LinkHotspotContent = { url };
  const target = readLinkTarget(content);
  const label = readString(content, 'label');

  if (target !== undefined) parsed.target = target;
  if (label !== undefined) parsed.label = label;

  return parsed;
}

export function parseCustomHotspotContent(content: unknown): CustomHotspotContent | null {
  if (!isObject(content)) return null;

  const parsed: CustomHotspotContent = {};
  const html = readString(content, 'html');
  const componentKey = readString(content, 'component_key');

  if (html !== undefined) parsed.html = html;
  if (componentKey !== undefined) parsed.component_key = componentKey;
  if (isObject(content.props)) parsed.props = content.props;

  return hasParsedFields(parsed) ? parsed : null;
}
