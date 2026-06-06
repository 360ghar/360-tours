# Floor Plan Integration

Floor plans provide a 2D navigation overlay for a 360° tour.

Related docs:
- Canonical schema: `../00-conventions.md` (FloorPlan + markers)
- API contract: `../technical/api-specification.md`

## MVP scope

- Upload a floor plan image per floor.
- Place markers and link each marker to a scene.
- Show a floor plan overlay in the viewer.
- Support multiple floors and switching floors.

## Post‑MVP scope

- PDF/SVG parsing and vector editing.
- AI-assisted alignment or auto placement.

## Data model

Use `FloorPlan` and `FloorPlanMarker` from `../00-conventions.md`.

- Marker coordinates are percentages (0–100) relative to the rendered image.

## Upload (MVP)

- Supported image types: `image/jpeg`, `image/png`, `image/webp`.
- Upload via `POST /api/v1/upload/presigned` (use `folder: "floor-plans"`).
- Create a floor plan via `POST /api/v1/tours/{tour_id}/floor-plans`.

## Marker placement (MVP)

- The editor MUST allow click-to-place markers.
- The editor SHOULD allow drag-to-adjust marker position.
- The editor MUST allow selecting a scene for each marker.

Bulk updates use:
- `PUT /api/v1/tours/{tour_id}/floor-plans/{floor_plan_id}/markers`

## Viewer overlay (MVP)

- Overlay can be shown/hidden.
- Current scene’s marker SHOULD be highlighted.
- Clicking a marker switches scenes.

**Document Links**:
- [Player & Embed](player-embed.md) ← Previous
- [VR/WebXR Support](vr-webxr-support.md) → Next
