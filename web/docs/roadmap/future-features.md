# Future Features Roadmap

This document tracks planned features for competitive parity with Kuula.co and Matterport, organized by implementation timeframe.

Related docs:
- MVP specification: `mvp.md`
- AI roadmap: `ai-roadmap.md`

## Short-term (next 2-3 months)

### Password-protected tours
*Kuula parity*
- Allow tour creators to set a password on published tours.
- Public viewers must enter the password before the tour loads.
- Password is hashed server-side; access validated via a session token.

### Background audio
*Kuula parity*
- Per-tour background audio (MP3/OGG) that plays during the tour.
- Controls: play/pause, volume, mute.
- Auto-play with mute by default (browser policy compliance).
- Per-scene audio overrides (optional).

### Google Analytics integration
*Kuula parity*
- Allow users to add their Google Analytics tracking ID (GA4).
- Inject GA tracking script into the public viewer.
- Fire custom events (`tour_view`, `scene_view`, `hotspot_click`) to GA.

### Chromeless player option
*Kuula parity*
- Embed option that removes all platform branding and UI chrome.
- Only the 360 viewer and hotspots are visible.
- Controlled via embed URL parameter (`?chromeless=true`).

### Custom domains
*Kuula Business parity*
- Allow users to serve tours from their own domain (e.g., `tours.mybrand.com`).
- Component already scaffolded (`CustomDomainSetup.tsx`).
- Requires: DNS CNAME configuration, SSL certificate provisioning, domain verification.

## Mid-term (3-6 months)

### Nadir/zenith patches
*Kuula parity*
- Allow users to upload images to cover the bottom (nadir) and top (zenith) of 360 photos.
- Common use: hide tripod at the bottom, add branding.
- Applied as a blended overlay during rendering.

### Photo editing/retouching
*Kuula parity*
- Basic in-browser editing of panorama images.
- Features: brightness/contrast, white balance, crop, straighten.
- Non-destructive editing with undo.

### Google Maps integration
*Kuula parity*
- Display tour locations on a map.
- Embed a map view showing all scenes with GPS coordinates.
- Click a map marker to navigate to that scene.
- Requires: Google Maps API key, GPS data from EXIF or manual input.

### Interactive measurement tool
*Matterport parity*
- Point-to-point distance measurement within 360 scenes.
- Requires depth data or manual calibration.
- Display measurements as overlays on the viewer.

### Face blurring / privacy protection
*Matterport parity*
- Automatic detection and blurring of faces in panorama images.
- Applied during image processing pipeline.
- Configurable: auto-blur all, manual review, or disabled.

### Video walkthrough generation
*Matterport parity*
- Generate a video (MP4) from a tour by animating through scenes.
- Configurable: scene order, transition duration, camera path.
- Export for sharing on social media or embedding.

### Heatmaps and session recordings
*Analytics enhancement*
- Visual heatmaps showing where viewers look and click in each scene.
- Session replay: watch how individual viewers navigated the tour.
- Aggregate attention data across all sessions.

## Long-term (6-12 months)

### Virtual staging
*Matterport parity*
- AI-powered placement of virtual furniture in empty rooms.
- Multiple style presets (modern, traditional, minimalist).
- Toggle between staged and unstaged views.

### MLS/real estate platform publishing
*Matterport parity*
- One-click publishing to real estate platforms (MagicBricks, 99acres, Housing.com, etc.).
- MLS-formatted export packages.
- Automatic metadata formatting for listing requirements.

### Google Street View publishing
*Matterport parity*
- Publish tours directly to Google Street View.
- Requires Google Street View Publish API integration.
- GPS coordinates and heading data required per scene.

### 3D model / dollhouse view
*Matterport parity*
- Transition from 2D panorama stitching to 3D spatial representation.
- Dollhouse view: bird's-eye 3D model of the entire space.
- Requires: depth sensors, photogrammetry, or AI-based depth estimation.

### Plugin/extension architecture
- Allow third-party developers to create plugins.
- Plugin types: custom hotspot actions, viewer overlays, data integrations.
- Sandboxed execution environment.
- Plugin marketplace.

### White-label reseller program
- Enable agencies to resell the platform under their own brand.
- Custom domains, branding, and pricing per reseller.
- Revenue sharing model.

## Dependencies and prerequisites

| Feature | Depends On |
|---------|-----------|
| Background audio | Media upload pipeline |
| Measurement tool | Depth data or calibration system |
| Face blurring | AI/ML image processing pipeline |
| Virtual staging | AI/ML + 3D rendering pipeline |
| Dollhouse view | 3D reconstruction pipeline |
| Custom domains | DNS/SSL infrastructure |
| MLS publishing | Third-party API integrations |

**Document Links**:
- [MVP Specification](mvp.md) ← Core scope
- [AI Roadmap](ai-roadmap.md) ← AI feature phases
- [Roadmap Index](README.md) ← Back
