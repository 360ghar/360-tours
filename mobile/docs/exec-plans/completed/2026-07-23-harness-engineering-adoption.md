# Adopt OpenAI-style harness engineering in 360-tours-app

This ExecPlan is a living document. Maintained per docs/PLANS.md.

## Purpose / Big Picture

Agents opening this repository get a short map (`AGENTS.md`), a progressive `docs/` system of record, architecture rules with mechanical checks, and an ExecPlan workflow — without CDP/observability overbuild.

## Progress

- [x] (2026-07-23) Research harness engineering article; lock scope with human
- [x] (2026-07-23) Root AGENTS.md + CLAUDE.md symlink
- [x] (2026-07-23) ARCHITECTURE.md + docs tree with real product content
- [x] (2026-07-23) Extract asset_providers; ban cross-feature screen imports
- [x] (2026-07-23) Harness scripts + CI workflow
- [x] (2026-07-23) Root README; verification commands

## Surprises & Discoveries

- Observation: Multiple features imported `asset_detail_screen.dart` only for `assetProvider`.
  Evidence: grep across share/analytics/viewer/tours/threed; fixed by extraction.
- Observation: Repo root had no README or agent files; only `app/README.md`.
  Evidence: directory listing at planning time.

## Decision Log

- Decision: Full agent-first model, root knowledge base, symlink CLAUDE→AGENTS, strict agent-first beliefs.
  Rationale: Human preference at plan approval.
  Date/Author: 2026-07-23 / agent+human
- Decision: Defer CDP UI driving and local observability stack.
  Rationale: Flutter client; no in-repo telemetry surface yet.
  Date/Author: 2026-07-23 / plan
- Decision: Architecture checker fails on cross-feature `*_screen.dart` imports and domain purity; file size hard fail at 600 lines.
  Rationale: High-signal, low false-positive subset of OpenAI-style enforcement.
  Date/Author: 2026-07-23 / agent

## Outcomes & Retrospective

Shipped the harness scaffold and first mechanical gates. Product feature behavior unchanged except shared provider extraction. Future: scheduled doc-gardening agent, richer model boundary parsing, widget/E2E coverage.

## Context and Orientation

See ARCHITECTURE.md and AGENTS.md produced by this plan.

## Validation and Acceptance

```sh
./scripts/check_docs_harness.sh
dart run scripts/check_architecture.dart
cd app && flutter analyze && flutter test
test -L CLAUDE.md && test "$(readlink CLAUDE.md)" = "AGENTS.md"
```
