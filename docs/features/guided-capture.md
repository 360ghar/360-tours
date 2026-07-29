# Guided Capture (product pivot)

Status: **Web pipeline live (MVP)**

Guided capture is implemented **in the website** (`360-tours`), not a separate
mobile app. Users create a capture session, take multi-yaw photos in the
browser, upload frames, and land in the existing tour editor.

## Pipeline

```text
Create tour → Guided capture
  → POST /capture-sessions
  → Camera (getUserMedia) · 8 yaw targets
  → Review
  → POST /upload per frame
  → POST /capture-sessions/{id}/frames
  → POST /capture-sessions/{id}/complete
  → POST /tours + scenes (draft tour bridge)
  → Tour editor
```

Upload panoramas and AI wizard remain available on the same create page.

## Routes

| Path | Screen |
|------|--------|
| `/tours/create` | Choose: guided · upload · AI |
| `/tours/capture` | New guided session setup |
| `/tours/capture/:sessionId` | Camera / review / upload |

## Code

| Path | Role |
|------|------|
| `src/pages/tours/GuidedCapturePage.tsx` | Capture UX |
| `src/api/capture.ts` | Capture session client |
| `src/types/capture.ts` | Types |

## Backend

See `360ghar-backend/docs/capture-sessions.md`.

## Non-goals (MVP)

- Gaussian Splatting as default capture
- Full Matterport / world-anchored AR dots
- Separate Flutter app (optional later)
