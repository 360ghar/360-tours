# Plan: Generate 360° Virtual Tours for All Properties Missing tour.json

## Context

There are 109 properties in `seed_properties/`, 56 already have `tour.json` files. **53 properties** need tours generated. Each has 5-8 equirectangular `.webp` panoramas in `equirectangular_images/` and a `property.json` with listing metadata.

## Properties Needing Tours (53 total)

```
00157, 00158, 00159, 00160, 00161, 00162, 00163, 00164, 00165, 00166,
00167, 00168, 00169, 00170, 00171, 00172, 00174, 00175, 00176, 00177,
00178, 00179, 00180, 00181, 00182, 00183, 00184, 00185, 00186, 00187,
00188, 00189, 00190, 00191, 00192, 00193, 00194, 00195, 00196, 00197,
00198, 00199, 00200, 00201, 00202, 00203, 00204, 00205, 00206, 00207,
00208, 00209, 00210
```

**Special case:** 00164 has only 1 panorama (minimal tour, single scene, no navigation hotspots).

## Orchestration Strategy

### Phase 1: Batch Dispatch (waves of ~8 parallel agents)

Each sub-agent gets ONE property and must:

1. **Inventory** — list panoramas in `equirectangular_images/`, read `property.json`
2. **Analyze each panorama** — classify room type from pixels, identify all traversable openings with yaw/pitch, generate title/description/caption/narration
3. **Synthesize connection graph** — assign scene IDs, match openings to scenes, ensure bidirectional links, ensure connectivity from initial scene
4. **Assemble tour.json** — write to the property folder following the schema from `references/tour-schema.md`
5. **Verify** — run `python .claude/skills/spatial-360-tour/scripts/overlay_tour_hotspots.py <property_dir>` and fix any errors (dangling targets, one-way links, unreachable scenes, out-of-range angles)
6. **Return report** — scene count, hotspot count, graph status (errors/warnings), any issues found

### Phase 2: Orchestrator Review

After each wave completes:
- Check each agent's report for success/failure
- For failures: diagnose the issue, dispatch a follow-up agent with specific corrections
- For successes with warnings: dispatch a targeted fix agent
- Continue until all 53 properties pass verification with 0 errors

### Phase 3: Final Validation

Run the overlay script on all 53 new tours to confirm they all pass graph checks.

## Agent Task Template

Each sub-agent receives:
- The `spatial-360-tour` skill instructions (from SKILL.md)
- The tour-schema reference
- The specific property folder path
- The overlay script path for verification
- Instructions to iterate until verification passes

## Key Files

- Skill: `.claude/skills/spatial-360-tour/SKILL.md`
- Schema: `.claude/skills/spatial-360-tour/references/tour-schema.md`
- Overlay script: `.claude/skills/spatial-360-tour/scripts/overlay_tour_hotspots.py`
- Reference tour: `seed_properties/00173-aurelia-sky-residence/tour.json`
- Evals: `.claude/skills/spatial-360-tour/evals/evals.json`

## Verification

1. Each agent runs the overlay script and gets `OK: 0 errors`
2. Orchestrator runs the overlay script on all 53 tours at the end
3. All tours should render correctly in the viewer at `localhost:3000/local/<propertyId>`
