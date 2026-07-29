# Hotspots & Interactivity

Hotspots are interactive markers placed on a scene to enable navigation and rich content.

Related docs:
- Canonical hotspot schema: `../00-conventions.md`
- API contract: `../technical/api-specification.md`

## MVP scope

- Create/edit/delete hotspots on a scene.
- Place hotspots by clicking in the viewer and adjust by dragging.
- Custom icon picker with color and size options (see `custom-hotspot-icons.md`).
- Support all 6 hotspot types:
  - `navigation` (scene-to-scene)
  - `info` (text/image/modal)
  - `link` (external URL)
  - `audio` (audio playback)
  - `video` (video playback — direct, YouTube, Vimeo)
  - `custom` (custom HTML or component)
- Track hotspot interactions via analytics.

## Post‑MVP scope

- Hotspot grouping, conditions, and templates.
- Forms/lead capture.
- A/B testing and heatmaps.

## Hotspot types (canonical)

Types and typed `content` are defined in `../00-conventions.md`.

### Navigation

- Requires `target_scene_id`.
- Viewer switches scenes immediately and emits `scene_view`.

### Info

- Displays a modal/panel containing `content.text` and/or `content.image_url`.
- HTML (if supported) MUST be sanitized or sandboxed.

### Link

- Opens `content.url` with `content.target` (`_blank` recommended).
- Backend SHOULD validate URLs:
  - allowed protocols: `https:` (and `http:` only if explicitly allowed)
  - reject `javascript:` and other unsafe schemes

### Audio

- Opens an audio player using `content.audio_url`.
- Options: `autoplay`, `loop`.

### Video

- Opens a video player modal using `content.video_url`, `content.youtube_id`, or `content.vimeo_id`.
- Options: `autoplay`, `muted`, `poster_url`.

### Custom

- Renders custom HTML (`content.html`) or a registered component (`content.component_key`).
- Custom content MUST be sandboxed to prevent XSS.
- Props can be passed via `content.props`.

## Icon customization

Each hotspot supports custom icons (see `custom-hotspot-icons.md`):

- `icon_name` — Predefined icon from the icon set.
- `icon_color` — Hex color code (default: `#ffffff`).
- `icon_size` — Size in pixels, 1-100 (default: 32).

## Placement and coordinates

- Hotspot positions use yaw/pitch degrees (see `../00-conventions.md`).
- Editor MUST support:
  - click-to-place (creates hotspot at cursor)
  - drag-to-adjust position

## API usage (MVP)

- List hotspots: `GET /api/v1/scenes/{scene_id}/hotspots`
- Create hotspot: `POST /api/v1/scenes/{scene_id}/hotspots`
- Update hotspot: `PATCH /api/v1/hotspots/{hotspot_id}`
- Update position: `PUT /api/v1/hotspots/{hotspot_id}/position`
- Delete hotspot: `DELETE /api/v1/hotspots/{hotspot_id}`

## Analytics (MVP)

- Viewer emits `hotspot_click` with `hotspot_id` and `type`.

**Document Links**:
- [Tour Creation](tour-creation.md) ← Previous
- [Player & Embed](player-embed.md) → Next
