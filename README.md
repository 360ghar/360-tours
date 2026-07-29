# 360 Tours

Monorepo for the 360° virtual-tour product:

- **`web/`** — React 19 + TypeScript SPA: tour editor, public viewer, embed/share, AI-assisted tour generation, and the experimental Splat Lab 3D pipeline.
- **`mobile/`** — Flutter client: guided phone capture, LiDAR (RoomPlan) scanning, Insta360 capture, on-device stitching, and a WebView-embedded viewer that loads `web` at runtime.

## Why one repo

Both clients talk to the same backend (`360ghar-backend`) and share Supabase auth. The mobile app's `viewer`/`share` features load specific `web` routes (`/embed/:id`, `/view/:id`, `/view3d/:id`) and require byte-parity between `web/src/utils/embedCode.ts` and `mobile/app/lib/features/share/domain/embed_code.dart`. Co-locating the two makes that coupling reviewable in one PR instead of two repos drifting out of sync.

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
