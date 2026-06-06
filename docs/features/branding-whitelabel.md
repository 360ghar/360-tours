# Branding & Whitelabel

Branding controls how tours appear (logo, colors, typography, watermark).

Related docs:
- Canonical settings: `../00-conventions.md` (`BrandingSettings`)
- Embed options: `player-embed.md`

## MVP scope

Per-tour branding settings (stored in `tour.settings.branding`):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `logo_url` | string | none | Custom logo displayed in the viewer |
| `primary_color` | string | `#FF5733` | Primary brand color |
| `secondary_color` | string | `#FFC857` | Secondary color |
| `accent_color` | string | `#FF8A5C` | Accent color for highlights |
| `text_color` | string | `#0A0A0B` | Text color |
| `background_color` | string | `#FAFAFA` | Background color |
| `font_family` | string | `Satoshi` | Font for tour UI text |
| `button_style` | enum | `rounded` | `rounded`, `square`, or `pill` |
| `show_watermark` | boolean | `true` | Display platform watermark |
| `watermark_position` | enum | `bottom-right` | `bottom-left`, `bottom-right`, `top-left`, `top-right` |
| `custom_css` | string | none | Custom CSS overrides |

The public player MUST render branding consistently across share links and embeds.

## Branding panel

The editor includes a BrandingPanel dialog with three tabs:

1. **Colors** — Quick preset themes (Default, Ocean, Forest, Sunset, Slate, Charcoal) plus custom color pickers for primary, secondary, accent, and text colors. Button style selector.
2. **Logo** — Upload a custom logo via presigned Supabase Storage upload. Remove or replace. Accepted formats: PNG, SVG, JPG.
3. **Typography** — Font family selector with live preview. Available fonts: Satoshi, Clash Display, Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Playfair Display, Source Sans Pro.

The panel includes a live desktop/mobile preview showing how the branding looks in the viewer.

## Uploading a logo (MVP)

1. Presign upload: `POST /api/v1/upload/presigned` (folder_type: `branding`, visibility: `public`).
2. Upload bytes to `signed_url` via `PUT` with Supabase headers.
3. Update tour: `PATCH /api/v1/tours/{tour_id}` with `settings.branding.logo_url`.

## Watermark behavior

- If `branding.show_watermark=false`, the viewer MUST not render platform watermarks.
- Watermark position is configurable to any corner.

## Post-MVP scope

- Account-level themes and multi-brand management.
- Custom domains (component scaffolded as `CustomDomainSetup.tsx`, not yet connected to backend).
- White-label deployment for enterprise customers.

**Document Links**:
- [Video Integration](video-integration.md) ← Previous
- [Analytics](analytics.md) → Next
