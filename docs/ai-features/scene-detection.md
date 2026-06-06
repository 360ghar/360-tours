# Scene Detection & Analysis (AI)

This feature describes AI analysis that produces metadata and quality checks for scenes.

Status: **MVP** (opt-in)

Related docs:
- AI job model: `../00-conventions.md`
- API contract: `../technical/api-specification.md`

## Goals

- Generate suggested scene titles/descriptions.
- Classify scenes (e.g., room type).
- Provide quality checks (e.g., low resolution, incorrect aspect ratio).

## Inputs

- `tour_id` or `scene_id`
- Optional: language and style guidance

## Outputs

- Suggested metadata:
  - `scene.title`
  - `scene.description`
  - `scene.metadata` (e.g., tags)
- Quality report (structured JSON), e.g.:
  - aspect ratio mismatch
  - low light / blur indicators
  - potential privacy flags (faces) (Optional)

## Workflow

1. User triggers analysis from the editor.
2. Backend creates an AI job (`job_type=scene_detection` or `quality_checks`).
3. Client polls until `completed`.
4. Client presents suggestions; user chooses what to apply.

## API usage

- Create job: `POST /api/v1/ai/jobs`
- Poll job: `GET /api/v1/ai/jobs/{job_id}`
- Apply selected changes via normal scene update:
  - `PATCH /api/v1/scenes/{scene_id}`

## Safety and privacy

- Do not store raw model prompts/responses that include sensitive content unless required.
- Treat AI output as untrusted input.

**Document Links**:
- [Automatic Tour Creation](automatic-tour-creation.md) ← Previous
- [Auto Hotspot Placement](auto-hotspot-placement.md) → Next
