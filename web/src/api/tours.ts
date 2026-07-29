import { apiClient, extractData } from './client';
import type {
  Tour,
  TourCreateInput,
  TourUpdateInput,
  Scene,
  SceneCreateInput,
  SceneUpdateInput,
  Hotspot,
  HotspotCreateInput,
  HotspotUpdateInput,
  TourAnalytics,
  DashboardStats,
  DashboardRealtimeStats,
  TourHeatmapData,
  CursorPaginatedResponse,
  FloorPlanResponse,
  FloorPlanCreateInput,
  FloorPlanUpdateInput,
  FloorPlanMarker,
} from '@/types';

export const toursApi = {
  /**
   * Get all tours for the current user (cursor pagination)
   */
  async getTours(params?: {
    cursor?: string | null;
    limit?: number;
    status?: string;
    search?: string;
  }): Promise<CursorPaginatedResponse<Tour>> {
    const response = await apiClient.get<CursorPaginatedResponse<Tour>>('/tours', {
      params,
    });
    return extractData(response);
  },

  /**
   * Get a single tour by ID (returns tour with scenes)
   */
  async getTour(id: string): Promise<Tour> {
    const response = await apiClient.get<Tour>(`/tours/${id}`);
    return extractData(response);
  },

  /**
   * Create a new tour
   */
  async createTour(data: TourCreateInput): Promise<Tour> {
    const response = await apiClient.post<Tour>('/tours', data);
    return extractData(response);
  },

  /**
   * Update a tour
   */
  async updateTour(id: string, data: TourUpdateInput): Promise<Tour> {
    const response = await apiClient.patch<Tour>(`/tours/${id}`, data);
    return extractData(response);
  },

  /**
   * Delete a tour
   */
  async deleteTour(id: string): Promise<void> {
    await apiClient.delete(`/tours/${id}`);
  },

  /**
   * Publish a tour
   */
  async publishTour(id: string): Promise<Tour> {
    const response = await apiClient.post<Tour>(`/tours/${id}/publish`);
    return extractData(response);
  },

  /**
   * Unpublish a tour
   */
  async unpublishTour(id: string): Promise<Tour> {
    const response = await apiClient.post<Tour>(`/tours/${id}/unpublish`);
    return extractData(response);
  },

  /**
   * Duplicate a tour
   */
  async duplicateTour(id: string): Promise<Tour> {
    const response = await apiClient.post<Tour>(`/tours/${id}/duplicate`);
    return extractData(response);
  },

  /**
   * Get tour analytics
   */
  async getTourAnalytics(id: string, params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<TourAnalytics> {
    const response = await apiClient.get<TourAnalytics>(`/tours/${id}/analytics`, {
      params,
    });
    return extractData(response);
  },

  /**
   * Get dashboard stats
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await apiClient.get<DashboardStats>('/dashboard/stats');
    return extractData(response);
  },

  /**
   * Get realtime dashboard stats including recent daily views
   */
  async getDashboardRealtime(): Promise<DashboardRealtimeStats> {
    const response = await apiClient.get<DashboardRealtimeStats>('/dashboard/realtime');
    return extractData(response);
  },

  /**
   * Get heatmap data for a tour
   */
  async getTourHeatmap(id: string, params?: {
    scene_id?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<TourHeatmapData> {
    const response = await apiClient.get<TourHeatmapData>(`/tours/${id}/heatmap`, { params });
    return extractData(response);
  },

  // Scene Management
  /**
   * Get all scenes for a tour
   */
  async getScenes(tourId: string): Promise<Scene[]> {
    const response = await apiClient.get<Scene[]>(`/tours/${tourId}/scenes`);
    return extractData(response);
  },

  /**
   * Get a single scene
   */
  async getScene(id: string): Promise<Scene> {
    const response = await apiClient.get<Scene>(`/scenes/${id}`);
    return extractData(response);
  },

  /**
   * Add a scene to a tour
   */
  async createScene(tourId: string, data: SceneCreateInput): Promise<Scene> {
    const response = await apiClient.post<Scene>(`/tours/${tourId}/scenes`, data);
    return extractData(response);
  },

  /**
   * Update a scene
   */
  async updateScene(id: string, data: SceneUpdateInput): Promise<Scene> {
    const response = await apiClient.patch<Scene>(`/scenes/${id}`, data);
    return extractData(response);
  },

  /**
   * Delete a scene
   */
  async deleteScene(id: string): Promise<void> {
    await apiClient.delete(`/scenes/${id}`);
  },

  /**
   * Reorder scenes in a tour
   */
  async reorderScenes(tourId: string, sceneIds: string[]): Promise<Scene[]> {
    const response = await apiClient.post<Scene[]>(`/tours/${tourId}/scenes/reorder`, {
      scene_ids: sceneIds,
    });
    return extractData(response);
  },

  // Hotspot Management
  /**
   * Get all hotspots for a scene
   */
  async getHotspots(sceneId: string): Promise<Hotspot[]> {
    const response = await apiClient.get<Hotspot[]>(`/scenes/${sceneId}/hotspots`);
    return extractData(response);
  },

  /**
   * Get a single hotspot
   */
  async getHotspot(id: string): Promise<Hotspot> {
    const response = await apiClient.get<Hotspot>(`/hotspots/${id}`);
    return extractData(response);
  },

  /**
   * Create a hotspot
   */
  async createHotspot(sceneId: string, data: HotspotCreateInput): Promise<Hotspot> {
    const response = await apiClient.post<Hotspot>(`/scenes/${sceneId}/hotspots`, data);
    return extractData(response);
  },

  /**
   * Update a hotspot
   */
  async updateHotspot(id: string, data: HotspotUpdateInput): Promise<Hotspot> {
    const response = await apiClient.patch<Hotspot>(`/hotspots/${id}`, data);
    return extractData(response);
  },

  /**
   * Delete a hotspot
   */
  async deleteHotspot(id: string): Promise<void> {
    await apiClient.delete(`/hotspots/${id}`);
  },

  /**
   * Update hotspot position
   */
  async updateHotspotPosition(id: string, position: { yaw: number; pitch: number }): Promise<Hotspot> {
    const response = await apiClient.put<Hotspot>(`/hotspots/${id}/position`, position);
    return extractData(response);
  },

  // Public Tour API (no auth required)
  /**
   * Get a public tour by ID
   */
  async getPublicTour(id: string, params?: { track?: boolean }): Promise<Tour> {
    const response = await apiClient.get<Tour>(`/public/tours/${id}`, {
      params: params?.track === undefined ? undefined : { track: params.track },
    });
    return extractData(response);
  },

  /**
   * Get scenes for a public tour
   */
  async getPublicTourScenes(tourId: string): Promise<Scene[]> {
    const response = await apiClient.get<Scene[]>(`/public/tours/${tourId}/scenes`);
    return extractData(response);
  },

  /**
   * Get floor plans for a public tour (fallback when not embedded in tour settings)
   */
  async getPublicFloorPlans(tourId: string): Promise<FloorPlanResponse[]> {
    const response = await apiClient.get<FloorPlanResponse[]>(`/public/tours/${tourId}/floor-plans`);
    return extractData(response);
  },

  /**
   * Track analytics event for a public tour
   */
  async trackEvent(tourId: string, eventData: {
    event_type: string;
    scene_id?: string;
    hotspot_id?: string;
    session_id?: string;
    event_data?: Record<string, unknown>;
  }): Promise<void> {
    await apiClient.post(`/public/tours/${tourId}/events`, eventData);
  },

  async likePublicTour(tourId: string, sessionId?: string): Promise<{ like_count: number }> {
    const response = await apiClient.post<{ like_count: number }>(
      `/public/tours/${tourId}/like`,
      undefined,
      {
        headers: sessionId ? { 'x-session-id': sessionId } : undefined,
      }
    );
    return extractData(response);
  },

  async unlikePublicTour(tourId: string, sessionId?: string): Promise<{ like_count: number }> {
    const response = await apiClient.delete<{ like_count: number }>(`/public/tours/${tourId}/like`, {
      headers: sessionId ? { 'x-session-id': sessionId } : undefined,
    });
    return extractData(response);
  },

  // Floor Plan Management
  /**
   * Get all floor plans for a tour
   */
  async getFloorPlans(tourId: string): Promise<FloorPlanResponse[]> {
    const response = await apiClient.get<FloorPlanResponse[]>(`/tours/${tourId}/floor-plans`);
    return extractData(response);
  },

  /**
   * Get a single floor plan
   */
  async getFloorPlan(tourId: string, floorPlanId: string): Promise<FloorPlanResponse> {
    const response = await apiClient.get<FloorPlanResponse>(`/tours/${tourId}/floor-plans/${floorPlanId}`);
    return extractData(response);
  },

  /**
   * Create a floor plan
   */
  async createFloorPlan(tourId: string, data: FloorPlanCreateInput): Promise<FloorPlanResponse> {
    const response = await apiClient.post<FloorPlanResponse>(`/tours/${tourId}/floor-plans`, data);
    return extractData(response);
  },

  /**
   * Update a floor plan
   */
  async updateFloorPlan(tourId: string, floorPlanId: string, data: FloorPlanUpdateInput): Promise<FloorPlanResponse> {
    const response = await apiClient.put<FloorPlanResponse>(`/tours/${tourId}/floor-plans/${floorPlanId}`, data);
    return extractData(response);
  },

  /**
   * Update floor plan markers only
   */
  async updateFloorPlanMarkers(tourId: string, floorPlanId: string, markers: FloorPlanMarker[]): Promise<FloorPlanResponse> {
    const response = await apiClient.put<FloorPlanResponse>(`/tours/${tourId}/floor-plans/${floorPlanId}/markers`, markers);
    return extractData(response);
  },

  /**
   * Delete a floor plan
   */
  async deleteFloorPlan(tourId: string, floorPlanId: string): Promise<void> {
    await apiClient.delete(`/tours/${tourId}/floor-plans/${floorPlanId}`);
  },
};
