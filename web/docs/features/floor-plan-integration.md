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
- Aligning an uploaded plan to the tour's rooms (matching drawn rooms to scenes).

## Generate from the tour (shipped 2026-10)

A tour can get a plan without any upload: `POST /api/v1/tours/{tour_id}/floor-plans/generate`
builds one from what the tour already knows.

- The server places each scene on a grid from the tour's navigation hotspots, draws walls with
  doorway openings, renders a PNG (Pillow) with an "AI estimated layout · schematic, not to
  scale" footer, uploads it and writes the markers in image percentages.
- It creates the row `Estimated layout (AI)`, or replaces that row's image and markers when it
  already exists. A user-uploaded plan is never modified.
- At least two scenes are required; without them the API answers 400 with the reason.
- Clients: the web editor's Floor Plan dialog ("Generate from tour", with a confirmation when
  unsaved edits would be lost), the AI wizard review step ("Sketch plan", after the tour exists),
  and the mobile floor-plan screen (app-bar action + empty state), which draws the markers as
  numbered pins with a legend.
- The result is an estimate for orientation, not a measurement: it is always presented as
  schematic, and it stays fully editable like an uploaded plan.

## Data model

Use `FloorPlan` and `FloorPlanMarker` from `../00-conventions.md`.

- Marker coordinates are percentages (0–100) relative to the rendered image.

## Upload (MVP)

- Supported image types: `image/jpeg`, `image/png`, `image/webp`.
- Upload via `POST /api/v1/upload` (`folder_type: generic`).
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
