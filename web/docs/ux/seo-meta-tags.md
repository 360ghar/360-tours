# SEO & Meta Tags

SEO support ensures public tours are discoverable and render rich previews when shared.

Related docs:
- Social sharing: `../features/social-sharing-analytics.md`
- API implementation notes: `../technical/api-implementation-notes.md`

## Client-side meta tags

The `MetaTags` component dynamically manages `<head>` meta tags for each page:

- `<title>` — Page-specific title.
- `og:title`, `og:description`, `og:image`, `og:url` — Open Graph for Facebook/LinkedIn.
- `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` — Twitter Card metadata.
- `description` — Standard meta description.
- `robots` — Indexing directives (e.g., `noindex` for unlisted tours).

## Server-rendered share previews

For link unfurling (Slack, iMessage, WhatsApp, etc.), the backend provides server-rendered HTML:

`GET /share/tours/{tour_id}?redirect=<viewer_url>`

This route:
1. Renders a minimal HTML page with OG + Twitter Card meta tags.
2. Redirects human visitors to the SPA viewer.

The preview image is the tour thumbnail or the first scene thumbnail as fallback.

## Indexing strategy

| Content | Indexed? | Notes |
|---------|----------|-------|
| Public tours | Yes | Full OG tags, sitemap candidate |
| Unlisted tours | No | `noindex` directive, unguessable IDs |
| Private tours | No | Requires auth, not accessible to crawlers |
| Landing pages | Yes | Static marketing content |

## Future scope

- XML sitemap generation for public tours.
- JSON-LD structured data (virtual tour schema).
- Canonical URL management.
- `robots.txt` configuration.

**Document Links**:
- [Social Sharing](../features/social-sharing-analytics.md) ← Related
- [UX Index](README.md) ← Back
