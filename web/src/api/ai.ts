import { apiClient } from './client';
import type { components } from '@/lib/api/schema.gen';
import { API_LIMITS } from '@/lib/api/limits.gen';

type Schemas = components['schemas'];

/** `POST /ai/tours/{id}/analyze` and the other job-starting routes: `{job}`. */
export type AIJobResponse = Schemas['AIJobResponse'];
/** `POST /ai/tours/generate`: the job plus the ids of the tour and scenes it creates. */
export type TourGenerationResponse = Schemas['TourGenerationResponse'];
/** `GET /ai/jobs/{id}` and `POST /ai/jobs/{id}/cancel`: `{job, result}`. */
export type AIJobStatusResponse = Schemas['AIJobStatusResponse'];
/** The `result` of a finished job: one model per job type, null while it has none. */
export type AIJobResult = NonNullable<AIJobStatusResponse['result']>;
export type DescriptionOptions = Schemas['DescriptionOptions'];

/**
 * Form fields of `POST /ai/tours/generate` (multipart). `spatial` is always sent:
 * the server default is true, and it decides how hotspots are placed (doorway
 * detection when true; naive suggestions only when it is false).
 */
export type TourGenerationOptions = Omit<
  Schemas['Body_generate_tour_api_v1_ai_tours_generate_post'],
  'images'
> & {
  images: File[];
};

/**
 * Generate a complete tour from uploaded images using AI.
 */
export async function generateTour(
  options: TourGenerationOptions,
  onProgress?: (progress: number) => void
): Promise<TourGenerationResponse> {
  const formData = new FormData();

  options.images.forEach(image => {
    formData.append('images', image);
  });

  if (options.title) {
    formData.append('title', options.title.slice(0, API_LIMITS.tour.titleMax));
  }
  if (options.description) {
    formData.append('description', options.description.slice(0, API_LIMITS.tour.descriptionMax));
  }
  if (options.generate_titles !== undefined) {
    formData.append('generate_titles', String(options.generate_titles));
  }
  if (options.generate_descriptions !== undefined) {
    formData.append('generate_descriptions', String(options.generate_descriptions));
  }
  if (options.suggest_hotspots !== undefined) {
    formData.append('suggest_hotspots', String(options.suggest_hotspots));
  }
  if (options.spatial !== undefined) {
    formData.append('spatial', String(options.spatial));
  }
  if (options.apply_to_scenes !== undefined) {
    formData.append('apply_to_scenes', String(options.apply_to_scenes));
  }
  if (options.language) formData.append('language', options.language);

  // Content-Type is intentionally unset: the request interceptor clears it for
  // FormData so the browser emits the multipart boundary.
  const response = await apiClient.post<TourGenerationResponse>('/ai/tours/generate', formData, {
    onUploadProgress: progressEvent => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(progress);
      }
    },
  });

  return response.data;
}

/**
 * Analyze scenes in a tour to detect room types and quality
 */
export async function analyzeScenes(tourId: string): Promise<AIJobResponse> {
  const response = await apiClient.post<AIJobResponse>(`/ai/tours/${tourId}/analyze`);
  return response.data;
}

/**
 * Get AI-suggested hotspots for a scene
 */
export async function suggestHotspots(sceneId: string): Promise<AIJobResponse> {
  const response = await apiClient.post<AIJobResponse>(`/ai/scenes/${sceneId}/hotspots`);
  return response.data;
}

/**
 * Generate AI descriptions for scenes in a tour
 */
export async function generateDescriptions(
  tourId: string,
  options?: DescriptionOptions
): Promise<AIJobResponse> {
  const response = await apiClient.post<AIJobResponse>(`/ai/tours/${tourId}/descriptions`, options);
  return response.data;
}

/**
 * Re-run AI doorway linking on an existing tour. Replaces previously
 * AI-generated navigation hotspots with a fresh, reachable set built from the
 * scenes' panoramas; manually placed hotspots are kept.
 */
export async function connectSpatial(tourId: string): Promise<AIJobResponse> {
  const response = await apiClient.post<AIJobResponse>(`/ai/tours/${tourId}/connect-spatial`);
  return response.data;
}

/**
 * Get the status of an AI processing job
 */
export async function getJobStatus(jobId: string): Promise<AIJobStatusResponse> {
  const response = await apiClient.get<AIJobStatusResponse>(`/ai/jobs/${jobId}`);
  return response.data;
}

/**
 * Cancel a running AI job. Returns the job with its final state; a job that
 * already finished or was cancelled answers 409 `JOB_NOT_CANCELLABLE`.
 */
export async function cancelJob(jobId: string): Promise<AIJobStatusResponse> {
  const response = await apiClient.post<AIJobStatusResponse>(`/ai/jobs/${jobId}/cancel`);
  return response.data;
}

export const aiApi = {
  generateTour,
  analyzeScenes,
  suggestHotspots,
  generateDescriptions,
  connectSpatial,
  getJobStatus,
  cancelJob,
};
