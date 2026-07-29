# VR/WebXR Support

This document defines VR capabilities for the web viewer.

Related docs:
- Viewer behavior: `../technical/360-viewer-implementation.md`
- Conventions: `../00-conventions.md`

## MVP scope

- **Gyroscope mode** on supported mobile devices.
- **Stereo/cardboard mode** (split-screen) for basic mobile VR.
- Clear UI controls to enter/exit VR modes.
- Graceful fallback when the device/browser lacks required sensors.

## Optional scope (Post‑MVP)

- **WebXR immersive-vr** sessions for supported browsers/headsets.
- Controller-based interactions.

## Capability detection

- VR controls MUST be hidden or disabled when not supported.
- The viewer SHOULD expose a clear message when the user attempts to enter VR on an unsupported device.

## Interaction model

- In VR modes, users must still be able to:
  - move between scenes (navigation hotspots)
  - trigger hotspots
  - exit VR quickly

## Performance targets

- VR rendering MUST prioritize smoothness over visual fidelity.
- The viewer SHOULD dynamically reduce quality if frame rate degrades.

## Analytics

- Emit `fullscreen_enter` / `fullscreen_exit` when fullscreen changes.
- Emit a VR-specific event (Optional) if needed, otherwise derive VR usage via device mode + fullscreen.

**Document Links**:
- [Floor Plan Integration](floor-plan-integration.md) ← Previous
- [Video Integration](video-integration.md) → Next
