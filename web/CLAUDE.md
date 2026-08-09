# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Canonical guide.** `AGENTS.md` adds agent workflow notes; `DESIGN.md` is the UI source of truth; `PRODUCT.md` is the product/scope spec; `docs/README.md` indexes the full doc tree.

This app lives at `web/` inside the `360-tours` monorepo. The Flutter mobile client is a sibling at `../mobile` (see `../mobile/CLAUDE.md`); the two share a backend and Supabase auth, and the mobile app's `viewer`/`share` features load specific routes from this app at runtime (see root `../AGENTS.md` for the cross-app contract). Whole-repo concerns (root CI, dependabot) live at the repo root, not here.

## Project Overview

**360 Tours** (the web viewer/editor for the 360° virtual-tour product) is a React 19 + TypeScript SPA for creating, editing, publishing, and viewing 360° virtual property tours. Primary focus (per `PRODUCT.md`): AI-assisted tour generation (scene analysis, auto hotspots, descriptions), reliable tour editing, fast public viewing, and share/embed/QR simplicity. Secondary (present but de-prioritized): advanced analytics, floor plans, branding/white-label, video.

Backend is the shared 360Ghar FastAPI monolith. `../backend` here is a **gitignored local checkout** — the canonical source is `https://github.com/360ghar/360ghar-backend` (production deploys from `main`); client contracts live in `backend/docs/repo-contract.json` and the live OpenAPI at `https://api.360ghar.com/api/v1/openapi.json`. Auth is Supabase. Primary users: real-estate photographers, agencies, PMs, architects; public viewers are buyers/tenants.

## Tech Stack

- **React 19** + **TypeScript ~5.9** (strict), **Vite 7**, project-references tsconfig
- **Routing:** `react-router-dom 7` via `createBrowserRouter` + `RouterProvider`
- **Server state:** `@tanstack/react-query 5` (queries/mutations used inline in pages â€” there are **no** query hooks in `src/hooks/`)
- **Client state:** `zustand 5` (6 stores â€” see below)
- **Styling:** Tailwind CSS v4 (CSS-based config via `@tailwindcss/vite`, **no `tailwind.config.ts`**) + Radix UI primitives, composed with `class-variance-authority` + `clsx` + `tailwind-merge` (`cn()`)
- **Forms:** `react-hook-form 7` + `@hookform/resolvers` + `zod 4`
- **360Â° rendering:** `@photo-sphere-viewer/core 5.14` + `markers-plugin`, `gyroscope-plugin`, `stereo-plugin` (no VirtualTourPlugin)
- **HTTP:** `axios 1.18`
- **Other runtime:** `@dnd-kit/*` (drag-and-drop), `react-dropzone`, `recharts`, `date-fns`, `react-day-picker`, `qrcode`, `lucide-react`
- **Realtime:** in-app WebSocket hooks (`useWebSocket`, `useAIJobWebSocket`) for AI jobs + notifications
- **Test:** `vitest 3` + `@testing-library/react` + `jsdom` + `msw` (unit); `@playwright/test` (E2E)

## Commands

```bash
npm ci                        # install from package-lock.json
cp .env.example .env          # only VITE_* vars reach the client
npm run dev                   # Vite dev server on http://localhost:3000
npm run build                 # tsc -b && vite build â†’ dist/ (sourcemaps on, manual chunking)
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
| `VITE_ENABLE_ANALYTICS` | `true` | Feature flag (`=== 'true'`) |
| `VITE_ENABLE_VR_MODE` | `true` | Feature flag (gyro/stereo plugins) |
| `VITE_ENABLE_AI_FEATURES` | `true` | Feature flag |
| `VITE_MAX_UPLOAD_SIZE_MB` | `50` | Client upload cap |
| `VITE_ALLOWED_IMAGE_TYPES` | `image/jpeg,image/png,image/webp` | Accept list |
| `VITE_AUTH_REDIRECT_URL` | `window.location.origin/auth/callback` | Google OAuth redirect override |
| `VITE_APP_NAME` / `VITE_APP_VERSION` | `360 Tours` / `1.0.0` | Display metadata |

## Project Structure

```
src/
â”œâ”€â”€ main.tsx              # createRoot + <StrictMode>; imports index.css then App
â”œâ”€â”€ App.tsx               # provider stack (see below) + <RouterProvider>
â”œâ”€â”€ index.css             # Tailwind v4 + design tokens (:root / .dark CSS custom props)
â”œâ”€â”€ api/                  # Axios clients (client, auth, tours, ai, upload, users, collaboration, customDomains)
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ ui/               # shadcn/Radix primitives (Button, Dialog, Select, Sheet, â€¦)
â”‚   â”œâ”€â”€ features/         # tour editor + feature components (PanoramaViewer, Hotspot*, FloorPlan*, â€¦)
â”‚   â”œâ”€â”€ layout/           # PublicLayout, AuthLayout, DashboardLayout, Header, Sidebar
â”‚   â”œâ”€â”€ landing/          # marketing sections (incl. Demo360Viewer)
â”‚   â”œâ”€â”€ common/           # GlobalErrorHandler, MetaTags, OfflineIndicator, Skeletons
â”‚   â””â”€â”€ animations/       # useInView, useStaggerAnimation
â”œâ”€â”€ pages/                # route-level screens (lazy-loaded except entry pages)
â”œâ”€â”€ stores/               # zustand stores (auth, tourEditor, viewer, ui, collaboration, confirm)
â”œâ”€â”€ hooks/                # utility/IO hooks (NO tanstack-query wrappers)
â”œâ”€â”€ lib/                  # queryClient, QueryProvider, router, supabaseAuth, lastAuthMethod, sceneUpload
â”œâ”€â”€ constants/            # config.ts, routes.ts, storage keys
â”œâ”€â”€ types/                # Tour/Scene/Hotspot/TourSettings domain types (+ hotspotContent.ts)
â”œâ”€â”€ utils/                # cn(), coordinates (yaw/pitch â†” degrees), helpers
â”œâ”€â”€ assets/  test/  â€¦
e2e/                      # playwright specs + fixtures + page-objects (+ .auth/ storage state, gitignored)
docs/                     # indexed by docs/README.md (features/, ai-features/, technical/, roadmap/, ux/)
public/  DESIGN.md  PRODUCT.md  AGENTS.md
```

## App Bootstrap & Provider Stack (`src/App.tsx`)

Outer â†’ inner: `<ErrorBoundary>` â†’ `<QueryProvider>` (TanStack + Devtools in DEV) â†’ `<ThemeInitializer>` (applies `useUIStore().theme`) â†’ `<GlobalErrorHandler>` â†’ `<AuthInitializer>` (runs `checkAuth()`, subscribes to `onAuthExpired` â†’ redirect to `/login?next=â€¦`, shows spinner while loading) â†’ `<RouterProvider>` â†’ `<Toaster>` / `<ConfirmDialog>` / `<OfflineIndicator>`.

Router is `createBrowserRouter` (`src/lib/router.tsx`). Entry pages (`HomePage`, auth pages, layouts, `ProtectedRoute`, `NotFoundPage`) are eagerly imported; all dashboard/tour pages are `lazy()` + `<LazyPage>` (Suspense + `ChunkErrorBoundary`). Vite `manualChunks` groups: react-vendor, router, tanstack, charts, forms, three-vendor, viewer, ui-vendor, network.

## Routing (`src/constants/routes.ts` + `src/lib/router.tsx`)

| Path | Component | Visibility |
|------|-----------|------------|
| `/` | `HomePage` (PublicLayout + `RootRedirect` â†’ dashboard if authed) | public |
| `/login`, `/register`, `/forgot-password` | auth pages (AuthLayout) | public |
| `/auth/callback` | `AuthCallbackPage` (Google OAuth code exchange) | public, no chrome |
| `/view/:id` | `PublicTourPage` | **public** (the shareable tour URL) |
| `/embed/:id` | `EmbedTourPage` | public, chromeless (iframe) |
| `/local/:propertyId` | `LocalTourPage` | **DEV only** â€” renders `seed_properties/<id>/tour.json` |
| `/dashboard`, `/tours`, `/tours/create`, `/tours/:id/edit`, `/tours/:id`, `/tours/:id/analytics` | dashboard/tour pages | protected |
| `/media`, `/analytics`, `/profile`, `/settings` | app pages | protected |
| `*` | `NotFoundPage` | public |

> There is **no** `/tours/new` and **no** `/tour/:id` alias â€” only `/tours/create` and `/view/:id`. (The README mentions `/tour/:id`; the router does not register it.)

## State Management â€” Zustand (`src/stores/`)

- **`authStore`** â€” `user`, `tokens`, `isAuthenticated`, `isLoading`; actions `login`, `loginWithPassword`, `verifyLoginOtp`, `register`, `logout`, `fetchCurrentUser`, `checkAuth` (subscribes to Supabase `onAuthStateChange` once). `isAuthError` signs out only on 401/403/SESSION_EXPIRED â€” **5xx/network errors do NOT sign out** (survives transient backend outages).
- **`tourEditorStore`** â€” `currentTour`, `currentSceneId`, `selectedHotspotId`, panel flags, `hasUnsavedChanges`, undo/redo stacks (capped 50). Scene/hotspot draft mutators are `@deprecated` â€” persistence now flows through `toursApi` endpoints inside feature components, **not** TourEditPage Save.
- **`viewerStore`** â€” per-scope `currentSceneId` keyed `"${route}:${tourId}"` so public/embed viewers stay isolated.
- **`uiStore`** â€” `theme: 'light'|'dark'|'system'`, `sidebarCollapsed`, `toasts[]`; `persist` middleware (only `theme` + `sidebarCollapsed`); exports `applyTheme`.
- **`collaborationStore`** â€” tour activities + collaborators (backed by `collaborationApi`).
- **`confirmStore`** â€” imperative `confirm()` replacing `window.confirm`, rendered by `<ConfirmDialog>`.

## Data Fetching â€” TanStack Query

`QueryClient` (`src/lib/queryClientInstance.ts`): `retry: false` for queries **and** mutations, `staleTime: 5m`, `gcTime: 10m`, `refetchOnWindowFocus: false`. Retries are intentionally disabled here because the **Axios interceptor already retries** 429/401/5xx â€” enabling both causes up to 9Ã— attempts. `useQuery`/`useMutation` are called inline in pages/components (e.g. `TourEditPage`, `ToursPage`, `ProfilePage`).

## API Layer (`src/api/`)

`client.ts` â€” Axios instance (`baseURL: API_BASE_URL`, `timeout: API_TIMEOUT`). Request interceptor attaches `Authorization: Bearer <token>` from `supabaseAuth.getAccessToken()`. Response interceptor: **401** â†’ one refresh retry then sign-out + `notifyAuthExpired()`; **429** â†’ honor `Retry-After` / backoff (max 3); **5xx/network** â†’ retry up to 3 with exponential backoff (disabled under `import.meta.env.TEST`). `onAuthExpired(listener)` pub/sub.

Clients: `authApi` (`/auth/identifier-status`, `/auth/last-method`, `/users/me`), `toursApi` (tours, scenes, hotspots, floor-plans, publish/duplicate/analytics, `/public/tours/:id/*`, dashboard stats/realtime), `aiApi` (`/ai/tours/generate`, analyze, hotspots, descriptions, reel, jobs), `uploadApi`, `usersApi`, `collaborationApi`, `customDomainsApi`.

## 360Â° Viewer â€” Photo-Sphere-Viewer (`src/components/features/PanoramaViewer.tsx`)

Renders one panorama per `Scene`. Plugins: `MarkersPlugin` (always loaded, markers added after `isViewerReady` â€” PSV drops pre-ready markers), `GyroscopePlugin` + `StereoPlugin` (conditional on `tourSettings.enable_vr`). **No VirtualTourPlugin** â€” scene-to-scene navigation is parent-driven via `onHotspotClick`/`onSceneChange`; `setPanorama` transitions run through a serialized queue to avoid in-flight aborts.

`Hotspot.position` is in **degrees**, converted via `utils/coordinates.ts` (`viewerPositionToDegrees`/`degreesToViewerPosition`). Types: `navigation | info | audio | video | link | custom`. Hardening: `escapeHtml` for interpolated titles, `safeColor` (hex/rgb regex) and `safeSize` (8â€“256) before injecting into styles. Auto-rotate is hand-rolled via `requestAnimationFrame` (not a plugin) and respects `prefers-reduced-motion`. VR prefs persist under `360g:vr:{gyroscope,stereo}`.

## Auth

- Supabase client (`src/lib/supabaseAuth.ts`): `persistSession`, `autoRefreshToken`, `detectSessionInUrl`, storageKey `STORAGE_KEYS.AUTH_TOKENS`. **Throws at import** if URL/key missing (non-test). Methods: password (phone + email), OTP (phone + email), Google (`signInWithGoogle` â†’ `/auth/callback` â†’ `exchangeCodeForSession`), `updatePassword`.
- Bearer token attached in the Axios request interceptor; 401 â†’ one refresh retry â†’ sign-out + auth-expired redirect.
- Route protection (`components/features/ProtectedRoute.tsx`): gates on `isAuthenticated`; optional `requiredRole?: 'user'|'agent'|'admin'` (admin always allowed; mismatch â†’ dashboard). `App.tsx` redirects expired sessions to `/login?next=<path>`, skipping the blocklist `[LOGIN, REGISTER, AUTH_CALLBACK]`.
- `src/lib/lastAuthMethod.ts` remembers the last successful method + masked identifier (localStorage `360ghar:lastAuthMethod`).

## Realtime (WebSockets)

`useWebSocket` (generic, auth-gated, 25s ping) and `useAIJobWebSocket` / `useUserNotifications` connect to `${buildWebSocketBaseUrl()}/ws/jobs/:jobId?token=â€¦` (ws(s) derived from `API_BASE_URL`), parse `job_update`/`notification` frames, auto-reconnect.

## Design System

`DESIGN.md` is canonical â€” warm/professional property-tech with an orange-red primary (`--color-primary-500: #FF5733`), light + dark (`.dark`), motion `cubic-bezier(0.4,0,0.2,1)`. Tokens live as CSS custom properties in `src/index.css`. Fonts (Clash Display / Satoshi / JetBrains Mono) load from Fontshare CDN in `index.html`. Use `cn()` + Tailwind semantic utilities over raw values; reach for `components/ui/` primitives first.

## Testing

- **Vitest** (`vitest.config.ts`): `jsdom`, `globals`, setup `src/test/setup.ts`, includes `src/**/*.{test,spec}.{ts,tsx}`. Coverage via v8 (thresholds are a deliberate low baseline â€” statements/lines 24%, functions 39%, branches 60% â€” raise as pages gain tests). `@` alias mirrored into the test config.
- **Playwright** (`playwright.config.ts`): `testDir ./e2e`, `baseURL http://localhost:3000`, projects `chromium`/`firefox`/`webkit`/`Mobile Chrome`/`Mobile Safari`/`chromium-authenticated` (uses `e2e/.auth/user.json`), all depending on a `setup` project. `webServer` runs `npm run dev` (or `npm run preview` in CI) on :3000. Specs cover ai-features, auth, dashboard, landing, performance, public-viewer, tour-create/edit, tours.

## Conventions

- **Imports:** `@/` â†’ `src/` (tsconfig `paths` + Vite alias). E.g. `import { cn } from '@/utils'`.
- **Naming:** components `PascalCase.tsx`; hooks `useSomething.ts`; stores `somethingStore.ts`; tests `*.test.ts(x)` / `*.spec.ts(x)` co-located under `src/`.
- **ESLint** (`eslint.config.js`, flat): `@typescript-eslint/no-explicit-any: error`; `no-empty` allows empty catch; extends react-hooks + react-refresh.
- **Prettier** (`prettier.config.js`): `semi`, `singleQuote`, `tabWidth 2`, `trailingComma 'es5'`, `printWidth 100`, `arrowParens 'avoid'`, `endOfLine 'lf'`.
- **tsconfig:** `strict`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`; `noUnusedLocals`/`noUnusedParameters` are explicitly **off**.

## Gotchas

- The `/api` Vite proxy has **no rewrite rule** â€” it forwards `/api/*` verbatim to `http://localhost:3600`. Dev server runs on **:3000**.
- `seed_properties/` is gitignored; the dev-only `servePropertiesDevDir` Vite plugin serves it over `/seed_properties/*` to feed the `/local/:propertyId` route (spatial-tour harness) without uploading to Cloudinary. Not in the production build.
- Don't enable React Query `retry` â€” the Axios interceptor already retries; both on = 9Ã— attempts.
- Don't sign users out on 5xx/network â€” only on 401/403/SESSION_EXPIRED (see `authStore.isAuthError`).
- Tour editor scene/hotspot edits persist via `toursApi`, not the deprecated `tourEditorStore` mutators or a single Save.
- Add markers to the viewer only after `isViewerReady` (PSV drops markers added before ready).
- Always sanitize hotspot `color`/`size`/title HTML before interpolating into PSV config (`safeColor`/`safeSize`/`escapeHtml`).

## Key Docs

- `DESIGN.md` â€” UI tokens, component specs, motion, dark mode (source of truth for all UI work)
- `PRODUCT.md` â€” product scope, users, principles, anti-references, a11y targets (WCAG 2.1 AA)
- `docs/README.md` â€” indexes `features/`, `ai-features/`, `technical/{api-specification,database-schema}`, `roadmap/`, `ux/`. "Read this first": `roadmap/mvp.md`, `features/tour-creation.md`, `features/player-embed.md`, `ai-features/automatic-tour-creation.md`.
- `AGENTS.md` â€” agent workflow notes (commits, PRs, env hygiene).
