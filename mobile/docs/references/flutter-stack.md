# Reference: Flutter stack

| Piece | Package / location | Role |
|-------|-------------------|------|
| State / DI | `flutter_riverpod` | Providers + overrides in main |
| Routing | `go_router` | Auth redirect + feature routes |
| HTTP | `dio` | Backend client + bare Cloudinary upload |
| Auth | `supabase_flutter`, `google_sign_in`, `sign_in_with_apple` | Identity |
| Camera | `camera`, `sensors_plus`, `permission_handler` | Capture |
| Stitch | `opencv_dart`, `image` | Device stitch + naive compositing |
| Web | `webview_flutter` | Viewer |
| Connectivity | `connectivity_plus` | Queue pump |
| Share | `share_plus`, `url_launcher` | Share sheet / links |
| Storage | `path_provider`, `shared_preferences`, custom `LocalStore` | Files + JSON |
| Deep links | `app_links` | Incoming URLs |

## Commands

```sh
cd app
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
```

## Analyzer

`app/analysis_options.yaml` includes `package:flutter_lints/flutter.yaml`. Prefer rules that already match codebase style (single-quoted imports).
