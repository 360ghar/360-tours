# Phase 4 — Production E2E Hardening (upload reliability + viewer + tour completion)

This ExecPlan is a living document. Maintain Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective per docs/PLANS.md.

## Purpose / Big Picture

After Phase 4, a normal user on a physical Android device can: capture 24 frames
→ see a local stitch → upload reliably → publish → tap **View 360 Virtual Tour**
→ actually see their room in the 360 viewer. Cloud refinement runs in the
background and its failure never takes down the tour.

## Progress

- [x] (2026-08-09) Forensic trace of capture→stitch→upload→publish→view on mobile
- [x] (2026-08-09) Backend contract verification against canonical 360ghar-backend (in sync with origin/main)
- [x] (2026-08-09) Deployed viewer host verification (tours.360ghar.com live; 360viewer.360ghar.com dead DNS)
- [x] (2026-08-10) Models: ScanAsset published/remoteSceneId/cloudStitchPending/canViewTour, AssetStatus.uploading
- [x] (2026-08-10) BackendApi: upload progress callback, getTourScenes reconcile, Cloudinary timeouts
- [x] (2026-08-10) UploadQueue rework: publish-first, bounded frame concurrency, idempotent scene, 4xx fast-fail, frame give-up keeps tour, structured logs; split into 3 files (architecture size limits)
- [x] (2026-08-10) Env: canonical viewer base default `https://tours.360ghar.com` (+ mobile/.env, web embedCode fallback, .env.example)
- [x] (2026-08-10) AssetDetailScreen: viewability predicate + state-specific UX + specific retries
- [x] (2026-08-10) ViewerScreen: timeout/http-error/retry states
- [x] (2026-08-10) Web: `public/_redirects` SPA fallback (Netlify), netlify.toml, .env.example fix — REDEPLOY REQUIRED
- [x] (2026-08-10) Tests: 14 new UploadQueue hardening tests, 11 AssetDetail widget tests, 7 Viewer widget tests (155 total green)
- [x] (2026-08-10) `flutter analyze` clean; `flutter test` 155/155; harness (docs + architecture) green; `flutter build apk --debug` OK
- [x] (2026-08-10) Docs: RELIABILITY, QUALITY_SCORE, feature-map updated
- [ ] Physical-device run (user): TESTS 1–15 checklist in the Phase 4 brief
- [ ] Web redeploy with `_redirects` (needs Netlify access)
- [ ] Final report (this doc + chat summary)

## Surprises & Discoveries

- **Primary root cause of the disabled View button:** the queue marks an asset
  `AssetStatus.failed` when the *optional frame upload* (post-publish cloud
  refinement input) gives up. Tour+scene are already published at that point,
  yet the detail screen's predicate `ready && hasRemote` disables the View
  button. Evidence: `UploadQueue._advance` catch → `onGiveUp` for non-stitch
  steps sets `status: failed` (`upload_queue.dart:408-411`); frame step
  `uploadFrames` is not in the stitch-step branch; `asset_detail_screen.dart:140-143`
  gates on `ready && hasRemote`.
- **The configured viewer host is dead:** `https://360viewer.360ghar.com` does
  not resolve in DNS (verified with Resolve-DnsName + HTTP). The real deployed
  viewer is `https://tours.360ghar.com` (Vite SPA, Netlify behind Cloudflare;
  headers show `x-nf-request-id`). Root README already documented the dead
  host.
- **The deployed viewer 404s every client route:** `GET https://tours.360ghar.com/view/x`
  returns Netlify's server-side 404 page (not the SPA). No `_redirects`,
  `netlify.toml` or `404.html` exists in the repo or deployment → no SPA
  fallback. Even a valid tour link dies at the edge.
- **Backend contract matches the client** (verified against canonical main):
  `POST /tours` 201, `POST /upload/presigned` → `{items:[{upload_id,signed_url,
  token,api_key,timestamp,public_id,path,public_url}]}`, `POST /upload/confirm/{id}`,
  `POST /tours/{id}/scenes` 201, `POST /tours/{id}/publish` → tour (short_code
  minted once; idempotent), `POST /scenes/{id}/stitch` → `{job}`,
  `GET /ai/jobs/{id}` → `{job, result:{image_url,…}}`, public `GET /public/tours/{id}`,
  share `GET /v/{code}` (OG page → `{PUBLIC_APP_URL}/view/{tour_id}`).
- **Cloud refinement does not block availability in code, but the UI hides it:**
  after `publish` the job uploads 24 frames sequentially, one per drain pass
  (72 HTTP round trips: presign+put+confirm each) — the "uploading for a long
  time" the user saw. Shared `attempts` counter across all steps means one
  flaky frame exhausts 8 attempts and fails the whole job.
- **createScene is not idempotent:** a timeout after server success re-runs
  createScene and duplicates the scene. Publish is idempotent server-side
  (short_code minted once). createTour is never re-run (tourId persisted).
- **401 refresh already exists** in `api_client.dart` (single-flight
  refreshSession + one replay). Queue needs to stop retrying permanent 4xx
  (validation) 8 times with backoff.
- `public.py` requires `status == published` + non-private for the public
  viewer/OG endpoints → `published` is the correct viewability gate.

## Decision Log

- Decision: Introduce `ScanAsset.published` (bool), `remoteSceneId`, and
  `cloudStitchPending` (bool); add `AssetStatus.uploading`.
  Rationale: viewability = published tour + panorama, independent of
  refinement. Status alone cannot express "published but refining/failed".
  Date: 2026-08-09
- Decision: On publish success the asset transitions to `ready` immediately
  and refinement continues in the background (frames upload + cloud stitch),
  tracked via `cloudStitchPending` → `cloudStitchFailed` on give-up.
  Rationale: spec §7 — local panorama is the fallback; refinement must never
  block tour availability.
- Decision: Frame-upload give-up marks `cloudStitchFailed` (not `failed`).
  Only pre-publish failures mark the asset `failed`.
  Rationale: direct fix for the reported dead-end.
- Decision: `canViewTour = remoteTourId != null && published &&
  (panoramaUrl != null || local panorama file exists)`.
  Rationale: spec §8; publish precedes frame upload, so published implies
  viewable. Local file fallback covers a missing remote URL.
- Decision: Bounded frame-upload concurrency of 2 (spec §6) with per-frame
  completion persisted (`frameUrlsByIndex` map) so retries skip uploaded
  frames; frames that are re-uploaded get fresh presigns only when needed.
- Decision: Idempotent scene creation — before `createScene`, reconcile via
  `GET /tours/{id}/scenes` matching `image_url == panoramaUrl`; adopt the
  existing scene id. Persist `sceneId` + `tourId` + `stitchJobId` in the job
  after each response (crash-safe). Stored `stitchJobId` skips re-requesting.
- Decision: Permanent 4xx (except 408/429) fails the job immediately with the
  backend detail as the actionable error; 5xx/network get bounded backoff.
- Decision: Canonical viewer host = `Env.viewerBase` default
  `https://tours.360ghar.com`. Share links stay `{apiRoot}/v/{code}` (backend
  contract); embed/view URLs derive from `Env.viewerBase` only.
- Decision: Web gets `public/_redirects` (Netlify) SPA fallback
  `/view/* /embed/* /view3d/* → /index.html 200`; redeploy required to take
  effect (BLOCKED on deploy access — see final report).
- Decision: Structured logs use tags `[capture] [stitch] [upload] [cloudinary]
  [backend] [stitch-refinement] [publish] [viewer]`; never log JWTs, secrets,
  or full signed URLs (host + path only).

## Context and Orientation

Mobile (`mobile/app`): `core/models/models.dart` (ScanAsset/AssetStatus),
`core/upload/upload_queue.dart` (sequential persisted pipeline),
`core/api/backend_api.dart` + `core/api/api_client.dart` (dio, 401 refresh),
`features/assets/presentation/asset_detail_screen.dart` (the disabled button),
`features/viewer/presentation/viewer_screen.dart` (WebView embed),
`core/env.dart` (viewerBase), `features/share/...` (share links/embed code).
Web (`web`): Vite SPA deployed to Netlify at `tours.360ghar.com`; routes
`/view/:id /embed/:id /view3d/:id` in `src/lib/router.tsx`; viewer calls
`GET /api/v1/public/tours/{id}`.
Backend (`backend`, canonical checkout): endpoints in
`app/api/api_v1/endpoints/{tours,scenes,upload,ai,public}.py`, share OG pages
in `app/api/share.py`.

## Plan of Work

1. Models: add fields + `canViewTour` getter + `AssetStatus.uploading`.
2. BackendApi: `uploadToCloudinary(..., onProgress)` with a long-lived Dio
   (no more bare `Dio()`), `getTourScenes(tourId)`.
3. UploadQueue: rewrite step state machine per Decision Log; add structured
   logs; keep resumability; bounded frame concurrency; reconciliation.
4. Env: viewerBase default → `https://tours.360ghar.com`.
5. AssetDetailScreen: use `canViewTour`; state-specific banners/actions;
   live queue-step provider for progress text.
6. ViewerScreen: load timeout, onHttpError, canViewTour gate, retry.
7. Web: `public/_redirects`, `netlify.toml` optional, `.env.example` comment.
8. Tests for queue/screen/viewer; run analyze/test; build debug APK.
9. Docs updates.

## Concrete Steps

Working directory: `mobile/app` unless noted.

```sh
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

Backend (from `backend`): `uv run pytest -q` (env-permitting), `uv run ruff check .`

## Outcomes & Retrospective

Shipped (2026-08-10):
- Publish-first pipeline: tour is live the moment publish succeeds; refinement
  (frames + cloud stitch) runs in the background; `canViewTour` is the single
  viewability predicate (published + panorama, refinement-independent).
- Frame upload give-up no longer marks the asset failed — the reported
  "upload failed → View button disabled" dead-end is fixed.
- Bounded 2-wide frame concurrency with per-frame persisted resume (no
  re-uploads), idempotent createScene (reconcile by image_url), stored
  stitchJobId resume, permanent-4xx fast-fail, 401 single-replay, structured
  redacted logs, honest progress (bytes for the pano, frames for sources).
- Viewer: canonical host tours.360ghar.com (360viewer.360ghar.com is dead
  DNS); load timeout, http/resource error UI with Retry.
- Web: `_redirects` SPA fallback + netlify.toml authored; redeploy pending.
- Validation: flutter analyze clean, 155/155 tests (14 new queue, 11 detail,
  7 viewer), docs + architecture harness green, debug APK built. Backend:
  ruff clean, 1783 unit tests pass; API tests needing Postgres BLOCKED (no
  local DB); 3 pre-existing env-config test failures unrelated.

Remaining / BLOCKED:
- Physical-device run (user) — TEST 1–15 checklist.
- Web redeploy (Netlify access) — until then deep links 404 at the edge.
- Backend PUBLIC_APP_URL live value unverifiable from this machine.
- Image rendering in widget tests stalls on this headless Windows host
  (instantiateImageCodec) — the "saved on this device" banner copy is covered
  at queue level, not widget level.

Lesson: the previous phase shipped a pipeline where an OPTIONAL step (frame
upload) could flip the whole asset to failed and disable the primary action;
the fix was structural (publish-first + refinement-independent predicate), not
a UI toggle.
