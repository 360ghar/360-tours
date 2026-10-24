import { apiClient, extractData } from './client';
import { clampLimit, fetchAllPages, MAX_PAGE_LIMIT } from './pagination';
import type {
  Tour,
  TourWithScenes,
  PublicTour,
  TourStatus,
  TourCreateInput,
  TourUpdateInput,
  Scene,
  SceneCreateInput,
  SceneUpdateInput,
  Hotspot,
  HotspotCreateInput,
  HotspotUpdateInput,
  FloorPlan,
  FloorPlanCreateInput,
  FloorPlanUpdateInput,
  TourAnalytics,
  DashboardStats,
  DashboardRealtimeStats,
  TourHeatmapData,
  TourEventPayload,
  CursorPaginatedResponse,
} from '@/types';
import type { components } from '@/lib/api/schema.gen';

export type TourLikeCount = components['schemas']['TourLikeCount'];

export interface TourListParams {
  cursor?: string | null;
  limit?: number;
  status?: TourStatus;
  search?: string;
  include_total?: boolean;
}

export const toursApi = {
  /**
   * One page of the current user's tours. Follow `next_cursor` for more.
   */
  async getTours(params?: TourListParams): Promise<CursorPaginatedResponse<Tour>> {
    const response = await apiClient.get<CursorPaginatedResponse<Tour>>('/tours', {
      params: {
        ...params,
        cursor: params?.cursor ?? undefined,
        limit: clampLimit(params?.limit),
      },
    });
    return extractData(response);
  },

  /** Every tour that matches the filters: follows `next_cursor` (a page holds at most 100). */
  async getAllTours(params?: Omit<TourListParams, 'cursor' | 'limit'>): Promise<Tour[]> {
    return fetchAllPages(cursor =>
      toursApi.getTours({ ...params, cursor, limit: MAX_PAGE_LIMIT })
    );
  },

  /**
   * Get one of the caller's tours (the owner shape, with `user_id`). The scenes
   * list can be longer than one page; read it with `getScenes`.
   */
  async getTour(id: string): Promise<TourWithScenes> {
    const response = await apiClient.get<TourWithScenes>(`/tours/${id}`);
    return extractData(response);
  },

  /**
   * Create a tour. A new tour is always a draft: `status` is not accepted.
   */
  async createTour(data: TourCreateInput): Promise<Tour> {
    const response = await apiClient.post<Tour>('/tours', data);
    return extractData(response);
  },

  /**
   * Update a tour. `status` is not accepted: use publish and unpublish.
   */
  async updateTour(id: string, data: TourUpdateInput): Promise<Tour> {
    const response = await apiClient.patch<Tour>(`/tours/${id}`, data);
    return extractData(response);
  },

  /** Delete a tour (204). */
  async deleteTour(id: string): Promise<void> {
    await apiClient.delete(`/tours/${id}`);
  },

  async publishTour(id: string): Promise<Tour> {
    const response = await apiClient.post<Tour>(`/tours/${id}/publish`);
    return extractData(response);
  },

  async unpublishTour(id: string): Promise<Tour> {
    const response = await apiClient.post<Tour>(`/tours/${id}/unpublish`);
    return extractData(response);
  },

  async duplicateTour(id: string): Promise<Tour> {
    const response = await apiClient.post<Tour>(`/tours/${id}/duplicate`);
    return extractData(response);
  },

  async getTourAnalytics(
    id: string,
    params?: { start_date?: string; end_date?: string }
  ): Promise<TourAnalytics> {
    const response = await apiClient.get<TourAnalytics>(`/tours/${id}/analytics`, { params });
    return extractData(response);
  },

  async getDashboardStats(): Promise<DashboardStats> {
    const response = await apiClient.get<DashboardStats>('/dashboard/stats');
    return extractData(response);
  },

  /** Realtime counters and the 5-minute view buckets (`recent_views[].timestamp`, UTC). */
  async getDashboardRealtime(): Promise<DashboardRealtimeStats> {
    const response = await apiClient.get<DashboardRealtimeStats>('/dashboard/realtime');
    return extractData(response);
  },

  /**
   * Heatmap of where viewers look: a flat list of `{scene_id, yaw, pitch,
   * intensity, count}`. Only the tour owner may read it.
   */
  async getTourHeatmap(
    id: string,
    params?: { scene_id?: string; start_date?: string; end_date?: string }
  ): Promise<TourHeatmapData> {
    const response = await apiClient.get<TourHeatmapData>(`/tours/${id}/heatmap`, { params });
    return extractData(response);
  },

  // ─── Scenes ───────────────────────────────────────────────────────────
  /** Every scene of a tour: follows `next_cursor` (a page holds at most 100). */
  async getScenes(tourId: string): Promise<Scene[]> {
    return fetchAllPages(async cursor => {
      const response = await apiClient.get<CursorPaginatedResponse<Scene>>(
        `/tours/${tourId}/scenes`,
        { params: { limit: MAX_PAGE_LIMIT, cursor: cursor ?? undefined } }
      );
      return extractData(response);
    });
  },

  /** Add a scene. The server appends it; order it with `reorderScenes`. */
  async createScene(tourId: string, data: SceneCreateInput): Promise<Scene> {
    const response = await apiClient.post<Scene>(`/tours/${tourId}/scenes`, data);
    return extractData(response);
  },

  async updateScene(id: string, data: SceneUpdateInput): Promise<Scene> {
    const response = await apiClient.patch<Scene>(`/scenes/${id}`, data);
    return extractData(response);
  },

  async deleteScene(id: string): Promise<void> {
    await apiClient.delete(`/scenes/${id}`);
  },

  /** Reorder scenes. Returns the first page of the reordered list. */
  async reorderScenes(
    tourId: string,
    sceneIds: string[]
  ): Promise<CursorPaginatedResponse<Scene>> {
    const response = await apiClient.post<CursorPaginatedResponse<Scene>>(
      `/tours/${tourId}/scenes/reorder`,
      { scene_ids: sceneIds }
    );
    return extractData(response);
  },

  // ─── Hotspots ─────────────────────────────────────────────────────────
  async createHotspot(sceneId: string, data: HotspotCreateInput): Promise<Hotspot> {
    const response = await apiClient.post<Hotspot>(`/scenes/${sceneId}/hotspots`, data);
    return extractData(response);
  },

  /** PATCH: send only the keys that changed. An explicit `null` clears a nullable field. */
  async updateHotspot(id: string, data: HotspotUpdateInput): Promise<Hotspot> {
    const response = await apiClient.patch<Hotspot>(`/hotspots/${id}`, data);
    return extractData(response);
  },

  async deleteHotspot(id: string): Promise<void> {
    await apiClient.delete(`/hotspots/${id}`);
  },

  async updateHotspotPosition(
    id: string,
    position: { yaw: number; pitch: number }
  ): Promise<Hotspot> {
    const response = await apiClient.put<Hotspot>(`/hotspots/${id}/position`, position);
    return extractData(response);
  },

  // ─── Floor plans: the floor_plans table is the only source ────────────
  /** Every floor plan of a tour: follows `next_cursor`. */
  async getFloorPlans(tourId: string): Promise<FloorPlan[]> {
    return fetchAllPages(async cursor => {
      const response = await apiClient.get<CursorPaginatedResponse<FloorPlan>>(
        `/tours/${tourId}/floor-plans`,
        { params: { limit: MAX_PAGE_LIMIT, cursor: cursor ?? undefined } }
      );
      return extractData(response);
    });
  },

  async createFloorPlan(tourId: string, data: FloorPlanCreateInput): Promise<FloorPlan> {
    const response = await apiClient.post<FloorPlan>(`/tours/${tourId}/floor-plans`, data);
    return extractData(response);
  },
  /**
   * Build a schematic floor plan from the tour's analyzed scenes and doorway
   * links. Deterministic and instant (no AI call at this point); generating
   * again replaces the previous AI-estimated plan instead of adding another.
   */
  async generateFloorPlan(tourId: string): Promise<FloorPlan> {
    const response = await apiClient.post<FloorPlan>(`/tours/${tourId}/floor-plans/generate`);
    return extractData(response);
  },

  /** PUT with a partial body: the keys that are sent replace the stored ones. */
  async updateFloorPlan(
    tourId: string,
    floorPlanId: string,
    data: FloorPlanUpdateInput
  ): Promise<FloorPlan> {
    const response = await apiClient.put<FloorPlan>(
      `/tours/${tourId}/floor-plans/${floorPlanId}`,
      data
    );
    return extractData(response);
  },

  async deleteFloorPlan(tourId: string, floorPlanId: string): Promise<void> {
    await apiClient.delete(`/tours/${tourId}/floor-plans/${floorPlanId}`);
  },

  // ─── Public tour API (anonymous: no Bearer token) ─────────────────────
  /**
   * A published tour with its public scenes (active hotspots only) and its
   * floor plans. `track: false` skips the view count.
   */
  async getPublicTour(id: string, params?: { track?: boolean }): Promise<PublicTour> {
    const response = await apiClient.get<PublicTour>(`/public/tours/${id}`, {
      params: params?.track === undefined ? undefined : { track: params.track },
    });
    return extractData(response);
  },

  /**
   * Record a viewer event (204, no body). `event_type` is one of the ten
   * `ViewerEventType` values. A `scene_view` needs `scene_id` and numeric
   * `event_data.yaw` and `event_data.pitch`.
   */
  async trackEvent(tourId: string, event: TourEventPayload): Promise<void> {
    await apiClient.post(`/public/tours/${tourId}/events`, event);
  },

  async likePublicTour(tourId: string): Promise<TourLikeCount> {
    const response = await apiClient.post<TourLikeCount>(`/public/tours/${tourId}/like`);
    return extractData(response);
  },

  async unlikePublicTour(tourId: string): Promise<TourLikeCount> {
    const response = await apiClient.delete<TourLikeCount>(`/public/tours/${tourId}/like`);
    return extractData(response);
  },
};
