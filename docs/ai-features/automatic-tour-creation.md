# Automatic Tour Creation (AI)

Status: **Core (active focus)**

## Purpose

Create a high-quality draft tour from raw 360 panorama images with minimal manual setup.

The generated draft should include:
- Scene ordering
- Scene labels/descriptions
- Navigation hotspot suggestions

## User Flow

1. User opens AI tour wizard from create flow.
2. User uploads images and chooses AI options.
3. Backend starts AI generation job.
4. Frontend tracks job status and progress.
5. User reviews generated draft and opens editor.
6. User fine-tunes hotspots/settings and publishes.

## Requirements

### Functional
- Accept multiple panorama images in one generation request.
- Support toggles for:
  - room detection
  - auto hotspot placement
  - auto description generation
- Return a draft result that includes at least one generated tour with scenes.

### Reliability
- Must support polling fallback when WebSocket updates are unavailable.
- Must avoid duplicate completion handling in client callbacks.
- Failed jobs must show actionable errors and allow retry.

### Safety
- Generated links/content should be treated as untrusted input.
- Users must explicitly review before publishing.

## API Touchpoints

- `POST /ai/tours/generate`
- `GET /ai/jobs/{job_id}`
- `POST /ai/jobs/{job_id}/cancel`

Apply/finalization still uses standard CRUD tour endpoints to preserve a consistent audit trail.
