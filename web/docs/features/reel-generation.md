# Reel Generation

Reel generation turns a tour's panoramas into a short, shareable vertical video — an animated "tiny planet" reel for social media.

Related docs:
- API contract: `../technical/api-specification.md` (see "Generate 360 reel")
- Storage: `../technical/storage-strategy.md` (see "Reel videos")

## What it does

- Renders each selected scene as an animated tiny planet: the camera starts in a normal perspective view and zooms out into a stereographic "planet" while rotating around the scene.
- Stitches the scenes into a crossfade slideshow, with a fade in from / out to black.
- Outputs a vertical 9:16 MP4 (1080×1920) ready for Instagram Reels, YouTube Shorts, and WhatsApp.

## User flow

1. User opens a tour in the editor and chooses **Create 360 Reel** from the AI menu (also available as **Create Reel** on the tour page).
2. User picks the scenes to include (defaults to all scenes in tour order) and adjusts per-scene duration, transition length, and rotation.
3. User starts generation; progress is tracked through the standard AI jobs pipeline (WebSocket with polling fallback).
4. User previews the finished reel in the modal and downloads the MP4.

## v1 scope and limits

- Max 10 scenes per reel; scenes beyond the cap are dropped.
- 2–6 seconds per scene (default 3), crossfade 0–1 seconds (default 0.5).
- Total duration capped at ~60 seconds (`scene_duration × scene_count`).
- Fixed output: 1080×1920 (9:16) at 30fps.
- No music and no watermark/branding overlay in v1.
- The reel lives in the job result only — it is not yet persisted on the tour.

## Technical summary

- Backend AI job `generate_reel`, created via `POST /api/v1/ai/tours/{tour_id}/reel`.
- Per scene, frames use a stereographic projection with the field of view animated from 80° (perspective) to 300° (tiny planet), eased with smoothstep; yaw rotates by `rotation_degrees` starting from the scene's `initial_view.yaw`.
- Frames are computed in Python via remap lookup tables and streamed into a single-pass `ffmpeg` H.264 encode (`libx264`, `yuv420p`, faststart).
- The finished MP4 is uploaded to Cloudinary under `tours/{tour_id}/reels/{job_id}.mp4`; the job result carries `video_url`, `thumbnail_url`, `duration_seconds`, `scene_count`, `width`, and `height`.
- Returns `503` if `ffmpeg` is not available on the server.

## Follow-ups

- Background music track.
- Watermark/branding overlay.
- Persist generated reels on the tour so they can be re-shared without regenerating.

**Document Links**:
- [Features Index](README.md) ← Back
