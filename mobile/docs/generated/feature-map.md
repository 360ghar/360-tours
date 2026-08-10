# Generated feature map

Inventory of `app/lib` for agent navigation. Update when features are added, renamed, or removed.

## core (`app/lib/core/`)

| Path | Role |
|------|------|
| `api/api_client.dart` | Dio + JWT |
| `api/backend_api.dart` | Backend endpoints |
| `env.dart` | dart-define config |
| `models/models.dart` | Shared domain models |
| `providers.dart` | DI seams |
| `repositories/repositories.dart` | Auth/Asset/Share contracts |
| `router.dart` | go_router |
| `storage/local_store.dart` | JSON collections on disk |
| `theme/app_theme.dart` | Theme + colors |
| `upload/upload_queue.dart` | Resumable publish pipeline (publish-first; Phase 4) |
| `upload/upload_queue_steps.dart` | Per-step pipeline logic (`UploadStepsRunner`) |
| `upload/upload_retry_helpers.dart` | Failure/retry helpers (4xx policy, resume step) |

## features

| Feature | Layers present | Notes |
|---------|----------------|-------|
| analytics | presentation | Uses `assetProvider` |
| assets | data, presentation | `asset_providers.dart` shared; local repository |
| auth | data, presentation | Supabase |
| capture | data, domain, presentation | Adaptive target planner (FOV profile → plan), orientation, quality gate, session persistence, stitching (geometry/blend/quality/service), pipeline, controller, overlay |
| lidar | presentation | RoomPlan UI |
| settings | domain, presentation | Processing preference |
| share | data, domain, presentation | Embed + API share |
| threed | presentation | generate-3d job |
| tours | presentation | rooms, hotspots, floor plan |
| viewer | presentation | WebView |

## packages

| Package | Path |
|---------|------|
| lidar_scanner | `app/packages/lidar_scanner/` |
| insta360_capture | `app/packages/insta360_capture/` |

## tests (`app/test/`)

| File | Covers |
|------|--------|
| `capture_controller_test.dart` | Capture controller skip/retake-missing |
| `capture_plan_test.dart` | Planner coverage/overlap/bounds invariants |
| `capture_session_test.dart` | Session persist/resume/discard |
| `capture_targets_test.dart` | Target geometry + default plan |
| `embed_code_test.dart` | Embed snippet compatibility |
| `frame_quality_test.dart` | Quality gate + capture decisions |
| `local_store_test.dart` | Persistence |
| `orientation_engine_test.dart` | Sensor fusion / wrap / movement |
| `panorama_blending_test.dart` | Weights, gains, bilinear, blend |
| `panorama_geometry_test.dart` | Equirect/pose/ray math, roll invariant |
| `panorama_quality_test.dart` | Coverage/seam/exposure scores, validation |
| `stitcher_test.dart` | Blend ladder, layouts, roll, custom profiles, candidate-selection policy |
| `stitcher_perf_test.dart` | Production-resolution blend benchmark (dart-define PERF=true) |
| `upload_queue_test.dart` | Resume / no duplicate tours / cloud-stitch polling |
| `widget_test.dart` | Smoke |
