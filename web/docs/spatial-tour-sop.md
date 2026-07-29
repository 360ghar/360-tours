# Spatial 360 Tour SOP (panorama-only)

How to turn a folder of equirectangular room panoramas into a Matterport-style
virtual tour — a set of **scenes** connected by **navigation hotspots** placed on
the actual doorway/opening that leads to each adjacent room.

This document is both (a) the manual procedure and (b) the spec the automated
Gemini pipeline implements (`backend/app/services/tour_ai/spatial.py`). It was
derived by manually building and verifying tours for properties `00101` and
`00102` (see `360-viewer/seed_properties/<id>/tour.json`).

---

## 0. Coordinate convention (verified)

The viewer (`@photo-sphere-viewer` v5) and our API store hotspot positions in
**degrees**; the conversion is a plain degrees↔radians with **no offset**
(`360-viewer/src/utils/coordinates.ts`). For an equirectangular image `W×H`:

```
yaw  0°  = horizontal CENTER of the image;  + = right,  - = left   (range -180..180)
pitch 0° = vertical center (horizon);        + = up,     - = down   (range  -90..90)

pixel -> angle:   yaw = (x / W) * 360 - 180        pitch = 90 - (y / H) * 180
angle -> pixel:   x   = ((yaw + 180) mod 360)/360 * W    y = (90 - pitch)/180 * H
```

**Navigation hotspots are floor-anchored "pucks":** put `yaw` at the horizontal
center of the doorway and `pitch ≈ -25 to -32` (the floor just inside the opening).
Verified correct against real doorways via `backend/tools/overlay_tour_hotspots.py`.

---

## 1. Identify each room from PIXELS, not the filename

**Filenames are unreliable.** In `00101` they were scrambled:
`balcony_panorama.webp` is actually the entrance foyer, `kids_bedroom_panorama.webp`
is the kitchen, `kitchen_panorama.webp` is the balcony. In `00102` they happened to
match. So: **always classify the room from image content** (one of: entrance,
living_room, dining_room, kitchen, bedroom/master_bedroom, bathroom, balcony,
terrace, hallway, study, utility, other). Keep the filename only as a weak hint /
tie-breaker.

## 2. Detect openings in each panorama

Scan the full 360° for **traversable openings** and record each one's center
pixel → `yaw`, plus a floor `pitch` (~-28):

- **Door** (open or closed, with frame) — counts even if closed (infer target from layout).
- **Archway / open passage** (open-plan living↔dining↔kitchen).
- **Glass sliding door / French window → balcony or terrace.**
- Ignore **windows** that aren't walk-through, and **mirrors** (they look like
  openings — a mirror shows the SAME room reflected; a real opening shows a
  DIFFERENT room/floor continuing).

For each opening also note **what room is visible through it** (the target guess):
e.g. "fridge + counter → kitchen", "sofa + TV → living_room", "bed → bedroom",
"toilet/vanity → bathroom", "railing + sky → balcony". Closed door → target unknown.

## 3. Build the room-connection graph (panorama-only matching)

1. Start from every (source_room, opening, target_guess).
2. Match each `target_guess` to the best **detected scene** of that room type.
   - If exactly one scene of that type exists → match it.
   - If several (e.g. two bedrooms) → use through-door detail + remaining-unmatched
     preference; leave unresolved rather than guess wildly.
   - Closed door with no guess → match to a room implied by the layout that is
     otherwise unconnected (so every scene stays reachable).
3. **Enforce bidirectionality:** if A links to kitchen, the kitchen scene should
   link back toward A. Add the reciprocal hotspot at the kitchen's opening that
   shows A. One-way shortcuts are tolerable only if the target is reachable some
   other way.
4. **Dedupe:** at most one navigation hotspot per (scene, target). If two openings
   reach the same room, keep the nearer/clearer one.
5. **Connectivity:** every scene must be reachable from the start scene. If a scene
   is isolated, add a link via its single most-confident opening.

### Room-type adjacency priors (sanity, not hard rules)
- **bathroom** is almost always a leaf: one door, back to its bedroom or a passage.
- **balcony / terrace**: one glass-door link back to the room it opens off (living
  or bedroom).
- **kitchen ↔ dining ↔ living** are frequently open-plan (archways, multiple links).
- **entrance/foyer** is a hub: links to living, kitchen/dining, and the bedroom passage.

## 4. Ordering & initial view

- **order_index / start scene:** entrance first if present, else living_room, else
  the most-connected scene. Then a natural walk order (hub → rooms → balcony/baths).
- **`metadata.initial_view.yaw`** per scene: face the room's main feature or the
  most important onward doorway (not a blank wall). `pitch 0`, `zoom 0`.

## 5. Output shape

Write `seed_properties/<id>/tour.json` (mirrors the API `Scene`/`Hotspot` so it ports
1:1 to the backend; only `image_url` differs — relative path locally, Cloudinary
URL in production):

```json
{ "title": "...", "initial_scene_id": "entrance",
  "scenes": [ { "id": "living_room", "title": "Living Room",
    "image_url": "equirectangular_images/living_room_panorama.webp",
    "order_index": 1, "metadata": { "initial_view": {"yaw":0,"pitch":0,"zoom":0} },
    "hotspots": [ { "id":"living_room->kitchen", "type":"navigation",
      "target_scene_id":"kitchen", "title":"Kitchen",
      "position": {"yaw":-88,"pitch":-28} } ] } ] }
```

## 6. Verify (two ways)

1. **Flat-projection overlay** (precise, no WebGL needed):
   `python backend/tools/overlay_tour_hotspots.py <property_dir>` — draws each
   hotspot on the flat panorama; confirm each puck sits on its doorway.
2. **Interactive harness:** open `http://localhost:3000/local/<folder-name>` (dev
   server). The panorama renders, orange floor pucks appear on the doorways, and
   clicking a puck walks you to the next room. Append `?calibrate=1` to click
   anywhere and read the yaw/pitch for fine-tuning.

### Viewer bugs fixed to make this work (PanoramaViewer.tsx / main.tsx)

The harness exposed three real, latent viewer bugs (they also affected production
in subtle ways):
- **Double panorama load**: the `Viewer` constructor loads the panorama and the
  scene-change effect immediately called `setPanorama` for the same URL, racing the
  load. Fixed by tracking `loadedPanoramaUrlRef` and skipping the redundant load.
- **Markers added before `ready` are discarded**: Photo Sphere Viewer drops markers
  added before the panorama texture finishes. The markers effect ran on mount
  (pre-ready), so pucks silently vanished unless the parent happened to re-render.
  Fixed with an `isViewerReady` state that gates/re-applies markers after each load.
- **React StrictMode**: its dev-only mount→cleanup→mount double-invoke destroyed the
  first viewer mid-load and the second hung forever on the loader. StrictMode was
  removed (dev-only; production output is identical).

## 7. Known edge cases observed

- Scrambled filenames (00101) → never trust them.
- Missing entrance pano (00101 had none in the file set; the foyer was mislabeled
  "balcony"). Start scene falls back to living_room.
- Utility balcony (off kitchen) vs main park-facing balcony — different scenes;
  don't merge.
- AI-generated panoramas may not be perfectly globally consistent room-to-room;
  bidirectional matching + connectivity repair compensates.
- Low-resolution source (≈1774×887) makes a few-degree yaw error normal; pucks
  still land in the doorway. Fine-tune borderline ones in the harness.
