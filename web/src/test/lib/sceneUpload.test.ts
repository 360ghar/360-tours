import { describe, it, expect, vi, beforeEach } from 'vitest';

const createSceneMock = vi.hoisted(() => vi.fn());
const uploadFileMock = vi.hoisted(() => vi.fn());

vi.mock('@/api', () => ({
  toursApi: {
    createScene: (...args: unknown[]) => createSceneMock(...args),
  },
  uploadApi: {
    uploadFile: (...args: unknown[]) => uploadFileMock(...args),
  },
}));

import { uploadSceneFile, uploadSceneFiles, validateSceneUploadFile } from '@/lib/sceneUpload';

const createImageFile = (name: string) => new File(['image-bytes'], name, { type: 'image/jpeg' });

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error('Timed out waiting for condition');
}

describe('sceneUpload helper', () => {
  beforeEach(() => {
    createSceneMock.mockReset();
    uploadFileMock.mockReset();
  });

  it('uploads to the shared scene folder and creates a scene from the file name', async () => {
    uploadFileMock.mockResolvedValue({ public_url: 'https://cdn.example.com/panorama.jpg' });
    createSceneMock.mockResolvedValue({ id: 'scene-1' });

    await uploadSceneFile('tour-1', createImageFile('Living Room.jpg'));

    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        folder: 'scenes',
        visibility: 'public',
      })
    );
    expect(createSceneMock).toHaveBeenCalledWith('tour-1', {
      image_url: 'https://cdn.example.com/panorama.jpg',
      title: 'Living Room',
    });
  });

  it('honors the requested batch concurrency', async () => {
    let activeUploads = 0;
    let maxActiveUploads = 0;
    const releaseUpload: Array<() => void> = [];

    uploadFileMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          activeUploads += 1;
          maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
          releaseUpload.push(() => {
            activeUploads -= 1;
            resolve({ public_url: `https://cdn.example.com/${releaseUpload.length}.jpg` });
          });
        })
    );
    createSceneMock.mockResolvedValue({ id: 'scene-1' });

    const uploadPromise = uploadSceneFiles(
      'tour-1',
      [
        createImageFile('one.jpg'),
        createImageFile('two.jpg'),
        createImageFile('three.jpg'),
        createImageFile('four.jpg'),
      ],
      { concurrency: 2 }
    );

    await waitForCondition(() => releaseUpload.length === 2);
    expect(maxActiveUploads).toBe(2);

    releaseUpload.shift()?.();
    await waitForCondition(() => releaseUpload.length === 2);
    expect(maxActiveUploads).toBe(2);

    releaseUpload.shift()?.();
    await waitForCondition(() => releaseUpload.length === 2);
    expect(maxActiveUploads).toBe(2);

    while (releaseUpload.length > 0) {
      releaseUpload.shift()?.();
    }

    const results = await uploadPromise;
    expect(results).toHaveLength(4);
    expect(results.every(result => result.status === 'fulfilled')).toBe(true);
    expect(maxActiveUploads).toBe(2);
  });

  it('uses the shared image validation policy', () => {
    const invalidFile = new File(['not-image'], 'document.pdf', { type: 'application/pdf' });

    expect(validateSceneUploadFile(createImageFile('valid.jpg')).valid).toBe(true);
    expect(validateSceneUploadFile(invalidFile)).toEqual(
      expect.objectContaining({
        valid: false,
        error: expect.stringContaining('Invalid file type'),
      })
    );
  });
});
