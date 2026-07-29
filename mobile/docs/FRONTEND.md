# FRONTEND

Flutter UI and state conventions for this app.

## Stack

- Flutter + Material
- Riverpod (`flutter_riverpod`) for DI and async UI state
- `go_router` with auth redirect (`core/router.dart`)
- Feature-first folders under `lib/features/<domain>/{presentation,domain,data}`

## Composition root

`lib/main.dart` builds `LocalStore`, `BackendApi`, `UploadQueue`, repositories, then:

```dart
ProviderScope(
  overrides: [
    authRepositoryProvider.overrideWithValue(auth),
    assetRepositoryProvider.overrideWithValue(assets),
    // ...
  ],
  child: const ToursApp(),
)
```

Providers in `core/providers.dart` throw `UnimplementedError` unless overridden — that is intentional.

## Screens and routing

- Register screens only in `core/router.dart`.
- Auth gate: unsigned users → `/signin`; signed-in users leaving sign-in → `/`.
- Fullscreen capture uses `MaterialPage(fullscreenDialog: true)`.

## Shared asset state

- `features/assets/presentation/asset_providers.dart` exports `assetProvider` and `assetTickProvider`.
- Other features may import **providers**, not `asset_detail_screen.dart`.

## Style

- Imports use single quotes (existing codebase convention).
- Prefer `const` constructors where possible.
- Avoid `print` in `lib/`; tests may be more relaxed.
- Analyzer: `flutter_lints` via `app/analysis_options.yaml`. Treat analyzer failures as blocking.

## Widgets

- Keep screen files focused; extract widgets into `presentation/widgets/` when a screen grows.
- Theme colors: `AppColors` / `AppTheme` in `core/theme/app_theme.dart`.

## Testing UI-adjacent logic

Prefer unit tests for pure domain (orientation, stitch, embed, queue, store). Widget tests are sparse; expand when fixing UI regressions with a minimal harness.
