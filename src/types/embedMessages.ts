type UnknownObject = { [key: string]: unknown };

export type EmbedOutboundMessageType =
  | 'ready'
  | 'sceneChange'
  | 'hotspotClick'
  | 'fullscreenChange'
  | 'error';

export interface EmbedOutboundData {
  [key: string]: unknown;
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
