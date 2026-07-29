# ARCHITECTURE.md

Top-level map of domains and dependency rules for the 360 Tours Flutter app. Agents must keep this accurate when structure changes.

## Repository shape

```text
360-tours-app/          # git root — agent knowledge base lives here
├── AGENTS.md           # short map
├── docs/               # system of record
├── scripts/            # harness checks
└── app/                # Flutter package (tours360)
    ├── lib/
    │   ├── main.dart           # composition root: DI wiring
    │   ├── core/               # shared infrastructure
    │   └── features/<domain>/  # feature slices
    ├── packages/
    │   ├── lidar_scanner/
    │   └── insta360_capture/
    └── test/
```

## Domains

| Domain | Path | Responsibility |
|--------|------|----------------|
| core | `app/lib/core/` | API client, models, repository contracts, local store, upload queue, router, theme, env, DI providers |
| auth | `app/lib/features/auth/` | Supabase sign-in (email, Google, Apple); JWT session for backend |
| assets | `app/lib/features/assets/` | Local tour/scan assets, list/detail, enqueue upload |
| capture | `app/lib/features/capture/` | Guided phone capture, orientation engine, stitch ladder |
| lidar | `app/lib/features/lidar/` | RoomPlan scan + photogrammetry UI |
| tours | `app/lib/features/tours/` | Rooms, hotspots, floor plans |
| viewer | `app/lib/features/viewer/` | WebView host for the web viewer (`../web` in this monorepo; deployed separately, loaded by URL at runtime) |
| share | `app/lib/features/share/` | Short links, embed code, system share sheet |
| threed | `app/lib/features/threed/` | Cloud generate-3d job UX |
| analytics | `app/lib/features/analytics/` | Tour view analytics |
| settings | `app/lib/features/settings/` | Processing preference (device vs cloud stitch) |

## Layers inside a feature

```text
presentation → domain → data → core
```

| Layer | Typical contents | May depend on |
|-------|------------------|---------------|
| `presentation/` | Screens, widgets, Riverpod UI providers | same feature `domain`, `core`, Flutter; other features' non-screen modules when necessary |
| `domain/` | Pure logic (math, embed strings, prefs) | `core/models`, Dart SDK; **not** widgets/`presentation`, Dio, Supabase. Riverpod notifiers in `domain/` are legacy-tolerated (see tech debt) |
| `data/` | Repository implementations | `core/api`, `core/storage`, `core/repositories`, domain types |
| `core/` | Shared only | packages, Flutter, platform APIs |

### Hard rules (enforced by `scripts/check_architecture.dart`)

1. **No cross-feature `*_screen.dart` imports** (relative or `package:` URIs under `features/`). Shared UI state belongs in `*_providers.dart` or `core/`.
2. **`domain/` must not import `presentation/`.**
3. **`domain/` must not import `package:dio` or `package:supabase_flutter`.**
4. **File length hard fail** above 600 lines per Dart file under `app/lib/` (soft warn above 400).

### Conventions (documented; not all machine-checked yet)

1. **Composition root only in `main.dart`.** Concrete repos and queue are constructed once and injected via `ProviderScope` overrides (`core/providers.dart`).
2. **Router is the only module that wires all feature screens together** (`core/router.dart`).
3. **Native SDKs only behind `app/packages/*` public Dart APIs.**
4. Prefer repository interfaces in `core/repositories/repositories.dart` for auth, assets, share.
5. Parse JSON into typed models at the API/storage boundary (`core/models/models.dart`).
6. Upload and publish pipeline is sequential and resumable via `core/upload/upload_queue.dart` — do not reimplement parallel ad-hoc uploads in UI.

## Runtime object graph

```text
main.dart
  ├─ Supabase.initialize (if Env.hasSupabase)
  ├─ LocalStore(docsDir)
  ├─ BackendApi(createApiClient())  // Dio + JWT interceptor
  ├─ UploadQueue(store, api, asset hooks)
  ├─ LocalAssetRepository(store, queue hooks, remote delete)
  ├─ SupabaseAuthRepository(client, api)
  └─ ApiShareRepository(api, saveAsset)
       → ProviderScope overrides → ToursApp → GoRouter
```

## Stitch ladder (capture domain)

Documented in depth in `docs/RELIABILITY.md` and `docs/product-specs/capture-and-stitch.md`.

1. On-device OpenCV (`opencv_dart` Stitcher) when user prefers device
2. Naive orientation compositing (always succeeds, seams OK)
3. Cloud re-stitch `POST /scenes/{id}/stitch` from raw frames (upload/caller path)

## External systems

| System | Role |
|--------|------|
| Supabase Auth | Identity; JWT |
| `api.360ghar.com/api/v1` | Tours, scenes, hotspots, presigned uploads, AI jobs |
| Cloudinary | Direct presigned image PUT (no app Authorization header) |
| `360viewer.360ghar.com` | Embed / view / view3d web app — source now lives at `../web` in this monorepo; coordinate route/embed-contract changes across both |
| Apple RoomPlan / RealityKit | LiDAR plugin |
| Insta360 camera WiFi | Optional capture path (SDK NDA-gated) |

## Changing architecture

1. Update this file and `docs/generated/feature-map.md`
2. Keep layer rules green under `dart run scripts/check_architecture.dart`
3. If introducing a new domain folder under `features/`, add product-spec or quality grade notes
4. Prefer additive, testable moves; extract shared providers before allowing new cross-imports
