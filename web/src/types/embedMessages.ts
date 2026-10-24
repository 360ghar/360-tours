type UnknownObject = { [key: string]: unknown };

export type EmbedOutboundMessageType =
  | 'ready'
  | 'sceneChange'
  | 'hotspotClick'
  | 'panoramaClick'
  | 'fullscreenChange'
  | 'error'
  | 'tour_error';

export interface EmbedOutboundData {
  [key: string]: unknown;
}

/** Data for `panoramaClick` (posted only when the embed runs with `editmode=1`). */
export interface EmbedPanoramaClickData extends EmbedOutboundData {
  yaw: number;
  pitch: number;
  sceneId?: string;
}

export interface EmbedOutboundMessage {
  type: EmbedOutboundMessageType;
  tourId: string;
  tour_id?: string;
  data?: EmbedOutboundData;
}

export type EmbedInboundCommand =
  | { type: 'goToScene'; sceneId: string }
  | { type: 'nextScene' }
  | { type: 'previousScene' }
  | { type: 'toggleFullscreen' };

function isObject(value: unknown): value is UnknownObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: UnknownObject, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function readMessageData(source: UnknownObject): UnknownObject | undefined {
  const value = source.data;
  return isObject(value) ? value : undefined;
}

function readSceneId(source: UnknownObject): string | undefined {
  const messageData = readMessageData(source);
  return (
    readString(source, 'sceneId') ||
    readString(source, 'scene_id') ||
    (messageData ? readString(messageData, 'sceneId') : undefined) ||
    (messageData ? readString(messageData, 'scene_id') : undefined)
  );
}

export function parseEmbedInboundCommand(value: unknown): EmbedInboundCommand | null {
  if (!isObject(value)) return null;

  const type = readString(value, 'type');

  switch (type) {
    case 'goToScene': {
      const sceneId = readSceneId(value);
      return sceneId ? { type, sceneId } : null;
    }
    case 'nextScene':
    case 'previousScene':
    case 'toggleFullscreen':
      return { type };
    default:
      return null;
  }
}

/**
 * Parse and validate the `origin` query param that `public/embed.js` appends
 * to the embed URL (the embedding page's origin). Returns a normalized
 * `http(s)://host[:port]` string usable as a `postMessage` targetOrigin, or
 * `null` when absent/invalid (direct iframe embeds omit the param).
 *
 * Security note: the param is advisory (a malicious embedder can omit or fake
 * it — the embedding page controls its own iframe), so it is used to make
 * outbound messages origin-targeted and to gate inbound commands with an
 * extra origin check, never as a trust boundary on its own.
 */
export function parseEmbedOriginParam(search: string): string | null {
  let raw: string | null = null;
  try {
    raw = new URL(search, 'http://embed.invalid').searchParams.get('origin');
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}
