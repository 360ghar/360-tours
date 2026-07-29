# Tour Duplication

Tour duplication allows users to clone an existing tour.

Related docs:
- API contract: `../technical/api-specification.md`

## MVP scope

- Duplicate any tour owned by the current user.
- Creates a full copy including all scenes and hotspots.

## API

`POST /api/v1/tours/{tour_id}/duplicate`

Response (201): new `Tour` object.

## Behavior

- The new tour is created in `draft` status regardless of the source tour's status.
- All scenes are copied with their metadata, order, and image URLs.
- All hotspots are copied with their positions, types, and content.
- Floor plans are copied with their markers.
- The new tour title is prefixed with "Copy of".
- Metrics (views, likes, shares) are reset to zero.
- The new tour gets a new unique ID.

## Use cases

- Create variations of a tour for different audiences.
- Use an existing tour as a template.
- Test changes on a copy without affecting the published version.

**Document Links**:
- [Tour Likes](tour-likes.md) ← Previous
- [Features Index](README.md) ← Back
