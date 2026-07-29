# ExecPlans (PLANS.md)

An **ExecPlan** is a living design document a coding agent can follow to deliver a working feature or system change. Adapted for this Flutter monorepo from the OpenAI Codex ExecPlan practice.

## When to write one

Create an ExecPlan for complex features or significant refactors. Skip for small, local edits.

- Active plans: `docs/exec-plans/active/<short-name>.md`
- Completed plans: `docs/exec-plans/completed/<short-name>.md`

## How to use

When **authoring**: research the repo, start from the skeleton below, make the plan self-contained for a novice agent with only the working tree and the plan file.

When **implementing**: do not wait for "next step" prompts — proceed milestone by milestone. Keep Progress, Surprises, Decision Log, and validation current. Commit-sized steps; resolve ambiguities in the plan.

When **discussing** design changes: record them in the Decision Log so the plan alone can restart the work.

## Non-negotiable requirements

1. **Self-contained.** All knowledge needed to succeed is in the plan (or checked-in paths it names).
2. **Living document.** Update as progress, discoveries, and decisions happen.
3. **Observable outcomes.** Acceptance is user-visible or demonstrated by tests/commands, not "added a struct."
4. **Validation required.** Include exact commands (`cd app && flutter test ...`) and expected results.
5. **Idempotent and safe.** Prefer additive, re-runnable steps.

## Required living sections

Every ExecPlan must maintain:

- **Progress** (checkbox list with timestamps when practical)
- **Surprises & Discoveries**
- **Decision Log**
- **Outcomes & Retrospective** (at major milestones and completion)

## Skeleton

```markdown
# <Short, action-oriented description>

This ExecPlan is a living document. Maintain Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective per docs/PLANS.md.

## Purpose / Big Picture

What someone can do after this change that they could not before, and how to see it.

## Progress

- [x] (YYYY-MM-DD) Example done
- [ ] Example remaining

## Surprises & Discoveries

- Observation: …
  Evidence: …

## Decision Log

- Decision: …
  Rationale: …
  Date/Author: …

## Outcomes & Retrospective

What shipped, what remains, lessons.

## Context and Orientation

Key files (repo-relative paths), current behavior, terms defined in plain language.

## Plan of Work

Prose sequence of edits: which files, which functions, what changes.

## Concrete Steps

Working directory + exact commands.

## Validation and Acceptance

Behavioral checks and test commands, e.g.:

    cd app && flutter analyze && flutter test
    cd app && flutter test test/upload_queue_test.dart

## Idempotence and Recovery

How to re-run safely.

## Artifacts and Notes

Short transcripts or evidence.

## Interfaces and Dependencies

Prescriptive types/APIs that must exist when done.
```

## Flutter-specific defaults

- Package root for commands: `app/`
- Verify with `flutter analyze` and `flutter test`
- Harness: from repo root `./scripts/check_docs_harness.sh` and `dart run scripts/check_architecture.dart`
- Prefer unit tests under `app/test/` for domain logic; note when a physical device is required

## Promotion rules

- Finished plan → move file to `docs/exec-plans/completed/`
- Leftover work → tech-debt entry or a new active plan
- Stable invariants discovered → promote into `ARCHITECTURE.md`, `docs/FRONTEND.md`, or a harness check
