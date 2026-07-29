# API Implementation Notes (Current Backend)

This document summarizes the **current** backend implementation contract and highlights known differences vs the canonical spec in `docs/technical/api-specification.md`.

## Base URLs

- REST API base path remains: `/api/v1`
- WebSocket endpoints are mounted at the server root (no `/api/v1` prefix):
  - `/ws/jobs/{job_id}?token=...`
  - `/ws/user?token=...`
  - `/ws/tours/{tour_id}?token=...`

## Key contract differences

### Tours

- The canonical spec uses `visibility: private|unlisted|public`.
- The backend currently uses `is_public: boolean`.
- The frontend sends and expects the 3-state `visibility` field.

### Scenes

- Scene create/update uses `image_url` (and optional `thumbnail_url`) directly.
  - No `image_file_id` indirection is required.
- Scene metadata is stored in the DB as `scene_metadata` but is serialized as `metadata` in API responses.
  - Requests may send either `metadata` or `scene_metadata`.

### Hotspots

- Hotspots are stored with `type` plus an optional JSON `content` payload.
- The frontend sends `PATCH /api/v1/hotspots/{hotspot_id}` for partial updates (aligns with canonical spec).
- The backend supports `PATCH`, with `PUT` accepted as a legacy alias (the same is true for `PATCH /api/v1/tours/{tour_id}`, `PATCH /api/v1/scenes/{scene_id}`, and `POST /api/v1/tours/{tour_id}/scenes/reorder`).
- The backend now normalizes and validates typed content for `link`, `audio`, `video`, `info`, and `custom`.

### Floor plans

- Floor plans are stored in a dedicated `floor_plans` table and managed via:
  - `GET/POST /api/v1/tours/{tour_id}/floor-plans`
  - `PUT /api/v1/tours/{tour_id}/floor-plans/{floor_plan_id}`
  - `PUT /api/v1/tours/{tour_id}/floor-plans/{floor_plan_id}/markers`
  - `DELETE /api/v1/tours/{tour_id}/floor-plans/{floor_plan_id}`
- Public tour payloads "hydrate" `settings.floor_plans` from the `floor_plans` table for viewer consumption.

### Uploads

- `POST /api/v1/upload` accepts multipart form data (`file`, `folder`, `visibility`) and uploads to Cloudinary.
- Returns `{ public_url, file_path, file_size, content_type }`.

### Analytics

- Public analytics ingest: `POST /api/v1/public/tours/{tour_id}/events`.
- The backend accepts canonical names like `tour_view` / `tour_share` / `tour_like` and normalizes them internally.
- Session duration is supported via `session_duration` with `event_data.duration_seconds`.

### Social share previews

- Backend provides server-rendered previews for link unfurling:
  - `GET /share/tours/{tour_id}?redirect=<viewer_url>`
  - Renders Open Graph + Twitter card meta tags, then redirects humans to the viewer.

## Backend gaps to resolve

The following items differ between what the frontend sends/expects and what the backend currently implements:

| # | Area | Frontend Expects | Backend Currently | Action |
|---|------|-----------------|-------------------|--------|
| 1 | Tour visibility | `visibility: "private" \| "unlisted" \| "public"` | `is_public: boolean` | Backend needs to support the 3-state `visibility` field. Map `is_public=true` → `public`, `is_public=false` → `private` as interim. |
| 2 | Hotspot update | `PATCH /api/v1/hotspots/{hotspot_id}` with partial body | `PATCH` supported (`PUT` kept as legacy alias) | Resolved. No change needed. |
| 3 | Scene metadata key | Sends/receives `metadata` key | Stored as `scene_metadata` in DB, serialized as `metadata` | Backend should accept both keys in requests. |
| 4 | Scene create | Sends `image_url` directly | Already works | No change needed. |
