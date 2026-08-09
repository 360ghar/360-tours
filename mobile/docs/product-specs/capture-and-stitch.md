# Spec: capture and stitch

## Intent

User captures a room with the phone camera under guided targets, producing a 2:1 equirectangular panorama suitable for the 360 viewer. The capture side is **Smart Capture V2**: adaptive targets, quality gating, single-target retake, and crash-safe session recovery. Stitching is unchanged (Phase 2 will revisit it).

## Flow

1. Navigate to `/capture` (optional `assetId` query to attach to existing asset).
2. Permissions: camera + motion sensors.
3. `CaptureController` + `OrientationEngine` fuse sensor data. A `CaptureTargetPlanner` builds the adaptive target plan from the documented camera-FOV profile (see `capture_targets.dart` — no fixed 16-shot layout; ring spacing derives from FOV × (1−overlap), pole rings snap to 90−vFov/2).
4. On an interrupted session the user gets Resume/Discard (persisted via `CaptureSessionStore`); a corrupted session shows "Unable to resume capture".
5. Each frame is quality-gated on device (sharpness, brightness, stability, duplicate-angle) before it counts. A rejected frame retakes the SAME target; after 3 consecutive rejections the frame is accepted with a low-quality flag (hysteresis — never trap the user).
6. Frames saved to disk with orientations; the session is persisted after every state change.
7. Completion gate: all angles captured → review. Skipped angles keep the user in aiming with "Capture incomplete. N angles need to be retaken"; the review sheet lists gaps and offers "Retake missing angles".
8. `StitcherService.stitch` runs the ladder (OpenCV → naive; cloud is separate rung). Unchanged in this phase.
9. Asset updated with panorama/thumbnail paths; upload may be enqueued.

## Processing preference

`features/settings` stores whether to prefer on-device OpenCV or cloud-first stitch. When device preference is off, OpenCV rung is skipped so backend stitch can own quality.

## Acceptance

- Planner invariants (360° azimuth coverage per ring, no elevation holes, overlap ≥ configured fraction, unique in-bounds targets) covered by `capture_plan_test.dart`.
- Quality gate decides accept/reject deterministically (`frame_quality_test.dart`); borderline frames accepted; hysteresis accept-after-3.
- Session persist → kill → resume keeps frames and resumes the correct target (`capture_session_test.dart`).
- Stitching geometry/blend/quality are pure and deterministically tested (`panorama_geometry_test.dart`, `panorama_blending_test.dart`, `panorama_quality_test.dart`): roll-correct alignment (incl. the top-center-pixel invariant and the flipped-roll failure mode), coverage bands, seam agreement/clash, exposure gains, malformed-output rejection.
- `stitcher_test.dart`: the 24-target Phase 1 layout blends to ≥98% coverage with the poles covered; legacy 16-frame captures still stitch (partial, honestly reported); custom profiles work; low-quality flags reduce weight without breaking coverage.
- Cloud stitch polling is covered end to end (`upload_queue_test.dart`): metadata payload, completion → ready, failure → published + flagged, retry without frame re-upload; legacy assets keep the old contract.
- Capture UI fails clearly when camera unavailable (simulator message).

## Stitching (V2)

- **Metadata blend** (primary, always): roll-correct rays through the complete yaw/pitch/roll pose, bilinear sampling, coverage-aware weighted blending (`center × edge × quality`), per-frame exposure gains (median target, clamped 0.85–1.25). Output is a true 2:1 equirect; uncovered pixels stay black (honestly uncovered). Every stitch carries `PanoramaMetrics` (coverage %, horizontal/vertical coverage, seam, exposure, sharpness, overall, warnings). Blend performance: ~200ms/frame at production resolution in the test VM (see `stitcher_perf_test.dart`).
- **OpenCV rung** (`preferDevice`): frames yaw-ordered and downscaled; its letterboxed result is only shipped when it measurably beats the blend on both coverage and sharpness — a successful OpenCV stitch is never trusted on status alone, and a non-full-sphere result is marked `partial`.
- **Cloud refinement**: raw frames + per-frame metadata (yaw/pitch/roll/target_index/low_quality) + camera profile are uploaded; the backend blends with the same math, validates (2:1, coverage ≥ 60%, encodable), and only then replaces the scene image. The mobile queue polls the AI job (`requestStitch → pollStitch → done|stitchFailed`) — refinement failure keeps the local panorama published and surfaces "Panorama refinement failed … [Retry refinement] [Use current panorama]" instead of silently dropping the result.
- Legacy captures (no orientation metadata) keep the old `frame_urls`-only contract end to end.

## Key files

- `app/lib/features/capture/presentation/capture_screen.dart`
- `app/lib/features/capture/presentation/capture_controller.dart`
- `app/lib/features/capture/presentation/capture_state.dart`
- `app/lib/features/capture/domain/capture_targets.dart` (profile, planner, plan)
- `app/lib/features/capture/domain/frame_quality.dart`
- `app/lib/features/capture/domain/capture_session.dart` + `app/lib/features/capture/data/capture_session_store.dart`
- `app/lib/features/capture/domain/stitching/panorama_geometry.dart`
- `app/lib/features/capture/domain/stitching/panorama_blending.dart`
- `app/lib/features/capture/domain/stitching/panorama_quality.dart`
- `app/lib/features/capture/domain/stitching/stitcher_service.dart`
- `app/lib/features/capture/domain/orientation_engine.dart`
