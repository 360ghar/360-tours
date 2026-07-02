import { describe, expect, it } from 'vitest';
import {
  parseAudioHotspotContent,
  parseCustomHotspotContent,
  parseInfoHotspotContent,
  parseLinkHotspotContent,
  parseNavigationHotspotContent,
  parseVideoHotspotContent,
} from '@/types/hotspotContent';

describe('hotspot content parsers', () => {
  it('parses info content and drops malformed optional fields', () => {
    expect(
      parseInfoHotspotContent({
        text: 'Room details',
        html: 42,
        image_url: 'https://example.com/image.jpg',
      })
    ).toEqual({
      text: 'Room details',
      image_url: 'https://example.com/image.jpg',
    });
  });

  it('returns null for non-object or empty info content', () => {
    expect(parseInfoHotspotContent(null)).toBeNull();
    expect(parseInfoHotspotContent('text')).toBeNull();
    expect(parseInfoHotspotContent({ unknown: 'value' })).toBeNull();
  });

  it('parses audio content with boolean autoplay only when typed correctly', () => {
    expect(parseAudioHotspotContent({ audio_url: '/audio.mp3', autoplay: true })).toEqual({
      audio_url: '/audio.mp3',
      autoplay: true,
    });
    expect(parseAudioHotspotContent({ audio_url: '/audio.mp3', autoplay: 'true' })).toEqual({
      audio_url: '/audio.mp3',
    });
  });

  it('parses video content from raw urls, provider ids, and poster fields', () => {
    expect(
      parseVideoHotspotContent({
        video_url: 'https://example.com/video.mp4',
        youtube_id: 'abc123',
        vimeo_id: '987',
        autoplay: false,
        poster: '/poster.jpg',
        poster_url: '/poster-2.jpg',
      })
    ).toEqual({
      video_url: 'https://example.com/video.mp4',
      youtube_id: 'abc123',
      vimeo_id: '987',
      autoplay: false,
      poster: '/poster.jpg',
      poster_url: '/poster-2.jpg',
    });
  });

  it('parses link content while rejecting invalid targets', () => {
    expect(
      parseLinkHotspotContent({
        url: 'https://example.com',
        link_url: 'https://fallback.example.com',
        target: '_top',
        link_new_tab: false,
        label: 'Open listing',
      })
    ).toEqual({
      url: 'https://example.com',
      link_url: 'https://fallback.example.com',
      link_new_tab: false,
      label: 'Open listing',
    });
  });

  it('parses custom html aliases', () => {
    expect(parseCustomHotspotContent({ html: '<p>Hi</p>', custom_html: '<b>Legacy</b>' })).toEqual({
      html: '<p>Hi</p>',
      custom_html: '<b>Legacy</b>',
    });
  });

  it('parses navigation content without requiring backend kind metadata', () => {
    expect(
      parseNavigationHotspotContent({
        label: 'Kitchen',
        scene_id: 'scene-1',
        target_scene_id: 'scene-2',
      })
    ).toEqual({
      label: 'Kitchen',
      scene_id: 'scene-1',
      target_scene_id: 'scene-2',
    });
  });
});
