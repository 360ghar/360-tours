# Media Library

The media library manages all uploaded files (panoramas, logos, floor plan images, hotspot media).

Related docs:
- Upload API: `../technical/api-specification.md`
- Storage strategy: `../technical/storage-strategy.md`

## MVP scope

- List, view, and delete uploaded media files.
- Track file metadata (size, dimensions, MIME type, processing status).
- Storage usage tracking per user.

## API

### List media files

`GET /api/v1/upload/media?page=1&page_size=20&folder=...&mime_type=...`

Supports filtering by folder and MIME type. Returns paginated `MediaFile` objects.

### Get a media file

`GET /api/v1/upload/media/{media_id}`

### Delete a media file

`DELETE /api/v1/upload/media/{media_id}` → 204

## MediaFile schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `user_id` | string | Owner |
| `purpose` | enum | `tour_scene`, `tour_thumbnail`, `floor_plan`, `hotspot_media`, `branding_logo` |
| `filename` | string | System-generated filename |
| `file_url` | string | Primary storage URL |
| `thumbnail_url` | string | Thumbnail URL (if processed) |
| `file_size` | number | Size in bytes |
| `mime_type` | string | MIME type |
| `width` | number | Image/video width in pixels |
| `height` | number | Image/video height in pixels |
| `duration` | number | Duration in seconds (audio/video) |
| `created_at` | string | ISO 8601 UTC timestamp |

## Storage usage

- Users can view their storage usage via `GET /api/v1/dashboard/stats`.
- Storage usage is calculated by summing `file_size` of all active media files.
- The backend enforces a per-user storage limit.

**Document Links**:
- [Tour Creation](tour-creation.md) ← Related
- [Features Index](README.md) ← Back
