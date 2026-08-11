# AI spatial navigation (Phase 5)

**Status: implemented.** Automatic Matterport-style navigation for published
tours, triggered after publish, strictly non-fatal.

## What it does

After a tour is published, the backend (Gemini vision + the deterministic
graph builder in `backend/app/services/tour_ai/spatial.py`) classifies each
room, detects doorways/openings in each panorama, builds a connected
bidirectional navigation graph, places navigation hotspots on the real
doorways, and produces a deterministic tour-quality score.

This client's role:

1. **Trigger** — `UploadQueue` enqueues a separate `kind: 'spatial'` job at
   the `publish` step (gated by `UploadQueue.spatialAiEnabled`; production
   default OFF via `Env.spatialAiEnabled` until `POST /ai/tours/{tour_id}/
   spatial` is deployed to canonical `main` — set `SPATIAL_AI_ENABLED=true`
   to opt in once it is; the endpoint currently exists only on backend
   `feat/metadata-stitching-v2`, so the default-off protects uploads from
   404ing the non-fatal AI job).
2. **Report capture metrics** — the local stitch's measured metrics
   (coverage, seam, exposure, sharpness) plus honest capture counts
   (frames, low-quality frames, plan targets, skipped angles) are persisted
   on `ScanAsset` at stitch time and sent with the spatial request so the
   backend quality score works even before/without a cloud-stitch report.
3. **Poll** — `requestSpatial → pollSpatial → done | spatialFailed` with a
   persisted `spatialJobId` (crash-resume) and bounded polls (~11 min cap).
4. **Surface state** — asset detail shows "building AI navigation…" while
   running and "AI navigation could not be generated" with a Retry button
   on failure; the deterministic quality score is stored in
   `ScanAsset.spatialQualityScore`.

## Non-fatal guarantee (the contract)

- The published tour NEVER depends on the AI job: failure marks
  `spatialAiFailed` (never `AssetStatus.failed`) and `ScanAsset.canViewTour`
  stays true; manual navigation and the share link keep working.
- The AI job is independent of cloud refinement: it runs whether refinement
  succeeded, failed, or never ran (on the published panorama either way).
- Retry (`queue.retry` → "Retry AI navigation") after a definitive failure
  clears the stale `spatialJobId` and requests a fresh job; a crash mid-poll
  resumes polling the stored job.

## Backend contract

- `POST /ai/tours/{tour_id}/spatial` — optional body
  `{"capture_metrics": [{scene_id, coverage_percent, seam_score,
  exposure_score, sharpness_score, low_quality:{total,low_quality},
  skipped:{total,skipped}}]}` → `{job}`.
- `GET /ai/jobs/{job_id}` — poll; completed result carries
  `quality` (deterministic report), `graph`, `applied`, `scenes`.
- `GET /ai/jobs?tour_id=…` — filter (web panel discovery).
- 409 when a spatial job for the tour is already pending/processing.

## Quality rules (enforced backend-side)

- Yaw ∈ [-180,180], pitch ∈ [-90,90]; NaN/Inf LLM coordinates rejected.
- Navigation edges never come solely from low-confidence detections
  (≥ 0.35 confidence; connectivity repair falls back to a neutral
  facing-direction puck).
- Near-duplicate detections collapse; duplicate (scene,target) edges dedupe.
- Regeneration deletes ONLY previously AI-created spatial hotspots
  (`custom_data.auto_generated && spatial`); manual navigation is never
  touched, and AI failure never deletes anything.
