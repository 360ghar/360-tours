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
- `tour_view`
- `scene_view`
- `hotspot_click`
- `tour_share`
- `tour_like`
- `fullscreen_enter` / `fullscreen_exit`

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
