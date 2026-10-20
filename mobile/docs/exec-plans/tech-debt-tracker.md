# Tech debt tracker

Versioned list of known debt. Prefer entries here over silent `TODO` comments. Agents: add when you defer work; remove or downgrade when fixed.

| ID | Area | Debt | Severity | Notes |
|----|------|------|----------|-------|
| TD-001 | insta360 | NDA SDK not linked; capture/connect throw | High | Three linkage points in plugin Swift; see native-plugins.md |
| TD-002 | auth | Google iOS OAuth client missing | High | Backend `/auth/config` may return null; Info.plist placeholder |
| TD-003 | auth | Sign in with Apple portal capability | Medium | Entitlement wired; portal enablement may be pending |
| TD-004 | deep links | AASA must list team+bundle on backend | Medium | Client applinks ready; server config external |
| TD-005 | api | `BackendApi` returns raw Maps | Done | 2026-10 (tours-mobile pass A): every response is a typed DTO (`core/models/api_dtos.dart`), errors are `ApiException`, enums are generated (`tool/gen_enums.py`), fixtures come from the backend (`tool/api_fixtures.py`, `test/contract/`) |
| TD-006 | delete | Remote tour/scene delete best-effort | Low | Local delete must stay consistent; queue-job cleanup added 2026-07-25 |
| TD-007 | tests | Sparse widget/E2E for capture + publish | Medium | Unit tests cover core math/queue |
| TD-008 | stitch | Naive stitch quality ceiling | Low | By design fallback; cloud re-stitch for quality |
| TD-009 | architecture | Shared providers lived on detail screen | Done | Extracted to `asset_providers.dart`; list screen migrated 2026-07-25 |
| TD-010 | architecture | `settings/domain/processing_preference.dart` hosts a Riverpod notifier | Low | Prefer pure enum/helpers in domain; move blocked by capture_controller import |
| TD-011 | tours | `Room` model has no status field | Done | `Room.status`/`lastError` added 2026-08 (W3e); queue marks rooms `failed` on give-up and `ready` on scene creation; room-list rendering of the failed state is W3f's to wire |
| TD-012 | tours | No hotspot list/delete/edit UI; orphaned hotspots on room delete | Done | 2026-10: the editor lists every hotspot (all pages), edits a destination with one PATCH, deletes with confirmation; the server removes hotspots that pointed at a deleted scene |
| TD-013 | threed | 3D job state not persisted across navigation | Removed | Feature deleted with splat removal; was Low. |
| TD-014 | deep links | `/view3d/{id}` deep link navigates to detail, not 3D viewer | Removed | Route deleted with splat removal; view3d links fall back to pano viewer. |
| TD-015 | viewer/share | `ShareLink.embedCode` getter in models.dart is dead code | Done | Removed 2026-08 (W3e); embed generation lives solely in `share/domain/embed_code.dart` |
| TD-016 | upload | Failing step + `lastError` not surfaced in UI | Done | 2026-08 (W3e): `UploadQueue.watchJob(assetId)` stream + asset detail shows backoff countdown (`nextRetryAt`), last error (truncated), terminal failure reason, and `waiting-auth` hold with Sign in |
| TD-017 | capture | Asset stuck in `stitching`/`pendingCloudStitch` if app killed mid-stitch | Done | 2026-10: `sweepStuckUploads` runs at start and after sign-in and re-enqueues or fails assets and rooms that a kill left without a job; the manual `retryStitch` path stays |
| TD-018 | threed | `AssetStatus.processing3d` read by UIs but never written | Removed | Feature + enum deleted with splat removal. |
| TD-019 | upload | Retry on an already-published failed asset can duplicate a scene in the same tour | Done | 2026-10: the main scene id is stored on the asset; a retry of a finished job resumes at `requestStitch`, `uploadFrames` or `publish` and never creates a second scene |
| TD-020 | tours | Floor plans cannot be created from the app | Partly done | 2026-10: the screen generates an AI-estimated schematic plan (`POST /tours/{id}/floor-plans/generate`) and draws its markers. Still open: a measured plan from a LiDAR scan — needs the RoomPlan outline rendered to an image, a presigned upload, then `POST /tours/{id}/floor-plans` |
| TD-021 | upload | Backend ignores `Idempotency-Key` on `POST /tours` and `POST /tours/{id}/scenes` | Low | A lost `POST /tours` response can leave one orphan draft tour; scene create has a client-side lookup guard. Backend declares the header only on `POST /bookings` |
| TD-022 | storage | Quarantined records and files had no way back | Done | 2026-10 (pass B): `recoverQuarantined` restores what the current parser reads, at start and after sign-in (see RELIABILITY.md). Data that is still unreadable stays in `<collection>_quarantine` (newest 50) and `.corrupt-<ts>` (newest 3); no screen lists it |
| TD-023 | storage | Local store is not purged on sign-out | Low | The image caches are purged (`purgeAccountCaches`). The local store holds unsent captures and is the only list of the user's tours in the app (no server list call), scoped by `ownerId`; purging it would delete captures that have not uploaded. Lead to confirm. If a purge is required: purge only records that are fully uploaded (`remoteSceneId` set and status `ready`) and keep unsent captures |

## How to add

1. New row with ID `TD-NNN`
2. Severity: High / Medium / Low
3. Link to ExecPlan if active work exists
