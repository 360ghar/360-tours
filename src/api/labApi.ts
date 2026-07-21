import { apiClient as api } from './client'; // Assumes you have a base axios client

export interface SplatJob {
  id: string;
  title: string;
  status: 'pending' | 'extracting' | 'converting' | 'sfm' | 'training' | 'compressing' | 'ready' | 'failed';
  progress: number;
  stage_message: string;
  splat_url?: string;
  supersplat_url?: string;
  error_message?: string;
  created_at: string;
}

export const labApi = {
  createJob: async (data: { title: string; is_360_video?: boolean; quality_preset?: string }) => {
    const response = await api.post('/lab/jobs', data);
    return response.data as { job_id: string; upload_path: string };
  },

  startJob: async (jobId: string) => {
    const response = await api.post(`/lab/jobs/${jobId}/start`);
    return response.data;
  },

  getJobs: async () => {
    const response = await api.get('/lab/jobs');
    return response.data as SplatJob[];
  },

  getJob: async (jobId: string) => {
    const response = await api.get(`/lab/jobs/${jobId}`);
    return response.data as SplatJob;
  },

  deleteJob: async (jobId: string) => {
    const response = await api.delete(`/lab/jobs/${jobId}`);
    return response.data;
  }
};
