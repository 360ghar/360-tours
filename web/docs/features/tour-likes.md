# Tour Likes

Tour likes allow public viewers to express appreciation for tours.

Related docs:
- API contract: `../technical/api-specification.md`
- Analytics events: `../00-conventions.md`

## MVP scope

- Public viewers can like/unlike a tour.
- Like count is displayed on the tour and tracked in metrics.
- Likes are session-based for anonymous users (no login required).

## API

### Like a tour

`POST /api/v1/public/tours/{tour_id}/like`

Optional header: `x-session-id: <session_id>` for deduplication.

Response: `{ "like_count": 42 }`

### Unlike a tour

`DELETE /api/v1/public/tours/{tour_id}/like`

Optional header: `x-session-id: <session_id>`

Response: `{ "like_count": 41 }`

## Behavior

- Likes are tracked per session ID to prevent duplicate likes.
- The `tour.like_count` metric is updated in real-time.
- A `tour_like` analytics event is emitted when a user likes a tour.

## Data model

Like counts are stored on the `tours` table as `like_count` (denormalized counter). Individual likes are tracked via `analytics_events` with `event_type = 'tour_like'`.

**Document Links**:
- [Tour Duplication](tour-duplication.md) → Next
- [Features Index](README.md) ← Back
