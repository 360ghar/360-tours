import { describe, expect, it } from 'vitest';
import {
  parseAudioHotspotContent,
  parseCustomHotspotContent,
  parseInfoHotspotContent,
  parseLinkHotspotContent,
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

  it('parses video content: provider ids, raw url, poster_url, and drops the poster alias', () => {
    expect(
      parseVideoHotspotContent({
        video_url: 'https://example.com/video.mp4',
        youtube_id: 'abc123',
        vimeo_id: '987',
        autoplay: false,
        muted: true,
        loop: 'yes',
        poster: '/poster.jpg',
        poster_url: '/poster-2.jpg',
      })
    ).toEqual({
      video_url: 'https://example.com/video.mp4',
      youtube_id: 'abc123',
      vimeo_id: '987',
      autoplay: false,
      muted: true,
      poster_url: '/poster-2.jpg',
    });
  });

  it('parses link content with the url and target keys only', () => {
    expect(
      parseLinkHotspotContent({
        url: 'https://example.com',
        link_url: 'https://fallback.example.com',
        target: '_self',
        link_new_tab: false,
        label: 'Open listing',
      })
    ).toEqual({
      url: 'https://example.com',
      target: '_self',
      label: 'Open listing',
    });
  });

  it('drops a link target outside _blank and _self, and rejects content without a url', () => {
    expect(parseLinkHotspotContent({ url: 'https://example.com', target: '_top' })).toEqual({
      url: 'https://example.com',
    });
    expect(parseLinkHotspotContent({ link_url: 'https://example.com' })).toBeNull();
  });

  it('parses custom content with html, component_key and props, and drops aliases', () => {
    expect(
      parseCustomHotspotContent({
        html: '<p>Hi</p>',
        custom_html: '<b>Legacy</b>',
        component_key: 'floor-switcher',
        props: { floor: 2 },
      })
    ).toEqual({
      html: '<p>Hi</p>',
      component_key: 'floor-switcher',
      props: { floor: 2 },
    });
    expect(parseCustomHotspotContent({ custom_html: '<b>Legacy</b>' })).toBeNull();
  });
});
