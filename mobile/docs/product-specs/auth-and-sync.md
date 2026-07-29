# Spec: auth and sync

## Auth

- Provider: Supabase (`supabase_flutter`).
- Methods: email/password, Sign in with Apple, Google Sign-In.
- Backend `GET /auth/config` supplies Google client ids for native sign-in.
- Without `SUPABASE_URL` + `SUPABASE_ANON_KEY`, app shows missing-env UI.

## Session → API

- Dio client (`core/api/api_client.dart`) attaches Supabase access token.
- All `BackendApi` calls assume JWT is present when signed in.

## Local assets

- `LocalStore` persists JSON collections under app documents.
- `LocalAssetRepository` is local-first; upload is asynchronous via `UploadQueue`.
- Delete attempts remote tour/scene cleanup best-effort.

## Upload pipeline

See `docs/RELIABILITY.md`. User-visible statuses on `ScanAsset` should reflect queue progress.

## Acceptance

- Sign-in redirect works (go_router auth notifier).
- Upload queue tests: resume without duplicate tours.
- Local store tests: upsert/read durability.

## Key files

- `app/lib/features/auth/data/supabase_auth_repository.dart`
- `app/lib/features/assets/data/local_asset_repository.dart`
- `app/lib/core/upload/upload_queue.dart`
- `app/lib/core/storage/local_store.dart`
