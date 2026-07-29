# Error Handling

This document defines error handling patterns across the platform.

Related docs:
- Error envelope: `../00-conventions.md`
- API spec: `api-specification.md`

## Architecture

Error handling follows a layered approach:

1. **API layer** — HTTP errors mapped to the standard error envelope.
2. **Client interceptor** — Axios interceptors handle token refresh and error normalization.
3. **React error boundary** — Catches unhandled React rendering errors.
4. **Global error handler** — Catches unhandled promise rejections and runtime errors.
5. **Toast notifications** — User-facing error messages.

## API error envelope

All non-2xx API responses use the canonical error format:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Human-readable error description",
    "details": { "field": "title", "reason": "required" }
  }
}
```

The FastAPI backend may also return errors in its native format:

```json
{ "detail": "Error message" }
```

The client normalizes both formats.

## Canonical error codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `unauthorized` | 401 | Missing or invalid auth token |
| `forbidden` | 403 | Authenticated but not authorized |
| `not_found` | 404 | Resource does not exist |
| `validation_failed` | 422 | Input validation error |
| `rate_limited` | 429 | Too many requests |
| `conflict` | 409 | Resource state conflict |
| `internal` | 500 | Unexpected server error |

## Client-side error handling

### API client interceptor

The Axios client interceptor (`src/api/client.ts`) handles:

1. **401 Unauthorized**: Attempts token refresh via Supabase. If refresh fails, logs the user out and redirects to login.
2. **Network errors**: Detected and surfaced as connection errors.
3. **Response normalization**: Extracts error messages from both standard and FastAPI error formats.

### React error boundary

The `ErrorBoundary` component wraps the application and catches unhandled rendering errors:

- Displays a fallback UI with error details (in development) or a generic message (in production).
- Logs the error for debugging.

### Global error handler

The `GlobalErrorHandler` component listens for:

- `unhandledrejection` events (promise rejections).
- `error` events (runtime errors).

These are logged and optionally surfaced to the user via toast notifications.

### Toast notifications

User-facing errors are shown as toast notifications:

- **Error toasts**: Red, dismissible, auto-hide after 5 seconds.
- **Warning toasts**: Yellow, for non-critical issues.
- **Info toasts**: Blue, for informational messages.

Toasts are managed by the UI store (`uiStore`) and rendered by the `Toaster` component.

## Offline handling

The `OfflineIndicator` component detects network state:

- Shows a banner when the user goes offline.
- Auto-dismisses when connectivity is restored.
- API calls made while offline fail gracefully with a connection error message.

## AI job error handling

AI jobs have their own error handling:

- Job failures are tracked in the `AIJob.error_message` field.
- The WebSocket connection reports job failures in real-time.
- Failed jobs can be retried by creating a new job.
- The WebSocket auto-reconnects on disconnect (configurable delay, default 3 seconds).

**Document Links**:
- [SEO](seo.md) ← Previous
- [Internationalization](i18n.md) → Next
- [Technical Index](README.md) ← Back
