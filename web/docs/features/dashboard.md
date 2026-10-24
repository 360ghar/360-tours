# Dashboard

The dashboard provides an overview of the user's tours and platform activity.

Related docs:
- API contract: `../technical/api-specification.md`
- Analytics: `analytics.md`

## MVP scope

- Display summary statistics (total tours, published tours, total views, storage used).
- Show recent tours with quick actions.
- Activity feed (scaffolded, not fully implemented).

## Dashboard stats

`GET /api/v1/dashboard/stats`

Response:
```json
{
  "total_tours": 12,
  "published_tours": 5,
  "total_views": 1234,
  "total_scenes": 48,
  "storage_used": 536870912,
  "storage_limit": 5368709120
}
```

### Stat cards

| Stat | Description |
|------|-------------|
| Total Tours | Count of all non-deleted tours |
| Published Tours | Count of tours with `status=published` |
| Total Views | Sum of `view_count` across all tours |
| Storage Used | Total bytes used / storage limit |

## Recent tours

The dashboard shows a vertical list of recent tours with:

- Tour thumbnail
- Title and status badge
- View count
- Each tour links to its detail page (`/tours/:id`)

## Activity feed

The dashboard has no activity feed: the backend has no tour activity route, and tour collaboration does not exist. The header bell lists the notifications that arrive on the `/ws/user` socket (for example a finished AI job).

**Document Links**:
- [Profile Management](profile-management.md) ← Previous
- [Features Index](README.md) ← Back
