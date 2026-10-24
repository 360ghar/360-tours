# Analytics

Analytics provides creators and admins with visibility into tour performance.

Related docs:
- Canonical event names: `../00-conventions.md`
- API contract: `../technical/api-specification.md`

## MVP scope

- Ingest analytics events from public viewing.
- Provide per-tour analytics summaries.
- Provide breakdowns by scene and by hotspot.

## Event model

Analytics is built from an append-only event stream.

**MVP event types** (see `../00-conventions.md`):
- `scene_view` (numeric `event_data.yaw` and `pitch` required; the heatmap is built from them)
- `hotspot_click`
- `share`
- `fullscreen_enter` / `fullscreen_exit`
- `vr_enter` / `vr_exit`
- `session_start` / `session_end` / `session_duration`

A page view is counted by `GET /api/v1/public/tours/{tour_id}` (once per client IP in 30 minutes), not by an event. Likes use `POST` and `DELETE /api/v1/public/tours/{tour_id}/like`.

## Dashboard requirements (MVP)

- Total views and unique sessions in a date range.
- Top scenes by `scene_view`.
- Top hotspots by `hotspot_click`.
- Device and country breakdown (best-effort based on user agent and IP).

## API usage (MVP)

- Ingest: `POST /api/v1/public/tours/{tour_id}/events`
- Summary: `GET /api/v1/tours/{tour_id}/analytics?start_date=...&end_date=...`

## Post‑MVP scope

- Heatmaps and gaze-based metrics.
- Session recordings.
- Real-time dashboards and alerting.

**Document Links**:
- [Branding & Whitelabel](branding-whitelabel.md) ← Previous
- [Social Sharing Analytics](social-sharing-analytics.md) → Next
