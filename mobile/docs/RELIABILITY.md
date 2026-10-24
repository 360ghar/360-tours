# RELIABILITY

Failure modes and recovery for the capture → publish pipeline.

## Upload queue

`core/upload/upload_queue.dart` is a **persistent, sequential** pipeline:

```text
createTour → presign → putCloudinary → confirm → createScene → publish
  → [uploadFrames → requestStitch → awaitStitch]
```

The bracketed steps run only when the on-device stitch was the naive fallback: the raw frames go up and the backend re-stitches them. `awaitStitch` polls `GET /ai/jobs/{id}` every 5 seconds and sets the asset `ready` (job `completed`), or `failed` (job `failed` or `cancelled`, with the server's `error_message`, or no finish in 20 minutes). When a cloud stitch was requested, the asset is not `ready` before that. With fewer than two frames no stitch job is created: the naive panorama stays and the asset is `ready` after `publish`.

- Job step is persisted after each success (`LocalStore` collection `upload_queue`).
- Crash or offline mid-pipeline resumes without creating duplicate tours (one active job per asset id).
- Connectivity changes trigger `pump()`; `dispose()` releases that subscription.
- Max attempts: 8, then mark failed; re-enqueue can reset failed jobs.
- Room uploads are a related job kind with their own step default.

**Idempotency guards.** Every remote-create step is entered only when its result
is not already recorded, because the backoff retry path does not run
`_resumeStep`:

- `createTour` is skipped when `job['tourId']` is set (a throw *after* the POST
  succeeded used to create a second tour on every retry).
- The main scene id is stored on `ScanAsset.remoteSceneId` and on the job. A job
  that has one never uploads the panorama or creates a scene again. A retry of a
  finished job resumes at `requestStitch`, `uploadFrames` or `publish`, never at
  `presign`.
- `createScene` (room pipeline) reuses `job['sceneId']` when present.
- `enqueueRoom` is idempotent: a room with a `remoteSceneId`, or one whose job
  is still in flight, is never rewound to `presign`.
- `createTour` and `createScene` send an `Idempotency-Key` (`tour-{assetId}`,
  `scene-{assetId}`, `scene-room-{roomId}`), the same on every retry. The
  backend ignores the header on these routes today, so after a lost scene
  response the retry first looks for a scene on the tour with the same image.
- The server appends scenes in creation order (the client sends no
  `order_index`), so a room job waits until the main scene exists.

**Failures.** `failureAction` (`upload_step_rules.dart`) decides: a 401 from the
API parks the job on `waiting-auth`; a 4xx other than 408 and 429 fails the job
at once (a retry cannot change the answer); a 401 from Cloudinary signs again;
anything else retries with backoff, honouring `Retry-After` (cap 5 minutes). The
text stored in `lastError` is the envelope message (`describeError`), never raw
Dio output.

**Startup sweep.** `sweepStuckUploads` (`upload_sweep.dart`) runs at app start and
after each sign-in, for the signed-in account only. It re-enqueues an asset or
room that has a panorama but no job, marks one with no panorama `failed`, and
gives an asset from an older build its main scene id. The queue runs only the
signed-in account's jobs.

**Auth expiry.** A 401 that survives the client's single refresh parks the job on
`waiting-auth` instead of burning attempts; `_drain` releases held jobs on the
next pump (app start, connectivity, re-auth). Holds are bounded by
`_maxAuthHolds` (8): each hold needs one more `pump()` (app start, connectivity, re-auth), so a session that never comes back reaches `failed` only after eight such pumps. With none, the job stays on `waiting-auth` and the row shows the sign-in prompt. Any
successful call clears the hold budget. The room list surfaces the parked state
as "Paused — sign in to resume", and delete is always available.

**Rule:** Do not bypass the queue with one-off multi-parallel uploads from UI for the main panorama path.

## Stitch ladder

`features/capture/domain/stitcher_service.dart`:

1. **OpenCV device stitch** (optional, timeout 90s) when `preferDevice` is true.
2. **Naive orientation compositing** in an isolate — always produces a 2:1 equirect (visible seams OK).
3. **Cloud stitch** `POST /scenes/{id}/stitch` with frame URLs (202, returns a job) — upload path when naive and network allow; the outcome is read from the job (`awaitStitch`).

Settings domain exposes processing preference (device vs cloud-first).

## Local store

`core/storage/local_store.dart` writes one file per collection as `{"schemaVersion": 1, "items": [...]}`. A plain list from before the header reads as version 0. A file from a newer schema is set aside whole. A corrupt file is renamed `.corrupt-<ts>` (newest 3 kept). One unreadable record moves to the `<collection>_quarantine` collection (newest 50 kept). The asset repository checks `ownerId` on the raw record before it parses, and the models are strict: an unknown status fails closed, a missing `createdAt` is an error.

**Recovery.** Quarantined data has a way back. `recoverQuarantined` (`upload/upload_sweep.dart`) runs at start and after sign-in, ahead of the stuck-upload sweep. A quarantined asset or room that the current parser reads is restored to its collection. A `.corrupt-<ts>` file that this build can now read (for example one a newer app wrote) is merged back by id and deleted. A live record is never overwritten. Data that is still unreadable (a corrupt file, a record with a status this build does not know) stays quarantined. There is no screen that lists it.

**Sign-out.** `purgeAccountCaches` (`core/storage/account_caches.dart`) runs when the auth stream reports no user. It empties the image disk cache (floor plan images) and the in-memory image cache. It does not touch the local store: that holds the user's own captures and unfinished uploads, not a copy of server data, and the app has no call that lists a user's tours from the server, so deleting it would remove the only way back to them. The store is scoped by `ownerId`, the queue runs only the signed-in account's jobs, and reads filter before they parse. The API client has no response cache, so a `Cache-Control: no-store` response is never stored.

## Remote deletes

Tour delete is best-effort. A room delete removes the scene on the server first; a failed delete throws and the room stays (404 counts as gone). The server removes hotspots that pointed at the deleted scene.

## Auth / env

- Missing Supabase dart-defines → dedicated missing-env app, not a silent hang.
- Google iOS client may be null from `/auth/config` — show a clear message.

## Agent validation

When changing queue or stitch:

```sh
cd app && flutter test test/upload_queue_test.dart test/stitcher_test.dart test/orientation_engine_test.dart
```
