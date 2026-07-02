import { describe, expect, it } from 'vitest';
import { parseEmbedInboundCommand } from '@/types/embedMessages';

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
