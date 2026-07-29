# DESIGN

Mobile product UX principles for the Tours360 Flutter client. This is not a marketing design system.

## Surfaces

| Surface | Feel |
|---------|------|
| Auth / list / settings | Standard Material, calm, high contrast ink on light/dark theme from `core/theme/app_theme.dart` |
| Capture | Full-screen, dark, instrument-like: target overlay, orientation feedback, minimal chrome |
| Viewer | WebView chrome thin; content is the web viewer (`../web` in this monorepo; deployed separately, loaded by URL at runtime) |
| Share | Practical: link, copy, embed snippet, system share sheet |

## Hierarchy

- Primary action per screen is obvious (Capture, Publish/Share, Sign in).
- Destructive actions (delete tour) require clear labeling; do not bury next to navigation.
- Loading and error states always show something readable (never an empty hung scaffold).

## Capture overlay

- Targets guide the user through yaw/pitch samples (`capture_targets` + `target_overlay`).
- Feedback must stay legible on camera preview (high contrast strokes, not low-contrast grey on grey).
- Avoid decorative motion that hides whether a frame was accepted.

## Consistency

- Use `AppColors` / theme tokens from `app_theme.dart` rather than one-off hex in screens.
- Prefer existing list/detail patterns in assets before inventing new card kits.
- Do not introduce web-landing "AI slop" patterns (gradient pills, fake metrics, glowing CTAs) into this utility app.

## Accessibility and device

- Respect safe areas on notched iPhones during capture.
- Camera, motion, LiDAR paths require a physical device; UI must say so when hardware is missing.
- Simulator paths (auth, list, share, queue) must remain usable without sensors.
