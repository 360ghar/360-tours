import { apiClient, extractData } from './client';
import type { SplatJob, CreateSplatJobRequest } from '@/types/lab';

interface JobListResponse {
  jobs: SplatJob[];
  total: number;
}

export const labApi = {
  /**
   * Create a new splat job
   */
  async createJob(data: CreateSplatJobRequest): Promise<SplatJob> {
    const response = await apiClient.post<SplatJob>('/lab/jobs', data);
    return extractData(response);
  },

  /**
   * Get all splat jobs for the current user.
   * Backend returns { jobs: [], total: N } so we unwrap to the array.
   */
  async getJobs(): Promise<SplatJob[]> {
    const response = await apiClient.get<JobListResponse>('/lab/jobs');
    const data = extractData(response);
    return data.jobs;
  },

  /**
   * Get a single splat job by ID
   */
  async getJob(jobId: string): Promise<SplatJob> {
    const response = await apiClient.get<SplatJob>(`/lab/jobs/${jobId}`);
    return extractData(response);
  },

  /**
   * Delete a splat job
   */
  async deleteJob(jobId: string): Promise<void> {
    await apiClient.delete(`/lab/jobs/${jobId}`);
  },

  /**
   * Get a presigned upload URL for a job's video file.
   * Backend route is POST /lab/jobs/{job_id}/upload-video (no body needed).
   */
  async getUploadUrl(
    jobId: string,
    filename: string
  ): Promise<{ upload_url: string; storage_path: string }> {
    const response = await apiClient.post<{ upload_url: string; storage_path: string }>(
      `/lab/jobs/${jobId}/upload-video?filename=${encodeURIComponent(filename)}`
    );
    return extractData(response);
  },

  /**
   * Start the processing pipeline for a job
   */
  async startPipeline(jobId: string): Promise<SplatJob> {
    const response = await apiClient.post<SplatJob>(`/lab/jobs/${jobId}/start`);
    return extractData(response);
  },
};
