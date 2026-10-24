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

- **Endpoint**: `ws(s)://<host>/ws/jobs/{job_id}`. The token is not in the URL: the first frame the client sends is `{"type":"auth","token":"<access_token>"}`.
- **Hook**: `useAIJobWebSocket(jobId, options)` in `src/hooks/useAIJobWebSocket.ts`
- **Messages**: `job_update` (`{job_id, data: {status, progress, error_message, result}}`), `connected`, `heartbeat`. Frame types are in `src/types/realtime.ts`.
- **Statuses**: `pending`, `processing`, `completed`, `failed`, `cancelled`. The last three are final.
- **Features**: Auto-reconnect on disconnect (3-second delay), except after close code 4001 (bad token) or 4004 (unknown job). Keep-alive ping every 25 seconds
- **Callbacks**: `onUpdate`, `onComplete`, `onError`

A separate `useUserNotifications` hook connects to `ws(s)://<host>/ws/user` (same first-frame auth) for user-level notifications: `{type: "notification", data: {id, type, title, message, created_at}}`.

## Guardrails

- AI output is always reviewable/editable before publish.
- API errors must fail gracefully and preserve user progress.
- Client should never block solely on WebSocket availability (polling fallback).
