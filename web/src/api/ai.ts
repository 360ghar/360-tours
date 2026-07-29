import { apiClient } from './client';
import type { AIProcessingJob, Scene, Hotspot, HotspotPosition, CursorPaginatedResponse } from '@/types';

// AI Job creation response
interface AIJobResponse {
  job: AIProcessingJob;
}

// Scene analysis result
export interface SceneAnalysisResult {
  scene_id: string;
  room_type: string;
  room_confidence: number;
  suggested_title: string;
  suggested_description: string;
  quality_score: number;
  quality_issues?: string[];
  features_detected: string[];
}

// Hotspot suggestion
export interface HotspotSuggestion {
  id: string;
  type: 'navigation' | 'info';
  position: HotspotPosition;
  target_scene_id?: string;
  suggested_title?: string;
  reasoning: string;
  confidence: number;
}

// Tour generation options
export interface TourGenerationOptions {
  images: File[];
  title?: string;
  description?: string;
  auto_detect_rooms?: boolean;
  auto_place_hotspots?: boolean;
  auto_generate_descriptions?: boolean;
}

// Description generation options
export interface DescriptionOptions {
  tone?: 'professional' | 'casual' | 'luxury' | 'friendly';
  length?: 'short' | 'medium' | 'long';
  include_features?: boolean;
  target_audience?: string;
}

// Reel generation options
export interface ReelOptions {
  scene_ids?: string[];
  scene_duration?: number;
  transition_duration?: number;
  rotation_degrees?: number;
}

// Reel generation result
export interface ReelResult {
  tour_id: string;
  video_url: string;
  thumbnail_url?: string;
  duration_seconds: number;
  scene_count: number;
  width: number;
  height: number;
}

// AI Processing status response
export interface AIJobStatusResponse {
  job: AIProcessingJob;
  result?: {
    scenes?: Scene[];
    analysis?: SceneAnalysisResult[];
    hotspots?: HotspotSuggestion[];
    descriptions?: Record<string, string>;
  };
}

/**
 * Generate a complete tour from uploaded images using AI
 */
export async function generateTour(
  options: TourGenerationOptions,
  onProgress?: (progress: number) => void
): Promise<AIJobResponse> {
  const formData = new FormData();

  options.images.forEach((image) => {
    formData.append(`images`, image);
  });

  if (options.title) formData.append('title', options.title);
  if (options.description) formData.append('description', options.description);
  if (options.auto_detect_rooms !== undefined) {
    formData.append('auto_detect_rooms', String(options.auto_detect_rooms));
  }
  if (options.auto_place_hotspots !== undefined) {
    formData.append('auto_place_hotspots', String(options.auto_place_hotspots));
  }
  if (options.auto_generate_descriptions !== undefined) {
    formData.append('auto_generate_descriptions', String(options.auto_generate_descriptions));
  }

  const response = await apiClient.post<AIJobResponse>('/ai/tours/generate', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
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
 * Analyze a single scene
 */
export async function analyzeScene(sceneId: string): Promise<AIJobResponse> {
  const response = await apiClient.post<AIJobResponse>(`/ai/scenes/${sceneId}/analyze`);
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
 * Get AI-suggested hotspots for all scenes in a tour
 */
export async function suggestTourHotspots(tourId: string): Promise<AIJobResponse> {
  const response = await apiClient.post<AIJobResponse>(`/ai/tours/${tourId}/hotspots`);
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
 * Generate AI description for a single scene
 */
export async function generateSceneDescription(
  sceneId: string,
  options?: DescriptionOptions
): Promise<AIJobResponse> {
  const response = await apiClient.post<AIJobResponse>(`/ai/scenes/${sceneId}/description`, options);
  return response.data;
}

/**
 * Generate a 360 reel video from a tour's scenes
 */
export async function generateReel(
  tourId: string,
  options?: ReelOptions
): Promise<AIJobResponse> {
  const response = await apiClient.post<AIJobResponse>(`/ai/tours/${tourId}/reel`, options);
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
 * Cancel a running AI job
 */
export async function cancelJob(jobId: string): Promise<{ success: boolean }> {
  const response = await apiClient.post<{ success: boolean }>(`/ai/jobs/${jobId}/cancel`);
  return response.data;
}

/**
 * Get all AI jobs for the current user (cursor pagination)
 */
export async function getJobs(options?: {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  cursor?: string | null;
  limit?: number;
}): Promise<CursorPaginatedResponse<AIProcessingJob>> {
  const response = await apiClient.get<CursorPaginatedResponse<AIProcessingJob>>('/ai/jobs', {
    params: options,
  });
  return response.data;
}

/**
 * Apply AI scene analysis suggestions to scenes
 */
export async function applySceneAnalysis(
  tourId: string,
  suggestions: Array<{
    scene_id: string;
    apply_title?: boolean;
    apply_description?: boolean;
  }>
): Promise<{ updated: number }> {
  const response = await apiClient.post<{ updated: number }>(`/ai/tours/${tourId}/apply-analysis`, {
    suggestions,
  });
  return response.data;
}

/**
 * Apply AI hotspot suggestions to a scene
 */
export async function applyHotspotSuggestions(
  sceneId: string,
  suggestionIds: string[]
): Promise<{ hotspots: Hotspot[] }> {
  const response = await apiClient.post<{ hotspots: Hotspot[] }>(
    `/ai/scenes/${sceneId}/apply-hotspots`,
    { suggestion_ids: suggestionIds }
  );
  return response.data;
}

// Export all AI API functions
export const aiApi = {
  generateTour,
  analyzeScenes,
  analyzeScene,
  suggestHotspots,
  suggestTourHotspots,
  generateDescriptions,
  generateSceneDescription,
  generateReel,
  getJobStatus,
  cancelJob,
  getJobs,
  applySceneAnalysis,
  applyHotspotSuggestions,
};
