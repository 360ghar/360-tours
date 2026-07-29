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
| `upload/upload_queue.dart` | Resumable publish pipeline |

## features

| Feature | Layers present | Notes |
|---------|----------------|-------|
| analytics | presentation | Uses `assetProvider` |
| assets | data, presentation | `asset_providers.dart` shared; local repository |
| auth | data, presentation | Supabase |
| capture | domain, presentation | Orientation, targets, stitch, controller, overlay |
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
| `capture_controller_test.dart` | Capture controller |
| `capture_targets_test.dart` | Target geometry |
| `embed_code_test.dart` | Embed snippet compatibility |
| `local_store_test.dart` | Persistence |
| `orientation_engine_test.dart` | Sensor fusion / wrap |
| `stitcher_test.dart` | Naive/OpenCV path behavior |
| `upload_queue_test.dart` | Resume / no duplicate tours |
| `widget_test.dart` | Smoke |
