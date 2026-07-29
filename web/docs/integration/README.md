# Integration PRDs

This folder defines how the 360 Tours Platform integrates with the broader 360Ghar ecosystem and any external systems.

## Documents

- `api-contracts.md` — The contract between the web frontend and the backend API service, including versioning and compatibility expectations.

## Principles

- Integrations MUST be versioned and backwards compatible within a major API version.
- Cross-system identifiers MUST be treated as opaque strings.
- Integration points that involve user data MUST document consent, retention, and deletion behavior.
