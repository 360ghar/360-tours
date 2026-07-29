# Video Integration

Video support is delivered through video hotspots.

Related docs:
- Hotspot content schema: `../00-conventions.md` (`VideoContent`)
- Hotspot behavior: `hotspots-interactivity.md`

## MVP scope

- Support video hotspots with these sources:
  - direct video URL (`content.video_url`)
  - YouTube (`content.youtube_id`)
  - Vimeo (`content.vimeo_id`)
- Playback occurs in a modal/player layered over the panorama.

## Post‑MVP scope

- Backend transcoding and adaptive streaming.
- Captions/subtitles.
- Server-generated posters/thumbnails.

## Uploading video assets (MVP)

If direct uploads are supported, they use the presigned upload flow:

1. `POST /api/v1/upload/presigned` with `folder_type: "hotspot_media"` → returns `signed_url` and `public_url`.
2. `PUT signed_url` with file bytes and Supabase headers.
3. Create/update hotspot `content.video_url` to the `public_url`.

## Viewer behavior

- Opening a video hotspot MUST pause/stop auto-rotate (if enabled).
- Closing the video returns the viewer to the same yaw/pitch.

## Analytics

- Viewer emits `hotspot_click` for the hotspot activation.
- Video play/pause analytics are Optional.

**Document Links**:
- [VR/WebXR Support](vr-webxr-support.md) ← Previous
- [Branding & Whitelabel](branding-whitelabel.md) → Next
