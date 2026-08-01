import { apiClient, extractData } from './client';
import type {
  CaptureFrame,
  CaptureFrameCreateInput,
  CaptureSession,
  CaptureSessionCreateInput,
  CaptureSessionUpdateInput,
} from '@/types/capture';

export const captureApi = {
  async createSession(data: CaptureSessionCreateInput): Promise<CaptureSession> {
    const response = await apiClient.post<CaptureSession>('/capture-sessions', data);
    return extractData(response);
  },

  async getSession(id: string): Promise<CaptureSession> {
    const response = await apiClient.get<CaptureSession>(`/capture-sessions/${id}`);
    return extractData(response);
  },

  async updateSession(id: string, data: CaptureSessionUpdateInput): Promise<CaptureSession> {
    const response = await apiClient.patch<CaptureSession>(`/capture-sessions/${id}`, data);
    return extractData(response);
  },

  async registerFrame(sessionId: string, data: CaptureFrameCreateInput): Promise<CaptureFrame> {
    const response = await apiClient.post<CaptureFrame>(
      `/capture-sessions/${sessionId}/frames`,
      data
    );
    return extractData(response);
  },

  async completeSession(id: string): Promise<CaptureSession> {
    const response = await apiClient.post<CaptureSession>(`/capture-sessions/${id}/complete`);
    return extractData(response);
  },

  async cancelSession(id: string): Promise<CaptureSession> {
    const response = await apiClient.post<CaptureSession>(`/capture-sessions/${id}/cancel`);
    return extractData(response);
  },
};
