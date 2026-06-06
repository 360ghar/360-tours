# Deployment Options

This document defines environment expectations and deployment strategies for the 360 Tours Platform.

## Environments (MVP)

- **Development**: local frontend + a shared dev API.
- **Staging**: production-like environment used for QA, demos, and release validation.
- **Production**: end-user environment.

Each environment MUST have its own:
- database
- object storage bucket/container
- CDN distribution
- secrets

## Configuration

- Configuration MUST be provided via environment variables (12‑factor).
- Secrets MUST be managed by a secrets manager (not committed in repo).
- The frontend MUST support environment-based API base URLs.

## CI/CD (recommended)

- Build and test on every PR.
- Deploy to staging on merge.
- Promote staging → production with an explicit release gate.

## Release strategies

### API service

- **Rolling deployments** are acceptable if the API is stateless.
- **Blue/green** is recommended when schema migrations are non-trivial.

### Web frontend

- Deploy as static assets to an object store/CDN.
- Use immutable filenames (content hashes) and atomic switch of the entrypoint.

## Database migrations

- Migrations MUST be deterministic and backwards compatible within a release window.
- Prefer expand/contract migrations:
  1. add new columns/tables
  2. deploy code that writes both
  3. backfill
  4. cut over reads
  5. remove old paths

## Observability

### Logs

- Structured JSON logs.
- Correlate requests via a `request_id`.

### Metrics

- API latency (p50/p95/p99)
- error rate by endpoint
- upload success rate
- processing queue depth

### Traces

- Trace API requests through DB/storage calls and job dispatch.

## Feature flags

- AI features (MVP, opt-in) and advanced analytics SHOULD be guarded by feature flags.
- Flags MUST be server-enforced when they affect data access.

**Document Links**:
- [Architecture](architecture.md) ← Previous
- [Database Schema](database-schema.md) → Next
