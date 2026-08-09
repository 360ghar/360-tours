# Smart Capture Engine V2 (adaptive targets, quality gate, retake, session recovery)

This ExecPlan is a living document. Maintain Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective per docs/PLANS.md.

## Purpose / Big Picture

Replace the fixed 16-shot guided capture with an adaptive, quality-gated
capture that a normal user can trust:

- Target layout computed from a documented camera-FOV profile (no more fixed
  8/4/4 rings with azimuthal holes and a 10.5° pole gap).
- Every frame is validated on device (sharpness, brightness, stability,
  duplicate angle) before it counts.
- A rejected frame triggers an immediate retake of the SAME target, never a
  room restart.
- Capture progress survives app kill / background via a persisted session and
  a Resume/Discard prompt.
- Completion is gated: a tour is only handed to the stitch/upload pipeline
  when coverage is complete (user override still possible for furniture
  blocked angles, with a warning).

## Progress

- [x] (2026-08-08) Baseline: `flutter test` 40/40 pass; audit of capture feature files
- [x] (2026-08-08) Verified camera plugin capabilities (no FOV API; ResolutionPreset values; lensType reliability)
- [x] (2026-08-08) CameraProfile + CaptureTargetPlanner + CapturePlan (domain)
- [x] (2026-08-08) FrameQualityGate + FrameQuality + FrameRejectionReason (domain)
- [x] (2026-08-08) CaptureSession model (domain) + CaptureSessionStore (data, LocalStore-backed)
- [x] (2026-08-08) OrientationEngine movement detection stream
- [x] (2026-08-08) CaptureController rework (plan, gate, retake, session, resume, coverage, 1080p)
- [x] (2026-08-08) CaptureScreen UX (resume dialog, rejection/movement banners, review warnings)
- [x] (2026-08-08) TargetOverlay updates (plan targets, human instructions)
- [x] (2026-08-08) New tests: capture_plan_test, frame_quality_test, capture_session_test; updated capture_targets_test, capture_controller_test
- [x] (2026-08-08) flutter analyze clean; flutter test green (old + new); harness checks pass
- [ ] Device test (NO physical Android/iOS device connected — Windows desktop + web only. Report honestly as DEVICE TEST NOT PERFORMED)

## Surprises & Discoveries

- `camera` 0.12.0+2 `CameraDescription` exposes only name / lensDirection /
  sensorOrientation / lensType. NO focal length, NO sensor size, NO FOV.
  Evidence: `camera_platform_interface-2.12.0/.../camera_description.dart`.
- `lensType` is populated on iOS (`camera_avfoundation-0.10.2`) but NOT on
  Android (`camera_android_camerax-0.7.4+2` constructs CameraDescription with
  lensDirection + sensorOrientation only) → cannot be used for FOV selection.
- `ResolutionPreset.high` ≈ 720p, `veryHigh` ≈ 1080p, `ultraHigh` ≈ 2160p
  (verified in resolution_preset.dart docs).
- 55° H / 69° V at 30% overlap → 24 targets (10 horizon + 7 + 7 pole rings).
  The pole ring at ±55.5° overlaps the horizon band by 13.5° (below the 30%
  target but gap-free by construction) — the documented pole trade-off.
- Existing controller tests rely on skip-on-last-target → review with ≥4
  frames. Kept intact (user override); the automatic completion gate now
  requires all targets, which is the honest default path.

## Decision Log

- Decision: FOV = documented fallback profile only (55°×69° portrait back
  camera), never invented from device/lensType. Rationale: no FOV API exists;
  lensType unreliable on Android; conservative wide estimate only
  over-captures (safe direction). Date: 2026-08-08.
- Decision: overlap = 0.30 (30%) default, documented. Rationale: OpenCV
  feature matching needs ~15-25%; ±5° alignment error can consume up to ~10°
  of nominal overlap, so 30% keeps the worst case comfortably positive.
- Decision: ring levels = horizon + pole rings snapped to maxPitch = 90−vFov/2,
  with intermediate rings only when the pole band does not reach the horizon
  band (vFov < 60°). Rationale: intermediate rings exist only to prevent
  elevation gaps; snapping guarantees zero pole gap.
- Decision: quality gate rejects only extreme frames; after 3 consecutive
  rejections the frame is ACCEPTED with a low-quality flag (hysteresis) so a
  user is never trapped in a retake loop (PHASE 1G).
- Decision: session persisted as lightweight JSON metadata via LocalStore
  (core/storage), images stay as files. Store lives in feature `data/` layer.
- Decision: resolution `veryHigh` (1080p) with runtime fallback to `high`
  (720p) on CameraException.
- Decision: movement warning uses accelerometer magnitude deviation from 1g
  (linear acceleration = translation). Not SLAM, not position tracking.
- Decision: `kHFovDeg`/`kVFovDeg` remain in capture_targets.dart as the single
  source of truth; CameraProfile.fallbackWide references them; naive stitcher
  keeps using them unchanged (stitching is Phase 2).

## Outcomes & Retrospective

Shipped (2026-08-08): adaptive planner (24 targets on the fallback 55×69@30%
profile; zero azimuthal holes, zero pole gap), quality gate (variance of
Laplacian ≥ 60 on 256px luma; brightness 0.05–0.97; hysteresis accept after 3
rejects), single-target retake, persisted capture session with Resume/Discard
(+ corrupted-session message), accelerometer-magnitude movement warning,
1080p capture with 720p fallback, completion coverage gate with "Retake
missing angles". 77/77 tests (40 baseline + 37 new), analyze clean, harness
checks pass. Stitching, UploadQueue, backend and web untouched.

Known limitations: FOV is a documented conservative estimate (plugin exposes
no FOV; a telephoto back camera would under-cover); quality thresholds
calibrated on deterministic synthetic fixtures — on-device calibration and
real-room testing still required; roll is recorded but unused by stitching
(Phase 2); movement detection is a warning, not SLAM.

## Context and Orientation

Key files:

- `app/lib/features/capture/domain/capture_targets.dart` — CaptureTarget,
  projection, alignment, FOV constants (source of truth)
- `app/lib/features/capture/domain/capture_plan.dart` (NEW) — CameraProfile,
  CaptureTargetPlanner, CapturePlan, coverage helpers
- `app/lib/features/capture/domain/frame_quality.dart` (NEW) — quality gate
- `app/lib/features/capture/domain/capture_session.dart` (NEW) — session model
- `app/lib/features/capture/data/capture_session_store.dart` (NEW) — persistence
- `app/lib/features/capture/domain/orientation_engine.dart` — fused sensors + movement
- `app/lib/features/capture/presentation/capture_controller.dart` — state machine
- `app/lib/features/capture/presentation/capture_screen.dart` — UX
- `app/lib/features/capture/presentation/widgets/target_overlay.dart` — overlay + instructions

Pipeline (untouched): Capture → LocalAsset → Stitch → UploadQueue → Cloudinary
→ Scene → Publish.

## Plan of Work

1. Domain: CameraProfile (documented fallback 55×69, overlap 0.30) + planner
   (ring geometry, per-ring azimuth count from actual FOV at ring pitch) + plan
   + coverage helpers (missing/misaligned targets).
2. Domain: quality gate — single downscaled decode per frame; variance of
   Laplacian (sharpness), mean luma (brightness); assess() with hysteresis.
3. Domain: session model + data store (LocalStore-backed, JSON metadata only).
4. Engine: movement detection (accel magnitude vs 1g, majority-of-window).
5. Controller: build plan at initialize; veryHigh→high fallback; quality gate
   in captureFrame; reject → same-target retake; accept → replace/append frame
   at target index; persist session after every state change; resume/discard;
   completion gate; movement flag; skip recording.
6. UI: resume dialog, inline rejection + movement banners, human instruction
   text, review-sheet coverage warnings, "retake missing angles".
7. Tests: planner (9 cases), quality gate (6 cases), session round-trip/recovery,
   controller advance/retake decisions; keep all 40 existing tests green
   (update only the fixed-16-layout test to the planner-based layout).
8. Calibrate sharpness/brightness thresholds against deterministic fixtures.
9. flutter analyze, flutter test, harness checks, docs (QUALITY_SCORE,
   product spec, feature-map).

## Concrete Steps

Working directory: `mobile/app`

```sh
flutter test                              # baseline 40/40
flutter analyze
dart run ../scripts/check_architecture.dart   # from mobile/
./scripts/check_docs_harness.sh           # from mobile/
```
