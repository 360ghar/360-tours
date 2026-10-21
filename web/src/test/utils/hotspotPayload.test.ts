import { describe, it, expect } from 'vitest';
import {
  buildHotspotContent,
  buildHotspotCreate,
  buildHotspotUpdate,
  type HotspotFormValues,
} from '@/utils/hotspotPayload';

const base: HotspotFormValues = {
  type: 'info',
  title: '',
  description: '',
  targetSceneId: '',
  position: { yaw: 10, pitch: -5 },
  iconName: 'info',
  iconColor: '#FF5733',
  iconSize: 32,
  audioUrl: '',
  videoUrl: '',
  linkUrl: '',
  linkNewTab: true,
  customHtml: '',
};

describe('buildHotspotContent', () => {
  it('builds the keys of each type and never a `kind` or an alias', () => {
    expect(buildHotspotContent({ ...base, type: 'info', description: ' Hello ' }, null)).toEqual({
      text: 'Hello',
    });
    expect(
      buildHotspotContent({ ...base, type: 'audio', audioUrl: 'https://cdn/a.mp3' }, null)
    ).toEqual({ audio_url: 'https://cdn/a.mp3' });
    expect(
      buildHotspotContent({ ...base, type: 'link', linkUrl: 'mailto:a@b.com', linkNewTab: false }, null)
    ).toEqual({ url: 'mailto:a@b.com', target: '_self' });
    expect(
      buildHotspotContent({ ...base, type: 'custom', customHtml: '<p>x</p>' }, null)
    ).toEqual({ html: '<p>x</p>' });
    expect(buildHotspotContent({ ...base, type: 'navigation' }, null)).toBeNull();
  });

  it('sends a YouTube or Vimeo link as youtube_id or vimeo_id, other hosts as video_url', () => {
    const video = (videoUrl: string) => buildHotspotContent({ ...base, type: 'video', videoUrl }, null);
    expect(video('https://www.youtube.com/watch?v=abcDEF12345')).toEqual({
      youtube_id: 'abcDEF12345',
    });
    expect(video('https://vimeo.com/123456')).toEqual({ vimeo_id: '123456' });
    expect(video('https://cdn.example.com/tour.mp4')).toEqual({
      video_url: 'https://cdn.example.com/tour.mp4',
    });
  });

  it('carries over the keys the form does not edit while the type is unchanged', () => {
    const stored = { audio_url: 'https://cdn/old.mp3', autoplay: true, loop: false };
    expect(
      buildHotspotContent({ ...base, type: 'audio', audioUrl: 'https://cdn/new.mp3' }, stored)
    ).toEqual({ audio_url: 'https://cdn/new.mp3', autoplay: true, loop: false });
  });

  it('returns null when the content is empty, so a clear is not an empty object', () => {
    expect(buildHotspotContent({ ...base, type: 'info' }, null)).toBeNull();
    expect(buildHotspotContent({ ...base, type: 'link', linkUrl: '  ' }, null)).toBeNull();
  });
});

describe('buildHotspotCreate', () => {
  it('leaves out an empty title, description and content', () => {
    const body = buildHotspotCreate({ ...base, type: 'info', description: 'Hi' }, { text: 'Hi' });

    expect(body).toEqual({
      type: 'info',
      position: { yaw: 10, pitch: -5 },
      description: 'Hi',
      icon_name: 'info',
      icon_color: '#FF5733',
      icon_size: 32,
      content: { text: 'Hi' },
    });
    expect(body).not.toHaveProperty('title');
    expect(body).not.toHaveProperty('target_scene_id');
  });

  it('keeps yaw, pitch and icon size inside the backend ranges', () => {
    const body = buildHotspotCreate(
      { ...base, position: { yaw: 400, pitch: -200 }, iconSize: 500 },
      null
    );
    expect(body.position).toEqual({ yaw: 180, pitch: -90 });
    expect(body.icon_size).toBe(100);
    expect(buildHotspotCreate({ ...base, iconSize: 2 }, null).icon_size).toBe(16);
  });

  it('sends target_scene_id for a navigation hotspot only', () => {
    expect(
      buildHotspotCreate({ ...base, type: 'navigation', targetSceneId: 'scene-2' }, null)
    ).toMatchObject({ target_scene_id: 'scene-2' });
    expect(buildHotspotCreate({ ...base, type: 'info', targetSceneId: 'scene-2' }, null)).not.toHaveProperty(
      'target_scene_id'
    );
  });
});

describe('buildHotspotUpdate', () => {
  it('sends an explicit null for a cleared title, description, target and content', () => {
    const body = buildHotspotUpdate({ ...base, type: 'info', title: '  ' }, null);

    expect(body.title).toBeNull();
    expect(body.description).toBeNull();
    expect(body.target_scene_id).toBeNull();
    expect(body.content).toBeNull();
    // The keys are present: a missing key would keep the stored value.
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(['title', 'description', 'target_scene_id', 'content'])
    );
  });

  it('never sends null for position, type or icon_size', () => {
    const body = buildHotspotUpdate(base, null);
    expect(body.position).not.toBeNull();
    expect(body.type).not.toBeNull();
    expect(body.icon_size).not.toBeNull();
  });
});
