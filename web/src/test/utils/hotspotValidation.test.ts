import { describe, expect, it } from 'vitest';
import {
  getHotspotValidationError,
  isHttpUrl,
  isSafeLinkUrl,
} from '@/utils/hotspotValidation';

const base = {
  targetSceneId: '',
  hasAvailableTargetScene: true,
  title: '',
  description: '',
  audioUrl: '',
  videoUrl: '',
  linkUrl: '',
  customHtml: '',
};

describe('getHotspotValidationError', () => {
  it('blocks navigation without a target scene and accepts a selected target', () => {
    expect(
      getHotspotValidationError({ ...base, type: 'navigation', hasAvailableTargetScene: false })
    ).toMatch(/Add another scene/);
    expect(getHotspotValidationError({ ...base, type: 'navigation' })).toMatch(
      /Select a target scene/
    );
    expect(
      getHotspotValidationError({
        ...base,
        type: 'navigation',
        targetSceneId: 'scene-2',
      })
    ).toBeNull();
  });

  it('requires info text and accepts a title or description', () => {
    expect(getHotspotValidationError({ ...base, type: 'info' })).toMatch(/title or description/);
    expect(
      getHotspotValidationError({ ...base, type: 'info', title: 'Fireplace' })
    ).toBeNull();
    expect(
      getHotspotValidationError({ ...base, type: 'info', description: 'Corner room' })
    ).toBeNull();
  });

  it('accepts http audio URLs and rejects empty or non-http values', () => {
    expect(getHotspotValidationError({ ...base, type: 'audio' })).toMatch(/audio URL/);
    expect(
      getHotspotValidationError({
        ...base,
        type: 'audio',
        audioUrl: 'javascript:alert(1)',
      })
    ).toMatch(/audio URL/);
    expect(
      getHotspotValidationError({
        ...base,
        type: 'audio',
        audioUrl: 'https://cdn.example.com/guide.mp3',
      })
    ).toBeNull();
  });

  it('accepts http/https/mailto/tel links and rejects other protocols', () => {
    expect(
      getHotspotValidationError({ ...base, type: 'link', linkUrl: 'javascript:alert(1)' })
    ).toMatch(/http, https, mailto, or tel/);
    expect(
      getHotspotValidationError({ ...base, type: 'link', linkUrl: 'ftp://files.example.com' })
    ).toMatch(/http, https, mailto, or tel/);
    expect(
      getHotspotValidationError({ ...base, type: 'link', linkUrl: 'https://360ghar.com' })
    ).toBeNull();
    expect(
      getHotspotValidationError({ ...base, type: 'link', linkUrl: 'mailto:hello@360ghar.com' })
    ).toBeNull();
    expect(getHotspotValidationError({ ...base, type: 'link', linkUrl: 'tel:+15551212' })).toBeNull();
  });
});

describe('URL helpers', () => {
  it('classifies http(s) vs other protocols', () => {
    expect(isHttpUrl('https://cdn.example.com/a.mp3')).toBe(true);
    expect(isHttpUrl('mailto:a@b.com')).toBe(false);
    expect(isSafeLinkUrl('mailto:a@b.com')).toBe(true);
    expect(isSafeLinkUrl('javascript:alert(1)')).toBe(false);
  });
});
