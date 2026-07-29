# Reference: backend API surface (client)

Thin typed wrappers live in `app/lib/core/api/backend_api.dart`. Base URL: `Env.apiBase` (default `https://api.360ghar.com/api/v1`). Auth: Supabase JWT on Dio.

## Tours

| Method | HTTP |
|--------|------|
| `createTour` | `POST /tours` |
| `getTour` | `GET /tours/{id}` |
| `publishTour` | `POST /tours/{id}/publish` |
| `deleteTour` | `DELETE /tours/{id}` |
| `getAnalytics` | `GET /tours/{id}/analytics` |
| `getQrCode` | `GET /tours/{id}/qr-code` (bytes) |
| `getFloorPlans` | `GET /tours/{id}/floor-plans` |
| `generate3dWorld` | `POST /tours/{id}/generate-3d` |

## Scenes and hotspots

| Method | HTTP |
|--------|------|
| `createScene` | `POST /tours/{tourId}/scenes` |
| `deleteScene` | `DELETE /scenes/{id}` |
| `createHotspot` | `POST /scenes/{sceneId}/hotspots` |
| `deleteHotspot` | `DELETE /hotspots/{id}` |
| `requestCloudStitch` | `POST /scenes/{sceneId}/stitch` body `{ frame_urls }` |

## Uploads

| Method | HTTP / behavior |
|--------|-----------------|
| `createPresignedUpload` | `POST /upload/presigned` |
| `uploadToCloudinary` | multipart POST to `signed_url` **without** app Authorization |
| `confirmUpload` | `POST /upload/confirm/{uploadId}` |

## AI jobs

| Method | HTTP |
|--------|------|
| `getAiJob` | `GET /ai/jobs/{jobId}` |

## Auth helpers

| Method | HTTP |
|--------|------|
| `getAuthConfig` | `GET /auth/config` (public) |

## Notes for agents

- Many methods still return `Map<String, dynamic>`. Prefer mapping into `core/models` at the repository boundary when touching call sites.
- Share links use `Env.apiRoot`, not `apiBase`.
- Backend implementation lives in a separate 360ghar-backend repo; do not invent endpoints not listed here without product confirmation.
