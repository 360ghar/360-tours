# Player & Embed

This document defines the public tour player and embedding experience.

Related docs:
- Viewer requirements: `../technical/360-viewer-implementation.md`
- Hotspots: `hotspots-interactivity.md`
- Floor plans: `floor-plan-integration.md`
- Analytics: `analytics.md`
- Sharing: `social-sharing-analytics.md`

## MVP scope

- Public tour player works on desktop + mobile.
- Scene navigation (including via navigation hotspots).
- Floor plan overlay navigation.
- Fullscreen.
- Simple embed via iframe with URL params.
- Embed `postMessage` API for basic integrations.

## Player behavior (MVP)

- Viewer loads the tour’s initial scene (see `TourSettings` in `../00-conventions.md`).
- Viewer supports hotspots (see `hotspots-interactivity.md`).
- Viewer emits analytics events (see `analytics.md`).

## Embed (MVP)

### Embed code

Embed is delivered as an iframe URL pointing at the embed viewer.

Example:
```html
<iframe
  src="https://app.example.com/embed/tours/{tour_id}?navbar=true&branding=false"
  width="100%"
  height="600"
  style="border:0"
  allow="fullscreen; xr-spatial-tracking"
></iframe>
```

### URL parameters

- `scene`: initial scene id
- `autoplay`: `true|false`
- `navbar`: `true|false`
- `branding`: `true|false`
- `minimal`: `true|false`
- `autohide`: `true|false` (auto-hide overlay controls)
- `fullscreen`: `true|false` (legacy override)
- `vr`: `true|false` (legacy override)
- `rotate`: `true|false` (legacy override; forces auto-rotate)

### postMessage API

Outgoing events:
- `ready`
- `sceneChange` (payload: `scene_id`)
- `hotspotClick` (payload: `hotspot_id`, `type`)
- `fullscreenChange` (payload: `is_fullscreen`)
- `error` (payload: `message`)

Incoming commands:
- `goToScene` (payload: `scene_id`)
- `nextScene`
- `previousScene`
- `toggleFullscreen`

## Post‑MVP scope

- JS SDKs and CMS plugins.
- Advanced embed customizations (theme injection, custom UI modules).

**Document Links**:
- [Hotspots & Interactivity](hotspots-interactivity.md) ← Previous
- [Floor Plan Integration](floor-plan-integration.md) → Next
