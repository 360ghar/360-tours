# SEO Strategy

This document defines the SEO approach for ensuring public tours are discoverable.

Related docs:
- UX SEO details: `../ux/seo-meta-tags.md`
- Social sharing: `../features/social-sharing-analytics.md`

## Meta tag management

The `MetaTags` component dynamically sets `<head>` tags per page:

- `<title>` — Page title (e.g., "Living Room Tour - 360 Viewer")
- `<meta name="description">` — Page description
- `og:title`, `og:description`, `og:image`, `og:url` — Open Graph
- `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` — Twitter Cards

## Server-rendered previews

Since the frontend is a SPA, social media crawlers cannot read client-rendered meta tags. The backend provides a server-rendered route:

`GET /share/tours/{tour_id}?redirect=<viewer_url>`

This returns a lightweight HTML page with OG/Twitter meta tags and redirects human visitors to the SPA viewer.

## Indexing rules

| Page type | `robots` | `canonical` |
|-----------|----------|-------------|
| Public tour | `index, follow` | Tour's canonical URL |
| Unlisted tour | `noindex, nofollow` | None |
| Private tour | Not accessible | N/A |
| Landing/marketing | `index, follow` | Page URL |
| Auth pages | `noindex` | None |
| Dashboard/editor | `noindex` | None |

## Future scope

### Sitemap

- Dynamic XML sitemap (`/sitemap.xml`) listing all public tours.
- Updated periodically or on tour publication.
- Submitted to Google Search Console.

### Structured data

JSON-LD structured data for public tours:

```json
{
  "@context": "https://schema.org",
  "@type": "VirtualLocation",
  "name": "Tour Title",
  "description": "Tour description",
  "image": "thumbnail_url",
  "url": "canonical_url"
}
```

### Canonical URLs

- Each public tour has a single canonical URL.
- Embed views do not have canonical URLs (prevent duplicate indexing).
- Share links redirect to the canonical viewer URL.

### robots.txt

```
User-agent: *
Allow: /view/
Allow: /share/
Disallow: /dashboard/
Disallow: /tours/*/edit
Disallow: /login
Disallow: /register
Sitemap: https://360-viewer.com/sitemap.xml
```

**Document Links**:
- [Accessibility](accessibility.md) ← Previous
- [Error Handling](error-handling.md) → Next
- [Technical Index](README.md) ← Back
