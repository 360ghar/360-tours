// User Types
export interface User {
  id: string;
  supabase_user_id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  profile_image_url: string | null;
  role: 'user' | 'agent' | 'admin';
  is_active: boolean;
  is_verified: boolean;
  preferences: Record<string, unknown>;
  notification_settings: Record<string, unknown>;
  privacy_settings: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

// Tour Types
export type TourStatus = 'draft' | 'published' | 'archived';

/**
 * Tour visibility controls access permissions:
 * - private: Only the owner can view (requires authentication)
 * - unlisted: Anyone with the link can view, but not indexed in public listings
 * - public: Visible in public listings and searchable
 */
export type TourVisibility = 'private' | 'unlisted' | 'public';

export interface Tour {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TourStatus;
  visibility: TourVisibility;
  is_featured: boolean;
  view_count: number;
  like_count: number;
  share_count: number;
  settings: TourSettings | null;
  thumbnail_url: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  scenes?: Scene[];
  scene_count?: number;
}

export interface BrandingSettings {
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  text_color: string;
  background_color: string;
  font_family: string;
  button_style: 'rounded' | 'square' | 'pill';
  show_watermark: boolean;
  watermark_position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  custom_css?: string;
}

export interface TourSettings {
  auto_rotate: boolean;
  auto_rotate_speed: number;
  initial_scene_id?: string;
  initial_view?: {
    yaw: number;
    pitch: number;
    zoom?: number;
  };
  show_navbar: boolean;
  enable_fullscreen: boolean;
  enable_vr: boolean;
  enable_gyroscope: boolean;
  gyroscope_auto_start: boolean;
  branding?: BrandingSettings;
  floor_plans?: FloorPlan[];
}

// Floor Plan Types
export interface FloorPlanMarker {
  scene_id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  label?: string;
}

export interface FloorPlan {
  id: string;
  name: string;
  image_url: string;
  floor_number: number;
  markers: FloorPlanMarker[];
}

// Floor Plan API types (for dedicated floor_plans table)
export interface FloorPlanResponse extends FloorPlan {
  tour_id: string;
  created_at: string;
  updated_at: string;
}

export interface FloorPlanCreateInput {
  name: string;
  image_url: string;
  floor_number?: number;
  markers?: FloorPlanMarker[];
}

export interface FloorPlanUpdateInput {
  name?: string;
  image_url?: string;
  floor_number?: number;
  markers?: FloorPlanMarker[];
}

export interface TourCreateInput {
  title: string;
  description?: string;
  status?: TourStatus;
  visibility?: TourVisibility;
  settings?: Partial<TourSettings>;
}

export interface TourUpdateInput extends Partial<TourCreateInput> {
  is_featured?: boolean;
  visibility?: TourVisibility;
}

// Scene Types
export interface Scene {
  id: string;
  tour_id: string;
  title: string | null;
  description: string | null;
  image_url: string;
  thumbnail_url: string | null;
  vr_url: string | null;
  order_index: number;
  metadata?: SceneMetadata | null;
  is_processed: boolean;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
  hotspots?: Hotspot[];
}

export interface SceneMetadata {
  initial_view?: {
    yaw: number;
    pitch: number;
    zoom?: number;
  };
  camera?: {
    fov?: number;
    min_fov?: number;
    max_fov?: number;
  };
  gps?: {
    latitude: number;
    longitude: number;
  };
  exif?: Record<string, unknown>;
}

export interface SceneCreateInput {
  title?: string;
  description?: string;
  image_url: string;
  thumbnail_url?: string;
  order_index?: number;
  metadata?: Partial<SceneMetadata>;
}

export type SceneUpdateInput = Partial<SceneCreateInput>;

// Hotspot Types
export type HotspotType = 'navigation' | 'info' | 'audio' | 'video' | 'link' | 'custom';

export interface HotspotPosition {
  yaw: number;
  pitch: number;
  radius?: number;
}

export interface Hotspot {
  id: string;
  scene_id: string;
  type: HotspotType;
  position: HotspotPosition;
  target_scene_id: string | null;
  title: string | null;
  description: string | null;
  icon: string | null;
  icon_name: string | null;
  icon_color: string | null;
  icon_size: number | null;
  content: Record<string, unknown> | null;
  custom_data: Record<string, unknown>;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HotspotCreateInput {
  type: HotspotType;
  position: HotspotPosition;
  target_scene_id?: string | null;
  title?: string | null;
  description?: string | null;
  icon?: string | null;
  icon_name?: string | null;
  icon_color?: string | null;
  icon_size?: number;
  content?: Record<string, unknown> | null;
  custom_data?: Record<string, unknown>;
}

export interface HotspotUpdateInput extends Partial<HotspotCreateInput> {
  is_active?: boolean;
}

// Analytics Types
export interface TourAnalytics {
  tour_id: string;
  user_id?: string;
  total_views: number;
  unique_views: number;
  total_likes: number;
  total_shares: number;
  avg_session_duration: number;
  scene_views: Record<string, number>;
  hotspot_clicks: Record<string, number>;
  device_breakdown: {
    desktop: number;
    mobile: number;
    tablet: number;
    vr: number;
  };
  country_breakdown: Record<string, number>;
  daily_views: Array<{
    date: string;
    views: number;
  }>;
}

export interface HeatmapPoint {
  scene_id?: string;
  yaw?: number;
  pitch?: number;
  x?: number;
  y?: number;
  intensity: number;
}

export interface TourHeatmapData {
  tour_id: string;
  heatmap: HeatmapPoint[];
}

export interface DashboardStats {
  total_tours: number;
  published_tours: number;
  total_views: number;
  total_scenes: number;
  storage_used: number;
  storage_limit: number;
}

export interface DashboardRealtimeStats {
  active_sessions: number;
  views_last_hour: number;
  likes_last_hour: number;
  shares_last_hour: number;
  avg_session_duration: number;
  recent_views: Array<{ date: string; views: number }>;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  // FastAPI error format
  detail?: string | { code?: string; message?: string };
}

export interface CursorPaginatedResponse<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
  total?: number;
}

// Auth Types
export interface LoginCredentials {
  phone: string;
  password: string;
}

export interface RegisterCredentials {
  phone: string;
  password: string;
  full_name?: string;
  email?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Upload Types
export interface UploadProgress {
  file_name: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  url?: string;
}

// Backend upload response format
export interface FileUploadResponse {
  file_path: string;
  public_url: string;
  file_type: string;
  file_size: number;
  content_type: string;
  original_filename: string;
}

// Media Types
export interface MediaFile {
  id: string;
  user_id: number;
  tour_id?: string | null;
  filename: string;
  original_filename: string | null;
  file_url: string;
  thumbnail_url: string | null;
  cdn_url: string | null;
  file_size: number;
  purpose?: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration?: number | null;
  folder: string | null;
  visibility: 'public' | 'private' | 'unlisted';
  is_processed: boolean;
  processing_metadata?: Record<string, unknown> | null;
  created_at: string;
  expires_at?: string | null;
}

// AI Processing Types
export type AIJobType =
  | 'tour_generation'
  | 'scene_detection'
  | 'hotspot_suggestions'
  | 'description_generation'
  | 'quality_checks'
  | 'generate_reel'
  // Accepted for older backend responses while the API is converging on the PRD names.
  | 'hotspot_placement'
  | 'optimization';
export type AIJobStatus = 'queued' | 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';

export interface AIProcessingJob {
  id: string;
  tour_id: string;
  user_id: string;
  job_type: AIJobType;
  status: AIJobStatus;
  progress: number;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  error_message: string | null;
  estimated_duration: number | null;
  actual_duration: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
