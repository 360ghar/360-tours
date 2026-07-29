# Core beliefs (agent-first)

These principles define how work happens in this repository. They are not optional flavor text.

## 1. Humans steer; agents execute

Humans set priorities, translate user feedback into acceptance criteria, and validate outcomes. Agents write application code, tests, CI, documentation, scripts, and internal tooling.

Do not leave "the agent almost finished it" patches for a human to complete by hand. Finish the change, or encode the blocker as harness debt and stop cleanly with an ExecPlan Progress note.

## 2. Missing capability → improve the harness

When an agent fails, do not only retry the same prompt. Ask: what tool, doc, test, lint, or fixture was missing? Add that capability to the repository so the next run succeeds without heroic prompting.

## 3. The repository is the system of record

If it is not in git (code, markdown, schemas, scripts, plans), it does not exist for the agent. Promote Slack decisions, verbal architecture, and review taste into `docs/` or mechanical checks.

## 4. Progressive disclosure over giant manuals

`AGENTS.md` is a table of contents. Depth lives under `docs/`. Do not dump encyclopedias into the entry file. Context is scarce.

## 5. Enforce invariants, not micromanaged style

Strict boundaries (layers, parse-at-boundary, no secrets, plugin SDK fences) are mechanical. Within those boundaries, prefer correct, maintainable, agent-legible code over human stylistic perfection.

## 6. Parse, do not YOLO

Validate and map data at API and storage boundaries into typed models (`core/models`). UI and domain logic should not probe unstructured maps "just in case."

## 7. Corrections are cheap; waiting is expensive

Prefer short-lived changes with fast feedback (`flutter analyze`, `flutter test`, harness scripts). Fix flakes and follow-ups quickly. Do not block forever on perfect first shots when a green, reversible step exists.

## 8. Golden principles (garbage collection)

1. Shared helpers live in `core` or feature `domain`, not copy-pasted across screens.
2. Network and publish side effects go through `BackendApi`, repositories, and `UploadQueue`.
3. Plugin SDKs stay behind `app/packages/*` Dart APIs.
4. New features update `docs/generated/feature-map.md` and `docs/QUALITY_SCORE.md`.
5. Repeated bad patterns become a lint, a harness rule, or a tech-debt entry — not another silent TODO.

## 9. Standard change loop

1. Read `AGENTS.md` → relevant docs → code.
2. Complex work: open or update an ExecPlan in `docs/exec-plans/active/` per `docs/PLANS.md`.
3. Implement.
4. Self-verify with analyze, test, and harness scripts.
5. Update docs/plan/quality/debt when behavior or architecture changed.
6. Iterate on review feedback until green.
7. On repeated struggle: fix the harness, then retry.

## 10. Doc gardening cadence

After major features: re-grade quality, move finished plans to `completed/`, refresh tech debt. Prefer continuous small cleanup over weekly "AI slop" dumps.
