import { apiClient, extractData } from './client';
import type {
  CaptureFrame,
  CaptureFrameCreateInput,
  CaptureSession,
  CaptureSessionDetail,
  CaptureSessionCreateInput,
  CaptureSessionStatus,
} from '@/types/capture';

/**
 * Capture session state machine (the server enforces it):
 *
 *   draft -> capturing -> review -> uploading -> processing -> ready
 *
 * A client PATCH may move draft->capturing, capturing->review,
 * review->capturing, review->uploading, uploading->review, and any
 * non-terminal state -> failed. `complete` runs processing -> ready.
 * `ready`, `failed` and `cancelled` are terminal: any other status is a 400.
 */
export const captureApi = {
  async createSession(data: CaptureSessionCreateInput): Promise<CaptureSession> {
    const response = await apiClient.post<CaptureSession>('/capture-sessions', data);
    return extractData(response);
  },

  async getSession(id: string): Promise<CaptureSessionDetail> {
    const response = await apiClient.get<CaptureSessionDetail>(`/capture-sessions/${id}`);
    return extractData(response);
  },

  /** Move the session along the state machine. Sending the current status is accepted. */
  async moveSession(id: string, status: CaptureSessionStatus): Promise<CaptureSession> {
    const response = await apiClient.patch<CaptureSession>(`/capture-sessions/${id}`, { status });
    return extractData(response);
  },

  /** Record a failure: `failed` with the reason. The server keeps `error_message` only with `failed`. */
  async failSession(id: string, errorMessage: string): Promise<CaptureSession> {
    const response = await apiClient.patch<CaptureSession>(`/capture-sessions/${id}`, {
      status: 'failed',
      error_message: errorMessage.slice(0, 1000),
    });
    return extractData(response);
  },

  async registerFrame(sessionId: string, data: CaptureFrameCreateInput): Promise<CaptureFrame> {
    const response = await apiClient.post<CaptureFrame>(
      `/capture-sessions/${sessionId}/frames`,
      data
    );
    return extractData(response);
  },

  /** Allowed from capturing, review or uploading, with at least one frame. */
  async completeSession(id: string): Promise<CaptureSession> {
    const response = await apiClient.post<CaptureSession>(`/capture-sessions/${id}/complete`);
    return extractData(response);
  },

  async cancelSession(id: string): Promise<CaptureSession> {
    const response = await apiClient.post<CaptureSession>(`/capture-sessions/${id}/cancel`);
    return extractData(response);
  },
};
