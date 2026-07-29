# 360 Tours

Capture a room as a guided 360° panorama in under a minute, stitch it on
device, publish it to the 360ghar backend, and share a public link.

> **Agents:** start at the repo root [`AGENTS.md`](../AGENTS.md) (same content as
> `CLAUDE.md`). This README is the human runbook for the Flutter package.

## Stack

- Flutter + Riverpod + go_router, feature-first layout under `lib/features/`.
- Auth: Supabase (email, Google, Apple) — the backend at api.360ghar.com
  verifies the Supabase JWT.
- Tours/scenes/hotspots/uploads/analytics: existing 360ghar backend
  (`/api/v1`), presigned direct-to-Cloudinary uploads.
- Viewing: the 360-viewer web app (`/embed/:id`, `/view/:id`, `/view3d/:id`)
  in a WebView; public share links are `https://api.360ghar.com/v/{code}`.
- Stitching ladder: on-device OpenCV (`opencv_dart` Stitcher) → pure-Dart
  orientation compositing fallback → backend OpenCV re-stitch
  (`POST /scenes/{id}/stitch`) fed by the raw frames.
- Native plugins (in `packages/`):
  - `lidar_scanner` — Apple RoomPlan scan (USDZ + parametric JSON +
    measurements) and RealityKit photogrammetry (iOS 17+).
  - `insta360_capture` — camera discovery over WiFi; SDK call sites are
    marked and documented (the official INSCameraSDK is NDA-gated, see the
    plugin README).

## Run

```sh
flutter run \
  --dart-define=SUPABASE_URL=https://<project>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon-key>
```

Optional overrides: `API_BASE` (default `https://api.360ghar.com/api/v1`),
`API_ROOT`, `VIEWER_BASE` (default `https://360viewer.360ghar.com`).

Camera, motion sensors, LiDAR and photogrammetry need a physical iPhone;
everything else (auth, list, viewer, share, upload queue) works on the
simulator.

## Tests

```sh
flutter analyze && flutter test
```

Covers the orientation math (sensor fusion, wrap-around), target projection,
the naive stitcher output (2:1 equirect), the persistent upload queue
(resume without duplicate tours), local store, models, and the embed-code
generator (kept byte-compatible with 360-viewer's `embedCode.ts`).

## iOS auth setup (one-time)

Google sign-in on iOS needs an iOS OAuth client (none exists yet — the
backend's `/auth/config` returns `google_ios_client_id: null`):

1. Google Cloud console → create an **iOS** OAuth client for bundle id
   `app.agentpilot.tours360`.
2. Set it in the backend config so `/auth/config` serves it.
3. Replace `com.googleusercontent.apps.REPLACE-WITH-IOS-CLIENT-ID` in
   `ios/Runner/Info.plist` with the REVERSED client id.

Until then the Google button fails with a clear message; email and Apple
sign-in work (Apple needs the Sign in with Apple capability enabled for the
bundle id in the developer portal — the entitlement file is already wired).
Deep links (`applinks:api.360ghar.com`) additionally require the AASA file
on the backend to list this app's team+bundle id.
