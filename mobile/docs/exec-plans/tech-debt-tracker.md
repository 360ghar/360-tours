# Tech debt tracker

Versioned list of known debt. Prefer entries here over silent `TODO` comments. Agents: add when you defer work; remove or downgrade when fixed.

| ID | Area | Debt | Severity | Notes |
|----|------|------|----------|-------|
| TD-001 | insta360 | NDA SDK not linked; capture/connect throw | High | Three linkage points in plugin Swift; see native-plugins.md |
| TD-002 | auth | Google iOS OAuth client missing | High | Backend `/auth/config` may return null; Info.plist placeholder |
| TD-003 | auth | Sign in with Apple portal capability | Medium | Entitlement wired; portal enablement may be pending |
| TD-004 | deep links | AASA must list team+bundle on backend | Medium | Client applinks ready; server config external |
| TD-005 | api | `BackendApi` returns raw Maps | Medium | Map to models at repository boundary over time |
| TD-006 | delete | Remote tour/scene delete best-effort | Low | Local delete must stay consistent; queue-job cleanup added 2026-07-25 |
| TD-007 | tests | Sparse widget/E2E for capture + publish | Medium | Unit tests cover core math/queue |
| TD-008 | stitch | Naive stitch quality ceiling | Low | By design fallback; cloud re-stitch for quality |
| TD-009 | architecture | Shared providers lived on detail screen | Done | Extracted to `asset_providers.dart`; list screen migrated 2026-07-25 |
| TD-010 | architecture | `settings/domain/processing_preference.dart` hosts a Riverpod notifier | Low | Prefer pure enum/helpers in domain; move blocked by capture_controller import |
| TD-011 | tours | `Room` model has no status field | Medium | Cannot represent stitching/uploading/failed per room; blocks failure surfacing |
| TD-012 | tours | No hotspot list/delete/edit UI; orphaned hotspots on room delete | Medium | `deleteHotspot` API exists but is never called; misplaced hotspots are permanent |
| TD-013 | threed | 3D job state not persisted across navigation | Low | Polling is in-memory; job lost on navigate-away; timeout + bounds added 2026-07-25 |
| TD-014 | deep links | `/view3d/{id}` deep link navigates to detail, not 3D viewer | Low | Should route to `/asset/{id}/view?mode=3d` |
| TD-015 | viewer/share | `ShareLink.embedCode` getter in models.dart is dead code | Low | Inferior duplicate of `generateEmbedCode`; remove when models.dart is next touched |
| TD-016 | upload | Failing step + `lastError` not surfaced in UI | Medium | Queue persists `lastStep`/`lastError` but no widget watches `upload_queue`; user only sees "Something went wrong" |
| TD-017 | capture | Asset stuck in `stitching`/`pendingCloudStitch` if app killed mid-stitch | Medium | No startup reconciliation; needs a boot sweep to re-drive or mark failed |

## How to add

1. New row with ID `TD-NNN`
2. Severity: High / Medium / Low
3. Link to ExecPlan if active work exists
