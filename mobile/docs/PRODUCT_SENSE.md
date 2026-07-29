# PRODUCT_SENSE

## Who this is for

Operators capturing real-estate or interior spaces: they need a trustworthy 360° tour quickly, not a pro photogrammetry studio. Primary device is a physical iPhone (camera, motion, optional LiDAR). Auth, listing, viewer, share, and upload-queue paths must also work on the iOS simulator for development.

## Job to be done

1. Sign in (email, Apple, Google when configured).
2. Capture a room as a guided multi-frame panorama in about a minute.
3. Stitch on device (or fall back) into an equirectangular panorama.
4. Publish to 360ghar backend (presigned Cloudinary upload + scene + publish).
5. Share a short public link / embed; optionally add rooms, hotspots, floor plans, 3D generation, analytics.

## What "done" means for a capture

- User can open the tour in the hosted viewer (`VIEWER_BASE` / share code `apiRoot/v/{code}`).
- Local asset is durable offline; upload resumes without duplicating remote tours.
- Thumbnail and panorama paths are stored on the asset; status reflects upload progress.

## Non-goals (for this client)

- Being the backend or the viewer web app (those are separate products, now co-located at `../web` in this monorepo — see its `CLAUDE.md`).
- Vendoring NDA-gated Insta360 SDK binaries.
- Full offline editing of cloud-only metadata without sync.

## Product principles

- **Capture reliability over stitch perfection.** Naive stitch that always finishes beats a beautiful stitch that OOMs.
- **Local-first assets.** Disk + `LocalStore` are source of truth until upload confirms.
- **Honest incomplete states.** Google iOS OAuth and Insta360 SDK linkage are incomplete: surface clear errors, do not pretend.
- **One sequential publish pipeline.** Simpler recovery than parallel multi-flight uploads.

## Acceptance language for agents

Prefer user-visible outcomes:

- "After capture, asset list shows the new scan with a thumbnail."
- "With network restored, upload queue reaches published and share screen shows a code."
- "Sign-in without dart-defines shows the missing-env screen, not a blank hang."
