# AI Features

AI functionality is a core product path in this project.

## Current Goal

Use AI to reduce manual tour-authoring work while keeping human review in control:
- Generate draft tours from uploaded panoramas
- Suggest scene structure and labeling
- Suggest hotspot placement/navigation links
- Generate scene descriptions

## Workflow

1. User uploads 360 images via AI wizard.
2. Backend creates an AI job.
3. Frontend tracks progress via **WebSocket** (with polling fallback).
4. User reviews generated output.
5. User continues in editor to finalize and publish.

## Key Docs

- `automatic-tour-creation.md`
- `scene-detection.md`
- `auto-hotspot-placement.md`
- `tech-stack.md`
- `../technical/api-specification.md`

## Real-time job monitoring

AI job progress is tracked via WebSocket:

- **Endpoint**: `ws(s)://<host>/ws/jobs/{job_id}?token=<access_token>`
- **Hook**: `useAIJobWebSocket(jobId, options)` in `src/hooks/useAIJobWebSocket.ts`
- **Messages**: `job_update` (status + progress), `connected`, `heartbeat`, `error`
- **Features**: Auto-reconnect on disconnect (3-second delay), keep-alive ping every 25 seconds
- **Callbacks**: `onUpdate`, `onComplete`, `onError`

A separate `useUserNotifications` hook connects to `ws(s)://<host>/ws/user?token=...` for user-level notifications.

## Guardrails

- AI output is always reviewable/editable before publish.
- API errors must fail gracefully and preserve user progress.
- Client should never block solely on WebSocket availability (polling fallback).
