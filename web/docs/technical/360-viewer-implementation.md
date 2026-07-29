# 360° Viewer Implementation (Web)

This document defines the behavior and non-functional requirements for the web-based 360° viewer used in:

- Public tours (share links)
- Embedded tours (iframe)
- The tour editor (authoring mode)

Canonical data shapes are defined in `../00-conventions.md`.

## Core requirements (MVP)

- Render equirectangular panoramas smoothly on desktop and mobile.
- Support scene switching without full-page reload.
- Support interactive hotspots (navigation, info, link, audio/video).
- Support floor plan overlay navigation.
- Support fullscreen.
- Report analytics events.

## Panorama rendering

- Input: a scene provides `image_url` (and optional derivatives).
- Projection: equirectangular sphere mapping.
- Quality selection:
  - prefer modern formats (e.g., WebP) when available
  - allow future multi-resolution tiling (Post‑MVP)

## Controls

### Mouse

- Drag to rotate yaw/pitch.
- Wheel to zoom.

### Touch

- Single-finger drag to rotate.
- Pinch to zoom.

### Keyboard (accessibility)

- Arrow keys rotate.
- `+`/`-` zoom.
- `F` toggles fullscreen.

## Scene navigation

- A tour MUST have a deterministic initial scene:
  - use `tour.settings.initial_scene_id` when set, otherwise first scene by `order_index`.
- Scene changes SHOULD prefetch the next/previous scene image when bandwidth allows.
- While loading a scene, the viewer SHOULD show a lightweight loading state.

## Hotspots

Hotspot types and typed content are defined in `../00-conventions.md`.

### Behavior

- **navigation**: switches to `target_scene_id`.
- **info**: opens a modal/panel.
- **link**: opens `content.url` with `content.target`.
- **audio/video**: opens a media modal/player.

### Placement and coordinates

- Hotspot position uses yaw/pitch in degrees.
- The authoring UI MUST support click-to-place and drag-to-adjust.

### Security

- Any HTML content MUST be sanitized server-side OR rendered in a sandbox.

## Floor plan overlay

- Floor plan images are uploaded media and referenced as `FloorPlan.image_url`.
- Markers use `(x,y)` percentage coordinates (0–100).
- Clicking a marker switches to the corresponding scene.
- If multiple floor plans exist, the overlay must allow floor switching.

## Fullscreen

- Fullscreen should work on desktop and mobile browsers that support it.
- When fullscreen changes, the viewer MUST emit analytics events:
  - `fullscreen_enter` / `fullscreen_exit`.

## Embed viewer

### URL parameters (MVP)

Embed is delivered as an iframe URL that accepts these query params:

- `scene`: initial scene id
- `autoplay`: `true|false`
- `navbar`: `true|false`
- `branding`: `true|false`
- `minimal`: `true|false`
- `autohide`: `true|false` (auto-hide overlay controls)
- `fullscreen`: `true|false` (legacy override)
- `vr`: `true|false` (legacy override)
- `rotate`: `true|false` (legacy override; forces auto-rotate)

### postMessage API (MVP)

The embed MUST communicate with its parent via `window.postMessage`.

Outgoing events:
- `ready`
- `sceneChange` (payload includes `scene_id`)
- `hotspotClick` (payload includes `hotspot_id`, `type`)
- `fullscreenChange` (payload includes `is_fullscreen`)
- `error` (payload includes `message`)

Incoming commands:
- `goToScene` (payload includes `scene_id`)
- `nextScene`
- `previousScene`
- `toggleFullscreen`

## VR support

VR is split into tiers:

- **MVP**: device orientation (gyroscope) and stereo/cardboard mode.
- **Optional**: WebXR immersive sessions for supported browsers/headsets.

The viewer MUST gracefully degrade when a VR capability is unavailable.

## Performance budgets (targets)

- Interaction latency (drag/rotate) should feel immediate.
- Memory usage should not grow unbounded across scene changes.

## Analytics (MVP)

Event naming is defined in `../00-conventions.md`.

- On first paint: emit `tour_view`.
- On scene change: emit `scene_view`.
- On hotspot interaction: emit `hotspot_click`.

**Document Links**:
- [Storage Strategy](storage-strategy.md) ← Previous
- [API Specification](api-specification.md) → Next
