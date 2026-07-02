#!/usr/bin/env python3
"""Grade a generated tour.json against the spatial-360-tour objective assertions.

Usage:
    python grade_tour.py --tour <path/to/tour.json> --property-dir <seed_properties/...> \
                         --out <run_dir>/grading.json

Emits grading.json in the skill-creator shape: {"expectations": [{text, passed, evidence}]}.
Resolves scene image_url relative to --property-dir so the tour.json can live anywhere.
Exit code is always 0 (grading is reported, not enforced).
"""
import argparse
import collections
import glob
import json
import os

NAV = "navigation"
PITCH_FLOOR_MIN, PITCH_FLOOR_MAX = -45.0, -10.0


def grade(tour, prop_dir):
    res = []

    def add(text, passed, evidence):
        res.append({"text": text, "passed": bool(passed), "evidence": evidence})

    scenes = tour.get("scenes", [])
    ids = [s.get("id") for s in scenes]
    idset = set(ids)

    add("tour.json exists and is valid JSON", True, f"parsed {len(scenes)} scenes")

    init = tour.get("initial_scene_id")
    add("initial_scene_id references an existing scene id", init in idset,
        f"initial_scene_id={init!r}")

    pano_dir = os.path.join(prop_dir, "equirectangular_images")
    panos = [os.path.basename(p) for p in glob.glob(os.path.join(pano_dir, "*"))
             if p.lower().endswith((".webp", ".jpg", ".jpeg", ".png"))]
    add("one scene per panorama in equirectangular_images/", len(scenes) == len(panos),
        f"{len(scenes)} scenes vs {len(panos)} panoramas ({sorted(panos)})")

    missing = []
    for s in scenes:
        rel = s.get("image_url", "")
        cand1 = os.path.join(prop_dir, rel)
        cand2 = os.path.join(pano_dir, os.path.basename(rel))
        if not (os.path.exists(cand1) or os.path.exists(cand2)):
            missing.append(s.get("id"))
    add("every scene's image_url resolves to a file on disk", not missing,
        "all resolve" if not missing else f"missing: {missing}")

    incomplete = []
    for s in scenes:
        for field in ("title", "description", "caption", "narration_script"):
            v = s.get(field)
            if not (isinstance(v, str) and v.strip()):
                incomplete.append(f"{s.get('id')}.{field}")
    add("every scene has non-empty title, description, caption and narration_script",
        not incomplete, "all present" if not incomplete else f"empty: {incomplete[:10]}")

    nav_edges = collections.defaultdict(list)
    dangling, bad_angle, off_floor = [], [], []
    for s in scenes:
        for hs in s.get("hotspots", []):
            pos = hs.get("position", {})
            yaw, pitch = pos.get("yaw"), pos.get("pitch")
            if yaw is None or not (-180 <= yaw <= 180) or pitch is None or not (-90 <= pitch <= 90):
                bad_angle.append(f"{s.get('id')}:{hs.get('id')}=({yaw},{pitch})")
            if hs.get("type") == NAV:
                tgt = hs.get("target_scene_id")
                if tgt not in idset:
                    dangling.append(f"{s.get('id')}->{tgt}")
                else:
                    nav_edges[s.get("id")].append(tgt)
                if pitch is not None and not (PITCH_FLOOR_MIN <= pitch <= PITCH_FLOOR_MAX):
                    off_floor.append(f"{s.get('id')}->{tgt}={pitch}")

    add("every navigation hotspot target_scene_id references an existing scene",
        not dangling, "all resolve" if not dangling else f"dangling: {dangling}")

    dupes = []
    for src, dsts in nav_edges.items():
        seen = collections.Counter(dsts)
        for dst, c in seen.items():
            if c > 1:
                dupes.append(f"{src}->{dst} x{c}")
    add("no duplicate (scene, target) navigation hotspots", not dupes,
        "no dupes" if not dupes else f"dupes: {dupes}")

    add("all yaw in [-180,180] and pitch in [-90,90]", not bad_angle,
        "all in range" if not bad_angle else f"bad: {bad_angle}")

    add("navigation hotspot pitch in floor band [-45,-18]", not off_floor,
        "all in floor band" if not off_floor else f"off-band: {off_floor}")

    one_way = []
    edgeset = {(s, d) for s, ds in nav_edges.items() for d in ds}
    for s, d in edgeset:
        if (d, s) not in edgeset:
            one_way.append(f"{s}->{d}")
    add("all navigation links are bidirectional", not one_way,
        "all reciprocal" if not one_way else f"one-way: {one_way}")

    reachable = set()
    if init in idset:
        adj = collections.defaultdict(set)
        for s, d in edgeset:
            adj[s].add(d)
            adj[d].add(s)
        reachable = {init}
        q = collections.deque([init])
        while q:
            cur = q.popleft()
            for nxt in adj[cur]:
                if nxt not in reachable:
                    reachable.add(nxt)
                    q.append(nxt)
    unreachable = idset - reachable
    add("all scenes reachable from initial_scene_id", init in idset and not unreachable,
        "all reachable" if not unreachable else f"unreachable: {sorted(unreachable)}")

    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tour", required=True)
    ap.add_argument("--property-dir", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    try:
        with open(args.tour) as f:
            tour = json.load(f)
        expectations = grade(tour, os.path.abspath(args.property_dir))
    except FileNotFoundError:
        expectations = [{"text": "tour.json exists and is valid JSON", "passed": False,
                         "evidence": f"not found: {args.tour}"}]
    except json.JSONDecodeError as e:
        expectations = [{"text": "tour.json exists and is valid JSON", "passed": False,
                         "evidence": f"invalid JSON: {e}"}]

    passed = sum(1 for e in expectations if e["passed"])
    total = len(expectations)
    out = {
        "expectations": expectations,
        "summary": {
            "pass_rate": round(passed / total, 4) if total else 0.0,
            "passed": passed,
            "failed": total - passed,
            "total": total,
        },
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2)
    print(f"{args.out}: {passed}/{len(expectations)} passed")
    for e in expectations:
        mark = "PASS" if e["passed"] else "FAIL"
        print(f"  [{mark}] {e['text']}  — {e['evidence']}")


if __name__ == "__main__":
    main()
