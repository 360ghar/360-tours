# tour.json schema reference

Mirrors the API types in `src/types/index.ts` (`Tour`, `Scene`, `Hotspot`, `SceneMetadata`)
so a local `tour.json` ports 1:1 to the backend. Only `image_url` differs: a relative path
locally (`equirectangular_images/foo.webp`) vs. a CDN URL in production.

## Table of contents
- [Top-level tour object](#top-level-tour-object)
- [Scene object](#scene-object)
- [Hotspot object](#hotspot-object)
- [Hotspot content by type](#hotspot-content-by-type)
- [Coordinate math](#coordinate-math)
- [Edge cases](#edge-cases)

## Top-level tour object

```jsonc
{
  "title": "The Aurelia Sky Residence",   // string, required
  "generator": "spatial-ai-v1",            // string, optional provenance tag
  "initial_scene_id": "entrance",          // string, must equal one scene id
  "scenes": [ /* Scene[] */ ]              // required, order doesn't matter (order_index does)
}
```

## Scene object

```jsonc
{
  "id": "living_room",                     // string, stable & unique within the tour
  "title": "Luxury High-Rise Living Room", // string
  "description": "2–4 sentences…",         // string
  "caption": "Sea-view sunken lounge",     // string, ≤8 words (authoring field, viewer ignores)
  "narration_script": "As you step in…",   // string, one spoken paragraph (authoring field)
  "image_url": "equirectangular_images/living_room_panorama.webp",  // relative locally
  "order_index": 1,                        // number, walk order
  "metadata": {
    "initial_view": { "yaw": 0, "pitch": 0, "zoom": 0 }
  },
  "hotspots": [ /* Hotspot[] */ ]
}
```

`caption` and `narration_script` are **not** in the current `Scene` type — they are extra
top-level keys the viewer/backend ignore harmlessly (forward-compatible authoring metadata).
Keep them top-level; do not stuff them into `metadata` (which is typed).

`SceneMetadata` may also carry `camera` (`{fov, min_fov, max_fov}`), `gps`
(`{latitude, longitude}`), and `exif` — omit unless you have real values. Default
`initial_view` is `{yaw:0, pitch:0, zoom:0}` (zoom 0 = wide view).

## Hotspot object

```jsonc
{
  "id": "living_room->kitchen",            // string, convention "<src>-><dst>"
  "type": "navigation",                    // navigation | info | audio | video | link | custom
  "target_scene_id": "kitchen",            // string|null — required for navigation, null otherwise
  "title": "Luxury Open-Plan Kitchen",     // string — for nav, use the target scene's title
  "position": { "yaw": -88, "pitch": -30 },// degrees; pitch < 0 = toward floor
  "order_index": 1,                        // number, optional
  "custom_data": {                         // free-form; used for provenance
    "auto_generated": true,
    "opening_type": "passage"              // passage|door|open_archway|glass_sliding_door
  }
}
```

Optional presentation fields (rarely needed for auto-tours): `icon`, `icon_name`,
`icon_color`, `icon_size`, `description`, `content`, `is_active`. Navigation pucks are styled
by the viewer automatically, so leave them unset.

## Hotspot content by type

For auto-generated property tours you almost always emit `navigation` only. The other types
exist in the schema; their `content` shapes (set `content` to the matching object):

| type | content shape |
|------|---------------|
| `navigation` | no `content`; uses `target_scene_id` |
| `info` | `{ "kind": "info", "text": "…", "image_url"?: "…", "html"?: "…" }` |
| `audio` | `{ "kind": "audio", "audio_url": "https://…/clip.mp3", "autoplay"?: true }` |
| `video` | `{ "kind": "video", "video_url"?: "…", "youtube_id"?: "…", "autoplay"?: false, "poster"?: "…" }` |
| `link` | `{ "kind": "link", "url": "https://…", "target": "_blank" }` |
| `custom` | `{ "kind": "custom", "html": "<div>…</div>" }` |

(Audio narration as actual playback would be an `audio` hotspot with autoplay — out of scope
here since this skill emits narration *text* only.)

## Coordinate math

```
image W×H, equirectangular (W:H == 2:1)

pixel → angle:   yaw = (x / W) * 360 − 180        pitch = 90 − (y / H) * 180
angle → pixel:   x = ((yaw + 180) mod 360)/360 * W    y = (90 − pitch)/180 * H

yaw   ∈ [−180, 180]   0 = image center, + = right, − = left
pitch ∈ [−90, 90]     0 = horizon, + = up, − = down
```

Navigation pucks: `yaw` = doorway center, `pitch` on the floor just inside the opening —
roughly −25..−40 for a normal doorway, as shallow as −15..−22 for one across a large open
room, steeper (−40..−45) for one right beside you. Anything shallower than ≈−10 is drifting
toward the horizon. No offset between stored degrees and viewer radians — `degreesToRadians`
is the only transform (`src/utils/coordinates.ts`).

## Edge cases

- **Scrambled filenames** (00101) — classify from pixels, never the name.
- **Missing entrance pano** — start scene falls back to `living_room`, then most-connected.
- **Two of the same room** (e.g. two bedrooms / two balconies) — keep as distinct scenes
  (`bedroom`, `bedroom_2`); don't merge. Match through-door detail to disambiguate links.
- **AI-generated panoramas** aren't always globally consistent room-to-room; bidirectional
  matching + connectivity repair compensates.
- **Low-resolution source** (~1774×887) → a few-degree yaw error is normal; pucks still land
  in the doorway. Fine-tune borderline ones in the harness with `?calibrate=1`.
