# AI Technology Stack

This document defines a provider-agnostic technical approach for AI features.

Status: **MVP** (opt-in)

Related docs:
- AI job model: `../00-conventions.md`
- API contract: `../technical/api-specification.md`

## Architecture

AI runs as asynchronous jobs.

```mermaid
graph TB
  A[Web App] -->|POST /ai/jobs| B[API Service]
  B --> C[(PostgreSQL)]
  B --> D[Job Queue]
  D --> E[AI Worker]
  E --> F[(Object Storage)]
  E --> G[Model Provider]
  E -->|update status/output| C
  A -->|GET /ai/jobs/{id}| B
```

## Model provider options

The platform MAY use:
- hosted multimodal models (vendor API)
- self-hosted open models (GPU workers)
- hybrid routing based on cost/latency/privacy

Provider choice MUST be abstracted behind a backend interface so the product can switch providers without frontend changes.

## Job execution model

- Job creation stores `AIJob.input` in DB.
- Worker writes progress updates and stores `AIJob.output` in DB.
- Client polls until job completion.

## Data handling

- Inputs MUST reference existing tour/scene/media IDs. Workers fetch media from object storage.
- Minimize persistence of raw prompts and raw model outputs.
- Any stored outputs MUST be structured JSON compatible with canonical schemas.

## Safety, privacy, and governance

- AI features MUST be opt-in for private tours.
- Apply server-side validation to AI outputs (URLs, schema validation, HTML sanitization).
- Provide an audit trail: the user is the final approver of applied changes.

## Cost and reliability

- Enforce per-user quotas and rate limits for job creation.
- Jobs MUST be cancelable (`/api/v1/ai/jobs/{id}/cancel`).
- Workers SHOULD have retries with backoff; output must be idempotent.

**Document Links**:
- [Auto Hotspot Placement](auto-hotspot-placement.md) ← Previous
- [AI Features Index](README.md) → Back
