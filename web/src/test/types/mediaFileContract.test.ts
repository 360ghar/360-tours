import { describe, expect, it } from 'vitest';
import type { MediaFile, MediaVisibility } from '@/types';

/**
 * Structural contract of the backend media response (`MediaFileResponse`).
 * The @ts-expect-error lines fail typecheck if a removed field returns to MediaFile,
 * because the directive would then be unused.
 */
describe('MediaFile contract', () => {
  it('has no processing_metadata field', () => {
    const media = {} as MediaFile;
    // @ts-expect-error processing_metadata was removed with the backend column
    const field = media.processing_metadata;
    expect(field).toBeUndefined();
  });

  it('has none of the storage internals the server stopped sending', () => {
    const media = {} as MediaFile;
    // @ts-expect-error storage_path is not exposed
    expect(media.storage_path).toBeUndefined();
    // @ts-expect-error bucket_name is not exposed
    expect(media.bucket_name).toBeUndefined();
    // @ts-expect-error duration is not part of the response
    expect(media.duration).toBeUndefined();
  });

  it('types visibility as the TourVisibility literal, and width and height as integers', () => {
    const visibilities: MediaVisibility[] = ['private', 'unlisted', 'public'];
    // @ts-expect-error a free string is not a visibility
    const invalid: MediaVisibility = 'Public';
    const media: Pick<MediaFile, 'visibility' | 'width' | 'height' | 'upload_status'> = {
      visibility: 'unlisted',
      width: 8192,
      height: 4096,
      upload_status: 'complete',
    };
    expect(visibilities).toContain(media.visibility);
    expect(invalid).toBe('Public');
    expect(media.width).toBe(8192);
  });
});
