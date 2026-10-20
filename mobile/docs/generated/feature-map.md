# Generated feature map

Inventory of `app/lib` for agent navigation. Update when features are added, renamed, or removed.

## core (`app/lib/core/`)

| Path | Role |
|------|------|
| `api/api_client.dart` | Dio + JWT |
| `api/api_exception.dart` | `ApiException` read from the error envelope, `describeError` |
| `api/backend_api.dart` | Typed backend endpoints |
| `env.dart` | dart-define config |
| `models/api_dtos.dart` | Typed response DTOs (`CursorPage`, `TourDto`, `HotspotDto`, `PresignedUploadDto`, `AiJobSnapshotDto`, ...) |
| `models/models.dart` | Shared domain models |
| `models/wire_enums.dart` | Generated wire enums (`tool/gen_enums.py`); an unknown value reads as null |
| `providers.dart` | DI seams |
| `repositories/repositories.dart` | Auth/Asset/Share contracts |
| `router.dart` | go_router |
| `storage/local_store.dart` | JSON collections on disk, quarantine and restore |
| `storage/account_caches.dart` | Empties the image caches on sign-out |
| `theme/app_theme.dart` | Theme + colors |
| `upload/upload_queue.dart` | Resumable publish pipeline (queue, enqueue, failure handling) |
| `upload/upload_pipelines.dart` | Asset and room job steps (part of `upload_queue.dart`) |
| `upload/upload_step_rules.dart` | Pure resume/staleness/failure-classification rules |
| `upload/upload_sweep.dart` | Startup and sign-in sweep for stuck uploads; `recoverQuarantined` |

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
| tours | presentation | rooms, hotspots, floor plan |
| viewer | presentation | WebView |

## tool (`app/tool/`)

| File | Role |
|------|------|
| `api_fixtures.py` | Writes `test/fixtures/api/*.json` from the backend's Pydantic models |
| `gen_enums.py` | Writes `lib/core/models/wire_enums.dart` from `contract-audit/enums.json` |

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
| `local_store_schema_test.dart` | Schema header, quarantine and its recovery, owner filter, strict models |
| `account_caches_test.dart` | Sign-out cache purge |
| `env_test.dart` | Link root follows `API_BASE` |
| `hotspot_editor_test.dart`, `hotspot_editor_screen_test.dart` | Destinations, one-PATCH edit, error display |
| `room_list_screen_test.dart` | Room states and routes |
| `share_repository_test.dart` | Share link from `short_code`, analytics |
| `upload_sweep_test.dart` | Startup sweep, quarantine recovery |
| `backend_api_signed_fields_test.dart` | Cloudinary form fields |
| `contract/` | Backend-shaped fixtures parsed by the DTOs, request bodies checked against the OpenAPI schemas, wire enums |
| `orientation_engine_test.dart` | Sensor fusion / wrap |
| `stitcher_test.dart` | Naive/OpenCV path behavior |
| `upload_queue_test.dart` | Resume / no duplicate tours |
| `upload_step_rules_test.dart` | Step rules in isolation |
| `widget_test.dart` | Smoke |
