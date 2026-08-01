# AGENTS.md

This is a two-app monorepo: `web/` (React) and `mobile/` (Flutter). Each is self-documenting and agent-first — `web/CLAUDE.md` and `mobile/AGENTS.md` (symlinked as `mobile/CLAUDE.md`) are canonical for their own subtree. Read the subtree's own docs first; fall back to this file only for whole-repo concerns (root CI, root dependabot config, or a change that touches the web/mobile contract below).

## The one cross-app contract to watch

`mobile/`'s `viewer` and `share` features load specific `web/` routes at runtime over WebView (`/embed/:id`, `/view/:id`, `/view3d/:id`, defined in `web/src/constants/routes.ts`) and require byte-parity between `web/src/utils/embedCode.ts` and `mobile/app/lib/features/share/domain/embed_code.dart`. The canonical default iframe snippet is pinned in `docs/embed-parity-golden.html` (`__VIEWER_BASE__`/`__TOUR_ID__` are substituted per side — web resolves the embedding page origin, mobile uses `Env.viewerBase`); both apps' unit tests assert their generator's default output is byte-identical to it (`web/src/test/utils/embedCode.test.ts` and `mobile/app/test/embed_code_test.dart`). This is the one place a change in one app can silently break the other — if you touch either file, the golden fixture, or any of those routes, check the other side before merging.

## Repository shape

```text
360-tours/
├── web/      # React 19 + TypeScript SPA — see web/CLAUDE.md
├── mobile/   # Flutter client — see mobile/AGENTS.md
└── .github/  # CI for both apps (path-filtered per app)
```

## Features & user flows

`docs/FEATURES_AND_USER_FLOWS.md` is the canonical, code-derived inventory of every feature and user flow in both apps — routes/screens, user stories, expected behavior, acceptance criteria, and known gaps (with file:line evidence). `docs/VERIFICATION_LOG.md` records verification results and known errors. Keep both in sync whenever behavior changes.
