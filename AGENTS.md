# AGENTS.md

This is a two-app monorepo: `web/` (React) and `mobile/` (Flutter). Each is self-documenting and agent-first — `web/CLAUDE.md` and `mobile/AGENTS.md` (symlinked as `mobile/CLAUDE.md`) are canonical for their own subtree. Read the subtree's own docs first; fall back to this file only for whole-repo concerns (root CI, root dependabot config, or a change that touches the web/mobile contract below).

## The one cross-app contract to watch

`mobile/`'s `viewer` and `share` features load specific `web/` routes at runtime over WebView (`/embed/:id`, `/view/:id`, `/view3d/:id`, defined in `web/src/constants/routes.ts`) and require byte-parity between `web/src/utils/embedCode.ts` and `mobile/app/lib/features/share/domain/embed_code.dart` (covered by `mobile/app/test/embed_code_test.dart`). This is the one place a change in one app can silently break the other — if you touch either file or any of those routes, check the other side before merging.

## Repository shape

```text
360-tours/
├── web/      # React 19 + TypeScript SPA — see web/CLAUDE.md
├── mobile/   # Flutter client — see mobile/AGENTS.md
└── .github/  # CI for both apps (path-filtered per app)
```
