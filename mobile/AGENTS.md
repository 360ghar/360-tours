# AGENTS.md

Map for coding agents working in this repository. Read this first. Do not treat it as the encyclopedia — follow the pointers.

## What this is

Flutter client for **360 Tours** (`app/`): capture a room as a guided 360° panorama, stitch on device, publish to the 360ghar backend, share a public link. Auth via Supabase; tours/scenes/uploads via `api.360ghar.com`. Native plugins under `app/packages/` (LiDAR RoomPlan, Insta360 capture).

This app lives at `mobile/` inside the `360-tours` monorepo; the web viewer app is a sibling at `../web`. Its `viewer`/`share` features load specific `web` routes and require byte-parity with `web/src/utils/embedCode.ts` — see `docs/product-specs/share-and-viewer.md` and root `../AGENTS.md`.

## Agent-first mandate

Humans steer (priority, acceptance criteria, review of outcomes). **Agents write** application code, tests, CI, documentation, and tooling. Do not leave half-applied harness fixes for a human to type.

If the agent cannot complete a task, the fix is almost never "try harder." Identify the missing capability (doc, test, lint, script, fixture) and add it to the repo, then retry.

Repository-local artifacts are the only system of record. Knowledge in chat, Slack, or heads does not exist for the next run.

## Always-run commands

```sh
cd app
flutter pub get
flutter analyze
flutter test
```

Harness checks (from repo root):

```sh
./scripts/check_docs_harness.sh
dart run scripts/check_architecture.dart
```

Human run/env details (dart-defines, iOS auth setup): `app/README.md`.

## Where truth lives (progressive disclosure)

| Need | Read |
|------|------|
| Domains, layers, import rules | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Operating principles (strict agent-first) | [`docs/design-docs/core-beliefs.md`](docs/design-docs/core-beliefs.md) |
| ExecPlan format | [`docs/PLANS.md`](docs/PLANS.md) |
| Active / completed plans, debt | [`docs/exec-plans/`](docs/exec-plans/) |
| Product intent | [`docs/PRODUCT_SENSE.md`](docs/PRODUCT_SENSE.md) |
| Feature inventory | [`docs/generated/feature-map.md`](docs/generated/feature-map.md) |
| UI conventions | [`docs/FRONTEND.md`](docs/FRONTEND.md) |
| UX principles | [`docs/DESIGN.md`](docs/DESIGN.md) |
| Reliability (queue, stitch ladder) | [`docs/RELIABILITY.md`](docs/RELIABILITY.md) |
| Security | [`docs/SECURITY.md`](docs/SECURITY.md) |
| Quality grades / gaps | [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md) |
| Backend API surface used by app | [`docs/references/backend-api.md`](docs/references/backend-api.md) |
| Native plugins / NDA SDK | [`docs/references/native-plugins.md`](docs/references/native-plugins.md) |
| Product specs index | [`docs/product-specs/index.md`](docs/product-specs/index.md) |

## ExecPlans

When writing **complex features** or **significant refactors**, create or update an ExecPlan under `docs/exec-plans/active/` following [`docs/PLANS.md`](docs/PLANS.md). Keep Progress, Decision Log, and validation commands current. Move finished plans to `docs/exec-plans/completed/`.

Small, local changes do not need an ExecPlan.

## Hard constraints

1. **No secrets in git.** Supabase and API config via `--dart-define` only (`app/lib/core/env.dart`).
2. **Insta360 `INSCameraSDK` is NDA-gated** — never vendor the framework; keep linkage points in the plugin.
3. **Feature-first layering** — see `ARCHITECTURE.md`. No cross-feature imports of `*_screen.dart`. Domain must not import Dio, Supabase, or `presentation/` (no widgets).
4. **Parse at boundaries** — typed models in `core/models`; do not thread raw `Map` deep into UI.
5. **Network side effects** go through repositories / `UploadQueue` / `BackendApi`, not ad-hoc Dio from widgets.
6. **Do not expand `AGENTS.md`**. Put depth under `docs/`. This file must stay a short map (hard fail above 200 lines in CI).

## Definition of done

- `flutter analyze` and `flutter test` pass in `app/`
- `./scripts/check_docs_harness.sh` and `dart run scripts/check_architecture.dart` pass
- Behavior or architecture changes update the relevant `docs/` pages (and `QUALITY_SCORE.md` / tech-debt when grades or debt change)
- Open ExecPlans have Progress updated
- New feature folders appear in `docs/generated/feature-map.md`

## Garbage collection

Prefer shared `core` or feature `domain` over copy-pasted helpers. When you spot drift or a repeated bad pattern: fix a small instance, encode a rule or doc note, or add an entry in [`docs/exec-plans/tech-debt-tracker.md`](docs/exec-plans/tech-debt-tracker.md). Do not leave silent `TODO`s as the only record.

## Identity

`CLAUDE.md` is a symlink to this file. Keep them identical via that symlink — never fork instructions.
