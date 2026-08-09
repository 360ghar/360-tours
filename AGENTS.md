# AGENTS.md

This is a two-app monorepo: `web/` (React) and `mobile/` (Flutter). Each is self-documenting and agent-first — `web/CLAUDE.md` and `mobile/AGENTS.md` (symlinked as `mobile/CLAUDE.md`) are canonical for their own subtree. Read the subtree's own docs first; fall back to this file only for whole-repo concerns (root CI, root dependabot config, or a change that touches the web/mobile contract below).

## The one cross-app contract to watch

`mobile/`'s `viewer` and `share` features load specific `web/` routes at runtime over WebView (`/embed/:id`, `/view/:id`, `/view3d/:id`, defined in `web/src/constants/routes.ts`) and require byte-parity between `web/src/utils/embedCode.ts` and `mobile/app/lib/features/share/domain/embed_code.dart` (covered by `mobile/app/test/embed_code_test.dart`). This is the one place a change in one app can silently break the other — if you touch either file or any of those routes, check the other side before merging.

## Repository shape

```text
360-tours/
├── web/      # React 19 + TypeScript SPA — see web/CLAUDE.md
├── mobile/   # Flutter client — see mobile/AGENTS.md
├── backend/  # LOCAL CHECKOUT of the canonical backend (gitignored, not tracked)
└── .github/  # CI for both apps (path-filtered per app)
```

## Backend source of truth

The backend is a **separate repository**: `https://github.com/360ghar/360ghar-backend` (canonical, production). It is NOT part of the monorepo and is NOT tracked here (`backend/` is a gitignored local checkout for development).

- **Production deploys from canonical `main`** (Railway). Do not assume the `backend/` checkout is production — always `git -C backend pull` (or reset) to canonical `main` before trusting it.
- The old fork `chrg613/360ghar-backend` is **abandoned**. Do NOT create another backend fork inside this monorepo, do not restore removed fork features (Daytona, the `/lab` API, `spatial-connect`, `floor_plan_ai`, Cloudinary local fallback), and do not merge/cherry-pick fork commits — canonical has already absorbed the useful work.
- Backend API contract used by both clients: see `backend/docs/repo-contract.json` and the live OpenAPI at `https://api.360ghar.com/api/v1/openapi.json`.
- Backend local setup: `cd backend && uv sync --extra dev && cp .env.example .env.dev` (Cloudinary credentials are mandatory — canonical has no local-storage fallback).
