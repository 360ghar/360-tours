# Social Sharing & Analytics

This document defines sharing behavior and how shares are tracked.

Related docs:
- Analytics events: `analytics.md`
- Canonical event names: `../00-conventions.md`

## MVP scope

- Provide a share link for published public/unlisted tours.
- Copy link, native share sheet, and social platform sharing.
- QR code generation and download.
- Record a `tour_share` analytics event.

## Share link requirements

- Public tours MUST have a stable, canonical URL.
- Unlisted tours MUST not be indexable and SHOULD use unguessable IDs.

## Rich previews (MVP)

For public/unlisted tours, share URLs SHOULD resolve to a server-rendered HTML route that renders metadata for link unfurling and then redirects humans to the viewer:

`GET /share/tours/{tour_id}?redirect=<viewer_url>`

- Open Graph: `og:title`, `og:description`, `og:image`, `og:url`
- Twitter cards: `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`

The preview image SHOULD be either:
- `tour.thumbnail_url`, or
- the first scene thumbnail as a fallback.

## Share modal

The ShareModal component provides multiple sharing methods:

1. **Copy link** — Copies the public tour URL to clipboard.
2. **Embed code** — Generates iframe embed code with customizable options (see `player-embed.md`).
3. **QR code** — Generates a QR code for the tour URL, displayed inline with a download button (saves as PNG).
4. **Social sharing** — Direct share links for Facebook, Twitter/X, LinkedIn, Email, and WhatsApp.

## QR code generation

- QR codes are generated client-side from the tour's public URL.
- Users can download the QR code as a PNG image.
- The QR code encodes the canonical share URL.

## Tracking shares

When the user triggers a share action, emit:

- `event_type`: `tour_share`
- `event_data.platform`: `copy_link | native_share | whatsapp | facebook | twitter | linkedin | email | other`

## Post-MVP scope

- Platform-specific engagement metrics (requires platform APIs and permissions).
- Custom branded QR codes with logo overlay.
- Short URL generation.

**Document Links**:
- [Analytics](analytics.md) ← Previous
- [Features Index](README.md) → Back
