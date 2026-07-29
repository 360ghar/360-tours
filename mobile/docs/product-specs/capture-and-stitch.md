# Spec: capture and stitch

## Intent

User captures a room with the phone camera under guided targets, producing a 2:1 equirectangular panorama suitable for the 360 viewer.

## Flow

1. Navigate to `/capture` (optional `assetId` query to attach to existing asset).
2. Permissions: camera + motion sensors.
3. `CaptureController` + `OrientationEngine` fuse sensor data; `capture_targets` define sample points; `TargetOverlay` draws guidance.
4. Frames saved to disk with orientations.
5. `StitcherService.stitch` runs the ladder (OpenCV → naive; cloud is separate rung).
6. Asset updated with panorama/thumbnail paths; upload may be enqueued.

## Processing preference

`features/settings` stores whether to prefer on-device OpenCV or cloud-first stitch. When device preference is off, OpenCV rung is skipped so backend stitch can own quality.

## Acceptance

- Orientation wrap-around and target projection unit tests pass.
- Stitch always returns paths; `naive: true` when fallback used.
- Capture UI fails clearly when camera unavailable (simulator message).

## Key files

- `app/lib/features/capture/presentation/capture_screen.dart`
- `app/lib/features/capture/presentation/capture_controller.dart`
- `app/lib/features/capture/domain/orientation_engine.dart`
- `app/lib/features/capture/domain/capture_targets.dart`
- `app/lib/features/capture/domain/stitcher_service.dart`
