# 360 Tours App

Flutter client for capturing guided 360° room panoramas, stitching on device, publishing to the 360ghar backend, and sharing public links.

## Humans

- **Run the app, env vars, iOS auth setup:** [`app/README.md`](app/README.md)
- **Stack:** Flutter + Riverpod + go_router · Supabase auth · `api.360ghar.com` · local plugins for LiDAR and Insta360

```sh
cd app
cp .env.example .env   # publishable Supabase keys; .env is gitignored
flutter run
```

Supabase credentials live in the bundled `app/.env` (publishable/anon keys
only); `--dart-define` overrides them — see `app/README.md`. A fresh clone
must create `.env` from the `.env.example` template first; without it the
app falls back to `_MissingEnvApp` (no credentials) or `--dart-define`.

```sh
cd app && flutter analyze && flutter test
```

## Agents

This repository is **agent-first**. Read **[`AGENTS.md`](AGENTS.md)** first (table of contents). `CLAUDE.md` is a symlink to the same file.

Depth lives under [`docs/`](docs/) and [`ARCHITECTURE.md`](ARCHITECTURE.md). Do not grow `AGENTS.md` into an encyclopedia.

Harness checks:

```sh
./scripts/check_docs_harness.sh
dart run scripts/check_architecture.dart
```
