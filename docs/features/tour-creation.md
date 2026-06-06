# Tour Creation

Tour creation is the authoring workflow for building a tour from uploaded panoramas.

Related docs:
- Conventions and schemas: `../00-conventions.md`
- API contract: `../technical/api-specification.md`

## MVP scope

- Create a tour (`draft` status).
- Upload panorama images and create scenes (single or bulk).
- Reorder scenes via drag-and-drop.
- Configure tour settings (initial scene, auto-rotate, viewer options, branding).
- Publish/unpublish.
- Duplicate an existing tour.
- Generate a share link, embed code, and QR code (see `player-embed.md`, `social-sharing-analytics.md`).
- AI auto-ordering or auto-grouping of scenes (opt-in, see `../ai-features/`).

## Post-MVP scope

- Offline export packages.
- Templates and multi-version history.

## User flow (MVP)

1. User clicks **Create Tour**.
2. User enters title/visibility and creates the tour.
3. User uploads panoramas (single or bulk) and creates scenes.
4. User reorders scenes and sets the initial scene.
5. User configures tour settings (auto-rotate, navbar, branding, VR).
6. User previews the tour.
7. User publishes and shares/embeds.

## Upload and scene creation

### Supported inputs (MVP)

- Equirectangular 2:1 panoramas.
- MIME types: `image/jpeg`, `image/png`, `image/webp`.

### Validation (MVP)

- Reject files that exceed backend-configured size limits.
- Reject files with invalid MIME types.
- Warn (not hard fail) if the aspect ratio is not close to 2:1.

### Upload flow (MVP)

Upload uses a **2-step presigned flow**:

1. **Presign**: `POST /api/v1/upload/presigned` with file metadata → returns `signed_url` and `public_url`.
2. **Upload**: `PUT signed_url` with file bytes and Supabase headers (`apikey`, `Authorization`, `Content-Type`).

After upload, create the scene:

3. **Create scene**: `POST /api/v1/tours/{tour_id}/scenes` with `image_url` set to the `public_url` from step 1.

### Bulk upload

The editor supports bulk panorama upload via the BulkUploader component:

- Drag-and-drop or file picker for multiple images.
- Per-file progress tracking.
- Automatic scene creation after each successful upload.
- Error handling with per-file retry.

## Scene ordering (MVP)

- Scenes have an `order_index`.
- The editor MUST support drag-and-drop ordering (implemented with `@dnd-kit`).
- Backend MUST support a reorder endpoint: `POST /api/v1/tours/{tour_id}/scenes/reorder`.

## Tour settings (MVP)

### Status vs visibility

- `status`: `draft | published | archived`
- `visibility`: `private | unlisted | public`

### Settings fields

See `TourSettings` in `../00-conventions.md`. Key settings exposed in the editor:

| Setting | Type | Description |
|---------|------|-------------|
| `auto_rotate` | boolean | Enable automatic rotation |
| `auto_rotate_speed` | number | Rotation speed multiplier |
| `show_navbar` | boolean | Show scene navigation bar |
| `enable_fullscreen` | boolean | Allow fullscreen mode |
| `enable_vr` | boolean | Enable VR/stereo mode |
| `enable_gyroscope` | boolean | Enable device orientation |
| `gyroscope_auto_start` | boolean | Auto-start gyroscope on mobile |
| `initial_scene_id` | string | First scene to display |
| `initial_view` | object | Default camera yaw/pitch/zoom |
| `branding` | object | See `branding-whitelabel.md` |

## Tour duplication

Users can duplicate an existing tour:

- `POST /api/v1/tours/{tour_id}/duplicate`
- Creates a full copy of the tour, all scenes, and all hotspots.
- The new tour starts in `draft` status with a title like "Copy of {original}".

## Preview (MVP)

- Editor must provide an in-app preview that uses the same viewer behavior as public viewing.

## Publish/unpublish (MVP)

- Publish: `POST /api/v1/tours/{tour_id}/publish`.
- Unpublish: `POST /api/v1/tours/{tour_id}/unpublish`.

## Analytics (MVP)

Viewer emits:
- `tour_view`
- `scene_view`

**Document Links**:
- [Features Index](README.md) ← Back
- [Hotspots & Interactivity](hotspots-interactivity.md) → Next
