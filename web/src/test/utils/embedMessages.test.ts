import { describe, expect, it } from 'vitest';
import { parseEmbedInboundCommand } from '@/types/embedMessages';
import type { EmbedOutboundMessage, EmbedPanoramaClickData } from '@/types/embedMessages';

describe('EmbedOutboundMessage', () => {
  it('accepts panoramaClick with yaw/pitch/sceneId data', () => {
    const data: EmbedPanoramaClickData = { yaw: 42.5, pitch: -12.25, sceneId: 'scene-1' };
    const message: EmbedOutboundMessage = { type: 'panoramaClick', tourId: 'tour-1', data };

    expect(message.type).toBe('panoramaClick');
    expect(message.data).toEqual({ yaw: 42.5, pitch: -12.25, sceneId: 'scene-1' });
  });

  it('accepts panoramaClick without a scene id', () => {
    const message: EmbedOutboundMessage = {
      type: 'panoramaClick',
      tourId: 'tour-1',
      data: { yaw: 0, pitch: 0 } satisfies EmbedPanoramaClickData,
    };

    expect(message.data).toEqual({ yaw: 0, pitch: 0 });
  });
});

describe('parseEmbedInboundCommand', () => {
  it('parses goToScene with top-level camelCase scene id', () => {
    expect(parseEmbedInboundCommand({ type: 'goToScene', sceneId: 'scene-1' })).toEqual({
      type: 'goToScene',
      sceneId: 'scene-1',
    });
  });

  it('parses goToScene with nested snake_case scene id', () => {
    expect(
      parseEmbedInboundCommand({ type: 'goToScene', data: { scene_id: 'scene-2' } })
    ).toEqual({
      type: 'goToScene',
      sceneId: 'scene-2',
    });
  });

  it('rejects goToScene without a string scene id', () => {
    expect(parseEmbedInboundCommand({ type: 'goToScene' })).toBeNull();
    expect(parseEmbedInboundCommand({ type: 'goToScene', sceneId: 123 })).toBeNull();
  });

  it('parses scene navigation and fullscreen commands', () => {
    expect(parseEmbedInboundCommand({ type: 'nextScene' })).toEqual({ type: 'nextScene' });
    expect(parseEmbedInboundCommand({ type: 'previousScene' })).toEqual({
      type: 'previousScene',
    });
    expect(parseEmbedInboundCommand({ type: 'toggleFullscreen' })).toEqual({
      type: 'toggleFullscreen',
    });
  });

  it('rejects malformed or unknown messages', () => {
    expect(parseEmbedInboundCommand(null)).toBeNull();
    expect(parseEmbedInboundCommand([])).toBeNull();
    expect(parseEmbedInboundCommand({ type: 'deleteTour' })).toBeNull();
  });
});
