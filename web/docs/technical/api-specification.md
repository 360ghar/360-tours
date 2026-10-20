# API Specification (v1)

This is the narrative REST API design for the 360 Tours Platform. The machine-readable contract is `openapi/openapi.json` (copied from the backend `docs/openapi.json`); where a section below differs from it, the OpenAPI document wins. The rules that the generated types do not show are in `api-implementation-notes.md`.

Shared types and conventions are defined in `../00-conventions.md`.

## Base URL and versioning

- Base path: `/api/v1`
- Versioning: changes that break clients require a new major version (`/api/v2`).

Example environment hosts (illustrative):
- Development: `https://dev.api.360-viewer.com`
- Staging: `https://staging.api.360-viewer.com`
- Production: `https://api.360-viewer.com`

## Authentication

- **Provider**: Supabase Auth with phone-based OTP.
- Authenticated endpoints require `Authorization: Bearer <access_token>`.
- Access tokens are Supabase-issued JWTs (short-lived, ~1 hour).
- Refresh tokens are long-lived and rotation-enabled.
- The frontend uses the Supabase client SDK for sign-up, sign-in, OTP, and token refresh; the backend validates the JWT on each request.

## Response conventions

- Single-resource endpoints return the resource JSON directly.
- List endpoints return the pagination envelope defined in `../00-conventions.md`.
- Errors MUST use the error envelope defined in `../00-conventions.md`.

## Common headers

- `Content-Type: application/json`
- `X-Request-Id` (optional request; MUST be echoed in response when present)
- `Idempotency-Key` (recommended for POST create operations)

## Authentication endpoints (MVP)

Authentication is handled via Supabase Auth SDK on the client. The backend does not expose custom auth endpoints — the frontend calls Supabase directly for register, login, OTP, and token refresh. The backend validates Supabase JWTs on protected routes.

### Supabase Auth flows (client-side)

| Flow | Supabase SDK method |
|------|---------------------|
| Register | `supabase.auth.signUp({ phone, password, options: { data: { full_name, email } } })` |
| Login | `supabase.auth.signInWithPassword({ phone, password })` |
| Logout | `supabase.auth.signOut()` |
| Request password reset OTP | `supabase.auth.signInWithOtp({ phone })` |
| Verify OTP | `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` |
| Update password | `supabase.auth.updateUser({ password })` |

After authentication, the frontend fetches the user profile from the backend:

`GET /api/v1/users/me`

## User endpoints (MVP)

### Get current user

`GET /api/v1/users/me`

Response (200):
```json
{
  "id": "uuid-string",
  "supabase_user_id": "string",
  "email": "user@example.com",
  "phone": "+91XXXXXXXXXX",
  "full_name": "string",
  "profile_image_url": "string",
  "role": "user",
  "is_active": true,
  "is_verified": true,
  "preferences": {},
  "notification_settings": {},
  "privacy_settings": {},
  "created_at": "2026-01-07T12:34:56Z",
  "updated_at": "2026-01-07T12:34:56Z"
}
```

### Update current user

`PATCH /api/v1/users/me`

Request (example):
```json
{ "full_name": "New Name", "email": "new@example.com" }
```

Response (200): `User`

### Upload profile image

`POST /api/v1/users/me/profile-image`

Request: `multipart/form-data` with `file` field.

Response (200): the full updated `User` object (with the new `profile_image_url`), not `{url}`.

> `POST /api/v1/users/me/avatar` is accepted as an alias for the same operation.

### Account deletion

There is no self-service account deletion endpoint. Account deletion is handled via support for now.

## Dashboard (MVP)

### Get dashboard stats

`GET /api/v1/dashboard/stats`

Response (200):
```json
{
  "total_tours": 12,
  "published_tours": 5,
  "total_views": 1234,
  "total_scenes": 48,
  "storage_used": 536870912,
  "storage_limit": 5368709120
}
```

## Uploads (MVP)

Uploads support a direct upload flow:

1. **Direct upload** (recommended): Client uploads via multipart form to the backend, which stores to Cloudinary.

### Upload a file

`POST /api/v1/upload`

Request:
```json
{
  "files": [
    {
      "filename": "living-room.jpg",
      "content_type": "image/jpeg",
      "file_size": 12345678,
      "folder_type": "scenes",
      "tour_id": "{tour_id}",
      "visibility": "public"
    }
  ]
}
```

Response (200):
```json
{
  "items": [
    {
      "signed_url": "https://... (Supabase signed upload URL)",
      "token": "string",
      "path": "tours/{tour_id}/scenes/{scene_id}/original/{uuid}.jpg",
      "public_url": "https://... (public object URL)",
      "media": { "id": "string" }
    }
  ]
}
```

The client uploads bytes via `PUT signed_url` with these headers:
- `apikey: <SUPABASE_PUBLISHABLE_KEY>`
- `Authorization: Bearer <access_token>`
- `Content-Type: <file mime type>`

### Direct upload (server-proxy)

`POST /api/v1/upload`

Request: `multipart/form-data` with `file`, optional `folder`, optional `visibility`.

Response (200):
```json
{
  "file_path": "string",
  "public_url": "string",
  "file_type": "string",
  "file_size": 12345678,
  "content_type": "image/jpeg",
  "original_filename": "living-room.jpg"
}
```

### Batch upload (server-proxy)

`POST /api/v1/upload/batch`

Request: `multipart/form-data` with multiple `files`, optional `folder`, optional `visibility`.

Response (200):
```json
{ "items": [{ "file_path": "...", "public_url": "...", ... }] }
```

### List media files

`GET /api/v1/upload/media?page=1&page_size=20&folder=...&mime_type=...`

Response (200): pagination envelope of `MediaFile`.

### Get a media file

`GET /api/v1/upload/media/{media_id}`

Response (200): `MediaFile`

### Delete a media file

`DELETE /api/v1/upload/media/{media_id}` → Response (204)

## Tours (MVP)

Tour schema is defined in `../00-conventions.md`.

### List tours

`GET /api/v1/tours?cursor=...&limit=20&include_total=false&status=draft|published|archived&search=...`

Response (200): `CursorPage` of `Tour` (`{items, next_cursor, has_more, limit, total}`; `limit` at most 100; `total` is null unless `include_total=true`).

### Create tour

`POST /api/v1/tours`

Request:
```json
{
  "title": "My Tour",
  "description": "Optional",
  "visibility": "private"
}
```

A new tour is a draft: `status` is not accepted.

Response (201): `Tour`

### Get tour

`GET /api/v1/tours/{tour_id}`

Response (200): the owner gets `Tour` with `floor_plans`, `main_scene_id` and a first page of `scenes` (read the full list from the scenes route). Another caller gets the public shape of a published tour; a draft or private tour of another user is a 404.

### Update tour

`PATCH /api/v1/tours/{tour_id}`

Request (example):
```json
{ "title": "Updated title", "settings": { "enable_vr": true } }
```

`status` is not accepted: use publish and unpublish. `settings` is deep-merged; a key set to `null` is removed.

Response (200): `Tour`

### Delete tour

`DELETE /api/v1/tours/{tour_id}`

Response (204): no body

### Publish / unpublish

- `POST /api/v1/tours/{tour_id}/publish` → Response (200): `Tour`
- `POST /api/v1/tours/{tour_id}/unpublish` → Response (200): `Tour`

### Duplicate

`POST /api/v1/tours/{tour_id}/duplicate`

Response (201): `Tour` (new tour in `draft` status with copied scenes and hotspots)

## Scenes (MVP)

Scene schema is defined in `../00-conventions.md`.

### List scenes for a tour

`GET /api/v1/tours/{tour_id}/scenes`

Response (200): `CursorPage` of `Scene` (ordered by `order_index`; `limit` 1 to 100, default 20; follow `next_cursor`).

### Create a scene

`POST /api/v1/tours/{tour_id}/scenes`

Request:
```json
{
  "title": "Living Room",
  "image_url": "https://... (uploaded image URL)",
  "thumbnail_url": "https://... (optional)"
}
```

The server appends the scene (no `order_index`); order scenes with the reorder route. The metadata key is `scene_metadata`.

Response (201): `Scene`

### Update scene

`PATCH /api/v1/scenes/{scene_id}`

Request (example):
```json
{ "title": "Bedroom", "scene_metadata": { "initial_view": { "yaw": 10, "pitch": 0 } } }
```

`scene_metadata` is deep-merged; a key set to `null` is removed.

Response (200): `Scene`

### Delete scene

`DELETE /api/v1/scenes/{scene_id}` → Response (204)

### Reorder scenes

`POST /api/v1/tours/{tour_id}/scenes/reorder`

Request:
```json
{ "scene_ids": ["scene1", "scene2", "scene3"] }
```

Response (200): `CursorPage` of `Scene` (updated order)

## Hotspots (MVP)

Hotspot schema (including typed content) is defined in `../00-conventions.md`.

### List hotspots for a scene

`GET /api/v1/scenes/{scene_id}/hotspots`

Response (200): array of `Hotspot`.

### Create hotspot

`POST /api/v1/scenes/{scene_id}/hotspots`

Request:
```json
{
  "type": "navigation",
  "position": { "yaw": 42, "pitch": 0 },
  "target_scene_id": "string",
  "title": "Next",
  "content": { "kind": "navigation", "label": "Go" }
}
```

Response (201): `Hotspot`

### Update hotspot

`PATCH /api/v1/hotspots/{hotspot_id}` → Response (200): `Hotspot`

### Update hotspot position

`PUT /api/v1/hotspots/{hotspot_id}/position`

Request:
```json
{ "yaw": 10, "pitch": -5 }
```

Response (200): `Hotspot`

### Delete hotspot

`DELETE /api/v1/hotspots/{hotspot_id}` → Response (204)

## Floor plans (MVP)

Floor plan schema is defined in `../00-conventions.md`.

### List floor plans

`GET /api/v1/tours/{tour_id}/floor-plans`

Response (200): array of `FloorPlan`.

### Create floor plan

`POST /api/v1/tours/{tour_id}/floor-plans`

Request:
```json
{
  "name": "Ground Floor",
  "floor_number": 1,
  "image_url": "https://... (uploaded image URL)",
  "markers": [{ "scene_id": "string", "x": 50, "y": 20, "label": "Lobby" }]
}
```

Response (201): `FloorPlan`

### Update floor plan

`PUT /api/v1/tours/{tour_id}/floor-plans/{floor_plan_id}`

Request:
```json
{ "name": "Updated Name", "markers": [...] }
```

Response (200): `FloorPlan`

### Replace markers (bulk)

`PUT /api/v1/tours/{tour_id}/floor-plans/{floor_plan_id}/markers`

Request:
```json
[{ "scene_id": "string", "x": 50, "y": 20 }]
```

Response (200): `FloorPlan`

### Delete floor plan

`DELETE /api/v1/tours/{tour_id}/floor-plans/{floor_plan_id}` → Response (204)

## Public viewing (MVP)

### Get public tour

`GET /api/v1/public/tours/{tour_id}?track=true`

Response (200):
```json
{
  "id": "string",
  "title": "string",
  "settings": { "floor_plans": [] },
  "scenes": []
}
```

The payload MUST only include data for `visibility=public|unlisted` tours.

### Get public tour scenes

`GET /api/v1/public/tours/{tour_id}/scenes`

Response (200): array of `Scene`.

### Like a tour

`POST /api/v1/public/tours/{tour_id}/like`

Headers (optional): `x-session-id: <session_id>` for anonymous session tracking.

Response (200):
```json
{ "like_count": 42 }
```

### Unlike a tour

`DELETE /api/v1/public/tours/{tour_id}/like`

Headers (optional): `x-session-id: <session_id>`

Response (200):
```json
{ "like_count": 41 }
```

## Analytics (MVP)

Analytics event naming is defined in `../00-conventions.md`.

### Ingest an analytics event

`POST /api/v1/public/tours/{tour_id}/events`

Request:
```json
{
  "event_type": "scene_view",
  "session_id": "string",
  "scene_id": "string",
  "event_data": { "yaw": 12.5, "pitch": -3 }
}
```

`event_type` is one of `scene_view`, `hotspot_click`, `share`, `fullscreen_enter`, `fullscreen_exit`, `vr_enter`, `vr_exit`, `session_start`, `session_end`, `session_duration`. A `scene_view` needs `scene_id` and numeric `event_data.yaw` and `event_data.pitch`. The body is required; there are no query keys.

Response (204): no body.

### Tour heatmap

`GET /api/v1/tours/{tour_id}/heatmap?scene_id=...&start_date=...&end_date=...` (owner only)

Response (200): `{ "tour_id": "string", "heatmap": [{ "scene_id": "string", "yaw": 10, "pitch": -5, "intensity": 0.4, "count": 3 }] }`

### Tour analytics summary

`GET /api/v1/tours/{tour_id}/analytics?start_date=2026-01-01&end_date=2026-01-07`

Response (200):
```json
{
  "tour_id": "string",
  "total_views": 123,
  "unique_views": 100,
  "total_likes": 50,
  "total_shares": 20,
  "avg_session_duration": 120,
  "scene_views": { "scene_id": 45 },
  "hotspot_clicks": { "hotspot_id": 12 },
  "device_breakdown": { "desktop": 60, "mobile": 35, "tablet": 5, "vr": 0 },
  "country_breakdown": { "IN": 80, "US": 20 },
  "daily_views": [{ "date": "2026-01-01", "views": 20 }]
}
```

## AI jobs

All AI job routes require authentication. A job is `AIJobBase`: `id`, `job_type`, `status`, `progress`, `tour_id`, `scene_id`, `error_message`, `started_at`, `completed_at`, `created_at`, `updated_at`, `actual_duration`.

- `status` is `pending`, `processing`, `completed`, `failed` or `cancelled`. The last three are final.
- `job_type` is one of `analyze_scene`, `analyze_scenes`, `generate_description`, `generate_descriptions`, `generate_tour`, `optimize_tour`, `spatial_connect`, `analyze_floor_plan`, `suggest_hotspots`, `suggest_tour_hotspots`, `panorama_stitch`. It is `null` when the stored value is outside this list.

### Generate tour (multipart)

`POST /api/v1/ai/tours/generate`

Request: `multipart/form-data` with `images` (files) and the optional fields `title`, `description`, `generate_titles`, `suggest_hotspots`, `generate_descriptions`, `spatial`, `apply_to_scenes`, `language`. Unknown fields are not read. The client always sends `spatial`: its server default decides how hotspots are placed.

Response (201): `{ "job": AIJobBase, "tour_id": "string", "scene_ids": ["string"] }`

### Analyze scenes

`POST /api/v1/ai/tours/{tour_id}/analyze` → `{ "job": AIJobBase }`

### Suggest hotspots for a scene

`POST /api/v1/ai/scenes/{scene_id}/hotspots` → `{ "job": AIJobBase }`

### Generate descriptions

`POST /api/v1/ai/tours/{tour_id}/descriptions` (optional `DescriptionOptions` body) → `{ "job": AIJobBase }`

### Get job

`GET /api/v1/ai/jobs/{job_id}` → `{ "job": AIJobBase, "result": object | null }`

`result` is the model of the job type. A finished `generate_tour` job returns `{ "tour_id", "tour", "scenes": [...], "generated": [...], "created_hotspots": [...] }`; an `analyze_scenes` job returns `{ "analysis": [...] }`; a `suggest_hotspots` job returns `{ "hotspots": [...] }`.

### Cancel job

`POST /api/v1/ai/jobs/{job_id}/cancel` → Response (200): `{ "job": AIJobBase, "result": object | null }`. Response (409) `JOB_NOT_CANCELLABLE` when the job already ended.

There is no job list route, no reel route and no `apply-*` route.

## WebSocket endpoints

WebSocket endpoints are mounted at the server root (no `/api/v1` prefix). The token is never sent in the URL: after the socket opens, the first frame the client sends is

```json
{ "type": "auth", "token": "<access_token>" }
```

The server closes the socket with code `4001` when that frame is missing or the token is not valid, and with `4004` when a job does not exist or is not the caller's. A client does not reconnect after `4001` or `4004`. The client sends the text `ping` every 25 seconds; the server answers `pong`.

### Job progress

`ws(s)://<host>/ws/jobs/{job_id}`

Frames (JSON), one `job_update` per state change:
```json
{
  "type": "job_update",
  "job_id": "string",
  "data": {
    "status": "pending | processing | completed | failed | cancelled",
    "progress": 50,
    "error_message": "string | null",
    "result": {}
  }
}
```
`connected` and `heartbeat` frames also arrive (`{"type": "connected", "message": "..."}`).

### User notifications

`ws(s)://<host>/ws/user`

Frames (JSON):
```json
{
  "type": "notification",
  "data": {
    "id": "string",
    "type": "string",
    "title": "string",
    "message": "string",
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```
A finished or failed AI job is also sent here. There is no per-tour socket.

## Social share previews

The backend provides server-rendered HTML for link unfurling:

`GET /share/tours/{tour_id}?redirect=<viewer_url>`

Renders Open Graph + Twitter Card meta tags, then redirects human visitors to the viewer.

## Errors

Every non-2xx JSON body is `{ "error": { "code": "string", "message": "string", "details": {} } }`. `details` is absent when it is empty. A 422 has `code` `VALIDATION_ERROR` and `details.fields`, a list of `{ "field": "body.title", "msg": "...", "type": "..." }` (`field` keeps its source prefix: `body`, `query`, `path`); `details.fields` is always present on a 422 and can be empty. Branch on `code`, not on `message`. Examples: `VALIDATION_ERROR`, `INVALID_CURSOR`, `RATE_LIMIT_EXCEEDED`, `TOKEN_INVALID`, `USER_INACTIVE`, `JOB_NOT_CANCELLABLE`, `FOLDER_TYPE_NOT_ALLOWED`, `TOUR_ID_REQUIRED`. A 429 and a 503 carry `Retry-After`.

**Document Links**:
- [Architecture](architecture.md) ← Previous: System architecture
- [Database Schema](database-schema.md) → Next: Database design
