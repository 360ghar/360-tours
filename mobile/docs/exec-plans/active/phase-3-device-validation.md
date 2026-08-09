# Phase 3 — Real-Device Validation Harness

This is the living test harness for **Phase 3: real-device validation,
calibration & production hardening**. It is designed to be executed by a human
with one or more physical Android/iOS devices. Every section has exact steps
and PASS/FAIL/BLOCKED criteria, plus the metrics tables the results must be
recorded into.

**Status: DEVICE TEST NOT PERFORMED** — no physical device was connected during
development (2026-08-09; `flutter devices` lists only Windows desktop + web,
`flutter emulators` has none). All host-side validation that can be done
safely (APK build, deterministic tests, threshold-calibration sweep,
production-resolution blend benchmark, policy audit, legacy-compat regression)
is recorded in this document. Fill in the tables below when hardware is
available, then update `docs/QUALITY_SCORE.md` and this doc's status line.

---

## 1. Devices

| Device | Android/iOS version | RAM | Camera (sensors) | Lens used | Actual resolution | Notes |
|---|---|---|---|---|---|---|
| (fill) | | | | | | |

Device discovery commands: `flutter devices`, `flutter emulators`.
On-device inspection for the table: `adb shell getprop ro.product.model`,
`adb shell cat /proc/meminfo | head -1`, Android Settings → About.
Actual capture resolution is logged by the app: `debugPrint` the
`CameraController.value` resolution + the saved JPEG dimensions.

## 2. Test matrix (A–M)

### A — Normal room (bedroom / living room / office)

- Steps: full capture → review → save → local stitch → upload → publish → view.
- Verify: guidance legible; auto-capture fires on dwell; **24 targets
  completed**; no duplicate captures; progress counter reaches 24/24; review
  shows no warnings; viewer renders a continuous room.
- Pass = no black wedges, no visible seams > hand-width, horizon level.

### B — Low-light room (dim bedroom, artificial light only)

- Steps: capture normally; note how many frames are rejected and WHY.
- Verify: brightness gate rejects only obviously black frames; false-rejection
  rate < 20% of frames; metadata blend still produces a usable panorama
  (exposure gains visible); OpenCV rung may fail — must not break the pipeline.
- Record: per-frame brightness/sharpness metrics; gate rejections per target.

### C — Blank / low-texture walls

- Steps: capture a room with large plain walls.
- Verify: local blend succeeds; OpenCV candidate (if it runs) is either
  measurably better or discarded; cloud stitch succeeds or reports a clean
  quality failure — never replaces the scene with garbage.
- Record: which rung won; coverage/seam/overall scores.

### D — Repeated textures (tiles, patterned wallpaper)

- Steps: capture a tiled bathroom or patterned room.
- Verify: no ghosting or doubled edges; seam score stays above ~60; if
  OpenCV wins the ranking, visually confirm no false-matched features.
- Record: seam score; visual ghosting Y/N.

### E — Bright windows / HDR scene

- Steps: capture with a sunlit window in view.
- Verify: exposure lock holds (first frame); exposure compensation doesn't
  blow out the walls; brightness gate doesn't reject normal frames; exposure
  score reported.
- Record: exposure score; whether any frame was rejected for brightness.

### F — Mirrors / reflective surfaces

- Steps: capture a room with a mirror or glass.
- Verify: no phantom people/furniture; reflections look plausible; seam
  score not collapsed by the mirrored region (if it is, record the value —
  mirrors are a known hard case).
- Record: seam score; visual artifacts Y/N.

### G — Phone roll (0°, ~10°, ~15°)

- Steps: three captures of the same room with the phone held at each roll.
- Verify: panoramas remain geometrically aligned (vertical edges stay
  vertical in the viewer); no twist at the poles; roll correction is visible
  in the metrics (seam score comparable across the three).
- Record: seam scores per roll.

### H — User movement

- Steps: capture once rotating normally; once translating slowly sideways;
  once stepping forward/backward mid-capture.
- Verify: the "Keep the phone in the same spot" banner appears during
  movement and clears; movement never blocks capture; a moved capture still
  completes (lower seam score is expected — record it).
- Record: banner behavior; seam scores.

### I — Kill / resume (+ lock + background)

- Steps: capture 5 targets → force-close the app → relaunch → Resume →
  complete. Also: background the app mid-capture → return; lock/unlock.
- Verify: Resume dialog offers the right count; frame files are valid;
  capture continues at the correct target; no duplicates after resume;
  completing saves normally.
- Record: resume count, any file-corruption events.

### J — Network loss during upload

- Steps: save a scan → disable Wi-Fi/network mid-upload → restore.
- Verify: queue retries with backoff; no duplicate tours/scenes/panoramas;
  asset reaches `ready`; job state consistent (`upload_queue` JSON readable
  via the app's local store).
- Record: retry behavior, final asset status.

### K — Cloud stitch failure (forced)

- Steps: after upload, simulate a failure (airplane mode during polling, or a
  backend job that fails validation via a low-coverage capture with skips).
- Verify: local panorama remains viewable; asset is `ready` with the
  refinement-failed banner; Retry refinement re-requests WITHOUT re-uploading
  frames (watch network); Use current panorama clears the banner; a
  successful retry replaces the scene only after validation.
- Record: frame-upload count on retry (must be 0 new uploads).

### L — Multi-room (3 rooms)

- Steps: capture room 1, room 2, room 3 as rooms of one asset; publish.
- Verify: room ordering; scene switching in the viewer; hotspot navigation;
  share link opens the tour.
- Record: room count, scene order, link behavior.

### M — Full end-to-end (most important)

- Steps: capture → review → local stitch → upload → cloud refinement →
  quality gate → publish → share → viewer, uninterrupted.
- Verify: every stage completes; the viewer shows the refined panorama when
  the cloud job completes; the whole flow works offline-first (local pano is
  immediately viewable).
- Record: every metric below.

## 3. Per-panorama metrics form

For every representative capture, record:

| Metric | Value |
|---|---|
| Device | |
| Room / scenario | |
| Frame count | |
| Low-quality frames | |
| Capture duration (s) | |
| Local stitch duration (s) | |
| Local stitch peak memory (if measurable) | |
| Panorama dimensions | |
| Coverage % | |
| Horizontal coverage % | |
| Vertical coverage % | |
| Seam score | |
| Exposure score | |
| Sharpness score | |
| Overall score | |
| Winner: OpenCV / blend | |
| Final panorama size (bytes) | |
| Cloud stitch duration (s) | |
| Cloud quality report (from job result) | |
| Warnings | |

Metrics are produced by the app's stitch path (StitchResult.metrics and the
cloud job `result.quality`). Grab them from `flutter logs` (debug build) —
`debugPrint` lines carry them, or read the local store JSON on the device.

## 4. Threshold calibration procedure

For each threshold below: capture 5–10 frames per class, record the measured
value, then classify (correct/false rejection or acceptance). Only change a
threshold when the table shows systematic misclassification — prefer the
conservative direction (accept more, never trap the user).

| Threshold | Current | Samples measured (min/max/mean) | Misclassifications | Verdict (keep/change) |
|---|---|---|---|---|
| Sharpness (var-of-Laplacian ≥ 30) | ~~60~~ → **30** | Room-like sweep: sharp 331 / mild blur 52 / moderate 9 / heavy 1 | Mild blur falsely rejected at 60 | **CHANGED to 30** (2026-08-09, host-side evidence; on-device re-check pending) |
| Dark (mean luma < 0.05) | 0.05 | Sweep: 0.010–0.029 reject, 0.056 accept | None on synthetic | keep |
| Bright (mean luma > 0.97) | 0.97 | Sweep: 0.51–0.56 accept at 0.9–0.99 scale | None on synthetic | keep |
| Duplicate angle (±5°) | 5° | (needs device) | | |
| Seam (disagreement < 12% luma) | 0.12 | (needs device) | | |
| Exposure (correction cost < 30%) | 0.30 | (needs device) | | |
| Cloud coverage gate (≥ 60%) | 60% | (needs device) | | |
| Cloud overall gate (≥ 40) | 40 | (needs device) | | |

## 5. Host-side validation log (2026-08-09, no device)

- Android debug APK **built and verified**: `app-debug.apk` (291 MB debug),
  contains opencv_dart natives for arm64-v8a / armeabi-v7a / x86_64; manifest
  has CAMERA + INTERNET permissions.
- Deterministic suites green: Flutter 119/119 (+1 perf test skipped by
  default), backend 32/32 stitch unit tests, ruff clean, analyze clean.
- **Threshold change (evidence-based): sharpness `kMinSharpness` 60 → 30.**
  Evidence: photo-like room fixture sweep (`frame_quality_test.dart`
  calibration group) — sharp room = 331.4 variance (11× margin), MILD
  hand-shake blur (radius 1 @256px) = 51.6 (was falsely rejected at 60),
  moderate blur (radius 2) = 9.4 (still 3× below 30), heavy blur ≈ 1.
  Conservative direction (accept more); hysteresis remains the safety net.
  Regression test asserts sharp > 3× threshold, mild blur accepted, heavy
  blur rejected — any future threshold regression fails CI.
- Exposure thresholds unchanged: sweep over photo-like content shows
  mean-luma 0.05 boundary is consistent (scale 0.04 → reject, 0.10 →
  accept); a dark-but-textured room (mean 0.078) is accepted.
- **Blend performance (test VM, JIT, Windows; AOT devices typically 2-4×
  faster):** 16 frames 3.7s, 20 frames 4.0s, 24 frames 5.0s (~200ms/frame)
  at production 2048×1024 with 1080×1920 input frames
  (`flutter test --dart-define=PERF=true test/stitcher_perf_test.dart`).
  Well under the 15-20s concern threshold → **no optimization performed**
  (Step 5: only optimize where profiling shows a real bottleneck). Peak
  blend memory ~81MB by construction (33.5MB float accumulators + 8.4MB
  canvas + ~39MB 640px working frames) — to be verified on-device.
- Step 10 policy audit: candidate selection extracted to the pure
  `openCvWins()` function; regression tests prove a worse candidate
  (coverage OR sharpness) can never replace the blend, and the OpenCV
  temp file is never left behind. Cloud-side invariant (scene replaced only
  on validated success) already covered by backend tests.
- Step 11 legacy compatibility: regression test added — pre-Phase-2
  ScanAsset JSON loads with safe defaults (null metadata,
  `cloudStitchFailed: false`).
- Step 8/9 UX: rejection messages reviewed (already human-language); the
  too-bright message now suggests pointing away from the window; the review
  screen shows a positive "All N angles captured" state when nothing is
  missing/low-quality, keeping technical metrics internal.
- No other threshold changes — no real-world evidence exists to justify
  them (Step 4: evidence-only, conservative changes).

## 6. Failures / fixes / regression tests

| Symptom | Root cause | File | Fix | Regression test |
|---|---|---|---|---|
| (fill during device testing) | | | | |

## 7. Remaining limitations (as of 2026-08-09)

- FOV fallback (55°×69°) unverified against real sensors (plugin exposes no
  FOV; see Phase 2 report).
- Quality thresholds calibrated on synthetic/photo-like fixtures only —
  on-device re-calibration per section 4 is the first device task.
- Blend performance measured in the test VM only (JIT); AOT devices are
  expected 2-4× faster but unmeasured; ~81MB peak blend memory unverified
  on-device.
- Cloud endpoint tests require Postgres — not executable on this machine
  (CI covers them).
- No on-device evidence for: camera startup/latency, sensor behavior,
  veryHigh actual resolution (harness log `[capture]` line added), movement
  warning feel, battery/thermal, mirrors/HDR/repeated-texture behavior.
