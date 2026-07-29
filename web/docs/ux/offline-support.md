# Offline Support

Current offline support is limited to a visual indicator. Full offline-first capabilities are planned for future releases.

## Current scope

### Offline indicator

The `OfflineIndicator` component detects network connectivity changes and displays a banner when the user goes offline. It uses the browser's `navigator.onLine` API and `online`/`offline` events.

### Behavior

- When offline: a non-intrusive banner appears informing the user that some features may be unavailable.
- When back online: the banner automatically dismisses.
- No data is cached or queued for offline use in the current implementation.

## Future scope

- Service worker for caching static assets and API responses.
- Offline tour viewing for previously loaded tours.
- Queued edits that sync when connectivity is restored.
- Background sync for analytics events.

**Document Links**:
- [Theming](theming.md) ← Related
- [UX Index](README.md) ← Back
