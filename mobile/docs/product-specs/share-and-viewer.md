# Spec: share and viewer

## Share

- `ApiShareRepository` creates or returns short link via backend.
- Public share URL form: `{API_ROOT}/v/{code}` (not under `/api/v1`).
- Embed snippet from `features/share/domain/embed_code.dart` must stay compatible with the web viewer's `embedCode.ts` (byte-sensitive tests) — now a monorepo sibling at `../web/src/utils/embedCode.ts`.
- Share screen: copy link, embed, system share, QR when available.

## Viewer

- `ViewerScreen` loads WebView against viewer base paths (`/embed/:id`, `/view/:id`, `/view3d/:id` as used by the product). This is a live cross-app contract with `../web` (routes defined in `web/src/constants/routes.ts`) — confirmed shipped as of this monorepo merge.
- Local file or remote tour id modes depend on asset state.

## Acceptance

- `flutter test test/embed_code_test.dart` green.
- Share screen shows code after successful publish linkage.
- Viewer opens without crashing when URL is valid; shows error state when asset missing.

## Key files

- `app/lib/features/share/presentation/share_screen.dart`
- `app/lib/features/share/domain/embed_code.dart`
- `app/lib/features/share/data/api_share_repository.dart`
- `app/lib/features/viewer/presentation/viewer_screen.dart`
- `app/lib/core/env.dart`
