import { describe, expect, it } from 'vitest';
import { isPlayablePublicTour } from '@/utils/publicTour';

describe('isPlayablePublicTour', () => {
  it('allows published public and unlisted tours', () => {
    expect(isPlayablePublicTour({ status: 'published', visibility: 'public' })).toBe(true);
    expect(isPlayablePublicTour({ status: 'published', visibility: 'unlisted' })).toBe(true);
  });

  it('rejects drafts, archives, private tours, and missing payloads', () => {
    expect(isPlayablePublicTour({ status: 'draft', visibility: 'public' })).toBe(false);
    expect(isPlayablePublicTour({ status: 'archived', visibility: 'public' })).toBe(false);
    expect(isPlayablePublicTour({ status: 'published', visibility: 'private' })).toBe(false);
    expect(isPlayablePublicTour(null)).toBe(false);
    expect(isPlayablePublicTour(undefined)).toBe(false);
  });
});
