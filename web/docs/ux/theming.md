# Theming

The platform supports dark, light, and system-preference themes.

Related docs:
- UI components: `ui-components.md`

## MVP scope

- Three theme modes: `light`, `dark`, `system`.
- Theme preference persisted to `localStorage`.
- CSS variable-based theming for instant switching.

## Implementation

Theme state is managed by the UI store (`uiStore`) with Zustand:

```
theme: 'light' | 'dark' | 'system'
```

The store persists the theme preference to `localStorage` and applies the appropriate CSS class to the document root.

## Theme switching

- Users can toggle themes from the header/settings.
- `system` mode follows the user's OS preference via `prefers-color-scheme` media query.
- Theme changes are applied instantly without page reload.

## CSS variables

The theme system uses CSS custom properties (variables) for all colors, enabling components to be theme-agnostic. Key variable categories:

- `--color-background` / `--color-surface` — Background colors
- `--color-text` / `--color-text-muted` — Text colors
- `--color-primary-*` — Primary brand color scale
- `--color-border` — Border colors
- `--color-error-*` / `--color-success-*` — Semantic colors

## Component integration

All UI components use CSS variables rather than hard-coded colors, ensuring automatic theme adaptation.

**Document Links**:
- [UI Components](ui-components.md) ← Related
- [UX Index](README.md) ← Back
