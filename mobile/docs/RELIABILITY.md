# RELIABILITY

Failure modes and recovery for the capture → publish pipeline.

## Upload queue

`core/upload/upload_queue.dart` (+ `upload_queue_steps.dart`,
`upload_retry_helpers.dart`) is a **persistent, sequential** pipeline:

```text
createTour → presign → putCloudinary → confirm → createScene → publish
           → (background) uploadFrames → requestStitch → pollStitch
```

- Job step is persisted after each success (`LocalStore` collection `upload_queue`).
- Crash or offline mid-pipeline resumes without creating duplicate tours (one active job per asset id).
- Connectivity changes trigger `pump()`.
- Max attempts: 8, then mark failed; re-enqueue can reset failed jobs.
- Room uploads are a related job kind with their own step default.
- **Publish-first (Phase 4):** the tour is published BEFORE refinement frames
  are uploaded. `AssetStatus.ready` + `ScanAsset.published` are set the moment
  publish succeeds; cloud refinement runs in the background and its failure
  (`cloudStitchFailed`) never marks the asset failed and never hides the
  View button (`ScanAsset.canViewTour`).
- **Frame uploads:** bounded concurrency 2 (never 24 parallel), each frame
  persists its own success keyed by ORIGINAL frame index
  (`frameUrlsByIndex`), so a restart/retry never re-uploads completed frames.
- **Idempotency:** server-generated ids (tourId, sceneId, stitchJobId) are
  persisted immediately; createScene reconciles against the tour's scenes by
  image_url before POSTing; a stored stitchJobId resumes polling instead of
  re-requesting; publish is idempotent server-side (short_code minted once).
- **Failure policy:** permanent 4xx (except 408/429) fail immediately with the
  backend detail; 5xx/network errors retry with exponential backoff (5s→5min
  cap), then give up. 401 is replayed exactly once by the api_client
  interceptor (single-flight refresh).
- Structured logs: `[backend] [cloudinary] [publish] [upload]
  [stitch-refinement]` with asset/tour/scene ids, step, attempt and elapsed —
  never JWTs, secrets or full signed URLs.

**Rule:** Do not bypass the queue with one-off multi-parallel uploads from UI for the main panorama path.

## Stitch ladder

`features/capture/domain/stitcher_service.dart`:

1. **OpenCV device stitch** (optional, timeout 90s) when `preferDevice` is true.
2. **Naive orientation compositing** in an isolate — always produces a 2:1 equirect (visible seams OK).
3. **Cloud stitch** `POST /scenes/{id}/stitch` with frame URLs — caller/upload path when naive and network allow.

Settings domain exposes processing preference (device vs cloud-first).

## Remote deletes

Asset/scene remote deletes are best-effort (errors swallowed in places). Local deletion must remain consistent even if remote fails. Document gaps in tech debt rather than pretending hard consistency.

## Auth / env

- Missing Supabase dart-defines → dedicated missing-env app, not a silent hang.
- Google iOS client may be null from `/auth/config` — show a clear message.

## Agent validation

When changing queue or stitch:

```sh
cd app && flutter test test/upload_queue_test.dart test/stitcher_test.dart test/orientation_engine_test.dart
```
