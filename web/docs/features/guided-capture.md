# Guided Capture (product pivot)

Status: **Web pipeline live (MVP)**

Guided capture is implemented **in the web app** (this page describes the
`web/` client). Users create a capture session, take multi-yaw photos in the
browser, upload frames, and land in the existing tour editor.

The monorepo's `mobile/` client (Flutter) has its own, independent guided
capture pipeline — on-device orientation-guided shots, a local stitch ladder,
and optional LiDAR (RoomPlan) / Insta360 capture — documented at
`mobile/docs/product-specs/capture-and-stitch.md`. The two pipelines use
different backend surfaces today (this web flow POSTs to
`/capture-sessions`; the mobile app uploads finished scenes through its own
`UploadQueue` / `BackendApi`) and are not required to converge, but any future
work unifying them should start from both docs.

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
- Converging with `mobile/`'s capture pipeline (tracked separately, see above)
