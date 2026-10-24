/**
 * Domain types.
 *
 * Every type that describes a backend payload is an alias of the generated
 * OpenAPI components (`src/lib/api/schema.gen.ts`, built by `npm run api:types`).
 * Do not re-declare an API shape by hand. Types that exist only in the UI
 * (resolved settings, upload progress, auth state) stay hand-written below.
 */
import type { components } from '@/lib/api/schema.gen';

type Schemas = components['schemas'];

// ─── Users ──────────────────────────────────────────────────────────────
/** `GET|PUT /users/me`. `id` is an integer, `supabase_user_id` is the Supabase UUID. */
export type User = Schemas['SelfUser'];
export type NotificationSettings = Schemas['NotificationSettings'];
export type NotificationSettingsWrite = Schemas['NotificationSettingsWrite'];
export type UserUpdate = Schemas['UserUpdate'];

// ─── Tours ──────────────────────────────────────────────────────────────
export type TourStatus = Schemas['TourStatus'];

/**
 * Tour visibility controls access permissions:
 * - private: Only the owner can view (requires authentication)
 * - unlisted: Anyone with the link can view, but not indexed in public listings
 * - public: Visible in public listings and searchable
 */
export type TourVisibility = Schemas['TourVisibility'];

/** List rows and mutation responses (`GET /tours`, `PATCH /tours/{id}`, ...). */
export type Tour = Schemas['Tour'];
/** `GET /tours/{id}` for the owner: scenes and the floor_plans table rows (always lists). */
export type TourWithScenes = Omit<Schemas['TourWithScenes'], 'scenes' | 'floor_plans'> & {
  scenes: Scene[];
  floor_plans: FloorPlan[];
};
/** `GET /public/tours/{id}`: no `user_id`, active hotspots only (scenes and floor plans are always lists). */
export type PublicTour = Omit<Schemas['PublicTourWithScenes'], 'scenes' | 'floor_plans'> & {
  scenes: PublicScene[];
  floor_plans: FloorPlan[];
};

/** Wire shape: every key is optional and nullable. Resolve it before reading. */
export type TourSettings = Schemas['TourSettings'];
export type BrandingSettings = Schemas['TourBrandingSettings'];

type NonNull<T> = { [K in keyof T]-?: NonNullable<T[K]> };

/** Branding with every default applied. `logo_url` and `custom_css` stay optional. */
export type ResolvedBranding = Omit<NonNull<BrandingSettings>, 'logo_url' | 'custom_css'> & {
  logo_url?: string;
  custom_css?: string;
};

/** Tour settings with every default applied (see `resolveTourSettings`). */
export type ResolvedTourSettings = Omit<
  NonNull<TourSettings>,
  'initial_scene_id' | 'initial_view' | 'branding'
> & {
  initial_scene_id?: string;
  initial_view?: { yaw?: number; pitch?: number };
  branding: ResolvedBranding;
};

export type TourCreateInput = Schemas['TourCreate'];
export type TourUpdateInput = Schemas['TourUpdate'];

// ─── Floor plans (the `floor_plans` table is the only source) ───────────
export type FloorPlanMarker = Schemas['FloorPlanMarker'];
export type FloorPlanMarkerInput = Schemas['FloorPlanMarkerIn'];
export type FloorPlan = Schemas['FloorPlanResponse'] &
  Required<Pick<Schemas['FloorPlanResponse'], 'markers'>>;
export type FloorPlanResponse = FloorPlan;
export type FloorPlanCreateInput = Schemas['FloorPlanCreate'];
export type FloorPlanUpdateInput = Schemas['FloorPlanUpdate'];

// ─── Scenes ─────────────────────────────────────────────────────────────
/** Owner scene (`processing_error`, `gps` and `exif` included); `hotspots` is always a list. */
export type Scene = Schemas['Scene'] & Required<Pick<Schemas['Scene'], 'hotspots'>>;
/** Public scene. An owner `Scene` is assignable to it, so viewers take this type. */
export type PublicScene = Schemas['PublicScene'] & Required<Pick<Schemas['PublicScene'], 'hotspots'>>;
export type SceneMetadata = Schemas['SceneMetadata'];
export type SceneCreateInput = Schemas['SceneCreate'];
export type SceneUpdateInput = Schemas['SceneUpdate'];

// ─── Hotspots ───────────────────────────────────────────────────────────
export type HotspotType = Schemas['HotspotType'];
export type Hotspot = Schemas['Hotspot'];
export type HotspotPosition = Schemas['HotspotPosition'];
export type HotspotCreateInput = Schemas['HotspotCreate'];
export type HotspotUpdateInput = Schemas['HotspotUpdate'];

export type NavigationHotspotContent = Schemas['NavigationContent'];
export type InfoHotspotContent = Schemas['InfoContent'];
export type AudioHotspotContent = Schemas['AudioContent'];
export type VideoHotspotContent = Schemas['VideoContent'];
export type LinkHotspotContent = Schemas['LinkContent'];
export type CustomHotspotContent = Schemas['CustomContent'];
export type LinkHotspotTarget = NonNullable<LinkHotspotContent['target']>;

/** Content as the backend stores and returns it (the keys of the hotspot type). */
export type HotspotContent = NonNullable<Hotspot['content']>;

export type HotspotCustomData = NonNullable<Hotspot['custom_data']>;

// ─── Analytics ──────────────────────────────────────────────────────────
/** Analytics counters: the server always sends every key. */
export type TourAnalytics = Required<Omit<Schemas['TourAnalytics'], 'device_breakdown'>> & {
  device_breakdown: Required<Schemas['DeviceBreakdown']>;
};
/** One aggregated view direction: one point per 5-degree cell per scene. */
export type HeatmapPoint = Schemas['HeatmapPoint'];
/** `heatmap` is always a list (empty when no viewer looked yet). */
export type TourHeatmapData = Required<Schemas['TourHeatmapData']>;
export type ViewerEventType = Schemas['ViewerEventType'];
export type TourEventPayload = Schemas['TourEventPayload'];

/** Dashboard counters: the server always sends every key. */
export type DashboardStats = Required<Schemas['DashboardStats']>;
export type DashboardRealtimeStats = Required<Schemas['DashboardRealtimeStats']>;

// ─── Errors and pagination ──────────────────────────────────────────────
export type ErrorEnvelope = Schemas['ErrorEnvelope'];
export type ValidationErrorEnvelope = Schemas['ValidationErrorEnvelope'];
export type ValidationFieldError = Schemas['ValidationFieldError'];
/** Body of every non-2xx JSON response. */
export type ApiError = ErrorEnvelope | ValidationErrorEnvelope;

/** One page of any list route. `total` is null unless `include_total=true`. */
export interface CursorPaginatedResponse<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
  total: number | null;
}

// ─── Auth (UI state) ────────────────────────────────────────────────────
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

// ─── Uploads and media ──────────────────────────────────────────────────
export interface UploadProgress {
  file_name: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  url?: string;
}

/** `POST /upload` (201). `media` carries the new MediaFile row. */
export type FileUploadResponse = Schemas['UploadResult'];
export type StorageFolderType = Schemas['StorageFolderType'];
export type MediaFile = Schemas['MediaFileResponse'];
export type MediaVisibility = MediaFile['visibility'];

// ─── AI jobs ────────────────────────────────────────────────────────────
export type AIJobType = Schemas['AIJobType'];
export type AIJobStatus = Schemas['AIJobStatus'];
export type AIProcessingJob = Schemas['AIJobBase'];
export type TourGenerationResult = Schemas['TourGenerationResult'];
export type TourGenerationSceneSummary = Schemas['TourGenerationSceneSummary'];
