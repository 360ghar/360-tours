import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, screen } from '../test-utils';

// Mock the API barrel so no upload/scene-creation network calls can fire.
vi.mock('@/api', () => ({
  toursApi: {
    createScene: vi.fn().mockResolvedValue({}),
  },
  uploadApi: {
    uploadFile: vi.fn().mockResolvedValue({
      public_url: 'https://example.com/uploaded.jpg',
    }),
  },
}));

import { BulkUploader } from '@/components/features/BulkUploader';

const createImageFile = (name: string) =>
  new File(['fake-image-bytes'], name, { type: 'image/jpeg' });

const createOversizedImageFile = (name: string) =>
  ({
    name,
    type: 'image/jpeg',
    size: 50 * 1024 * 1024 + 1,
  }) as File;

describe('BulkUploader preview URL cleanup', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    let counter = 0;
    createObjectURLSpy = vi.fn(() => `blob:mock-preview-${++counter}`);
    revokeObjectURLSpy = vi.fn();
    URL.createObjectURL = createObjectURLSpy as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURLSpy as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('revokes every created preview object URL on unmount', async () => {
    const { unmount } = render(<BulkUploader tourId="tour-1" open onOpenChange={vi.fn()} />);

    // The dialog renders a hidden multi-file input (portaled to document.body).
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const fileA = createImageFile('panorama-a.jpg');
    const fileB = createImageFile('panorama-b.jpg');

    fireEvent.change(fileInput!, { target: { files: [fileA, fileB] } });

    await waitFor(() => {
      expect(screen.getByText('2 files selected')).toBeInTheDocument();
    });

    expect(createObjectURLSpy).toHaveBeenCalledTimes(2);
    const createdUrls = createObjectURLSpy.mock.results.map(r => r.value as string);
    expect(createdUrls).toEqual(['blob:mock-preview-1', 'blob:mock-preview-2']);

    unmount();

    // Every preview URL created must be revoked on unmount (no blob leaks).
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(2);
    for (const url of createdUrls) {
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(url);
    }
  });

  it('does not offer retry for validation failures', async () => {
    render(<BulkUploader tourId="tour-1" open onOpenChange={vi.fn()} />);

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput!, { target: { files: [createOversizedImageFile('huge.jpg')] } });

    await waitFor(() => {
      expect(screen.getByText('1 file selected')).toBeInTheDocument();
    });

    expect(screen.getByText(/File size exceeds/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry failed/i })).not.toBeInTheDocument();
  });
});
