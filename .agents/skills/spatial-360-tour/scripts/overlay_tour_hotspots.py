#!/usr/bin/env python3
"""Verify a spatial 360 tour: draw each hotspot on its flat panorama and check the graph.

Usage:
    python overlay_tour_hotspots.py <property_dir> [--out _overlay]

<property_dir> must contain equirectangular_images/ (and tour.json, unless --tour is given).
By default it writes overlays to <property_dir>/_overlay/<scene_id>.png; pass --out to write
elsewhere (--out is resolved relative to your current directory, or use an absolute path). Each
hotspot is drawn at its angle->pixel position so
you can confirm pucks land on real doorways. It also prints a graph report: dangling targets,
missing reciprocal (one-way) links, unreachable scenes, out-of-range angles, and duplicate
hotspots. Exit code is non-zero if any hard error (dangling target / unreachable scene /
out-of-range angle / duplicate) is found, so it doubles as a CI/grader check.

Only dependency: Pillow (`pip install Pillow`).

Coordinate convention (see SKILL.md / docs/spatial-tour-sop.md):
    x = ((yaw + 180) mod 360) / 360 * W      y = (90 - pitch) / 180 * H
    yaw in [-180,180] (0=center,+right), pitch in [-90,90] (0=horizon,+up)
"""
import argparse
import collections
import json
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

NAV = "navigation"
# Floor band for nav pucks. Wide end (-45) for near doorways, shallow end (-10) for a far
# doorway across a large open-plan room (its floor recedes toward the horizon). A puck
# shallower than -10 is drifting onto the horizon and almost certainly mis-placed.
NAV_PITCH_MIN, NAV_PITCH_MAX = -45.0, -10.0


def angle_to_pixel(yaw, pitch, w, h):
    x = ((yaw + 180.0) % 360.0) / 360.0 * w
    y = (90.0 - pitch) / 180.0 * h
    return x, y


def load_tour(prop_dir, tour_path=None):
    path = tour_path or os.path.join(prop_dir, "tour.json")
    with open(path) as f:
        return json.load(f)


def draw_overlays(prop_dir, tour, out_dir):
    img_root = os.path.join(prop_dir, "equirectangular_images")
    os.makedirs(out_dir, exist_ok=True)
    try:
        font = ImageFont.truetype("Arial.ttf", 22)
    except OSError:
        font = ImageFont.load_default()

    written = []
    for scene in tour.get("scenes", []):
        rel = scene.get("image_url", "")
        # image_url may be "equirectangular_images/x.webp" or just "x.webp"
        cand = os.path.join(prop_dir, rel)
        if not os.path.exists(cand):
            cand = os.path.join(img_root, os.path.basename(rel))
        if not os.path.exists(cand):
            print(f"  ! scene {scene['id']}: image not found ({rel})")
            continue
        im = Image.open(cand).convert("RGB")
        w, h = im.size
        d = ImageDraw.Draw(im, "RGBA")
        for hs in scene.get("hotspots", []):
            pos = hs.get("position", {})
            yaw, pitch = float(pos.get("yaw", 0)), float(pos.get("pitch", 0))
            x, y = angle_to_pixel(yaw, pitch, w, h)
            r = max(14, w // 90)
            color = (255, 122, 0, 255) if hs.get("type") == NAV else (40, 170, 90, 255)
            d.ellipse([x - r, y - r, x + r, y + r], fill=color, outline=(255, 255, 255, 255), width=3)
            label = hs.get("title") or hs.get("target_scene_id") or hs.get("type", "")
            d.text((x + r + 4, y - 12), f"{label} ({yaw:.0f},{pitch:.0f})",
                   fill=(255, 255, 255, 255), font=font,
                   stroke_width=3, stroke_fill=(0, 0, 0, 230))
        out_path = os.path.join(out_dir, f"{scene['id']}.png")
        im.save(out_path)
        written.append(out_path)
    return written


def check_graph(tour):
    """Return (errors, warnings)."""
    errors, warnings = [], []
    scenes = tour.get("scenes", [])
    ids = [s["id"] for s in scenes]
    idset = set(ids)
    if len(ids) != len(idset):
        dupes = [i for i, c in collections.Counter(ids).items() if c > 1]
        errors.append(f"duplicate scene ids: {dupes}")

    init = tour.get("initial_scene_id")
    if init not in idset:
        errors.append(f"initial_scene_id '{init}' is not a scene id")

    nav_edges = collections.defaultdict(set)  # src -> {dst}
    for s in scenes:
        seen = set()
        for hs in s.get("hotspots", []):
            pos = hs.get("position", {})
            yaw, pitch = pos.get("yaw"), pos.get("pitch")
            if yaw is None or not (-180 <= yaw <= 180):
                errors.append(f"{s['id']}: yaw out of range ({yaw})")
            if pitch is None or not (-90 <= pitch <= 90):
                errors.append(f"{s['id']}: pitch out of range ({pitch})")
            if hs.get("type") == NAV:
                tgt = hs.get("target_scene_id")
                if tgt not in idset:
                    errors.append(f"{s['id']}: nav hotspot targets missing scene '{tgt}'")
                    continue
                if tgt in seen:
                    errors.append(f"{s['id']}: duplicate nav hotspot to '{tgt}'")
                seen.add(tgt)
                nav_edges[s["id"]].add(tgt)
                if pitch is not None and not (NAV_PITCH_MIN <= pitch <= NAV_PITCH_MAX):
                    warnings.append(
                        f"{s['id']}->{tgt}: nav pitch {pitch} outside floor band "
                        f"[{NAV_PITCH_MIN},{NAV_PITCH_MAX}] (puck may float)")

    # reciprocity
    for src, dsts in nav_edges.items():
        for dst in dsts:
            if src not in nav_edges.get(dst, set()):
                warnings.append(f"one-way link {src}->{dst} (no {dst}->{src})")

    # reachability (BFS from initial scene, undirected on nav edges so we flag islands)
    if init in idset:
        adj = collections.defaultdict(set)
        for src, dsts in nav_edges.items():
            for dst in dsts:
                adj[src].add(dst)
                adj[dst].add(src)
        seen = {init}
        q = collections.deque([init])
        while q:
            cur = q.popleft()
            for nxt in adj[cur]:
                if nxt not in seen:
                    seen.add(nxt)
                    q.append(nxt)
        unreachable = idset - seen
        if unreachable:
            errors.append(f"scenes unreachable from '{init}': {sorted(unreachable)}")
    return errors, warnings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("property_dir")
    ap.add_argument("--out", default=None,
                    help="overlay output dir (default <property_dir>/_overlay; "
                         "relative paths resolve against cwd, not the property dir)")
    ap.add_argument("--tour", default=None,
                    help="path to tour.json (defaults to <property_dir>/tour.json)")
    args = ap.parse_args()

    prop_dir = os.path.abspath(args.property_dir)
    # --out is resolved relative to cwd (or absolute) when given; only the implicit default
    # lives inside the property dir. Avoids leaking overlays into the property folder.
    out_dir = os.path.abspath(args.out) if args.out else os.path.join(prop_dir, "_overlay")
    tour = load_tour(prop_dir, args.tour)

    print(f"Tour: {tour.get('title')!r}  scenes={len(tour.get('scenes', []))}")
    written = draw_overlays(prop_dir, tour, out_dir)
    print(f"Wrote {len(written)} overlay(s) to {out_dir}/")

    errors, warnings = check_graph(tour)
    for w in warnings:
        print(f"  WARN  {w}")
    for e in errors:
        print(f"  ERROR {e}")
    if errors:
        print(f"\nFAILED: {len(errors)} error(s), {len(warnings)} warning(s)")
        sys.exit(1)
    print(f"\nOK: 0 errors, {len(warnings)} warning(s)")


if __name__ == "__main__":
    main()
