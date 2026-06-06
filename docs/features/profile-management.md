# Profile Management

User profile management covers viewing and editing account information, avatar management, password changes, and account deletion.

Related docs:
- User endpoints: `../technical/api-specification.md`
- Auth: `../00-conventions.md`

## MVP scope

- View and edit profile information (name, email, phone).
- Upload and delete profile image.
- Change password (with current password verification).
- View usage statistics.
- Delete account (with password confirmation).

## Profile fields

| Field | Editable | Description |
|-------|----------|-------------|
| `full_name` | Yes | User's display name |
| `email` | Yes | Email address (optional, not used for auth) |
| `phone` | Read-only | Phone number (primary auth identifier) |
| `profile_image_url` | Yes | Avatar image URL |
| `role` | Read-only | User role (`user`, `agent`, `admin`) |
| `date_of_birth` | Yes | Date of birth |

## Profile image

### Upload

`POST /api/v1/users/me/avatar` — multipart/form-data with `file` field.

### Delete

`DELETE /api/v1/users/me/avatar`

## Password change

Users can change their password by providing their current password for re-authentication:

1. Sign in with current phone + password (re-auth via Supabase).
2. Update password via Supabase `updateUser({ password })`.

## Usage stats

`GET /api/v1/users/me/usage` returns:

- Total tours created
- Published tours count
- Total scenes
- Storage used (bytes)
- Storage limit (bytes)

## Account deletion

`DELETE /api/v1/users/me` with `{ "password": "..." }`.

- Requires password confirmation.
- Soft-deletes the account (sets `deleted_at`).
- Associated data is retained for a grace period before hard deletion.

**Document Links**:
- [Dashboard](dashboard.md) → Next
- [Features Index](README.md) ← Back
