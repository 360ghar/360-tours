# Spec: share and viewer

## Share

- `ApiShareRepository` creates or returns short link via backend.
- Public share URL form: `{API_ROOT}/v/{code}` (not under `/api/v1`).
- Embed snippet from `features/share/domain/embed_code.dart` must stay compatible with the web viewer's `embedCode.ts` (byte-sensitive tests) — now a monorepo sibling at `../web/src/utils/embedCode.ts`.
- Share screen: copy link, embed, system share, QR when available.

## Viewer

- `ViewerScreen` loads WebView against viewer base paths (`/embed/:id`, `/view/:id`, `/view3d/:id` as used by the product). This is a live cross-app contract with `../web` (routes defined in `web/src/constants/routes.ts`) — confirmed shipped as of this monorepo merge.
- Canonical viewer host: `Env.viewerBase` (default `https://tours.360ghar.com`, verified live 2026-08-10). The legacy `360viewer.360ghar.com` does NOT resolve in DNS and must never be used (mobile default, web `embedCode.ts` fallback, and both `.env.example`s updated).
- Local file or remote tour id modes depend on asset state.
- The deployed viewer (Netlify) must ship `web/public/_redirects` (`/view/* /embed/* /view3d/* → /index.html 200`) or deep links 404 at the edge (Phase 4 finding).

## Acceptance

- `flutter test test/embed_code_test.dart` green.
- Share screen shows code after successful publish linkage.
- Viewer opens without crashing when URL is valid; shows error state when asset missing.
- Load timeout (45s), HTTP/resource errors, and Retry are handled (spec §11).

## Key files

- `app/lib/features/share/presentation/share_screen.dart`
- `app/lib/features/share/domain/embed_code.dart`
- `app/lib/features/share/data/api_share_repository.dart`
- `app/lib/features/viewer/presentation/viewer_screen.dart`
- `app/lib/core/env.dart`
