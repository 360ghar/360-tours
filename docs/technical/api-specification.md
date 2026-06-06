# API Specification (v1)

This is the canonical REST API contract for the 360 Tours Platform.

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

`POST /api/v1/users/me/avatar`

Request: `multipart/form-data` with `file` field.

Response (200): `User` (with updated `profile_image_url`)

### Delete profile image

`DELETE /api/v1/users/me/avatar`

Response (200): `User` (with `profile_image_url: null`)

### Get usage stats

`GET /api/v1/users/me/usage`

Response (200):
```json
{
  "total_tours": 12,
  "published_tours": 5,
  "total_scenes": 48,
  "storage_used": 536870912,
  "storage_limit": 5368709120
}
```

### Delete account

`DELETE /api/v1/users/me`

Request:
```json
{ "password": "string" }
```

Response (204): no body

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

Uploads support two flows:

1. **Presigned flow** (recommended): Client gets a signed URL, then uploads directly to Supabase Storage.
2. **Server-proxy flow**: Client uploads via multipart form to the backend.

### Presign an upload

`POST /api/v1/upload/presigned`

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

`GET /api/v1/tours?page=1&page_size=20&status=draft|published|archived&search=...`

Response (200): pagination envelope of `Tour`.

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

Response (201): `Tour`

### Get tour

`GET /api/v1/tours/{tour_id}`

Response (200): `Tour` (includes `scenes` array)

### Update tour

`PATCH /api/v1/tours/{tour_id}`

Request (example):
```json
{ "title": "Updated title", "settings": { "enable_vr": true } }
```

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

Response (200): array of `Scene` (ordered by `order_index`).

### Create a scene

`POST /api/v1/tours/{tour_id}/scenes`

Request:
```json
{
  "title": "Living Room",
  "image_url": "https://... (uploaded image URL)",
  "thumbnail_url": "https://... (optional)",
  "order_index": 0
}
```

Response (201): `Scene`

### Get a scene

`GET /api/v1/scenes/{scene_id}`

Response (200): `Scene`

### Update scene

`PATCH /api/v1/scenes/{scene_id}`

Request (example):
```json
{ "title": "Bedroom", "metadata": { "initial_view": { "yaw": 10, "pitch": 0 } } }
```

Response (200): `Scene`

### Delete scene

`DELETE /api/v1/scenes/{scene_id}` → Response (204)

### Reorder scenes

`POST /api/v1/tours/{tour_id}/scenes/reorder`

Request:
```json
{ "scene_ids": ["scene1", "scene2", "scene3"] }
```

Response (200): array of `Scene` (updated order)

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
  "hotspot_id": "string",
  "event_data": { "referrer": "https://example.com" }
}
```

Response (200): `{ "status": "ok" }`

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

AI job schema is defined in `../00-conventions.md`.

### Create a job

`POST /api/v1/ai/jobs`

Request:
```json
{ "job_type": "hotspot_suggestions", "tour_id": "string", "input": {} }
```

Response (201): `AIJob`

### Get job

`GET /api/v1/ai/jobs/{job_id}` → Response (200): `AIJob`

### List jobs

`GET /api/v1/ai/jobs?page=1&page_size=20&status=queued|processing|completed|failed`

Response (200): pagination envelope of `AIJob`.

### Cancel job

`POST /api/v1/ai/jobs/{job_id}/cancel` → Response (204)

### Generate tour (multipart)

`POST /api/v1/ai/tours/generate`

Request: `multipart/form-data` with image files and tour metadata.

Response (201): `AIJob`

### Apply scene analysis

`POST /api/v1/ai/jobs/{job_id}/apply-scenes`

Response (200): updated `Scene[]`

### Apply hotspot suggestions

`POST /api/v1/ai/jobs/{job_id}/apply-hotspots`

Response (200): updated `Hotspot[]`

## WebSocket endpoints

WebSocket endpoints are mounted at the server root (no `/api/v1` prefix). Authentication is via token query parameter.

### Job progress

`ws(s)://<host>/ws/jobs/{job_id}?token=<access_token>`

Messages (JSON):
```json
{
  "type": "job_update | connected | heartbeat | error",
  "job_id": "string",
  "data": {
    "status": "processing | completed | failed",
    "progress": 50,
    "result": {},
    "error_message": "string"
  }
}
```

The client sends `ping` every 25 seconds; the server responds with `pong`.

### User notifications

`ws(s)://<host>/ws/user?token=<access_token>`

Messages (JSON):
```json
{
  "type": "notification",
  "data": { ... }
}
```

### Tour collaboration (scaffolded)

`ws(s)://<host>/ws/tours/{tour_id}?token=<access_token>`

Reserved for future real-time collaboration features.

## Social share previews

The backend provides server-rendered HTML for link unfurling:

`GET /share/tours/{tour_id}?redirect=<viewer_url>`

Renders Open Graph + Twitter Card meta tags, then redirects human visitors to the viewer.

## Error codes (canonical)

The backend SHOULD use stable `error.code` values. Recommended codes:
- `unauthorized`
- `forbidden`
- `not_found`
- `validation_failed`
- `rate_limited`
- `conflict`
- `internal`

**Document Links**:
- [Architecture](architecture.md) ← Previous: System architecture
- [Database Schema](database-schema.md) → Next: Database design
