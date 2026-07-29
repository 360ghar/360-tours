---
name: spatial-360-tour
description: >-
  Build a navigable Matterport-style 360° virtual tour from a folder of equirectangular
  panoramas of a property. Analyzes each panorama with vision to classify the room, detect
  doorways/openings, place navigation hotspots at the right yaw/pitch, generate the title,
  description, caption and narration script, and wire the rooms into a connected, bidirectional
  graph written to tour.json — then verifies it with an overlay render and the local viewer.
  Use this whenever the user wants to create, build, generate, author, stitch, or assemble a
  360 tour, virtual tour, panorama tour, property walkthrough, or interactive real-estate
  walkthrough; whenever they have equirectangular / 360 / panorama room images and want them
  connected with hotspots; or whenever they mention placing hotspots, linking rooms, or
  generating tour.json / scene metadata — even if they don't say the word "skill".
---

# Spatial 360° Tour Builder

Turn a folder of equirectangular room panoramas into a Matterport-style virtual tour: a set
of **scenes** (one per panorama) connected by **navigation hotspots** placed on the actual
doorway that leads to each adjacent room, plus per-scene title, description, caption, and
narration. The output is a `tour.json` that the project's viewer renders 1:1.

This skill distills `docs/spatial-tour-sop.md` (the validated SOP for properties 00101 /
00102 / 00173). When that doc is present, treat it as the source of truth and read it for the
full rationale; this skill is the actionable procedure plus bundled tooling.

## Why the order matters

The hard part isn't writing JSON — it's getting each hotspot to land on the *correct
doorway* and making every room reachable. Two ideas drive the whole procedure:

1. **Rooms are identified from pixels, never filenames.** Filenames lie. In property 00101
   `balcony_panorama.webp` is actually the entrance, `kids_bedroom_panorama.webp` is the
   kitchen. Classify every image from what you *see*; keep the filename only as a weak hint.
2. **The graph is built once, centrally, after all images are analyzed.** Per-image analysis
   is independent and parallelizable, but bidirectionality, dedup, and connectivity are
   global properties — you can only get them right when you can see every room's openings at
   once.

## Inputs and outputs

- **Input:** a property folder (e.g. `seed_properties/<id>/`) containing
  `equirectangular_images/*.{webp,jpg,png}`. Equirectangular = a single 2:1 image covering
  the full 360°×180° sphere.
- **Output:** `tour.json` written to that folder, plus `_overlay/*.png` verification renders.
  The format mirrors the API `Scene`/`Hotspot` so it ports straight to the backend; only
  `image_url` differs (relative path locally, CDN URL in production). Full schema:
  `references/tour-schema.md`.

## Coordinate convention (memorize this)

The viewer (`@photo-sphere-viewer` v5) and the API store positions in **degrees**, converted
to radians with **no offset** (`src/utils/coordinates.ts`). For an equirectangular image `W×H`:

```
yaw  0°  = horizontal CENTER of the image;  + = right,  − = left   (range −180..180)
pitch 0° = vertical center (horizon);        + = up,     − = down   (range  −90..90)

pixel → angle:   yaw = (x / W) * 360 − 180        pitch = 90 − (y / H) * 180
angle → pixel:   x = ((yaw + 180) mod 360)/360 * W    y = (90 − pitch)/180 * H
```

**Navigation hotspots are floor-anchored "pucks":** set `yaw` to the horizontal center of the
doorway and `pitch` to the floor just inside the opening. Typical range **−25 to −40** (steeper,
−35 to −45, for a doorway right next to you; shallower for one across the room). A doorway on
the far side of a large open-plan room reads as a shallow **−12 to −20** — that's correct, not
a mistake; don't force it deeper. Only a puck near the horizon (shallower than ≈−10) is wrong.

Note: panoramas aren't always exactly 2:1 (you may see e.g. 1659×948). The math above uses the
image's *actual* `W` and `H`, and the overlay script reads real dimensions — so just use each
file's true pixel size and the angles stay correct.

## Procedure

### Step 1 — Inventory

List the panoramas in `equirectangular_images/`. Note the count — it decides whether to fan
out (Step 2). Read `property.json` if present for a property name to seed the tour title.

### Step 2 — Analyze every panorama (fan out when there are more than ~3)

Each panorama is an independent vision task, so this is where parallelism can pay off. With
many images (say >8), **dispatch one sub-agent per panorama** (the `dispatching-parallel-agents`
pattern) and have each return the JSON below. For a typical home (≤~8 panoramas), analyzing
them yourself in sequence is just as good and often better — the graph synthesis in Step 3
needs every room's openings in one head anyway, so there's no reconciliation tax. Each analysis
reads the image and returns exactly this JSON — nothing else:

```json
{
  "image_file": "living_room_panorama.webp",
  "room_type": "living_room",
  "title": "Sunlit Open-Plan Living Room",
  "description": "Two-to-four sentence description of the space and its standout features.",
  "caption": "One short line (≤8 words) for thumbnails/overlays.",
  "narration_script": "One spoken-style paragraph a guide would say while standing here.",
  "initial_view_yaw": 0,
  "openings": [
    { "opening_type": "passage|door|open_archway|glass_sliding_door",
      "target_guess": "kitchen", "yaw": -88, "pitch": -30,
      "evidence": "fridge + counter visible through the gap" }
  ]
}
```

Give each analysis agent these rules (they are the reason results come back usable):

- **Classify `room_type` from pixels.** One of: `entrance`, `living_room`, `dining_room`,
  `kitchen`, `bedroom`, `master_bedroom`, `bathroom`, `balcony`, `terrace`, `hallway`,
  `study`, `utility`, `other`. The filename is a tie-breaker only.
- **Find every traversable opening** across the full 360°. A doorway (open or closed), an
  archway, an open-plan passage, a glass/sliding door to a balcony all count. For each, give
  the center `yaw`, a floor `pitch` (~−28), and **what room is visible through it** as
  `target_guess` (fridge→kitchen, sofa+TV→living_room, bed→bedroom, toilet/vanity→bathroom,
  railing+sky→balcony). A closed door with no view → `target_guess: null`.
- **Ignore windows and mirrors.** A mirror reflects the *same* room; a real opening shows a
  *different* room continuing. This is the most common false positive.
- **`initial_view_yaw`** faces the room's main feature or most important onward doorway — not
  a blank wall.
- Metadata tone: see "Writing the metadata" below.

### Step 3 — Synthesize the connection graph (do this yourself, with all results in hand)

1. Assign a stable scene `id` per room (`living_room`, `bedroom`, `bedroom_2`, …). Dedup
   `room_type` collisions with a numeric suffix.
2. For each opening, match its `target_guess` to the best detected scene of that type. One
   candidate → match it. Several (e.g. two bedrooms) → use through-door detail and prefer a
   still-unmatched scene; leave it unresolved rather than guess wildly.
3. **Drop openings that have no scene.** You usually get fewer panoramas than rooms — a 3BHK
   may ship 6 panoramas, so you'll *see* doorways to a second bedroom, a utility, an extra
   bath, the front exit. If an opening's target room has no panorama, **do not create a
   hotspot for it** (it would dangle). Note it in your report, but only link rooms you have
   images for. Never invent a scene for a room you can't show.
4. **Always make links reciprocal.** If A links to the kitchen, add the kitchen→A hotspot too,
   placed on the kitchen's opening that shows A. Every navigation edge must go both ways — a
   visitor who can enter a room must be able to leave it the way they came. (The gold tours
   are fully bidirectional; the verifier flags one-way links.)
5. **Dedup:** at most one navigation hotspot per (scene, target). Open-plan layouts are the
   common trap — a great-room can show the *same* living area through two or three archways;
   collapse those to a single puck on the clearest opening.
6. **Connectivity:** every scene must be reachable from the start scene (BFS). If one is
   isolated, link it via its single most-confident opening.

**Two panoramas of one open volume.** Sometimes the entrance and the living room (or living
and dining) are two shots of one continuous open space, so *both* see the same kitchen, the
same bedroom door, the same balcony. Don't link every shared target from both — that spawns
redundant pucks. Instead assign each onward target to the **nearer** of the two panoramas
(bedroom + bath to the foyer side, kitchen + balcony to the lounge side, say), and link the two
panoramas directly to each other. Leaf rooms (bath, balcony) get exactly one inbound link, from
their single most-confident neighbor.

When through-views disagree, **trust the originating scene.** AI-generated or imperfectly
captured panoramas sometimes show the wrong room beyond a door (a door that "should" lead to
the living room renders a bathroom glimpse). When the reciprocal opening's content contradicts
the link you need for connectivity/bidirectionality, place the puck on the most door-like
opening in that scene and keep the link — the originating scene's evidence wins.

Adjacency priors (sanity, not hard rules): a bathroom is almost always a leaf off its
bedroom/passage; a balcony/terrace links back to the room it opens off; kitchen↔dining↔living
are often open-plan with multiple links; an entrance/foyer is a hub.

### Step 4 — Assemble tour.json

- `initial_scene_id`: entrance if present, else living_room, else the most-connected scene.
- `order_index`: a natural walk order (hub → rooms → balcony/bath).
- Each scene carries `title`, `description`, `caption`, `narration_script`,
  `metadata.initial_view` (`{yaw, pitch:0, zoom:0}`), and its `hotspots`.
- Each navigation hotspot: `{ id: "<src>-><dst>", type: "navigation", target_scene_id,
  title: <target's title>, position: {yaw, pitch}, custom_data: {auto_generated: true,
  opening_type} }`.

Copy the exact field shapes from `references/tour-schema.md`. A real generated example to
match is `seed_properties/00173-aurelia-sky-residence/tour.json`.

### Step 5 — Verify and fine-tune (this is not optional — it's how positions get correct)

A first-pass yaw from a squished low-res equirectangular is often a few degrees off. Two
checks catch and fix it:

1. **Overlay (precise, no browser):**
   `python .claude/skills/spatial-360-tour/scripts/overlay_tour_hotspots.py seed_properties/<id>`
   draws every puck on the flat panorama into `<id>/_overlay/` (one PNG per scene, named
   `<scene_id>.png` — not the image filename) and exits non-zero if the graph is broken. Open
   the PNGs and confirm each puck sits *on its doorway*. If a puck is on a wall
   or window, fix that hotspot's `yaw`/`pitch` and re-run. The script also reports schema/graph
   problems (unreachable scenes, dangling targets, one-way links, off-floor pucks).
   If your `tour.json` lives outside the property folder, pass `--tour <path/to/tour.json>`;
   pass `--out <dir>` to write overlays elsewhere (relative paths resolve against your current
   directory — they are *not* placed inside the property folder).
2. **Interactive harness (in this repo):** `npm run dev`, then open
   `http://localhost:3000/local/<folder-name>`. Walk the tour by clicking pucks. Append
   `?calibrate=1` to click anywhere and read the exact yaw/pitch in the console for tuning.

Iterate Step 5 until every puck lands in a doorway and every room is reachable.

## Writing the metadata

Aim for real-estate-listing quality — specific and grounded in what's visible, never generic.

- **title** — a short, appealing room name (`"Sunlit Open-Plan Living Room"`, not
  `"Room 3"`). Lead with the standout quality.
- **description** — 2–4 sentences. Name concrete features you can see (materials, light,
  views, layout) and how the space connects onward. Avoid filler like "nice" and "beautiful".
- **caption** — ≤8 words for a thumbnail/overlay (`"Marble island, sea-view kitchen"`).
- **narration_script** — one spoken paragraph as if a guide stood in the room: orient the
  visitor ("As you step in…"), point out two or three features, and gesture toward the next
  room. This is text only; no audio is synthesized.

`caption` and `narration_script` are top-level scene fields the current viewer/backend ignore
harmlessly — they are authoring metadata, forward-compatible for when narration ships.

## Common failure modes (from real runs)

- **Trusting filenames** → wrong rooms. Always classify from pixels.
- **Mirror mistaken for a doorway** → a phantom hotspot into a room that doesn't connect.
- **Puck at the horizon** (pitch 0) instead of the floor → it floats; floor band is roughly
  −10 to −45 (as shallow as −10..−15 for a far open-plan doorway, steeper for near ones).
- **Linking an opening whose room has no panorama** → a dangling hotspot. Only link rooms you
  have images for; drop the rest.
- **One-way links** → a room you can enter but not leave. Always add the reciprocal hotspot.
- **Skipping Step 5** → positions a few degrees off that never get corrected.
