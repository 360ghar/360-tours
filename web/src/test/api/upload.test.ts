import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

vi.mock('@/lib/supabaseAuth', () => ({
  supabaseAuth: {
    getAccessToken: vi.fn().mockResolvedValue('test-access-token'),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
    getTokens: vi.fn(() => null),
  },
}));

import { apiClient } from '@/api/client';
import { uploadApi } from '@/api/upload';
import { usersApi } from '@/api/users';
import { aiApi } from '@/api/ai';

/**
 * Regression guard for the JSON-instead-of-multipart upload bug.
 *
 * The axios instance is created with a default `Content-Type: application/json`.
 * When a request carries a JSON content type, axios 1.x `transformRequest`
 * converts a FormData body with `JSON.stringify(formDataToJSON(data))` — every
 * File silently becomes `{}` and no bytes leave the browser. The request
 * interceptor clears the content type for FormData bodies so the platform emits
 * a real `multipart/form-data` request with its boundary.
 *
 * The assertions run against the adapter, which sees the config AFTER the
 * request interceptors and `transformRequest`: a serialized body arrives here
 * as a string, a correct one as the FormData instance itself.
 */
const captured: InternalAxiosRequestConfig[] = [];
const originalAdapter = apiClient.defaults.adapter;

const recordingAdapter: AxiosAdapter = async config => {
  captured.push(config);
  return {
    data: { url: 'https://cdn.example.com/panorama.jpg' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
};

beforeEach(() => {
  captured.length = 0;
  apiClient.defaults.adapter = recordingAdapter;
});

afterAll(() => {
  apiClient.defaults.adapter = originalAdapter;
});

function panoramaFile(): File {
  return new File([new Uint8Array([1, 2, 3, 4])], 'panorama.jpg', { type: 'image/jpeg' });
}

function contentTypeOf(config: InternalAxiosRequestConfig): string {
  const raw = config.headers?.getContentType?.();
  return typeof raw === 'string' ? raw : '';
}

describe('FormData requests', () => {
  it('uploadApi.uploadFile sends the FormData body, not a JSON string', async () => {
    await uploadApi.uploadFile(panoramaFile(), { folderType: 'tour_original', tourId: 'tour-1' });

    expect(captured).toHaveLength(1);
    const [config] = captured;
    expect(config.data).toBeInstanceOf(FormData);
    expect(typeof config.data).not.toBe('string');
    expect(contentTypeOf(config)).not.toContain('application/json');
    const form = config.data as FormData;
    expect(form.get('file')).toBeInstanceOf(File);
    // The route takes `folder_type` (StorageFolderType) and `tour_id`; `folder` is gone.
    expect(form.get('folder_type')).toBe('tour_original');
    expect(form.get('tour_id')).toBe('tour-1');
    expect(form.has('folder')).toBe(false);
  });

  it('usersApi.uploadProfileImage sends the FormData body, not a JSON string', async () => {
    await usersApi.uploadProfileImage(panoramaFile());

    expect(captured).toHaveLength(1);
    expect(captured[0].data).toBeInstanceOf(FormData);
    expect(contentTypeOf(captured[0])).not.toContain('application/json');
  });

  it('aiApi.generateTour sends the FormData body, not a JSON string', async () => {
    await aiApi.generateTour({ images: [panoramaFile()], title: 'Loft' });

    expect(captured).toHaveLength(1);
    expect(captured[0].data).toBeInstanceOf(FormData);
    expect(contentTypeOf(captured[0])).not.toContain('application/json');
  });

  it('leaves the JSON content type on ordinary object bodies', async () => {
    await apiClient.post('/tours', { title: 'Loft' });

    expect(captured).toHaveLength(1);
    expect(contentTypeOf(captured[0])).toContain('application/json');
    expect(typeof captured[0].data).toBe('string');
  });

  it('aiApi.generateTour sends the renamed option fields and never the retired names', async () => {
    await aiApi.generateTour({
      images: [panoramaFile()],
      title: 'Loft',
      generate_titles: true,
      suggest_hotspots: false,
      generate_descriptions: true,
      spatial: true,
    });

    const form = captured[0].data as FormData;
    expect(form.get('generate_titles')).toBe('true');
    expect(form.get('suggest_hotspots')).toBe('false');
    expect(form.get('generate_descriptions')).toBe('true');
    expect(form.get('spatial')).toBe('true');
    expect(form.has('auto_detect_rooms')).toBe(false);
    expect(form.has('auto_place_hotspots')).toBe(false);
    expect(form.has('auto_generate_descriptions')).toBe(false);
    expect(form.has('status')).toBe(false);
  });

  it('aiApi.generateTour cuts a title to the 255 character limit', async () => {
    await aiApi.generateTour({ images: [panoramaFile()], title: 't'.repeat(400) });

    const form = captured[0].data as FormData;
    expect((form.get('title') as string).length).toBe(255);
  });
});
