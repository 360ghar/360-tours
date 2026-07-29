# AI Roadmap

AI ships as part of **MVP** and runs as safe, opt-in, asynchronous jobs alongside the core tour creation + viewer experience.

## Phase 0: Foundations

- Implement `/api/v1/ai/jobs` creation, polling, and cancellation.
- Add worker infrastructure and job queue.
- Add governance:
  - quotas and rate limits
  - opt-in for private tours
  - structured outputs only (no “free-form” application)

## Phase 1: Scene analysis

- Job types:
  - `scene_detection`
  - `quality_checks`
- Output:
  - suggested scene titles/descriptions
  - structured quality report

## Phase 2: Hotspot suggestions

- Job type: `hotspot_suggestions`
- Output:
  - hotspot candidates with yaw/pitch + typed content
- UX:
  - user reviews and selects suggestions to apply

## Phase 3: Draft tour generation

- Job type: `tour_generation`
- Output:
  - proposed scene ordering and hotspot plan

## Phase 4 (Optional): Enterprise and evaluation

- evaluation harnesses and regression tests
- model/provider routing
- stricter tenant isolation and audit

## Success criteria

- AI reduces authoring time without reducing tour quality.
- AI output is safe by default and requires explicit user approval.
