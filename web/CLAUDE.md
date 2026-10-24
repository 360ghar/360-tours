# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Canonical guide.** `AGENTS.md` adds agent workflow notes; `DESIGN.md` is the UI source of truth; `PRODUCT.md` is the product/scope spec; `docs/README.md` indexes the full doc tree.

This app lives at `web/` inside the `360-tours` monorepo. The Flutter mobile client is a sibling at `../mobile` (see `../mobile/CLAUDE.md`); the two share a backend and Supabase auth, and the mobile app's `viewer`/`share` features load specific routes from this app at runtime (see root `../AGENTS.md` for the cross-app contract). Whole-repo concerns (root CI, dependabot) live at the repo root, not here.

## Project Overview

**360 Viewer** is a React 19 + TypeScript SPA for creating, editing, publishing, and viewing 360° virtual property tours. Primary focus (per `PRODUCT.md`): AI-assisted tour generation (scene analysis, auto hotspots, descriptions), reliable tour editing, fast public viewing, and share/embed/QR simplicity. Secondary (present but de-prioritized): advanced analytics, floor plans, branding/white-label, video.

Backend is the shared 360Ghar FastAPI monolith (`../../360ghar-backend`, i.e. a sibling of the `360-tours` monorepo) at `/api/v1`. Auth is Supabase. Primary users: real-estate photographers, agencies, PMs, architects; public viewers are buyers/tenants.

## Tech Stack

- **React 19** + **TypeScript ~5.9** (strict), **Vite 7**, project-references tsconfig
- **Routing:** `react-router-dom 7` via `createBrowserRouter` + `RouterProvider`
- **Server state:** `@tanstack/react-query 5` (queries/mutations used inline in pages — there are **no** query hooks in `src/hooks/`)
- **Client state:** `zustand 5` (6 stores — see below)
- **Styling:** Tailwind CSS v4 (CSS-based config via `@tailwindcss/vite`, **no `tailwind.config.ts`**) + Radix UI primitives, composed with `class-variance-authority` + `clsx` + `tailwind-merge` (`cn()`)
- **Forms:** `react-hook-form 7` + `@hookform/resolvers` + `zod 4`
- **360° rendering:** `@photo-sphere-viewer/core 5.14` + `markers-plugin`, `gyroscope-plugin`, `stereo-plugin` (no VirtualTourPlugin)
- **HTTP:** `axios 1.18`
- **Other runtime:** `@dnd-kit/*` (drag-and-drop), `react-dropzone`, `recharts`, `date-fns`, `react-day-picker`, `qrcode`, `lucide-react`
- **Realtime:** in-app WebSocket hooks (`useWebSocket`, `useAIJobWebSocket`) for AI jobs + notifications
- **Test:** `vitest 3` + `@testing-library/react` + `jsdom` + `msw` (unit); `@playwright/test` (E2E)

## Commands

```bash
npm ci                        # install from package-lock.json
cp .env.example .env          # only VITE_* vars reach the client
npm run dev                   # Vite dev server on http://localhost:3000
npm run build                 # tsc -b && vite build → dist/ (sourcemaps on, manual chunking)
npm run preview               # serve the production bundle
npm run type-check            # tsc --noEmit
npm run lint                  # eslint .
npm run format                # prettier --write "src/**/*.{ts,tsx,css}"
npm test                      # vitest (watch)
npm run test:run              # vitest single run
npm run test:coverage         # vitest + v8 coverage
npm run test:e2e              # playwright (boots dev server on :3000, or `preview` in CI)
npm run test:e2e:smoke        # auth + landing specs, chromium only
```

## Environment Variables (`.env.example`)

Only `VITE_*` vars are exposed to the client. Parsed in `src/constants/config.ts`.

| Var | Default | Purpose |
|-----|---------|---------|
| `VITE_API_BASE_URL` | `http://localhost:3600/api/v1` | Backend base (falls back to deprecated `VITE_API_URL`) |
| `VITE_API_TIMEOUT` | `30000` | Axios timeout (ms) |
| `VITE_SUPABASE_URL` | _(empty, required)_ | Auth throws at load if unset (non-test) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | _(empty, required)_ | Supabase anon key |
| `VITE_MAX_UPLOAD_SIZE_MB` | `50` | Client upload cap |
| `VITE_ALLOWED_IMAGE_TYPES` | `image/jpeg,image/png,image/webp` | Accept list |
| `VITE_AUTH_REDIRECT_URL` | `window.location.origin/auth/callback` | Google OAuth redirect override |
| `VITE_APP_NAME` / `VITE_APP_VERSION` | `360 Viewer` / `1.0.0` | Display metadata |

## Project Structure

```
src/
├── main.tsx              # createRoot + <StrictMode>; imports index.css then App
├── App.tsx               # provider stack (see below) + <RouterProvider>
├── index.css             # Tailwind v4 + design tokens (:root / .dark CSS custom props)
├── api/                  # Axios clients (client, auth, tours, ai, upload, users, capture, customDomains) + errors, pagination, aiResults
├── lib/api/              # schema.gen.ts + limits.gen.ts (generated from openapi/openapi.json, do not edit)
├── components/
│   ├── ui/               # shadcn/Radix primitives (Button, Dialog, Select, Sheet, …)
│   ├── features/         # tour editor + feature components (PanoramaViewer, Hotspot*, FloorPlan*, …)
│   ├── layout/           # PublicLayout, AuthLayout, DashboardLayout, Header, Sidebar
│   ├── landing/          # marketing sections (incl. Demo360Viewer)
│   ├── common/           # GlobalErrorHandler, MetaTags, OfflineIndicator, Skeletons
│   └── animations/       # useInView, useStaggerAnimation
├── pages/                # route-level screens (lazy-loaded except entry pages)
├── stores/               # zustand stores (auth, tourEditor, viewer, ui, confirm)
├── hooks/                # utility/IO hooks (NO tanstack-query wrappers)
├── lib/                  # queryClient, QueryProvider, router, supabaseAuth, lastAuthMethod, sceneUpload, floorPlanSync, accountStorage, accountCache
├── constants/            # config.ts, routes.ts, storage keys
├── types/                # Tour/Scene/Hotspot/TourSettings domain types (+ hotspotContent.ts)
├── utils/                # cn(), coordinates (yaw/pitch ↔ degrees), helpers
├── assets/  test/  …
e2e/                      # playwright specs + fixtures + page-objects (+ .auth/ storage state, gitignored)
docs/                     # indexed by docs/README.md (features/, ai-features/, technical/, roadmap/, ux/)
public/  DESIGN.md  PRODUCT.md  AGENTS.md
```

## App Bootstrap & Provider Stack (`src/App.tsx`)

Outer → inner: `<ErrorBoundary>` → `<QueryProvider>` (TanStack + Devtools in DEV) → `<ThemeInitializer>` (applies `useUIStore().theme`) → `<GlobalErrorHandler>` → `<AuthInitializer>` (runs `checkAuth()`, subscribes to `onAuthExpired` → redirect to `/login?next=…`) → `<RouterProvider>` → `<Toaster>` / `<ConfirmDialog>` / `<OfflineIndicator>`.

**The router is never gated on `authStore.isLoading`.** Public routes (`/view/:id`, `/embed/:id`, the landing page) are anonymous by contract and must render while `checkAuth()` is still in flight — gating the whole router blanked the embedded viewer for the entire `/users/me` retry window. Routes that *do* depend on the session gate themselves: `ProtectedRoute` and `RootRedirect` render a `<PageLoader>` while `isLoading`.

Router is `createBrowserRouter` (`src/lib/router.tsx`). Entry pages (`HomePage`, auth pages, layouts, `ProtectedRoute`, `NotFoundPage`) are eagerly imported; all dashboard/tour pages are `lazy()` + `<LazyPage>` (Suspense + `ChunkErrorBoundary`). Vite `manualChunks` groups: react-vendor, router, tanstack, charts, forms, viewer, ui-vendor, network.

## Routing (`src/constants/routes.ts` + `src/lib/router.tsx`)

| Path | Component | Visibility |
|------|-----------|------------|
| `/` | `HomePage` (PublicLayout + `RootRedirect` → dashboard if authed) | public |
| `/login`, `/register`, `/forgot-password` | auth pages (AuthLayout) | public |
| `/auth/callback` | `AuthCallbackPage` (Google OAuth code exchange) | public, no chrome |
| `/view/:id` | `PublicTourPage` | **public** (the shareable tour URL) |
| `/embed/:id` | `EmbedTourPage` | public, chromeless (iframe) |
| `/local/:propertyId` | `LocalTourPage` | **DEV only** — renders `seed_properties/<id>/tour.json` |
| `/dashboard`, `/tours`, `/tours/create`, `/tours/:id/edit`, `/tours/:id`, `/tours/:id/analytics` | dashboard/tour pages | protected |
| `/media`, `/analytics`, `/profile`, `/settings` | app pages | protected |
| `*` | `NotFoundPage` | public |

> There is **no** `/tours/new` and **no** `/tour/:id` alias — only `/tours/create` and `/view/:id`. (The README mentions `/tour/:id`; the router does not register it.)

## State Management — Zustand (`src/stores/`)

- **`authStore`** — `user` (the generated `SelfUser`; `id` is an integer), `tokens`, `isAuthenticated`, `isLoading`; actions `login`, `loginWithPassword`, `verifyLoginOtp`, `setPasswordAndComplete`, `logout`, `fetchCurrentUser`, `checkAuth` (subscribes to Supabase `onAuthStateChange` once). `isAuthError` signs out only on 401/403/SESSION_EXPIRED — **5xx/network errors do NOT sign out** (survives transient backend outages).
- **`tourEditorStore`** — `currentTour`, `currentSceneId`, `selectedHotspotId`, panel flags, `hasUnsavedChanges`, and `pendingChanges` (tour fields only). There is **no** undo/redo stack. Scene/hotspot create/update/delete persist through `toursApi` endpoints inside the feature components and are deliberately not modelled as drafts; `mergeScenes` only mirrors fresh `[SCENES, tourId]` query data into the store.
- **`viewerStore`** — per-scope `currentSceneId` keyed `"${route}:${tourId}"` so public/embed viewers stay isolated.
- **`uiStore`** — `theme: 'light'|'dark'|'system'`, `sidebarCollapsed`, `toasts[]`; `persist` middleware (only `theme` + `sidebarCollapsed`); exports `applyTheme`.
- **`confirmStore`** — imperative `confirm()` replacing `window.confirm`, rendered by `<ConfirmDialog>`.

## Data Fetching — TanStack Query

`QueryClient` (`src/lib/queryClientInstance.ts`): `retry: false` for queries **and** mutations, `staleTime: 5m`, `gcTime: 10m`, `refetchOnWindowFocus: false`. Retries are intentionally disabled here because the **Axios interceptor already retries** 429/401/5xx — enabling both causes up to 9× attempts. `useQuery`/`useMutation` are called inline in pages/components (e.g. `TourEditPage`, `ToursPage`, `ProfilePage`).

## API Layer (`src/api/`)

`client.ts` — Axios instance (`baseURL: API_BASE_URL`, `timeout: API_TIMEOUT`). Request interceptor attaches `Authorization: Bearer <token>` from `supabaseAuth.getAccessToken()`, and **clears the default JSON `Content-Type` for `FormData` bodies** so uploads go out as real multipart (axios serializes FormData to JSON when a JSON content type is set — never set `multipart/form-data` by hand either, that omits the boundary). Response interceptor: **401** → one refresh retry then sign-out + `notifyAuthExpired()`; **429** → honor `Retry-After` / backoff (max 3); **5xx/network** → retry up to 3 with exponential backoff (disabled under `import.meta.env.TEST`). Both retry branches replay **idempotent methods only** and keep **separate counters**. `onAuthExpired(listener)` pub/sub.

Clients: `authApi` (`/auth/identifier-status`, `/auth/last-method`, `/users/me`), `toursApi` (tours, scenes, hotspots, floor-plans, publish/unpublish/duplicate/analytics/heatmap, `/public/tours/:id/*`, dashboard stats/realtime), `aiApi` (`/ai/tours/generate`, analyze, scene hotspots, descriptions, job get and cancel), `captureApi` (capture sessions), `uploadApi` (`/upload`, `/upload/media`, batch delete), `usersApi`, `customDomainsApi`. There is no collaboration, reel or public floor-plan client: the backend has no such routes.

### Contract rules (backend OpenAPI)

- **Generated types.** `openapi/openapi.json` is copied from the backend by `npm run api:sync` (override the path with `BACKEND_DIR`). `npm run api:types` writes `src/lib/api/schema.gen.ts` (`openapi-typescript`, `--default-non-nullable false`) and `src/lib/api/limits.gen.ts` (request length limits, read by `scripts/api-limits.mjs`). `src/types/*.ts` are aliases of `components["schemas"][...]`; only UI-only types are hand-written. Run both scripts after a backend contract change.
- **Errors.** Every non-2xx body is `{"error": {"code", "message", "details"}}`; a 422 carries `details.fields[{field, msg, type}]`. `src/api/errors.ts` is the only reader (`readErrorEnvelope`, `parseApiError`); the Axios interceptor puts the readable text in `error.message`. A toast after a failed write uses `errorText(error, fallback)` so the user sees the server's field errors, not a generic line. Branch on `code`, not on `message`.
- **Lists.** Every list is a `CursorPage` `{items, next_cursor, has_more, limit, total}`. `limit` is at most 100 and `total` is null unless `include_total=true`. Reads that need every row (`getScenes`, `getFloorPlans`, `getAllTours`) follow `next_cursor` through `fetchAllPages`; page-by-page screens (media library) pass the cursor back unchanged.
- **Strict keys.** Send only declared query and body keys (an unknown key is a 422). PATCH bodies carry only the changed keys; an explicit `null` clears a nullable field (`title`, `description`, `target_scene_id`, `content` of a hotspot). Deletes answer 204 with no body. There is no `success` flag.
- **Tours.** A new tour is a draft; publish and unpublish change `status` (no `status` in POST or PATCH). Scenes have no `order_index` on create (the server appends; order with `POST /tours/{id}/scenes/reorder`) and use `scene_metadata`. Floor plans live in the `floor_plans` table only: write through the floor-plan routes (`lib/floorPlanSync.ts`), read `tour.floor_plans`. Hotspot `content` holds exactly the keys of its type (no `kind`); link URLs may use http, https, mailto or tel.
- **Uploads.** Send `folder_type` (`StorageFolderType`) and `tour_id`. A scene panorama is `tour_original` + `tour_id`; other web uploads are `generic`. `property_*` and `scene` folders are rejected by `/upload`.
- **Capture.** `draft -> capturing -> review -> uploading -> processing -> ready`; `ready`, `failed` and `cancelled` are final. `GuidedCapturePage` sends `device_info.platform` `web`, follows the order above, and calls `captureApi.failSession` on an error.
- **Viewer events.** `POST /public/tours/:id/events` takes a JSON body with one of ten `ViewerEventType` values. A page view is counted by the GET; a `scene_view` needs numeric `event_data.yaw` and `pitch`.
- **Dates and ids.** Datetimes are UTC ISO strings ending in `Z`; convert to local time only to display them. Date-only fields (`daily_views[].date`, `start_date`, `end_date`) are `YYYY-MM-DD`: show them with `formatDateOnly` (never `new Date(value)`, which is UTC midnight and shows the previous day west of UTC) and send them with `format(date, 'yyyy-MM-dd')`. `User.id` and `Tour.user_id` are numbers.
- **Caches.** TanStack Query holds data in memory only. Browser storage for account data goes through `lib/accountStorage` (key = store name + schema version + account id). Sign-out and an account switch call `purgeAccountCaches()`. Persisted zustand stores carry a `version`. The service worker (`public/sw.js`, cache `360-tours-v2`) never caches `/api/` or `/ws/` paths, a request with an `Authorization` header, or a response marked `no-store` or `private` (the backend marks every account response `private, no-store`); `src/test/lib/serviceWorker.test.ts` pins this.

## 360° Viewer — Photo-Sphere-Viewer (`src/components/features/PanoramaViewer.tsx`)

Renders one panorama per `Scene`. Plugins: `MarkersPlugin` (always loaded, markers added after `isViewerReady` — PSV drops pre-ready markers), `GyroscopePlugin` + `StereoPlugin` (conditional on `tourSettings.enable_vr`). **No VirtualTourPlugin** — scene-to-scene navigation is parent-driven via `onHotspotClick`/`onSceneChange`; `setPanorama` transitions run through a serialized queue to avoid in-flight aborts.

`Hotspot.position` is in **degrees**, converted via `utils/coordinates.ts` (`viewerPositionToDegrees`/`degreesToViewerPosition`). Types: `navigation | info | audio | video | link | custom`. Hardening: `escapeHtml` for interpolated titles, `safeColor` (hex/rgb regex) and `safeSize` (8–256) before injecting into styles. Auto-rotate is hand-rolled via `requestAnimationFrame` (not a plugin) and respects `prefers-reduced-motion`. VR prefs persist under `360g:vr:{gyroscope,stereo}`.

## Auth

- Supabase client (`src/lib/supabaseAuth.ts`): `flowType: 'pkce'`, `persistSession`, `autoRefreshToken`, `detectSessionInUrl: false` (the app exchanges the OAuth code itself on `/auth/callback`), storageKey `STORAGE_KEYS.AUTH_TOKENS`. **Throws at import** if URL/key missing (non-test). Methods: password (phone + email), OTP (phone + email), Google (`signInWithGoogle` → `/auth/callback` → `exchangeCodeForSession`), `updatePassword`.
- Bearer token attached in the Axios request interceptor; 401 → one refresh retry → sign-out + auth-expired redirect.
- Route protection (`components/features/ProtectedRoute.tsx`): gates on `isAuthenticated`; optional `requiredRole?: 'user'|'agent'|'admin'` (admin always allowed; mismatch → dashboard). `App.tsx` redirects expired sessions to `/login?next=<path>`, skipping the blocklist `[LOGIN, REGISTER, AUTH_CALLBACK]`.
- `src/lib/lastAuthMethod.ts` remembers the last successful method + masked identifier (localStorage `360ghar:lastAuthMethod`).

## Realtime (WebSockets)

`useWebSocket` (generic, auth-gated, 25s ping) and `useAIJobWebSocket` / `useUserNotifications` connect to `${buildWebSocketBaseUrl()}/ws/jobs/:jobId` and `/ws/user` (ws(s) derived from `API_BASE_URL`). **The token is never in the URL**: the first frame after the socket opens is `{"type":"auth","token"}`. Frames are typed in `types/realtime.ts` and parsed by `utils/realtimeFrames.ts` (`job_update` `{job_id, data:{status, progress, error_message, result}}`, `notification` `{id, type, title, message, created_at}`, `connected`, `heartbeat`). The hooks auto-reconnect, except after close code 4001 (bad token) or 4004 (unknown job). There is no `/ws/tours` socket.

## Design System

`DESIGN.md` is canonical — warm/professional property-tech with an orange-red primary (`--color-primary-500: #FF5733`), light + dark (`.dark`), motion `cubic-bezier(0.4,0,0.2,1)`. Tokens live as CSS custom properties in `src/index.css`. Fonts (Clash Display / Satoshi / JetBrains Mono) load from Fontshare CDN in `index.html`. Use `cn()` + Tailwind semantic utilities over raw values; reach for `components/ui/` primitives first.

## Testing

- **Vitest** (`vitest.config.ts`): `jsdom`, `globals`, setup `src/test/setup.ts`, includes `src/**/*.{test,spec}.{ts,tsx}`. Coverage via v8 (thresholds are a deliberate low baseline — statements/lines 24%, functions 39%, branches 60% — raise as pages gain tests). `@` alias mirrored into the test config.
- **Playwright** (`playwright.config.ts`): `testDir ./e2e`, `baseURL http://localhost:3000`, projects `chromium`/`firefox`/`webkit`/`Mobile Chrome`/`Mobile Safari`/`chromium-authenticated` (uses `e2e/.auth/user.json`), all depending on a `setup` project. `webServer` runs `npm run dev` (or `npm run preview` in CI) on :3000. Specs cover ai-features, auth, dashboard, landing, performance, public-viewer, tour-create/edit, tours.

## Conventions

- **Imports:** `@/` → `src/` (tsconfig `paths` + Vite alias). E.g. `import { cn } from '@/utils'`.
- **Naming:** components `PascalCase.tsx`; hooks `useSomething.ts`; stores `somethingStore.ts`; tests `*.test.ts(x)` / `*.spec.ts(x)` co-located under `src/`.
- **ESLint** (`eslint.config.js`, flat): `@typescript-eslint/no-explicit-any: error`; `no-empty` allows empty catch; extends react-hooks + react-refresh.
- **Prettier** (`prettier.config.js`): `semi`, `singleQuote`, `tabWidth 2`, `trailingComma 'es5'`, `printWidth 100`, `arrowParens 'avoid'`, `endOfLine 'lf'`.
- **tsconfig:** `strict`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`; `noUnusedLocals`/`noUnusedParameters` are explicitly **off**.

## Gotchas

- The `/api` Vite proxy has **no rewrite rule** — it forwards `/api/*` verbatim to `http://localhost:3600`. Dev server runs on **:3000**.
- `seed_properties/` is gitignored; the dev-only `servePropertiesDevDir` Vite plugin serves it over `/seed_properties/*` to feed the `/local/:propertyId` route (spatial-tour harness) without uploading to Cloudinary. Not in the production build.
- Don't enable React Query `retry` — the Axios interceptor already retries; both on = 9× attempts.
- Don't sign users out on 5xx/network — only on 401/403/SESSION_EXPIRED (see `authStore.isAuthError`).
- Tour editor scene/hotspot edits persist via `toursApi`, not the deprecated `tourEditorStore` mutators or a single Save.
- Test fixtures (`src/test/fixtures.ts`) and the msw handlers (`src/test/mocks/handlers.ts`) build wire-shaped payloads; do not hand-write a `Tour` or `Scene` literal in a test.
- Add markers to the viewer only after `isViewerReady` (PSV drops markers added before ready).
- Always sanitize hotspot `color`/`size`/title HTML before interpolating into PSV config (`safeColor`/`safeSize`/`escapeHtml`).

## Key Docs

- `DESIGN.md` — UI tokens, component specs, motion, dark mode (source of truth for all UI work)
- `PRODUCT.md` — product scope, users, principles, anti-references, a11y targets (WCAG 2.1 AA)
- `docs/README.md` — indexes `features/`, `ai-features/`, `technical/{api-specification,database-schema}`, `roadmap/`, `ux/`. "Read this first": `roadmap/mvp.md`, `features/tour-creation.md`, `features/player-embed.md`, `ai-features/automatic-tour-creation.md`.
- `AGENTS.md` — agent workflow notes (commits, PRs, env hygiene).
