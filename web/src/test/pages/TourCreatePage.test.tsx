import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TourCreatePage } from '@/pages/tours/TourCreatePage';
import { toursApi, uploadApi } from '@/api';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import { makeScene, makeTour } from '@/test/fixtures';
import type { Tour } from '@/types';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/api', () => ({
  toursApi: {
    createTour: vi.fn(),
    updateTour: vi.fn(),
    createScene: vi.fn(),
  },
  uploadApi: {
    uploadFile: vi.fn(),
  },
}));

vi.mock('@/components/features', () => ({
  AITourWizard: () => null,
}));

const createdTour: Tour = makeTour({
  id: 'tour-new',
  title: 'Manual Draft',
  settings: { ...DEFAULT_TOUR_SETTINGS },
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/tours/create']}>
        <TourCreatePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function reachUploadStep() {
  await userEvent.click(screen.getByRole('button', { name: 'Upload panoramas' }));
  await userEvent.type(screen.getByLabelText('Tour Title'), 'Manual Draft');
  await userEvent.click(screen.getByRole('button', { name: 'Continue to Upload' }));
  expect(await screen.findByRole('heading', { name: 'Upload 360° Images' })).toBeInTheDocument();
}

function pngFile(name: string) {
  return new File(['png-bytes'], name, { type: 'image/png' });
}

describe('TourCreatePage manual upload', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    vi.mocked(toursApi.createTour).mockReset().mockResolvedValue(createdTour);
    vi.mocked(toursApi.updateTour).mockReset();
    vi.mocked(toursApi.createScene).mockReset().mockResolvedValue(
      makeScene({
        id: 'scene-1',
        tour_id: 'tour-new',
        title: 'living-room',
        image_url: 'https://cdn.example.com/living.png',
      })
    );
    vi.mocked(uploadApi.uploadFile).mockReset().mockResolvedValue({
      file_path: 'scenes/living.png',
      public_url: 'https://cdn.example.com/living.png',
      file_type: 'image',
      file_size: 9,
      content_type: 'image/png',
      original_filename: 'living-room.png',
    });
  });

  it('does not create scenes for invalid files and does not continue with zero scenes', async () => {
    renderPage();
    await reachUploadStep();

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    // accept= filters the picker; change() matches a drop of a rejected file.
    fireEvent.change(input!, {
      target: { files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByText(/Invalid file type/)).toBeInTheDocument();
    expect(toursApi.createScene).not.toHaveBeenCalled();
    expect(uploadApi.uploadFile).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Continue to Editor' })).not.toBeInTheDocument();
    expect(screen.getByText('No scenes were uploaded')).toBeInTheDocument();
  });

  it('creates a scene for a valid panorama and then allows Continue to Editor', async () => {
    renderPage();
    await reachUploadStep();

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    await userEvent.upload(input!, pngFile('living-room.png'));

    await userEvent.click(screen.getByRole('button', { name: 'Upload 1 Files' }));

    await waitFor(() => {
      expect(uploadApi.uploadFile).toHaveBeenCalled();
      expect(toursApi.createScene).toHaveBeenCalledWith('tour-new', {
        image_url: 'https://cdn.example.com/living.png',
        title: 'living-room',
      });
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Continue to Editor' }));
    expect(navigateMock).toHaveBeenCalledWith('/tours/tour-new/edit');
  });

  it('rejects oversized images and does not create scenes', async () => {
    renderPage();
    await reachUploadStep();

    const huge = new File(['x'], 'huge.jpg', { type: 'image/jpeg' });
    Object.defineProperty(huge, 'size', { value: 51 * 1024 * 1024 });

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    await userEvent.upload(input!, huge);

    expect(await screen.findByText(/File size exceeds/)).toBeInTheDocument();
    expect(toursApi.createScene).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Continue to Editor' })).not.toBeInTheDocument();
  });

  it('does not treat an empty upload list as a successful tour', async () => {
    renderPage();
    await reachUploadStep();

    expect(screen.queryByRole('button', { name: 'Continue to Editor' })).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-continue-hint')).toBeInTheDocument();
  });

  it('creates the tour as a draft: the body carries no status', async () => {
    renderPage();
    await reachUploadStep();

    expect(toursApi.createTour).toHaveBeenCalledTimes(1);
    const [body] = vi.mocked(toursApi.createTour).mock.calls[0];
    expect(body).not.toHaveProperty('status');
    expect(body).toMatchObject({ title: 'Manual Draft', visibility: 'private' });
  });

  it('uploads a panorama as tour_original with the tour id (the scene folder needs a scene id)', async () => {
    renderPage();
    await reachUploadStep();

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    await userEvent.upload(input!, pngFile('living-room.png'));
    await userEvent.click(screen.getByRole('button', { name: 'Upload 1 Files' }));

    await waitFor(() => expect(uploadApi.uploadFile).toHaveBeenCalled());
    const [, options] = vi.mocked(uploadApi.uploadFile).mock.calls[0];
    expect(options).toMatchObject({ folderType: 'tour_original', tourId: 'tour-new' });
    expect(options).not.toHaveProperty('folder');
  });
});
