import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../../test-utils';
import { BulkUploader } from '@/components/features/BulkUploader';
import { VideoUploader } from '@/components/features/VideoUploader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const apiMocks = vi.hoisted(() => ({
  createScene: vi.fn(),
  uploadFile: vi.fn(),
}));

vi.mock('@/api', () => ({
  toursApi: {
    createScene: (...args: unknown[]) => apiMocks.createScene(...args),
  },
  uploadApi: {
    uploadFile: (...args: unknown[]) => apiMocks.uploadFile(...args),
  },
}));

function createImageFile(name: string) {
  return new File(['fake-image-bytes'], name, { type: 'image/jpeg' });
}

function createVideoFile(name: string) {
  return new File(['fake-video-bytes'], name, { type: 'video/mp4' });
}

function mockVideoMetadataExtraction() {
  const originalCreateElement = document.createElement.bind(document);

  return vi.spyOn(document, 'createElement').mockImplementation(
    ((tagName: string, options?: ElementCreationOptions) => {
      if (tagName.toLowerCase() === 'video') {
        let src = '';
        const video = {
          preload: '',
          muted: false,
          duration: 12,
          videoWidth: 640,
          videoHeight: 320,
          onloadedmetadata: null as ((event: Event) => void) | null,
          onloadeddata: null as ((event: Event) => void) | null,
          onseeked: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
          get src() {
            return src;
          },
          set src(value: string) {
            src = value;
            queueMicrotask(() => {
              video.onloadedmetadata?.(new Event('loadedmetadata'));
              video.onloadeddata?.(new Event('loadeddata'));
            });
          },
          get currentTime() {
            return 0;
          },
          set currentTime(_value: number) {
            queueMicrotask(() => {
              video.onseeked?.(new Event('seeked'));
            });
          },
        };

        return video as unknown as HTMLVideoElement;
      }

      if (tagName.toLowerCase() === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toDataURL: () => 'data:image/jpeg;base64,thumbnail',
        } as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName, options);
    }) as typeof document.createElement
  );
}

describe('Upload confirmation behavior', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    apiMocks.createScene.mockReset();
    apiMocks.uploadFile.mockReset();
    apiMocks.uploadFile.mockReturnValue(new Promise(() => {}));
    URL.createObjectURL = vi.fn(() => 'blob:mock-preview') as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('uses the styled confirm dialog instead of window.confirm when closing during upload', async () => {
    const nativeConfirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onOpenChange = vi.fn();

    render(
      <>
        <BulkUploader tourId="tour-1" open onOpenChange={onOpenChange} />
        <ConfirmDialog />
      </>
    );

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, {
      target: { files: [createImageFile('panorama.jpg')] },
    });

    fireEvent.click(await screen.findByRole('button', { name: /upload \(1\)/i }));

    await waitFor(() => {
      expect(screen.getByText(/uploading 0 of 1/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /close uploader/i }));

    expect(nativeConfirmSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/close the uploader while files are still uploading/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /keep open/i }));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: /close uploader/i }));
    fireEvent.click(await screen.findByRole('button', { name: /close uploader/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('uses the styled confirm dialog instead of window.confirm when closing pending video uploads', async () => {
    mockVideoMetadataExtraction();
    const nativeConfirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onOpenChange = vi.fn();

    render(
      <>
        <VideoUploader open onOpenChange={onOpenChange} onUploadComplete={vi.fn()} />
        <ConfirmDialog />
      </>
    );

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, {
      target: { files: [createVideoFile('tour-video.mp4')] },
    });

    expect(await screen.findByText('tour-video.mp4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(nativeConfirmSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/close the uploader while video uploads are still in progress/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /keep open/i }));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    fireEvent.click(await screen.findByRole('button', { name: /close uploader/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
