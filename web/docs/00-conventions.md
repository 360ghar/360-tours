# Conventions (Source of Truth)

This document defines the **canonical terminology, schemas, and API conventions** used across the PRD suite.

If two documents disagree, treat this file as the tie‑breaker.

## Requirement keywords

- **MUST**: required for compliance with the PRD.
- **SHOULD**: strongly recommended; deviation needs an explicit reason.
- **MAY**: optional; can be implemented later or behind a flag.

## Status labels

- **MVP**: required for v1 launch.
- **Post‑MVP**: planned, not required for v1.
- **Optional**: may ship behind a flag / add‑on.

## Glossary

- **Tour**: A collection of 360° scenes (panoramas) with settings, hotspots, and optional floor plans.
- **Scene**: A single 360° panorama within a tour.
- **Hotspot**: An interactive marker placed on a scene (navigation, info, media, link, etc.).
- **Floor plan**: A 2D image (per floor) with scene markers.
- **Public viewer**: A read‑only experience intended for end‑viewers.
- **Embed viewer**: A public viewer designed to be embedded in other pages via an iframe.
- **AI job**: An asynchronous AI task (tour generation, scene analysis, hotspot suggestions, etc.).

## Coordinate system (360° viewer)

- **Yaw**: horizontal angle in degrees.
  - Range: **-180 to 180**
  - 0° = forward
- **Pitch**: vertical angle in degrees.
  - Range: **-90 to 90**
  - 0° = horizon

## Media conventions

- **Panorama format**: equirectangular (2:1) images are the baseline.
- **Accepted image types (MVP)**: `image/jpeg`, `image/png`, `image/webp`.
- **Recommended panorama resolution**: 6000×3000 or higher (quality dependent).
- **Max upload size**: configured by the backend; docs assume **50MB/image** (MVP default).

## Canonical domain schemas

### ID and timestamp types

- All `id` fields are **opaque strings**. Clients must not assume numeric IDs.
- Timestamps are **ISO 8601 UTC strings** (example: `2026-01-07T12:34:56Z`).

### Tour

```ts
type TourStatus = 'draft' | 'published' | 'archived';

interface Tour {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  status: TourStatus;

  visibility: 'private' | 'unlisted' | 'public';
  is_featured?: boolean;

  settings: TourSettings;
  thumbnail_url?: string | null;

  view_count?: number;
  like_count?: number;
  share_count?: number;

  created_at: string;
  updated_at: string;
  published_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
}

interface TourSettings {
  auto_rotate: boolean;
  auto_rotate_speed?: number; // unitless multiplier; interpretation is viewer-specific

  initial_scene_id?: string;
  initial_view?: { yaw: number; pitch: number; zoom?: number };

  show_navbar: boolean;
  enable_fullscreen: boolean;

  // “VR” is a feature umbrella: cardboard stereo, device orientation, and/or WebXR.
  enable_vr: boolean;
  enable_gyroscope: boolean;
  gyroscope_auto_start: boolean;

  branding?: BrandingSettings;
  floor_plans?: FloorPlan[];
}

interface BrandingSettings {
  logo_url?: string;
  primary_color?: string; // hex, e.g. "#FF5733"
  secondary_color?: string; // hex
  accent_color?: string; // hex
  text_color?: string; // hex, default "#0A0A0B"
  background_color?: string; // hex, default "#FAFAFA"
  font_family?: string; // e.g. "Satoshi", "Inter", "Roboto"
  button_style?: 'rounded' | 'square' | 'pill';
  show_watermark?: boolean;
  watermark_position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  custom_css?: string;
}
```

### Scene

```ts
interface Scene {
  id: string;
  tour_id: string;

  title?: string | null;
  description?: string | null;

  image_url: string;
  thumbnail_url?: string | null;
  vr_url?: string | null;

  order_index: number;
  metadata?: SceneMetadata;

  is_processed?: boolean;
  processing_error?: string | null;

  created_at: string;
  updated_at: string;
}

interface SceneMetadata {
  initial_view?: { yaw: number; pitch: number; zoom?: number };
  camera?: { fov?: number; min_fov?: number; max_fov?: number };
  gps?: { latitude: number; longitude: number };
  exif?: Record<string, unknown>;
}
```

### Hotspot

Hotspots have a **typed content payload**. Keys MUST follow this schema to avoid cross‑component mismatches.

```ts
type HotspotType = 'navigation' | 'info' | 'audio' | 'video' | 'link' | 'custom';

interface Hotspot {
  id: string;
  scene_id: string;

  type: HotspotType;
  position: { yaw: number; pitch: number; radius?: number };

  title?: string | null;
  description?: string | null;

  // Appearance
  icon_name?: string | null;
  icon_color?: string | null;
  icon_size?: number; // px

  // For navigation hotspots
  target_scene_id?: string | null;

  // Typed content
  content?: HotspotContent | null;

  order_index?: number;
  is_active: boolean;

  created_at: string;
  updated_at: string;
}

type HotspotContent =
  | NavigationContent
  | InfoContent
  | AudioContent
  | VideoContent
  | LinkContent
  | CustomContent;

interface NavigationContent {
  // Optional additional UI hints (e.g., arrow labels); core behavior is via target_scene_id.
  kind: 'navigation';
  label?: string;
}

interface InfoContent {
  kind: 'info';
  text?: string;
  html?: string; // sanitized by backend OR rendered in a sandbox (see Security sections)
  image_url?: string;
}

interface AudioContent {
  kind: 'audio';
  audio_url: string;
  autoplay?: boolean;
  loop?: boolean;
}

interface VideoContent {
  kind: 'video';
  // Exactly one source should be set
  video_url?: string; // direct mp4/webm
  youtube_id?: string;
  vimeo_id?: string;
  autoplay?: boolean;
  muted?: boolean;
  poster_url?: string;
}

interface LinkContent {
  kind: 'link';
  url: string;
  target?: '_blank' | '_self';
  label?: string;
}

interface CustomContent {
  kind: 'custom';
  html?: string;
  component_key?: string;
  props?: Record<string, unknown>;
}
```

### Floor plans

```ts
interface FloorPlan {
  id: string;
  name: string;
  floor_number: number;
  image_url: string;
  markers: FloorPlanMarker[];
}

interface FloorPlanMarker {
  scene_id: string;
  x: number; // percentage 0–100
  y: number; // percentage 0–100
  label?: string;
}
```

### Media files

```ts
type MediaPurpose =
  | 'tour_scene'
  | 'tour_thumbnail'
  | 'floor_plan'
  | 'hotspot_media'
  | 'branding_logo';

interface MediaFile {
  id: string;
  user_id: string;
  purpose: MediaPurpose;
  filename: string;
  mime_type: string;
  file_size: number;
  width?: number;
  height?: number;
  duration?: number;

  // Either can be present depending on visibility/security model.
  file_url: string;
  thumbnail_url?: string;

  created_at: string;
}
```

### Analytics

#### Canonical event names

All analytics are built from an append-only `analytics_event` stream.

**MVP event types**:
- `tour_view`
- `tour_like`
- `tour_share`
- `scene_view`
- `hotspot_click`
- `fullscreen_enter`
- `fullscreen_exit`

#### Canonical event properties

```ts
interface AnalyticsEvent {
  id: string;
  tour_id: string;
  user_id?: string;
  session_id: string;

  event_type: string;
  scene_id?: string;
  hotspot_id?: string;

  // viewer context
  occurred_at: string;
  referrer?: string;
  user_agent?: string;
  device_type?: 'desktop' | 'mobile' | 'tablet' | 'vr';
  country?: string;
}
```

### AI jobs

```ts
type AIJobType =
  | 'tour_generation'
  | 'scene_detection'
  | 'hotspot_suggestions'
  | 'description_generation'
  | 'quality_checks';

type AIJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';

interface AIJob {
  id: string;
  user_id: string;
  tour_id: string;
  job_type: AIJobType;
  status: AIJobStatus;
  progress?: number; // 0–100
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
}
```

## API conventions

- **Base path**: `/api/v1`
- **Auth**: `Authorization: Bearer <access_token>` for authenticated endpoints.
- **Idempotency**: POST endpoints that create resources SHOULD support `Idempotency-Key`.
- **Pagination**: list endpoints MUST support `page` and `page_size` and return a common envelope.

### Pagination envelope

```json
{
  "items": [],
  "total": 123,
  "page": 1,
  "page_size": 20,
  "total_pages": 7
}
```

### Error envelope

All non-2xx errors MUST use this shape:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

## Authentication context

- **Auth provider**: Supabase Auth with phone-based OTP.
- **Primary identifier**: phone number (e.g., `+91XXXXXXXXXX`).
- **User profile fields**: `full_name`, `email` (optional), `date_of_birth` (optional), `profile_image_url`.
- **Roles**: `user`, `agent`, `admin`.
- **Tokens**: Supabase-issued JWT access tokens (short-lived) and refresh tokens.

## Security and privacy (baseline)

- Tours with `visibility=private` MUST require authentication.
- Tours with `visibility=unlisted` MUST not be indexable and SHOULD use unguessable IDs.
- Any HTML in hotspot content MUST be sanitized server-side OR rendered within a hardened sandbox.
- AI processing MUST be opt-in for private content and MUST disclose what data leaves the tenant boundary.
