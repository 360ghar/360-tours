import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GuidedCapturePage } from '@/pages/tours/GuidedCapturePage';
import { captureApi, toursApi, uploadApi } from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { writeAccountItem } from '@/lib/accountStorage';
import { makeScene, makeTour, makeUser } from '@/test/fixtures';
import type { CaptureSession } from '@/types/capture';

vi.mock('@/api', () => ({
  captureApi: {
    createSession: vi.fn(),
    getSession: vi.fn(),
    moveSession: vi.fn(),
    failSession: vi.fn(),
    registerFrame: vi.fn(),
    completeSession: vi.fn(),
    cancelSession: vi.fn(),
  },
  toursApi: { createTour: vi.fn(), createScene: vi.fn() },
  uploadApi: { uploadFile: vi.fn() },
}));

const USER_ID = 7;
const TIME = '2024-01-01T00:00:00Z';

function session(status: CaptureSession['status'], id = 'sess-1'): CaptureSession {
  return {
    id,
    user_id: USER_ID,
    title: 'Property walkthrough',
    description: null,
    status,
    progress: 0,
    plan: null,
    device_info: null,
    tour_id: null,
    error_message: null,
    frame_count: 0,
    created_at: TIME,
    updated_at: TIME,
  };
}

/** A frame as the page keeps it in session storage between a capture and the upload. */
function storeFrame(sessionId: string) {
  const frame = {
    id: 'frame-1',
    yawDeg: 0,
    pitchDeg: null,
    roomId: 'room-1',
    roomLabel: 'Living Room',
    waypointId: 'wp-center',
    waypointIndex: 0,
    frameIndex: 0,
    width: 1280,
    height: 720,
    capturedAt: TIME,
    dataUrl: 'data:image/jpeg;base64,AAAA',
    uploadStatus: 'pending',
  };
  writeAccountItem('captureFrames', USER_ID, JSON.stringify([frame]), sessionId);
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tours/capture" element={<GuidedCapturePage />} />
        <Route path="/tours/capture/:sessionId" element={<GuidedCapturePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('GuidedCapturePage capture state machine', () => {
  beforeEach(() => {
    // jsdom has no object URLs: the page makes one per restored frame.
    URL.createObjectURL = vi.fn(() => 'blob:frame');
    URL.revokeObjectURL = vi.fn();
    sessionStorage.clear();
    useAuthStore.setState({ user: makeUser({ id: USER_ID }), isAuthenticated: true });
    vi.mocked(captureApi.createSession).mockReset().mockResolvedValue(session('draft'));
    vi.mocked(captureApi.getSession).mockReset();
    vi.mocked(captureApi.moveSession)
      .mockReset()
      .mockImplementation(async (id, status) => session(status, id));
    vi.mocked(captureApi.failSession)
      .mockReset()
      .mockImplementation(async id => session('failed', id));
    vi.mocked(captureApi.registerFrame).mockReset().mockResolvedValue({} as never);
    vi.mocked(captureApi.completeSession)
      .mockReset()
      .mockImplementation(async id => session('ready', id));
    vi.mocked(uploadApi.uploadFile)
      .mockReset()
      .mockResolvedValue({
        file_path: 'generic/f.jpg',
        public_url: 'https://cdn.example.com/f.jpg',
        file_type: 'image',
        file_size: 4,
        content_type: 'image/jpeg',
      });
    vi.mocked(toursApi.createTour).mockReset().mockResolvedValue(makeTour({ id: 'tour-9' }));
    vi.mocked(toursApi.createScene)
      .mockReset()
      .mockResolvedValue(makeScene({ id: 'scene-9', tour_id: 'tour-9' }));
  });

  afterEach(() => {
    sessionStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('creates the session with platform web and moves draft to capturing', async () => {
    renderAt('/tours/capture');

    await userEvent.click(screen.getByRole('button', { name: /start camera/i }));

    await waitFor(() => expect(captureApi.moveSession).toHaveBeenCalledWith('sess-1', 'capturing'));
    const [body] = vi.mocked(captureApi.createSession).mock.calls[0];
    expect(body.device_info).toMatchObject({ platform: 'web' });
    expect(body.title).toBe('Property walkthrough');
  });

  it('uploads review > uploading > frames > complete, then creates a draft tour with no status', async () => {
    vi.mocked(captureApi.getSession).mockResolvedValue({
      ...session('review'),
      frames: [],
    } as Awaited<ReturnType<typeof captureApi.getSession>>);
    storeFrame('sess-1');

    renderAt('/tours/capture/sess-1');
    await userEvent.click(await screen.findByRole('button', { name: /upload & create tour/i }));

    await waitFor(() => expect(captureApi.completeSession).toHaveBeenCalledWith('sess-1'));
    expect(await screen.findByText('Capture finished')).toBeInTheDocument();

    // review -> uploading comes before any frame is registered, and complete comes last.
    expect(captureApi.moveSession).toHaveBeenCalledWith('sess-1', 'uploading');
    const order = (fn: { mock: { invocationCallOrder: number[] } }) =>
      fn.mock.invocationCallOrder[0];
    const uploading = vi
      .mocked(captureApi.moveSession)
      .mock.calls.findIndex(([, status]) => status === 'uploading');
    expect(
      vi.mocked(captureApi.moveSession).mock.invocationCallOrder[uploading]
    ).toBeLessThan(order(vi.mocked(captureApi.registerFrame)));
    expect(order(vi.mocked(captureApi.registerFrame))).toBeLessThan(
      order(vi.mocked(captureApi.completeSession))
    );

    // Every frame names the web platform and goes up as a generic upload (no tour yet).
    const [sessionId, frame] = vi.mocked(captureApi.registerFrame).mock.calls[0];
    expect(sessionId).toBe('sess-1');
    expect(frame.metadata?.device).toMatchObject({ platform: 'web' });
    expect(frame.image_url).toBe('https://cdn.example.com/f.jpg');
    expect(vi.mocked(uploadApi.uploadFile).mock.calls[0][1]).toMatchObject({
      folderType: 'generic',
    });

    // A new tour is a draft: `status` is not a writable field. A scene has no order_index.
    const [tourBody] = vi.mocked(toursApi.createTour).mock.calls[0];
    expect(tourBody).not.toHaveProperty('status');
    const [, sceneBody] = vi.mocked(toursApi.createScene).mock.calls[0];
    expect(sceneBody).not.toHaveProperty('order_index');
    expect(captureApi.failSession).not.toHaveBeenCalled();
  });

  it('records a failed session when a frame upload fails, and returns to review', async () => {
    vi.mocked(captureApi.getSession).mockResolvedValue({
      ...session('review'),
      frames: [],
    } as Awaited<ReturnType<typeof captureApi.getSession>>);
    vi.mocked(uploadApi.uploadFile).mockRejectedValue(new Error('Upload unavailable'));
    storeFrame('sess-1');

    renderAt('/tours/capture/sess-1');
    await userEvent.click(await screen.findByRole('button', { name: /upload & create tour/i }));

    await waitFor(() =>
      expect(captureApi.failSession).toHaveBeenCalledWith('sess-1', 'Upload unavailable')
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload unavailable');
    expect(captureApi.completeSession).not.toHaveBeenCalled();
    expect(toursApi.createTour).not.toHaveBeenCalled();
    // The frame stays on the device: the review screen is back.
    expect(screen.getByRole('button', { name: /upload & create tour/i })).toBeEnabled();
  });

  it('opens a new session for the upload when the stored session already ended', async () => {
    vi.mocked(captureApi.getSession).mockResolvedValue({
      ...session('failed'),
      frames: [],
    } as Awaited<ReturnType<typeof captureApi.getSession>>);
    vi.mocked(captureApi.createSession).mockResolvedValue(session('draft', 'sess-2'));
    storeFrame('sess-1');

    renderAt('/tours/capture/sess-1');
    await userEvent.click(await screen.findByRole('button', { name: /upload & create tour/i }));

    // A terminal session never changes: a new one walks draft > capturing > review > uploading.
    await waitFor(() => expect(captureApi.completeSession).toHaveBeenCalledWith('sess-2'));
    const moves = vi.mocked(captureApi.moveSession).mock.calls.map(([id, status]) => `${id}:${status}`);
    expect(moves).toEqual(['sess-2:capturing', 'sess-2:review', 'sess-2:uploading']);
    expect(vi.mocked(captureApi.registerFrame).mock.calls[0][0]).toBe('sess-2');
  });
});
