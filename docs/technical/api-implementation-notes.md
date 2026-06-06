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

- The implementation uses `is_public: boolean` instead of `visibility: private|unlisted|public`.
  - “Unlisted” is not implemented as a separate mode.

### Scenes

- Scene create/update uses `image_url` (and optional `thumbnail_url`) directly.
  - No `image_file_id` indirection is required.
- Scene metadata is stored in the DB as `scene_metadata` but is serialized as `metadata` in API responses.
  - Requests may send either `metadata` or `scene_metadata`.

### Hotspots

- Hotspots are stored with `type` plus an optional JSON `content` payload.
- Update endpoint uses `PUT /api/v1/hotspots/{hotspot_id}` (not `PATCH`).
- The backend now normalizes and validates typed content for `link`, `audio`, `video`, `info`, and `custom`.

### Floor plans

- Floor plans are stored in a dedicated `floor_plans` table and managed via:
  - `GET/POST /api/v1/tours/{tour_id}/floor-plans`
  - `PUT /api/v1/tours/{tour_id}/floor-plans/{floor_plan_id}`
  - `PUT /api/v1/tours/{tour_id}/floor-plans/{floor_plan_id}/markers`
  - `DELETE /api/v1/tours/{tour_id}/floor-plans/{floor_plan_id}`
- Public tour payloads “hydrate” `settings.floor_plans` from the `floor_plans` table for viewer consumption.

### Uploads

- `POST /api/v1/upload/presigned` returns `signed_url` for a direct Supabase Storage `PUT` plus a `public_url` for asset usage.
- Clients must upload with Supabase headers:
  - `apikey: <SUPABASE_PUBLISHABLE_KEY>`
  - `Authorization: Bearer <access_token>`
  - `Content-Type: <file mime type>`

### Analytics

- Public analytics ingest: `POST /api/v1/public/tours/{tour_id}/events`.
- The backend accepts canonical names like `tour_view` / `tour_share` / `tour_like` and normalizes them internally.
- Session duration is supported via `session_duration` with `event_data.duration_seconds`.

### Social share previews

- Backend provides server-rendered previews for link unfurling:
  - `GET /share/tours/{tour_id}?redirect=<viewer_url>`
  - Renders Open Graph + Twitter card meta tags, then redirects humans to the viewer.

## Known backend gaps (TODOs)

The following items are documented in the canonical API spec but not yet implemented in the backend:

1. **Visibility field**: The spec uses `visibility: private|unlisted|public` but the backend currently uses `is_public: boolean`. Unlisted is not a separate mode. Backend needs to migrate to the `visibility` enum.
2. **Hotspot update method**: The spec uses `PATCH /api/v1/hotspots/{hotspot_id}` but the backend uses `PUT`. Backend should support `PATCH` for partial updates.
3. **Scene create input**: The spec accepts `image_url` directly. No `image_file_id` indirection is needed.
4. **Scene metadata key**: Stored as `scene_metadata` in DB but serialized as `metadata` in API responses. Requests may send either key.
