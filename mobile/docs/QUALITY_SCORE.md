# QUALITY_SCORE

Grades for product domains and shared layers. Scale: **A** (solid + tested) … **D** (incomplete / high risk) · **F** (broken / unusable). Re-grade after major changes.

Last reviewed: 2026-07-25 (full codebase audit + fix pass). Updated 2026-08 (W3e core-reliability fix pass: re-stitch retry, presign staleness, queue observability, auth-hold, orphan sweep, wrong-shape quarantine, room status, <2-frames warning).

## Domains

| Domain | Grade | Notes |
|--------|-------|-------|
| capture (math + targets) | **A** | Orientation snapshotted at shutter; init re-entrancy guard; sensor pause on lifecycle; haptic feedback; dead code removed; `retryStitch` re-runs the ladder for failed assets; `sweepOrphanedCaptures` cleans abandoned sessions (startup call pending in main.dart) |
| upload queue | **A** | Backoff bypass, stale-write, retry-default, and expired-presign bugs fixed; shared failure helper extracted; **crash-restart resumes re-presign** stale Cloudinary signatures; auth-expiry holds jobs in `waiting-auth` without burning attempts; room jobs mark the room `failed` on give-up; <2-frames cloud-stitch skip warns instead of claiming ready; `watchJob` exposes per-asset queue state |
| local store / models | **A** | Durable write-before-cache, corrupt-JSON quarantine (now also wrong-shape/TypeError), copyWith null-reset sentinel; `Room.status`/`lastError` added; dead `ShareLink.embedCode` + `AssetType.lidar` removed |
| auth | **B+** | Stream error handling, tri-state restoring/splash, force-unwrap fixes, Google init race, loading feedback; `authExpiredStream` signals failed 401 refresh so UI + queue can react |
| assets list/detail | **A-** | Migrated to shared provider, error retry, pull-to-refresh, delete/upload race closed, disabled-action hints; detail screen now surfaces queue backoff countdown + last error + terminal-failure reason, offers re-stitch retry for failed stitch assets, and shows a session-expired banner with Sign in |
| share / embed | **A-** | HTML-escaped embed, share-sheet error handling, friendly publish errors, loading-flash guard |
| viewer | **B+** | Side-effect-free build, retry button, uploading/not-ready differentiation, labeled loading |
| tours (rooms/hotspots/floor) | **B** | Delete confirmation, yaw/pitch clamp, web error handling, floor-plan CTA; `Room.status`/`lastError` now exist and the queue marks rooms failed on give-up (room list rendering of `failed` still W3f's to wire); hotspot mgmt still debt (TD-012) |
| lidar | **B-** | Native cleanup on dispose, error-phase handling, share/export action; scan HUD overlap remains |
| threed | **B-** | Timer leak + stuck-state fixed, bounded polling, failure surfacing, retry label; job persistence still debt (TD-013); `AssetStatus.processing3d` contract documented for generate_3d_screen (TD-018) |
| analytics | **B** | Empty-state CTA, pull-to-refresh, loading-flash guard |
| settings | **B+** | Persist-before-set with rollback + error surfacing; TD-010 move blocked by capture import |
| insta360 plugin | **D** | Discovery without SDK works; capture blocked until NDA SDK linked |
| frontend polish | **B** | Loading/error/empty states added across all screens; haptics on capture |

## Layers

| Layer | Grade | Notes |
|-------|-------|-------|
| core API (`BackendApi`) | **B** | Typed methods; still returns `Map` in places — parse at callers |
| repository contracts | **B+** | Clear auth/asset/share interfaces |
| DI / providers | **B+** | Overrides in main; shared asset providers extracted |
| architecture enforcement | **B** | Harness scripts added; not full custom lint platform |
| docs / agent harness | **B+** | Progressive disclosure structure in place (this pass) |
| CI | **B** | `harness.yml` analyze + test + structure checks |

## Known gaps (see also tech-debt-tracker)

1. Google iOS OAuth client id missing from backend config / Info.plist placeholder (TD-002).
2. Insta360 SDK linkage points incomplete by design (NDA) (TD-001).
3. Cross-cutting `BackendApi` maps not always mapped to models at the boundary (TD-005).
4. Sparse widget/integration tests for capture UI and full publish E2E (TD-007).
5. Deep link AASA coordination is backend-side (TD-004).
6. `sweepOrphanedCaptures` implemented but not yet called from main.dart (W3e fix pass — one-line startup call pending with W3f).
7. No hotspot list/delete/edit UI; orphaned hotspots remain after room deletion (TD-012).
8. `/view3d/{id}` deep link lands on detail, not the 3D viewer (TD-014).
9. Retry on an already-published failed asset can re-upload into the same tour (duplicate-scene edge, TD-019).
10. `AssetStatus.processing3d` read by UIs but still not written by generate_3d_screen (TD-018).

Many prior gaps (auth session race, upload backoff bypass, local-store durability, capture orientation timing, missing loading/error/empty states, failed-stitch dead end, room failure invisibility) were resolved in the 2026-07-25 audit pass and the 2026-08 W3e core-reliability pass.

## How to re-grade

After a feature lands: update the row, date the review, and if grade drops, add debt or an ExecPlan rather than ignoring it.
