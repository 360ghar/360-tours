# MVP Specification

This MVP definition is intentionally narrowed to execution quality on core journeys.

## MVP Scope (Current)

### 1) Authentication
- Phone-based registration and login via Supabase Auth.
- OTP-based password reset.
- Session handling with JWT access/refresh tokens.

### 2) Tour Authoring
- Create/edit/delete tours.
- Upload and manage scenes (single and bulk upload).
- Create/edit/delete hotspots (all 6 types: navigation, info, audio, video, link, custom).
- Custom hotspot icons with color and size options.
- Drag-and-drop scene reordering.
- Tour settings (auto-rotate, navbar, fullscreen, VR, gyroscope).
- Publish/unpublish tours.
- Duplicate tours.

### 3) AI Tour Generation
- Generate draft tours from uploaded panoramas.
- AI scene analysis and description generation.
- AI hotspot suggestions.
- Track AI jobs reliably via polling and WebSocket.
- Let users review and refine generated output in editor.

### 4) Public Viewer
- Load published/unlisted tours on desktop + mobile.
- Navigate scenes via thumbnails and hotspots.
- Stable fullscreen behavior.
- Tour likes (session-based for anonymous viewers).
- VR/gyroscope mode support.

### 5) Embed + Share
- iframe embed generation with URL controls.
- Public share link generation and copy flows.
- QR code generation and download.
- Social sharing (Facebook, Twitter/X, LinkedIn, WhatsApp, Email).
- Server-rendered rich previews (OG + Twitter Cards).

### 6) Branding
- Per-tour branding: colors (primary, secondary, accent, text, background), logo, font, button style.
- Watermark toggle and position.
- Preset themes.

### 7) Floor Plans
- Multi-floor plan upload and management.
- Scene marker placement on floor plans.
- Floor plan overlay in viewer with floor switching.

### 8) Analytics
- Event tracking: tour views, scene views, hotspot clicks, shares, likes.
- Per-tour analytics dashboard with date range filtering.
- Device and country breakdown.
- Dashboard with summary statistics.

### 9) Profile & Settings
- Profile view/edit (name, email, avatar).
- Password change.
- Usage statistics.
- Dark/light/system theme.

## Explicitly De-prioritized for Current Phase

- Password-protected tours
- Background audio
- Advanced analytics (heatmaps, session recordings)
- Video overlays/integration
- Extended WebXR feature set
- Custom domains
- Google Analytics integration
- Photo editing/retouching
- Measurement tools
- Internationalization (i18n)

## Acceptance Gates

- Core flows are testable and stable:
  - AI generate -> review -> edit
  - publish -> view public
  - share -> open (link + QR code)
  - embed -> render
  - like -> count updates
- No dead links in primary navigation.
- User-facing docs match implemented routes and behavior.
- Unit tests pass for core components and stores.
- E2E tests pass for core user flows.

**Document Links**:
- [Future Features](future-features.md) → Next: Competitor roadmap
- [AI Roadmap](ai-roadmap.md) → AI feature phases
- [Roadmap Index](README.md) ← Back
