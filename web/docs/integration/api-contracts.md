# API Contracts

This document defines versioning and compatibility expectations for the platform API.

The canonical endpoint definitions live in `../technical/api-specification.md` and shared schemas live in `../00-conventions.md`.

## API versioning

- Base path: `/api/v1`
- Backwards incompatible changes require a new major version (`/api/v2`).
- Backwards compatible changes (new optional fields, new endpoints) are allowed within `v1`.

## Compatibility rules

- Do not change the meaning of an existing field.
- Do not remove fields or endpoints within a major version.
- New fields MUST be optional and have sensible defaults.

## Pagination and errors

- List endpoints MUST use the pagination envelope from `../00-conventions.md`.
- All non-2xx responses MUST use the error envelope from `../00-conventions.md`.

## Idempotency

- Create endpoints SHOULD accept `Idempotency-Key`.
- Retry behavior MUST not create duplicate tours/scenes/hotspots.

## Deprecation policy

- Deprecations MUST be communicated via release notes and tracked in the roadmap.
- When possible, keep deprecated endpoints for at least one major release cycle.
