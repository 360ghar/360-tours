# 360 Tours

Monorepo for the 360° virtual-tour product:

- **`web/`** — React 19 + TypeScript SPA: tour editor, public viewer, embed/share, AI-assisted tour generation, and the experimental Splat Lab 3D pipeline.
- **`mobile/`** — Flutter client: guided phone capture, LiDAR (RoomPlan) scanning, Insta360 capture, on-device stitching, and a WebView-embedded viewer that loads `web` at runtime.
- **`backend/`** — a **local checkout** of the canonical backend (see below); not tracked by this repo.

## Backend

The backend is a separate repository: **`https://github.com/360ghar/360ghar-backend`** (canonical, production — deployed from `main` on Railway). `backend/` here is only a gitignored local checkout for development. The old fork `chrg613/360ghar-backend` is abandoned; do not fork the backend inside this monorepo. Setup: `cd backend && uv sync --extra dev && cp .env.example .env.dev` (Cloudinary credentials are required).

> **Known config gap — viewer host.** The configured viewer URL `360viewer.360ghar.com` (in `web/.env` → `VITE_APP_URL`, mobile default `viewerBase`, backend Railway env → `PUBLIC_APP_URL`) does not resolve in DNS. It must eventually be set to the real deployed viewer origin in **all three** places: `web/.env` (`VITE_APP_URL`), the mobile build (`VIEWER_BASE` dart-define or `mobile/app/.env`), and the backend environment (`PUBLIC_APP_URL`). Do not change it to a guessed domain.

## Why one repo

Both clients talk to the same backend (`backend/`) and share Supabase auth. The mobile app's `viewer`/`share` features load specific `web` routes (`/embed/:id`, `/view/:id`, `/view3d/:id`) and require byte-parity between `web/src/utils/embedCode.ts` and `mobile/app/lib/features/share/domain/embed_code.dart`. Co-locating the two makes that coupling reviewable in one PR instead of two repos drifting out of sync.

## Commands

| Task | web | mobile |
|---|---|---|
| Install | `cd web && npm ci` | `cd mobile/app && flutter pub get` |
| Dev run | `cd web && npm run dev` (`:3000`) | `cd mobile/app && flutter run --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...` |
| Type/lint | `cd web && npm run type-check && npm run lint` | `cd mobile/app && flutter analyze` |
| Test | `cd web && npm run test:run` | `cd mobile/app && flutter test` |
| Repo harness checks | — | `cd mobile && ./scripts/check_docs_harness.sh && dart run scripts/check_architecture.dart` |
| Build | `cd web && npm run build` | see `mobile/app/README.md` |

## Agents

See [`web/CLAUDE.md`](web/CLAUDE.md) and [`mobile/AGENTS.md`](mobile/AGENTS.md) for each app's full agent-facing docs — don't duplicate their content here. Root [`AGENTS.md`](AGENTS.md) covers cross-app concerns only.
