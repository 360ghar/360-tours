# SECURITY

## Secrets

- **Never commit** real secrets: API tokens, Cloudinary secrets, service keys.
- Supabase keys: the bundled `.env` asset (`app/.env`, loaded by `app/lib/core/env.dart`) may hold **publishable/anon** keys only — they are public by design (web commits the same key in `web/.env`). Anything sensitive stays `--dart-define`-only, never in `.env` or git.
- Resolution order in `env.dart`: `--dart-define` (highest) → bundled `.env` → default.
- Anon key is a public client key; still treat it as non-writable to git history and screenshots in issues when possible.

## AuthZ model

- Supabase issues the user JWT.
- Dio client attaches JWT; **backend verifies** the token (`api.360ghar.com`).
- Client must not invent authorization logic that the API does not enforce.

## Uploads

- Presigned upload flow: app receives short-lived Cloudinary params from backend, then uploads with a **bare Dio** (no Authorization header) to Cloudinary.
- Do not log full presigned signatures or tokens.

## Deep links

- `applinks:api.360ghar.com` requires AASA on the backend listing this app's team + bundle id.
- Validate that deep-link handlers do not open privileged actions without a session.

## Native / local network

- Insta360 path uses local WiFi / `NEHotspotNetwork` / camera HTTP endpoints — local network usage strings are required in Info.plist.
- LiDAR / camera permissions: request with system APIs; fail closed with user-visible errors.
- **Do not vendor** NDA Insta360 SDK binaries into git.

## Dependency caution

- Prefer well-known packages already in `pubspec.yaml`.
- New native code in plugins is high risk: keep surface small and documented in `docs/references/native-plugins.md`.
