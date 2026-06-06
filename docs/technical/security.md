# Security

This document defines the security architecture and practices for the 360 Tours Platform.

Related docs:
- Conventions: `../00-conventions.md`
- Database security: `database-schema.md` (RLS, encryption sections)
- API spec: `api-specification.md`

## Authentication

### Provider

Supabase Auth with phone-based OTP.

### Auth flows

| Flow | Method |
|------|--------|
| Registration | Phone + password via Supabase `signUp()` |
| Login | Phone + password via Supabase `signInWithPassword()` |
| Password reset | OTP sent to phone → verify → update password |
| Logout | Supabase `signOut()` (revokes refresh token) |

### Token management

- **Access tokens**: Supabase-issued JWTs, short-lived (~1 hour).
- **Refresh tokens**: Long-lived, rotation-enabled.
- **Storage**: Managed by Supabase client SDK (secure cookie or localStorage).
- **Refresh**: Automatic via Supabase SDK; the API client interceptor retries on 401 and logs out on persistent failure.

## Authorization

### Row-Level Security (RLS)

PostgreSQL RLS policies enforce data isolation at the database level:

- **Tours**: Users can only access tours where `user_id` matches their ID.
- **Scenes**: Access follows tour ownership (via join).
- **Hotspots**: Access follows scene → tour ownership.
- **Analytics**: Users can only view analytics for their own tours.

### Visibility model

| Visibility | Who can view | Indexed |
|-----------|-------------|---------|
| `private` | Owner only (requires auth) | No |
| `unlisted` | Anyone with the link | No |
| `public` | Anyone, discoverable | Yes |

Unlisted tours use unguessable UUIDs to prevent enumeration.

## Input validation

### Client-side

Zod schemas (`src/utils/validation.ts`) validate all form inputs:

- Tour creation/update: title length, visibility enum, settings shape.
- Hotspot creation: position range (yaw -180..180, pitch -90..90), type enum.
- File uploads: MIME type, file size limits.
- Auth forms: phone format, password strength.

### Server-side

The backend (FastAPI) validates all request bodies against Pydantic models, rejecting malformed input before processing.

## XSS prevention

- **Hotspot HTML content**: Any user-provided HTML in `info` or `custom` hotspots MUST be sanitized server-side or rendered in a sandboxed iframe.
- **Rich text**: No raw `dangerouslySetInnerHTML` without sanitization.
- **URL validation**: Link hotspot URLs are validated to prevent `javascript:` protocol injection.

## CORS

- API CORS is configured to allow only known frontend origins.
- Credentials mode is enabled for authenticated requests.

## Rate limiting

- API endpoints enforce rate limits per user/IP.
- AI job creation is quota-limited to prevent abuse.
- Public analytics ingestion is rate-limited per session ID.

## Content Security Policy (CSP)

Recommended CSP headers for the frontend:

- `default-src 'self'`
- `script-src 'self'` (no inline scripts)
- `img-src 'self' <supabase-storage-domain> <cdn-domain>`
- `connect-src 'self' <api-domain> <supabase-domain>`
- `frame-ancestors *` (for embed support)

## Media access control

- **Private media**: Served via signed URLs with expiration or proxied through the API.
- **Public/unlisted media**: Served directly via CDN URLs.
- **Upload validation**: File type, size, and content validation before storage.

## Session management

- Sessions are tracked in the `user_sessions` table.
- Revoked sessions are immediately rejected.
- Session cleanup removes expired tokens periodically.

## AI processing security

- AI processing is opt-in for private tour content.
- AI jobs disclose what data leaves the tenant boundary.
- AI output requires explicit user approval before being applied.
- Reference IDs only are passed to AI providers; raw content is minimized.

**Document Links**:
- [Testing Strategy](testing-strategy.md) ← Previous
- [Accessibility](accessibility.md) → Next
- [Technical Index](README.md) ← Back
