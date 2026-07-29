# Technical PRDs

This folder defines the technical requirements, contracts, and non-functional constraints for the 360 Tours Platform.

## Start here

1. `../00-conventions.md` (canonical schemas and conventions)
2. `api-specification.md` (backend contract)
3. `database-schema.md` (persistence model)
4. `storage-strategy.md` (media storage + processing)

## Architecture & API

- `architecture.md` — Target architecture and system boundaries (web app, API, storage, processing, CDN, observability).
- `api-specification.md` — Canonical REST API contract for frontend ↔ backend.
- `api-implementation-notes.md` — Notes on the current backend's implemented contract vs the canonical spec.
- `database-schema.md` — Canonical relational schema and indexing strategy.
- `storage-strategy.md` — Upload flows, CDN strategy, processing pipeline, retention.
- `360-viewer-implementation.md` — Viewer behavior requirements (hotspots, navigation, VR modes, performance budgets).
- `deployment-options.md` — Environments, CI/CD expectations, monitoring, rollout strategy.

## Quality & operations

- `testing-strategy.md` — Unit tests, component tests, E2E tests, coverage targets.
- `security.md` — Authentication, authorization, RLS, input validation, XSS prevention.
- `error-handling.md` — Error envelope, client interceptors, error boundaries, toast notifications.

## Standards & compliance

- `accessibility.md` — WCAG conformance, keyboard navigation, ARIA, contrast, 360 viewer a11y.
- `seo.md` — Meta tags, server-rendered previews, indexing rules, structured data.
- `i18n.md` — Internationalization status, recommended approach, priority languages.

## Cross-cutting requirements

- **Multi-tenancy**: every object belongs to an owner/tenant; enforce at the DB and API layers.
- **Performance**: viewer interaction must remain responsive on mid-tier mobile devices.
- **Privacy**: private tours must never leak media URLs or metadata to unauthorized users.
- **Compatibility**: public viewing must work without authentication.
