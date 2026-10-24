# API Implementation Notes (Current Backend)

The machine-readable contract is `openapi/openapi.json` (a copy of the backend `docs/openapi.json`, refreshed by `npm run api:sync`). The client types are generated from it (`npm run api:types`, output in `src/lib/api/`). This note lists the rules that the generated types do not show. `api-specification.md` is the narrative design spec and can lag behind the OpenAPI document: when they differ, the OpenAPI document wins.

## Base URLs

- REST API base path: `/api/v1`.
- WebSocket endpoints are mounted at the server root (no `/api/v1` prefix): `/ws/jobs/{job_id}` and `/ws/user`. There is no `/ws/tours/{tour_id}`.

## Envelopes

- **Errors.** Every non-2xx JSON body is `{"error": {"code", "message", "details"}}`. A 422 has `code` `VALIDATION_ERROR` and `details.fields`, a list of `{field, msg, type}` (`field` keeps its source prefix: `body.title`, `query.limit`). `details.fields` is always present on a 422 and can be empty. The client reads errors only through `src/api/errors.ts`; a toast after a failed write calls `errorText(error, fallback)` there, so a 422 shows `title: String should have at most 255 characters` and not a generic line.
- **Lists.** Every list is a `CursorPage`: `{items, next_cursor, has_more, limit, total}`. Query keys are `cursor`, `limit` (1 to 100, default 20) and `include_total`. `total` is null unless `include_total=true`. A cursor is opaque and bound to the filters of the request that made it. A reader that needs every row follows `next_cursor` while `has_more` is true.
- **Writes.** Create answers 201 with the resource, delete answers 204 with no body, and no response has a `success` key. A body or query key the schema does not declare is a 422. A PATCH body carries only the changed keys; an explicit `null` clears a nullable field.
- **Values.** Money is a JSON number. A datetime is UTC ISO 8601 ending in `Z`. A date-only field is `YYYY-MM-DD`. An enum value is exactly one of the values in the schema. Ids named `*_id` have the type of their target: user ids are integers, tour, scene and hotspot ids are strings.

## WebSocket

- The token is never in the URL. After the socket opens, the first frame the client sends is `{"type":"auth","token":"<access_token>"}`.
- Close code 4001 means the auth frame was missing or the token was bad. Close code 4004 means the job does not exist or is not the caller's. The client does not reconnect after either.
- `/ws/jobs/{job_id}` sends one `job_update` per state change: `{type, job_id, data: {status, progress, error_message, result}}`. `status` is `pending`, `processing`, `completed`, `failed` or `cancelled`.
- `/ws/user` sends `{type: "notification", data: {id, type, title, message, created_at}}`. A finished or failed AI job also arrives here.
- Both sockets also send `connected` and `heartbeat` frames. The client sends the text `ping` every 25 seconds and the server answers `pong`.

## Tours

- `visibility` is `private`, `unlisted` or `public`. A new tour is always a draft: `status` is not a field of `POST /tours` or `PATCH /tours/{id}`. `POST /tours/{id}/publish` and `POST /tours/{id}/unpublish` change it. `is_featured` is not writable.
- `GET /tours/{id}` answers the owner with `scenes` (read the full list from `GET /tours/{id}/scenes`), `floor_plans` and `main_scene_id`. Another caller gets the public shape of a published tour; a draft or private tour the caller does not own is a 404. `GET /public/tours/{id}` has no `user_id` and lists active hotspots only.
- `settings` is deep-merged on PATCH. A key set to `null` is removed. `settings` declares `auto_rotate`, `auto_rotate_speed`, `initial_scene_id`, `initial_view`, `show_navbar`, `enable_fullscreen`, `enable_vr`, `enable_gyroscope`, `gyroscope_auto_start` and `branding`; any other key (including `floor_plans`) is a 422.
- Text limits (a longer value is a 422) are read from the schema into `src/lib/api/limits.gen.ts`.

### Scenes

- `POST /tours/{id}/scenes` takes `image_url` (and optional `thumbnail_url`, `title`, `description`, `scene_metadata`). It has no `order_index`: the server appends the scene. `POST /tours/{id}/scenes/reorder` takes `{scene_ids}` and answers a `CursorPage` of scenes.
- The metadata key is `scene_metadata` in requests and responses. `initial_view.zoom` is 0 (widest) to 100 (closest); the default is 50.
- Update with `PATCH /scenes/{id}`. There is no `PUT` and no `GET /scenes/{id}`.

### Hotspots

- `content` holds exactly the keys of the hotspot type: info `text`, `html`, `image_url`; audio `audio_url`, `autoplay`, `loop`; video one of `youtube_id`, `vimeo_id`, `video_url` plus `poster_url`, `autoplay`, `muted`, `loop`; link `url`, `target` (`_blank` or `_self`), `label`; custom `html`, `component_key`, `props`; navigation `{}`. There is no `kind` key and no alias.
- A link `url` may use http, https, mailto or tel. Audio, video and image URLs must be http or https.
- `PATCH /hotspots/{id}` with an explicit `null` clears `title`, `description`, `icon`, `icon_name`, `icon_color`, `target_scene_id` and `content`. `null` on `position`, `type`, `icon_size`, `is_active` or `custom_data` is a 422.
- `position` can be `null` in a response when the stored position was invalid.

### Floor plans

- Floor plans are rows of the `floor_plans` table and nowhere else: `GET/POST /tours/{id}/floor-plans`, `PUT /tours/{id}/floor-plans/{floor_plan_id}`, `PUT /tours/{id}/floor-plans/{floor_plan_id}/markers` and `DELETE`. A marker is `{scene_id, x, y, label}` with `x` and `y` from 0 to 100. Viewers read `tour.floor_plans`. There is no `/public/tours/{id}/floor-plans` route.

### Capture sessions

- Status moves `draft -> capturing -> review -> uploading -> processing -> ready`. A PATCH may move `draft -> capturing`, `capturing -> review`, `review -> capturing`, `review -> uploading`, `uploading -> review`, and any non-terminal state to `failed`. `POST /capture-sessions/{id}/complete` runs from `capturing`, `review` or `uploading`.
- `ready`, `failed` and `cancelled` are final. A repeat of the same final status returns the row unchanged; any other status is a 400. `done` is a 422.
- `device_info.platform` is `android`, `ios` or `web`. `error_message` is kept only together with `failed`.

### Uploads

- `POST /upload` takes `file`, `folder_type` (default `generic`), `tour_id` and `visibility`. It answers 201 with `{file_path, public_url, file_type, file_size, content_type, original_filename, media}`.
- `folder_type` is one of `avatar`, `property_image`, `property_video`, `property_document`, `tour_thumbnail`, `tour_original`, `scene`, `document_lease`, `document_maintenance`, `document_general`, `generic`. `tour_thumbnail` and `tour_original` need `tour_id`. `property_*` and `scene` folders need an id that this route does not take (use `POST /upload/presigned`).
- `GET /upload/media` takes `tour_id`, `mime_type`, `visibility`, `is_processed`, `upload_status`, `search` (1 to 100 characters), `cursor`, `limit`, `include_total`. `POST /upload/media/batch-delete` takes `{media_ids}` (at most 50) and answers `{deleted, failed, storage_warnings}`.
- A media row has `width`, `height`, `visibility` (`private`, `unlisted`, `public`) and `upload_status`. It has no `duration`, `storage_path`, `bucket_name` or `processing_metadata`.

### Analytics

- `POST /public/tours/{id}/events` takes a JSON body `{event_type, scene_id, hotspot_id, session_id, event_data}` and answers 204. `event_type` is one of `scene_view`, `hotspot_click`, `share`, `fullscreen_enter`, `fullscreen_exit`, `vr_enter`, `vr_exit`, `session_start`, `session_end`, `session_duration`. A `scene_view` needs `scene_id` and numeric `event_data.yaw` (-180 to 180) and `event_data.pitch` (-90 to 90). A page view is counted by `GET /public/tours/{id}` (once per client IP in 30 minutes).
- `GET /tours/{id}/heatmap` answers `{tour_id, heatmap: [{scene_id, yaw, pitch, intensity, count}]}`: one point per 5-degree cell per scene. Only the tour owner may read it.
- `GET /tours/{id}/analytics` no longer carries `heatmap_points`.
- `GET /dashboard/realtime` answers `recent_views: [{timestamp, views}]`, where `timestamp` is the UTC start of a 5-minute bucket. `GET /dashboard/stats` answers `storage_used` in bytes (the sum of the user's media file sizes).

### AI jobs

- Routes the web client calls: `POST /ai/tours/generate` (multipart: `images`, `title`, `description`, `generate_titles`, `suggest_hotspots`, `generate_descriptions`, `spatial`, `apply_to_scenes`, `language`), `POST /ai/tours/{id}/analyze`, `POST /ai/scenes/{id}/hotspots`, `POST /ai/tours/{id}/descriptions`, `GET /ai/jobs/{id}` and `POST /ai/jobs/{id}/cancel`. The client sends `spatial` explicitly.
- A job has `job_type` (null when the stored value is outside the enum), `status`, `progress`, `tour_id`, `scene_id`, `error_message`, `started_at`, `completed_at`, `created_at`, `updated_at` and `actual_duration` (seconds, null until complete).
- `GET /ai/jobs/{id}` and `POST /ai/jobs/{id}/cancel` answer `{job, result}`. `result` is the model of the job type; a `generate_tour` result is `{tour_id, tour, scenes, generated, created_hotspots}`. Cancel answers 409 `JOB_NOT_CANCELLABLE` when the job already ended.
- There is no reel route and no job list route.

### Users and settings

- `GET/PUT /users/me` answer `SelfUser` (integer `id`, `supabase_user_id`, typed `preferences`, `notification_settings`, `privacy_settings`). A profile save sends only changed fields: `full_name`, `phone`, `date_of_birth`, `notification_settings`. `email`, `bio`, `preferences` and `profile_image_url` are not accepted, and an empty `phone` is rejected (`PHONE_REQUIRED`).
- `notification_settings` has four keys: `push_notifications`, `email_notifications`, `sms_notifications` and `promotional_emails`. The server merges the keys it gets into the stored object. `marketing_emails` is a 422.

### Social share previews

- `GET /share/tours/{tour_id}?redirect=<viewer_url>` renders Open Graph and Twitter card meta tags, then redirects people to the viewer.
