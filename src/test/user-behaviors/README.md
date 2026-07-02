# User-Behavior Test Structure

Behavior tests live here when they validate a workflow or user story instead of
one isolated primitive.

- `account/`: profile, settings, custom domains, auth-adjacent account workflows.
- `analytics/`: account and per-tour analytics, exports, heatmaps.
- `app/`: app shell, protected routes, global feedback, layout behavior.
- `auth/`: login, registration, OTP, password setup, callback, session expiry.
- `dashboard/`: account overview, recent tours, realtime metrics.
- `editor/`: tour editor, uploads, floor plans, hotspots, AI authoring.
- `media/`: media library browsing, previews, single/bulk deletion.
- `shared/`: cross-cutting utilities when behavior is not tied to one route.
- `tours/`: tour list, creation, lifecycle management.
- `viewer/`: public viewer, embed viewer, local harness, tracking, media playback.

Each test should map to one or more story IDs in
`outputs/019f15d0-c68e-71a3-a3a1-dadf11bb7e30/feature_story_tracker.xlsx`.
The workbook's `Story Test Cases` sheet is the canonical list of story-level
test cases and target files.
