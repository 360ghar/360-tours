# Accessibility (a11y)

This document defines accessibility requirements and current implementation status.

## Target conformance

WCAG 2.1 Level AA for all non-viewer UI. The 360 viewer has specific challenges addressed below.

## Keyboard navigation

### Implemented

- `useKeyPress` and `useEscapeKey` hooks for keyboard event handling.
- Arrow keys for 360 viewer pan control.
- `+`/`-` keys for zoom.
- `F` key for fullscreen toggle.
- `Escape` to close modals and dialogs.
- Tab navigation through hotspot editor controls.

### Requirements

- All interactive elements MUST be reachable via Tab.
- Focus order MUST follow visual reading order.
- Focus indicators MUST be visible (no `outline: none` without alternative).
- Keyboard shortcuts MUST not conflict with screen reader commands.

## ARIA

### Labels and roles

- All form inputs MUST have associated `<label>` elements or `aria-label`.
- Icon-only buttons MUST have `aria-label` describing the action.
- Modal dialogs MUST use `role="dialog"` with `aria-modal="true"`.
- Loading states MUST use `aria-busy="true"`.
- Toast notifications MUST use `role="alert"` or `aria-live="polite"`.

### Dynamic content

- Scene changes in the viewer SHOULD announce the new scene title via `aria-live`.
- Hotspot interactions SHOULD announce the result (e.g., "Navigated to Kitchen").
- Progress indicators (AI jobs, uploads) MUST use `aria-valuenow`.

## Focus management

- Opening a modal MUST trap focus within the modal.
- Closing a modal MUST return focus to the trigger element.
- Scene navigation MUST manage focus appropriately (not lose focus on scene change).
- The `useClickOutside` hook is used for modal dismissal but MUST not interfere with keyboard-only users.

## Color and contrast

- Text contrast MUST meet WCAG AA minimum (4.5:1 for normal text, 3:1 for large text).
- UI elements MUST not rely solely on color to convey information (e.g., status badges use text labels + color).
- The dark/light theme system MUST maintain contrast ratios in both modes.

## 360 viewer accessibility

The 360 viewer presents unique challenges:

### Current support

- Keyboard controls for pan, zoom, and fullscreen.
- Hotspots are navigable and activatable via keyboard.
- Gyroscope mode for device-based navigation on mobile.

### Limitations

- Visual panorama content is inherently not accessible to screen readers.
- Hotspot positions described in yaw/pitch coordinates are not meaningful to non-visual users.

### Mitigations

- Scene titles and descriptions provide text alternatives for the visual content.
- Hotspot titles and descriptions are read by screen readers when focused.
- A scene list (navbar) provides an alternative navigation method that doesn't require spatial awareness.

## Touch targets

- All touch targets MUST be at least 44x44px (WCAG 2.5.5).
- The `useMediaQuery` hooks detect mobile devices for appropriate sizing.
- Hotspot click targets in the viewer have a minimum radius.

## Reduced motion

- Respect `prefers-reduced-motion` media query.
- Auto-rotate SHOULD be disabled when reduced motion is preferred.
- Transition animations SHOULD be simplified or removed.

**Document Links**:
- [Security](security.md) ← Previous
- [SEO](seo.md) → Next
- [Technical Index](README.md) ← Back
