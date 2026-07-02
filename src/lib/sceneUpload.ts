import { toursApi, uploadApi } from '@/api';
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_SIZE_BYTES } from '@/constants';
import { validateImageFile } from '@/utils/validation';
import type { Scene } from '@/types';

export const SCENE_UPLOAD_FOLDER = 'scenes';
export const SCENE_UPLOAD_VISIBILITY = 'public';
export const SCENE_UPLOAD_MAX_CONCURRENT = 4;
export const SCENE_UPLOAD_MAX_FILE_COUNT = 50;
export const SCENE_UPLOAD_MAX_SIZE_MB = MAX_UPLOAD_SIZE_BYTES / (1024 * 1024);

const MIME_TYPE_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

const sceneUploadAllowedImageTypes: string[] = ALLOWED_IMAGE_TYPES;

export const SCENE_UPLOAD_ACCEPT: Record<string, string[]> = {};
for (const mimeType of sceneUploadAllowedImageTypes) {
  SCENE_UPLOAD_ACCEPT[mimeType] = MIME_TYPE_EXTENSIONS[mimeType] ?? [];
}

export const SCENE_UPLOAD_ACCEPT_ATTRIBUTE = sceneUploadAllowedImageTypes.join(',');

export interface SceneUploadValidation {
  valid: boolean;
  error?: string;
}

export interface UploadSceneFileOptions {
  onProgress?: (progress: number) => void;
}

export interface UploadSceneBatchOptions {
  concurrency?: number;
  onFileProgress?: (file: File, index: number, progress: number) => void;
  onFileSuccess?: (file: File, index: number, scene: Scene) => void;
  onFileError?: (file: File, index: number, error: unknown) => void;
}

export interface SceneUploadBatchResult {
  file: File;
  index: number;
  status: 'fulfilled' | 'rejected';
  scene?: Scene;
  reason?: unknown;
}

export function validateSceneUploadFile(file: File): SceneUploadValidation {
  return validateImageFile(file);
}

export function isSceneUploadValidationError(error?: string): boolean {
  return !!error && (error.includes('Invalid file type') || error.includes('File size exceeds'));
}

export function getSceneTitleFromFile(file: File): string {
  return file.name.replace(/\.[^/.]+$/, '');
}

export async function uploadSceneFile(
  tourId: string,
  file: File,
  options: UploadSceneFileOptions = {}
): Promise<Scene> {
  const uploadResult = await uploadApi.uploadFile(file, {
    folder: SCENE_UPLOAD_FOLDER,
    visibility: SCENE_UPLOAD_VISIBILITY,
    onProgress: options.onProgress,
  });

  return toursApi.createScene(tourId, {
    image_url: uploadResult.public_url,
    title: getSceneTitleFromFile(file),
  });
}

export async function uploadSceneFiles(
  tourId: string,
  files: File[],
  options: UploadSceneBatchOptions = {}
): Promise<SceneUploadBatchResult[]> {
  if (files.length === 0) return [];

  const concurrency = Math.max(1, options.concurrency ?? SCENE_UPLOAD_MAX_CONCURRENT);
  const queue = files.map((file, index) => ({ file, index }));
  const results: SceneUploadBatchResult[] = new Array(files.length);

  const runNext = async (): Promise<void> => {
    const next = queue.shift();
    if (!next) return;

    const { file, index } = next;

    try {
      const scene = await uploadSceneFile(tourId, file, {
        onProgress: progress => options.onFileProgress?.(file, index, progress),
      });
      options.onFileSuccess?.(file, index, scene);
      results[index] = { file, index, status: 'fulfilled', scene };
    } catch (error) {
      options.onFileError?.(file, index, error);
      results[index] = { file, index, status: 'rejected', reason: error };
    }

    await runNext();
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, () => runNext())
  );

  return results;
}
