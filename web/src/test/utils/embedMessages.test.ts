import { describe, expect, it } from 'vitest';
import { parseEmbedInboundCommand, parseEmbedOriginParam } from '@/types/embedMessages';
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

describe('parseEmbedOriginParam', () => {
  it('parses a valid https origin appended by embed.js', () => {
    expect(parseEmbedOriginParam('?tour=abc&origin=https%3A%2F%2Fagent.example.com')).toBe(
      'https://agent.example.com'
    );
    expect(parseEmbedOriginParam('?origin=http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('rejects missing, malformed, or non-http(s) origins', () => {
    expect(parseEmbedOriginParam('')).toBeNull();
    expect(parseEmbedOriginParam('?scene=s1')).toBeNull();
    expect(parseEmbedOriginParam('?origin=not-a-url')).toBeNull();
    expect(parseEmbedOriginParam('?origin=javascript%3Aalert(1)')).toBeNull();
    expect(parseEmbedOriginParam('?origin=file%3A%2F%2Fetc%2Fpasswd')).toBeNull();
    expect(parseEmbedOriginParam('?origin=https%3A%2F%2Fevil.example.com%2Fpath%2Fmore')).toBe(
      'https://evil.example.com' // normalized: path stripped
    );
  });

  it('survives a non-string or garbage search value', () => {
    expect(parseEmbedOriginParam('??')).toBeNull();
    expect(parseEmbedOriginParam('%')).toBeNull();
  });
});
