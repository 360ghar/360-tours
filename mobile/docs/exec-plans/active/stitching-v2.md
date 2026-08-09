# Stitching Engine V2 — metadata-driven panorama reconstruction

This ExecPlan is a living document. Maintain Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective per docs/PLANS.md.

## Purpose / Big Picture

Turn Phase 1's reliable capture metadata (24-target adaptive plan, per-frame
yaw/pitch/roll, quality flags, CameraProfile) into a genuinely continuous
360° equirectangular panorama:

- A proper metadata-driven equirect blender (roll-correct rays, bilinear
  sampling, coverage-aware blending, exposure normalization) replaces the
  paste-only naive compositor as the primary local stitch.
- A `PanoramaResult` with honest, measurable quality (coverage %, seam,
  exposure, sharpness, warnings) accompanies every stitch.
- The silent cloud-stitch failure is fixed: the mobile queue polls the
  backend AI job and surfaces "refinement failed / retry / use current".
- The backend stitch contract gains per-frame metadata + camera profile
  (backward compatible), a metadata-driven numpy blender, and a quality gate
  that refuses to silently replace a scene with bad output.
- OpenCV remains as the visual-refinement rung with ordered/normalized inputs
  and is only chosen when it measurably beats the blend.

## Progress

- [x] (2026-08-09) Forensic analysis complete (mobile + backend, verified against source)
- [x] (2026-08-09) Panorama geometry module (Dart) + tests
- [x] (2026-08-09) Panorama blending module (Dart) + tests
- [x] (2026-08-09) Panorama quality module (Dart) + tests
- [x] (2026-08-09) StitcherService rework + stitcher tests
- [x] (2026-08-09) ScanAsset metadata + upload-queue polling/retry + tests
- [x] (2026-08-09) Asset detail refinement-failed UX
- [x] (2026-08-09) Backend schema + panorama.py + stitch.py metadata path + tests
- [x] (2026-08-09) Docs + full validation + report
- [x] (2026-08-09) Phase 3 hardening: candidate-selection policy extracted (`openCvWins`) + invariant tests; production-resolution blend benchmark (~5s/24 frames VM); legacy ScanAsset JSON regression test; see phase-3-device-validation.md

## Surprises & Discoveries

- Backend `POST /scenes/{id}/stitch` only accepts `frame_urls`; the worker
  letterboxes OpenCV output onto 2:1 and unconditionally replaces
  `scene.image_url` — NO quality validation anywhere in the cloud path.
- Mobile `upload_queue.dart` calls `requestCloudStitch` and IMMEDIATELY marks
  the asset `ready` and the job `done` — the returned AIJob id is discarded,
  never polled. A failed cloud stitch is invisible to the user (the naive
  pano stays). This is the "silent cloud-stitch failure".
- `GET /ai/jobs/{job_id}` + `BackendApi.getAiJob` already exist and are used
  by generate-3d — the polling infra is there, unused by the stitch path.
- Mobile `ScanAsset` does not persist target indices / low-quality flags
  after save — must be added (additive, backward compatible) to send the
  full frame metadata to the cloud.
- `AssetStatus.pendingCloudStitch` already renders "Uploading frames for
  cloud stitch…" — safe to hold during polling.
- Roll convention (verified from `orientation_engine.dart`): positive roll =
  phone top tilted right. The image's world "up" axis becomes
  `up' = sin(roll)·right + cos(roll)·up` — the top-center pixel of a rolled
  level frame lands at yaw ≈ `atan2(sin(roll)·tan(vFov/2), 1)`.
- cv2.Stitcher output cannot be validated as full-sphere → the OpenCV rung is
  ranked against the blend using measured metrics; its non-black coverage is
  a documented heuristic.

## Decision Log

- Decision: the metadata blend becomes the PRIMARY local stitch (always
  succeeds, true 2:1, honest coverage). OpenCV stays as a preferDevice rung,
  ranked by metrics; chosen only when it beats the blend. Rationale: the
  capture model is pure-rotation (single station), which the blend models
  exactly; OpenCV's output is unvalidatable as full-sphere (spec 14/15).
- Decision: local blend output size 2048×1024, working frames ≤640px long
  side, stats pass at 512×256 (bounded memory: ~33MB float buffers peak).
- Decision: exposure = per-frame luminance gain (median target, clamped
  0.85–1.25), applied at sampling; no per-pixel histogram equalization.
- Decision: cloud quality gate = coverage ≥ 60% AND 2:1 aspect AND decodable
  AND non-empty → else job failed with structured quality result, scene NOT
  replaced. Legacy OpenCV requests keep current behavior (+ informational
  coverage in result) so existing clients/tours are unaffected.
- Decision: `ScanAsset` gains optional `frameTargetIndices`,
  `frameLowQuality`, `cloudStitchFailed` (all defaulted → JSON round-trip
  safe).
- Decision: queue stitch steps become `requestStitch → pollStitch →
  done|stitchFailed`; `stitchFailed` is retryable via existing `retry()`
  (resumes at `requestStitch`, keeps uploaded frame URLs). Never marks the
  asset `failed` — the naive pano is live (spec: never lose the capture).

## Outcomes & Retrospective

Shipped (2026-08-09): metadata-driven equirect blend (roll-correct rays,
bilinear, coverage-aware weights, exposure gains) is the primary local stitch
with honest PanoramaMetrics; OpenCV rung yaw-ordered and ranked by measured
quality; ScanAsset carries frame metadata; upload queue polls the backend AI
job (`requestStitch → pollStitch → done|stitchFailed`) with retry and a
refinement-failed UX; backend `panorama.py` (numpy port) + quality-gated
scene replacement + backward-compatible schema. Mobile 114/114 tests, backend
32/32 stitch unit tests, ruff + flutter analyze clean, harness checks pass.

Retrospective: the seam metric's first design measured texture aliasing rather
than geometric misalignment — fixed by testing with world-field-rendered
content (frames that are genuinely photos of the same world). The queue drain
needed `stitchFailed` excluded from the pending filter (terminal state).
Relative frame paths in tests silently skipped uploads — absolute paths
required.

Remaining: OpenCV rung and cloud runtime need a real-device pass; quality
thresholds calibrated on synthetic fixtures.

## Context and Orientation

Mobile (`mobile/app`):
- `lib/features/capture/domain/stitcher_service.dart` — current naive + OpenCV ladder
- `lib/features/capture/domain/capture_targets.dart` — CameraProfile (single FOV source of truth)
- `lib/features/capture/domain/frame_quality.dart` — variance-of-Laplacian (reused for sharpness score)
- `lib/core/upload/upload_queue.dart` — `requestStitch` step (silent failure to fix)
- `lib/core/api/backend_api.dart` — `requestCloudStitch`, `getAiJob`
- `lib/core/models/models.dart` — ScanAsset / FrameOrientation
- `lib/features/capture/domain/stitch_pipeline.dart` — saveScan hand-off

Backend (`backend`, canonical main, clean):
- `app/services/tour_ai/stitch.py` — legacy OpenCV worker, no validation
- `app/schemas/tour.py` — `SceneStitchRequest` (frame_urls only)
- `app/api/api_v1/endpoints/scenes.py` — POST /scenes/{id}/stitch
- `app/services/tour_ai/jobs.py` — AIJob lifecycle + WS broadcast
- `tests/unit/services/test_tour_stitch.py`, `tests/api/test_scene_stitch_endpoint.py`

## Plan of Work

1. Dart `stitching/` modules (pure math, no I/O): geometry (equirect↔world,
   pose basis with roll, camera ray, FOV bounds), blending (center/edge/
   quality weights, gains, blend loop), quality (coverage map, seam,
   exposure, sharpness, scores, malformed rejection).
2. `StitcherService`: blend primary; OpenCV rung with yaw-ordered normalized
   inputs, ranked by metrics, `partial` flag; `StitchResult` carries
   `PanoramaMetrics`.
3. ScanAsset metadata + `saveScan` plumbing + `BackendApi.requestCloudStitch`
   metadata payload + queue polling (`requestStitch → pollStitch →
   done|stitchFailed` + retry) + asset-detail banner.
4. Backend: schema extension (frames/camera_profile, frame_urls still
   required), `panorama.py` (numpy blend + quality, ported math), `stitch.py`
   metadata path with quality gate, tests for both paths.
5. Validate: `flutter analyze`, `flutter test`, backend `pytest` for stitch
   modules, harness checks, docs.

## Concrete Steps

Working dirs: `mobile/app` and `backend`.

```sh
flutter analyze && flutter test
uv run pytest tests/unit/services/test_tour_stitch.py tests/api/test_scene_stitch_endpoint.py -v   # env permitting
dart run scripts/check_architecture.dart   # from mobile/
```
