# QUALITY_SCORE

Grades for product domains and shared layers. Scale: **A** (solid + tested) … **D** (incomplete / high risk) · **F** (broken / unusable). Re-grade after major changes.

Last reviewed: 2026-07-25 (full codebase audit + fix pass).

## Domains

| Domain | Grade | Notes |
|--------|-------|-------|
| capture (math + targets) | **A** | Orientation snapshotted at shutter; init re-entrancy guard; sensor pause on lifecycle; haptic feedback; dead code removed |
| upload queue | **A** | Backoff bypass, stale-write, retry-default, and expired-presign bugs fixed; shared failure helper extracted |
| local store / models | **A-** | Durable write-before-cache, corrupt-JSON quarantine, copyWith null-reset sentinel |
| auth | **B+** | Stream error handling, tri-state restoring/splash, force-unwrap fixes, Google init race, loading feedback |
| assets list/detail | **B+** | Migrated to shared provider, error retry, pull-to-refresh, delete/upload race closed, disabled-action hints |
| share / embed | **A-** | HTML-escaped embed, share-sheet error handling, friendly publish errors, loading-flash guard |
| viewer | **B+** | Side-effect-free build, retry button, uploading/not-ready differentiation, labeled loading |
| tours (rooms/hotspots/floor) | **B-** | Delete confirmation, yaw/pitch clamp, web error handling, floor-plan CTA; Room status + hotspot mgmt still debt (TD-011/012) |
| lidar | **B-** | Native cleanup on dispose, error-phase handling, share/export action; scan HUD overlap remains |
| threed | **B-** | Timer leak + stuck-state fixed, bounded polling, failure surfacing, retry label; job persistence still debt (TD-013) |
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
6. `Room` model has no status field; room upload/stitch failures are not distinctly surfaceable (TD-011).
7. No hotspot list/delete/edit UI; orphaned hotspots remain after room deletion (TD-012).
8. `/view3d/{id}` deep link lands on detail, not the 3D viewer (TD-014).

Many prior gaps (auth session race, upload backoff bypass, local-store durability, capture orientation timing, missing loading/error/empty states) were resolved in the 2026-07-25 audit pass.

## How to re-grade

After a feature lands: update the row, date the review, and if grade drops, add debt or an ExecPlan rather than ignoring it.
