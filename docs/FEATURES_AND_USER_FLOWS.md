# 360-tours — Features & User Flows

> **Working-tree status (2026-08-01):** the 90-file refactor (tour editor
> persistence rework, auth hardening, mobile reliability) landed after this
> doc's last full sync. A re-verification pass is recorded in
> `docs/VERIFICATION_LOG.md` ("Status update — 2026-08-01"); several `Known gap`
> lines below are stale and marked there as FIXED. Re-verify against the code
> before acting on any gap line listed in that status table.

Canonical, code-derived inventory of every feature and user flow in the monorepo, written as user stories with expected behavior and acceptance criteria. This is the contract for verification and quality work: expected behavior comes from reading the code, and `docs/VERIFICATION_LOG.md` records which stories have been verified and what errors were found.

- **Web App — 360 Viewer** (`web/`): the React SPA — landing/auth, dashboard, tour creation (upload/guided capture/AI), tour editor (scenes, hotspots, settings, branding, floor plans), public viewing, embed/share, analytics, media library, lab.
- **Mobile App — 360 Tours** (`mobile/`): the Flutter client — guided 16-shot capture, on-device stitching, persistent upload queue, publish/share, in-app viewer, rooms/hotspots, LiDAR, floor plans, 3D generation, analytics.

Each section documents its route/screen inventory, then every feature as a user story with a numbered flow, expected behavior, and acceptance criteria derived from the code. A `**Known gap:**` line flags places where behavior differs from intent (with file:line evidence) — those feed the verification-and-fix pass.
# Web App — 360 Viewer: Features & User Flows

**360 Viewer** is the web app of the 360Ghar monorepo: a React 19 + TypeScript SPA (Vite 7) for creating, editing, publishing, and viewing 360° virtual property tours, backed by the shared FastAPI backend (`/api/v1`) with Supabase auth. Rendering uses `@photo-sphere-viewer` (markers/gyroscope/stereo plugins); server state is TanStack Query, client state is Zustand. The app is an internal tool gated to staff roles (`agent`/`admin`), while public viewers (buyers/tenants) consume published tours via `/view/:id`, `/embed/:id`, and `/view3d/:id` — the same routes the Flutter mobile app loads in its WebView (byte-parity contract with `mobile/`).

**How to read this doc:** the route inventory maps every registered route to its page file; each feature below is written as a user story with a concrete numbered flow, expected behavior, and testable acceptance criteria, all derived from the code. A `**Known gap:**` line at the end of a feature flags places where the code behaves differently from intent (each carries file:line evidence); those are inputs for a later verification-and-fix pass, not fixes made here. API endpoints are named as `<METHOD /path>`; all paths are relative to the API base (`/api/v1`).

## Page / Route Inventory

| Route | Page file | Purpose (one line) | Visibility |
|---|---|---|---|
| `/` | `src/pages/HomePage.tsx` | Marketing landing (hero/demo, AI showcase, features, pricing, CTA); redirects to `/dashboard` when authenticated | public |
| `/login` | `src/pages/auth/LoginPage.tsx` | Sign in via phone/email (password or OTP) or Google | public |
| `/register` | `src/pages/auth/RegisterPage.tsx` | Create account (identifier + name + OTP + set password) | public |
| `/forgot-password` | `src/pages/auth/ForgotPasswordPage.tsx` | Reset password via OTP (phone/email) | public |
| `/auth/callback` | `src/pages/auth/AuthCallbackPage.tsx` | Google OAuth code exchange + staff-gate, then redirect; no chrome | public |
| `/dashboard` | `src/pages/dashboard/DashboardPage.tsx` | Overview: stats cards, storage bar, weekly views chart, recent tours | protected |
| `/tours` | `src/pages/tours/ToursPage.tsx` | Tour list: search, status filter, grid/list, cursor pagination, row actions | protected |
| `/tours/create` | `src/pages/tours/TourCreatePage.tsx` | Create tour: choose path (guided capture / upload / AI), info form, upload scenes | protected |
| `/tours/capture` | `src/pages/tours/GuidedCapturePage.tsx` | Guided in-browser camera capture (session setup) | protected |
| `/tours/capture/:sessionId` | `src/pages/tours/GuidedCapturePage.tsx` | Resume an existing capture session | protected |
| `/tours/:id/edit` | `src/pages/tours/TourEditPage.tsx` | Tour editor: scenes, hotspots, settings, branding, floor plans, AI, publish, collaborators | protected |
| `/tours/:id` | `src/pages/tours/TourViewPage.tsx` | Tour detail: viewer preview, stats, scenes grid, share/reel entry points | protected |
| `/tours/:id/analytics` | `src/pages/tours/TourAnalyticsPage.tsx` | Per-tour analytics: date range, charts, heatmap, CSV/JSON export | protected |
| `/media` | `src/pages/media/MediaLibraryPage.tsx` | Media library: browse/search/filter/delete/preview uploaded files | protected |
| `/analytics` | `src/pages/analytics/AnalyticsPage.tsx` | Cross-tour analytics: overview stats, tour selector, comparison table | protected |
| `/profile` | `src/pages/settings/ProfilePage.tsx` | Profile: photo upload, name/phone, account status | protected |
| `/settings` | `src/pages/settings/SettingsPage.tsx` | Settings: theme, notifications, change password, account deletion note | protected |
| `/lab` | `src/pages/lab/SplatLabPage.tsx` | Splat Lab: Gaussian-splat pipeline jobs from 360° video | protected |
| `/lab/editor` | `src/pages/lab/DollhouseEditorPage.tsx` | Dollhouse editor: compose multiple splat models + door connections in 3D | protected |
| `/lab/kitchen-tour` | `src/pages/lab/KitchenTourPage.tsx` | Constrained kitchen GS tour (standpoint navigation demo) | protected |
| `/view/:id` | `src/pages/PublicTourPage.tsx` | Public tour viewer (the shareable URL; SEO meta + analytics) | public |
| `/view3d/:id` | `src/pages/View3DPage.tsx` | Minimal 3D-world viewer (splat mesh / hosted viewer iframe) | public |
| `/embed/:id` | `src/pages/EmbedTourPage.tsx` | Chromeless embeddable viewer with parent-window `postMessage` protocol | public |
| `/local/:propertyId` | `src/pages/LocalTourPage.tsx` | Dev-only harness rendering `seed_properties/<id>/tour.json` (`?calibrate=1` for position readout) | dev-only |
| `*` | `src/pages/NotFoundPage.tsx` | 404 fallback with Go Home / Go Back | public |

## Features & User Stories

### 1. Landing & Marketing

#### Feature: Marketing landing page
- **Pages/Components:** `pages/HomePage.tsx`, `components/layout/PublicLayout.tsx`, `components/landing/*` (HeroSection, Demo360Viewer, SocialProofBar, AIShowcase, HowItWorks, FeaturesGrid, PricingSection, FinalCTA, AnimatedCounter), `components/common/MetaTags.tsx`
- **User flow:**
  1. Anonymous visitor opens `/`; `RootRedirect` in `lib/router.tsx` passes them through (authenticated users are redirected to `/dashboard` instead).
  2. `HeroSection` renders with an auto-rotating 360 demo (`Demo360Viewer` loads a remote sample panorama into a bare Photo-Sphere-Viewer; auto-rotate pauses on interaction and after 2s idle, respects `prefers-reduced-motion`).
  3. Visitor scrolls through SocialProofBar (logo marquee), AIShowcase (AI features bento), HowItWorks (3-step), FeaturesGrid, PricingSection (Free + Pro), FinalCTA.
  4. In-page anchors (`#features`, `#pricing`, `#how-it-works`) scroll to sections; header "Sign in" → `/login`, "Get Started" → `/register`; theme toggle flips light/dark/system via `useUIStore`.
  5. Visitor exits; nothing persists server-side (only the theme preference in `localStorage`).
- **User story:** "As a potential customer, I want to understand what 360 Viewer does and start a trial, so that I can evaluate creating virtual tours."
- **Expected behavior:**
  - Landing loads fast (eager `HomePage`, no auth calls).
  - `MetaTags` sets title/description/keywords for SEO.
  - The demo viewer auto-rotates but stops when the user interacts; reduced-motion users see a static panorama.
  - Authenticated users hitting `/` land on `/dashboard`, never the landing page.
  - Mobile menu (hamburger) exposes the same links and closes on Escape.
- **Acceptance criteria:**
  - Given an anonymous user at `/`, when the page loads, then hero, social proof, AI showcase, how-it-works, features, pricing, and CTA sections render in order.
  - Given an authenticated user at `/`, when the page loads, then the browser navigates to `/dashboard`.
  - Given a click on "Get Started", then the user lands on `/register`.
  - Given a click on the theme toggle, then light/dark/system mode applies and persists across reloads.

#### Feature: 404 page
- **Pages/Components:** `pages/NotFoundPage.tsx`
- **User flow:** 1. User hits any unregistered path. 2. Router `*` catch-all renders NotFoundPage. 3. "Go Home" navigates to `/`; "Go Back" uses `history.back()` when history exists, else `/`.
- **User story:** "As a visitor, I want a clear fallback when I mistype a URL, so that I can get back to the app."
- **Expected behavior:** Always renders for unknown routes (eagerly loaded, no spinner); both buttons behave as described.
- **Acceptance criteria:**
  - Given an unknown URL, when loaded, then a 404 page with "Go Home" and "Go Back" buttons appears.
  - Given history length > 1, when "Go Back" is clicked, then the previous page loads; otherwise `/` loads.

### 2. Authentication & Account

#### Feature: Sign in (identifier → password or OTP)
- **Pages/Components:** `pages/auth/LoginPage.tsx`, `components/features/GoogleSignInButton.tsx`, `stores/authStore.ts`, `api/auth.ts`, `lib/supabaseAuth.ts`, `lib/lastAuthMethod.ts`, `utils/validation.ts`, `lib/authErrors.ts`
- **User flow:**
  1. User opens `/login` (optionally with `?next=` or router state `from` from `ProtectedRoute`); the identifier step shows Google sign-in, a phone/email channel toggle, and the identifier input. The last-used method is pre-selected from `localStorage` (`360ghar:lastAuthMethod`).
  2. User submits identifier → `POST /auth/identifier-status` (`checkIdentifierStatusSafe`; on network/5xx the flow stops with "identifier status unavailable" instead of falling through).
  3. If the backend says `next_step=password` (or verified+has_password) → password step. `POST`-equivalent Supabase `signInWithPassword` via `authStore.loginWithPassword`, then `GET /users/me` hydrates the user, last-method is recorded (`POST /auth/last-method`, best-effort), and the user is navigated to the safe return path (blocklist guards `/login`, `/register`, `/auth/callback`, `//`).
  4. Otherwise (unverified existing user, or unknown identifier treated as signup) → OTP step: Supabase `requestEmailOtp`/`requestOtp` (`shouldCreateUser: !exists`), user enters the 6-digit code (`useWebOtp` autofill on Android Chrome), `authStore.verifyLoginOtp` establishes the session.
  5. If the account has no password (passwordless/unknown identifier), a mandatory, non-skippable "set password" step runs against the OTP session (`setPasswordAndComplete` → `supabaseAuth.updatePassword`), then navigates to the return path.
  6. User exits by navigating away; session persists via Supabase (`360ghar:auth-tokens` storage key).
- **User story:** "As a staff user, I want to sign in with phone/email via password or OTP, so that I can access my tours securely from any device."
- **Expected behavior:**
  - Errors render inline (`role="alert"`) with mapped Supabase messages; OTP resend shows a 30s cooldown.
  - A failed identifier-status call never creates an account or sends an OTP.
  - Google-callback failures surfaced from `/login?error=...` render as a banner.
  - Return path is validated (`isSafeReturnPath`) and defaults to `/dashboard`.
- **Acceptance criteria:**
  - Given a verified account with a password, when the correct password is entered, then the user reaches the return path and the header shows their name.
  - Given an unknown identifier, when "Continue" is clicked, then an OTP is sent and login completes only after a set-password step.
  - Given an invalid OTP, when verified, then an inline error appears and the step is not advanced.
  - Given a 5xx on identifier-status, when continuing, then the user sees the "unavailable" message and no OTP is sent.

#### Feature: Create account (register)
- **Pages/Components:** `pages/auth/RegisterPage.tsx`, `stores/authStore.ts`, `api/auth.ts`
- **User flow:**
  1. User opens `/register`, picks phone or email channel, enters full name + identifier and accepts Terms/Privacy (client checkbox with error state; no server fetch).
  2. "Send verification code" → Supabase `requestEmailOtp`/`requestOtp` with `shouldCreateUser: true` and `data: { full_name }`.
  3. OTP step: user enters code (autofill supported); `verifyEmailOtp`/`verifyOtp` establishes the session.
  4. Set-password step: password + confirmation validated (zod schema, min length), `supabaseAuth.updatePassword` runs on the OTP session, `fetchCurrentUser()` hydrates, then navigation to `/dashboard` (`replace`).
  5. User exits to the app; new account is active immediately.
- **User story:** "As a new staff member, I want to register with my phone or email, so that I can start creating tours."
- **Expected behavior:**
  - Full name is required; terms checkbox is required; both surface inline errors.
  - Resend OTP has a 30s cooldown and only starts after a confirmed send.
  - Any error keeps the user on the current step.
- **Acceptance criteria:**
  - Given an unverified identifier and valid inputs, when the OTP is verified, then the user sets a password and lands on `/dashboard`.
  - Given mismatched passwords, when submitting step 3, then an inline error blocks submission.
  - Given an unchecked terms box, when submitting step 1, then an inline terms error appears.
- **Known gap:** Registration never checks identifier status and always sends the OTP with `shouldCreateUser: true`; for an already-existing identifier the OTP can be verified and step 3's `updatePassword` then **overwrites that existing account's password**, hijacking it (RegisterPage.tsx:112-146).

#### Feature: Password reset (forgot password)
- **Pages/Components:** `pages/auth/ForgotPasswordPage.tsx`, `api/auth.ts`
- **User flow:**
  1. User opens `/forgot-password` (optionally pre-filled from LoginPage route state), picks channel, enters identifier.
  2. `POST /auth/identifier-status` decides existence (network failure → "unavailable" error, no OTP). If the identifier does not exist, an error is shown and the flow stops.
  3. Existing identifier → Supabase `requestOtp`/`requestEmailOtp` (`shouldCreateUser: false`), then the verify step checks the OTP (`verifyOtp`/`verifyEmailOtp`) → reset step.
  4. Reset step: new password + confirmation validated, `supabaseAuth.updatePassword` applied → success screen with "Back to sign in".
- **User story:** "As a user who forgot their password, I want to reset it with an OTP, so that I can regain access to my account."
- **Expected behavior:** OTP resend with cooldown; errors keep the user on the current step; success screen is a dead-end with a link to `/login`.
- **Acceptance criteria:**
  - Given a valid existing identifier, when OTP is verified, then the user can set a new password and sees the success screen.
  - Given a wrong OTP, when verified, then an inline error appears and the user stays on the verify step.
- **Known gap:** The request step reveals whether an identifier has an account ("No account found with this email or phone…", ForgotPasswordPage.tsx:113), enabling account enumeration.

#### Feature: Google OAuth sign-in & callback
- **Pages/Components:** `pages/auth/LoginPage.tsx`, `pages/auth/RegisterPage.tsx`, `pages/auth/AuthCallbackPage.tsx`, `components/features/GoogleSignInButton.tsx`, `lib/supabaseAuth.ts`
- **User flow:**
  1. User clicks "Continue with Google" on `/login` or `/register`; the return path is stashed in `sessionStorage` (`stashOAuthNext`) and the browser redirects to Google (`signInWithGoogle`).
  2. Google redirects back to `/auth/callback?code=…`; `AuthCallbackPage` (no chrome) runs `exchangeCodeForSession`, then `GET /users/me`.
  3. Staff gate: only roles `agent`/`admin` proceed; anyone else is signed out and bounced to `/login?error=not_staff`.
  4. Staff users get `setLastAuthMethod('google', …)` + `POST /auth/last-method`, then navigate to the stashed return path (default `/dashboard`). Errors navigate to `/login?error=…` with a mapped message.
- **User story:** "As a staff user, I want to sign in with my Google account, so that I skip password entry and land where I was going."
- **Expected behavior:**
  - `?error=not_staff` and `?error=auth` render friendly messages on the login page.
  - The return path survives the OAuth round trip via sessionStorage.
  - Double-invocation of the callback effect is guarded by a `handledRef` (StrictMode safety).
- **Acceptance criteria:**
  - Given a staff Google account, when the callback completes, then the user lands on the stashed path with a session.
  - Given a non-staff Google account, when the callback completes, then the session is cleared and `/login?error=not_staff` is shown.
  - Given a callback without a `code`, when loaded, then the user is redirected to `/login?error=auth`.
- **Known gap:** The return path is consumed at AuthCallbackPage.tsx:38 (`consumeOAuthNext`) inside an effect that depends on a `handledRef` guard to survive React StrictMode double-mounting; the next-path handling is fragile in dev (the stash can be consumed while the effect re-runs).

#### Feature: Session lifecycle & route protection
- **Pages/Components:** `components/features/ProtectedRoute.tsx`, `stores/authStore.ts`, `api/client.ts`, `lib/router.tsx`, `App.tsx`
- **User flow:**
  1. On boot, `AuthInitializer` runs `checkAuth()` (restores Supabase session, subscribes to `onAuthStateChange`, hydrates `GET /users/me`); a spinner shows until done.
  2. Every protected route is wrapped in `ProtectedRoute`: loading → profile-hydration wait → redirect to `/login` (with `from` state) when unauthenticated → optional role check (`requiredRole`; non-matching non-admin users go to `/dashboard`).
  3. Axios attaches `Authorization: Bearer` to every request. On 401 the interceptor refreshes the token once and retries; if that fails (or the token retry budget is exhausted) it signs out and fires `onAuthExpired` (client.ts:89-130). `App.tsx` then hard-redirects to `/login?next=<current path>` (blocklist: login/register/callback). 429s honor `Retry-After` (max 3), 5xx/network retry with exponential backoff (max 3).
  4. User clicks Logout in the header menu → `authStore.logout()` → redirect to `/login`.
- **User story:** "As a user, I want my session to be restored, refreshed, and expired cleanly, so that I never see broken data and am never stuck on a dead page."
- **Expected behavior:** 5xx/network failures do **not** sign the user out (only 401/403/SESSION_EXPIRED); retries are capped; expired sessions redirect with a `next` return path.
- **Acceptance criteria:**
  - Given an unauthenticated visitor on `/tours`, when the page loads, then they are redirected to `/login` and after signing in return to `/tours`.
  - Given an expired access token on a protected API call, when the request is retried, then one refresh attempt happens before sign-out.
  - Given a 500 on a dashboard call, when the request completes, then the user stays signed in and sees an error state.
- **Known gap:** Public pages share the same authed Axios client, so a 401 from a public endpoint (e.g. `/public/tours/:id`) while a session exists still triggers the refresh→sign-out cascade, logging a signed-in user out of a public tour view (api/client.ts:89-130).

### 3. Dashboard & Tour Management

#### Feature: Dashboard overview
- **Pages/Components:** `pages/dashboard/DashboardPage.tsx`
- **User flow:**
  1. User lands on `/dashboard` after login.
  2. Page fetches `GET /dashboard/stats` (total/published tours, total views, storage used/limit), `GET /tours?limit=5` (recent tours), and `GET /dashboard/realtime` (recent daily views) in parallel; skeletons show while loading.
  3. User reads the welcome header, four stat cards, storage progress bar, "Views This Week" line chart, and the recent-tours list (thumbnail, views, relative updated time, status badge).
  4. "Create Tour" → `/tours/create`; a recent tour row → `/tours/:id`; "View all" → `/tours`. Error states offer "Try again" (refetch) per widget.
  5. User exits to any nav item; nothing persists locally.
- **User story:** "As a tour creator, I want a snapshot of my tours and views at a glance, so that I know what needs attention."
- **Expected behavior:** Stats failures render a scoped error card with retry, not a blank page; storage % is capped at 100; each widget refetches independently.
- **Acceptance criteria:**
  - Given a user with tours, when `/dashboard` loads, then four stat cards, storage progress, a views chart, and up to 5 recent tours render.
  - Given a stats error, when the page loads, then an error card with "Try again" appears and retry refetches.
  - Given a click on "Create Tour", then the user navigates to `/tours/create`.

#### Feature: Tour list (browse, search, filter, paginate)
- **Pages/Components:** `pages/tours/ToursPage.tsx`
- **User flow:**
  1. User opens `/tours`; `GET /tours` runs with `limit=12`, cursor, debounced search (300ms), and status filter.
  2. User searches by title/description (query key resets to page 1) and filters by status (`TOUR_STATUS_OPTIONS`).
  3. User toggles grid/list view and pages with Previous/Next (a cursor-history stack enables going back); the page shows "Showing N of M tours".
  4. Each card/row shows thumbnail, status badge (published/archived/draft), views, scene count, updated time; the card menu and list actions expose Edit, Duplicate, View Live (published only), Archive/Unarchive, Delete.
  5. Empty states branch: no tours at all vs. no matches (with "Clear filters").
- **User story:** "As a creator with many tours, I want to search, filter, and page through them, so that I can quickly find the one to work on."
- **Expected behavior:** Search/filter changes reset pagination; mutations (delete/duplicate/archive) invalidate the tours query and show toasts; destructive deletes require confirmation via the app `confirm()` dialog.
- **Acceptance criteria:**
  - Given a search term, when typed, then results filter after 300ms and pagination resets.
  - Given an archived tour, when "Unarchive" is clicked, then its status becomes `draft` and the list refreshes.
  - Given a delete confirmation accepted, when Delete is clicked, then `DELETE /tours/:id` runs and the list refreshes; on rejection nothing changes.

#### Feature: Tour actions (duplicate, archive, delete, view live)
- **Pages/Components:** `pages/tours/ToursPage.tsx`, `stores/confirm.ts`
- **User flow:** 1. User opens the row/card menu. 2. Duplicate → `POST /tours/:id/duplicate`, list refreshes, toast on error only. 3. Archive/Unarchive → `PATCH /tours/:id {status: archived|draft}`, list refreshes. 4. Delete → confirm dialog → `DELETE /tours/:id`. 5. View Live → opens `/view/:id` in a new tab (published only).
- **User story:** "As a creator, I want to duplicate, archive, or delete tours, so that I can manage my portfolio without losing work accidentally."
- **Expected behavior:** All mutations invalidate `[tours]` query keys; failures surface error toasts.
- **Acceptance criteria:**
  - Given a published tour, when View Live is clicked, then `/view/:id` opens in a new tab.
  - Given a delete confirmation, when Delete is accepted, then the tour is removed; when cancelled, nothing changes.

#### Feature: Tour detail & preview
- **Pages/Components:** `pages/tours/TourViewPage.tsx`, `components/features/PanoramaViewer.tsx`, `components/features/ShareModal.tsx`, `components/features/ai/ReelGeneratorModal.tsx`
- **User flow:**
  1. User opens `/tours/:id`; `GET /tours/:id` and `GET /tours/:id/scenes` load in parallel.
  2. Header shows title/status/description with Analytics, Share (disabled until published, with tooltip), Create Reel (disabled without scenes), and Edit Tour buttons.
  3. A live `PanoramaViewer` preview renders the first scene (with hotspots); stat cards show views/likes/shares/scenes; a scenes grid and details (created/updated/published, visibility, auto-rotate, VR mode) render below.
  4. Share opens the ShareModal; Create Reel opens the reel generator; Analytics → `/tours/:id/analytics`; Edit Tour → `/tours/:id/edit`.
- **User story:** "As a creator, I want a full read-only view of a tour with a working preview, so that I can check it before editing or sharing."
- **Expected behavior:** Missing tour shows "Tour not found" with a back link; the preview uses the first scene; stats fall back to `tour.view_count` etc.
- **Acceptance criteria:**
  - Given a published tour, when the page loads, then a working 360 preview and four stat cards render.
  - Given a draft tour, when Share is clicked, then the button is disabled with a "Publish the tour to share it" tooltip.
  - Given a tour with no scenes, when Create Reel is clicked, then it is disabled with a tooltip.

### 4. Tour Creation (Upload & Guided Capture)

#### Feature: Create-tour wizard
- **Pages/Components:** `pages/tours/TourCreatePage.tsx`, `utils/validation.ts` (tourSchema), `constants/routes.ts`
- **User flow:**
  1. User opens `/tours/create` (or clicks Create Tour / New Tour); a three-card chooser offers "Guided capture" (→ `/tours/capture`), "Upload panoramas" (→ info step), and "AI generate" (→ AITourWizard).
  2. Info step: title (required), description, defaults `status=draft`, `visibility=private`, `settings=DEFAULT_TOUR_SETTINGS`; submit → `POST /tours` (or `PATCH /tours/:id` when returning to edit an already-created tour).
  3. Upload step: drag-drop or file picker accepts images (JPG/PNG/WebP, ≤50MB per `VITE_MAX_UPLOAD_SIZE_MB`); invalid files are marked `error` with a reason; the file list shows per-file progress.
  4. "Upload N Files" → each file: `POST /upload` (folder `scenes`, visibility `public`) then `POST /tours/:id/scenes` (title = filename without extension). Overall progress bar = bytes-based.
  5. When nothing is pending and not uploading, "Continue to Editor" → `/tours/:id/edit`. "Edit Info" returns to the info step pre-filled. The AI Generate button is available on non-chooser steps.
- **User story:** "As a creator, I want to create a tour shell and batch-upload panoramas, so that I can start editing quickly."
- **Expected behavior:** Parallel uploads (`Promise.allSettled`), per-file success/error states, upload status label ("X uploaded, Y files need attention"), invalid files removable.
- **Acceptance criteria:**
  - Given valid images, when upload completes, then each file becomes a scene and the tour list refreshes.
  - Given an invalid file type, when added, then the file is marked with an error and is not uploaded.
  - Given a tour already created, when "Edit Info" then submit, then `PATCH /tours/:id` runs and the user returns to upload.
- **Known gap:** Failed uploads cannot be retried (only removed) and, because "Continue to Editor" shows whenever `!isUploading && pendingCount === 0` — which is also true when **all** files errored — the user can continue with a zero-scene tour (TourCreatePage.tsx:546-548).

#### Feature: Guided capture session
- **Pages/Components:** `pages/tours/GuidedCapturePage.tsx`, `api/capture.ts`, `api/upload.ts`
- **User flow:**
  1. User picks "Guided capture" (or opens `/tours/capture`), enters a session title and first room name, reads the how-it-works list, and clicks "Start camera" (requests camera + iOS orientation permission inside the gesture).
  2. `POST /capture-sessions` creates a session with a default plan (1 room, 1 center waypoint, device info); the URL becomes `/tours/capture/:sessionId` (`replace`).
  3. Camera phase: live video with 8 discrete yaw targets (0–315°). The user turns to each highlighted direction and captures; each capture is drawn to a canvas, JPEG-encoded (0.92 quality), stored **locally** as a frame with yaw/pitch metadata and a preview URL; level hint shows tilt via `deviceorientation` (beta−90), green ≤20°.
  4. Review phase: grid of captured frames with per-yaw labels; retake by returning to camera, remove individual frames.
  5. "Upload & create tour": `PATCH /capture-sessions/:id {status: uploading}` → per frame `POST /upload` + `POST /capture-sessions/:id/frames` (pose metadata) → `POST /capture-sessions/:id/complete` → `POST /tours` (draft, private) → `POST /tours/:id/scenes` per frame ("Room · yaw°").
  6. Done phase: "Open tour editor" → `/tours/:id/edit`, "Back to tours", or "New capture" (resets to setup).
- **User story:** "As a photographer on-site, I want to capture a room with my phone camera and have frames turned into a draft tour, so that I don't need a separate 360 camera."
- **Expected behavior:** Retakes replace the same yaw; already-uploaded frames are skipped on retry after partial failure; on pipeline failure the session is marked `failed` with an error message and the user returns to review.
- **Acceptance criteria:**
  - Given a granted camera, when 8 yaws are captured, then a "Continue to review" prompt appears.
  - Given a successful upload, when the pipeline finishes, then a draft tour with one scene per frame is created and the editor link works.
  - Given a resumed session URL, when the page loads, then the session title is restored and the camera phase starts.
- **Known gap:** Frames live only in component state; on reload of `/tours/capture/:sessionId` the resume effect restores the session title/phase but **not** the captured frames, so all captures are lost (GuidedCapturePage.tsx:183-200).

### 5. AI Tour Generation

#### Feature: AI tour wizard (generate a full tour)
- **Pages/Components:** `components/features/ai/AITourWizard.tsx`, `api/ai.ts` (generateTour), `components/features/ai/AIJobStatus.tsx`, `lib/sceneUpload.ts`
- **User flow:**
  1. User opens the wizard from TourCreatePage ("AI generate" card, or header button on info/upload steps). Step 1: drag-drop images (JPG/PNG/WebP, ≤50MB, ≤50 files; rejections combined into one message).
  2. Step 2 (optional title/description) → Step 3 (toggles: auto-detect rooms, auto-place hotspots, auto-generate descriptions; summary list).
  3. "Generate Tour" → `POST /ai/tours/generate` (multipart; upload progress shown) returns a job id; the processing step renders `AIJobStatus` (WebSocket `ws/jobs/:jobId` + 2s polling fallback) with a Cancel button (`POST /ai/jobs/:id/cancel`).
  4. On completion, the review step shows the generated tour title + scenes; "Complete" calls `onComplete` (TourCreatePage navigates to `/tours/:id/edit` and invalidates tour queries).
- **User story:** "As a busy creator, I want AI to build a whole tour from raw images, so that I skip manual setup."
- **Expected behavior:** Wizard state resets on close; failures return to the options step with an error; invalid files are rejected with reasons; count cap enforced.
- **Acceptance criteria:**
  - Given ≥1 valid image, when "Generate Tour" is clicked, then a job starts and progress is shown.
  - Given job completion with a tour+scenes payload, when the review step is reached, then "Complete" navigates to the editor.
  - Given a job failure, when the status flips to failed, then the user returns to options with the error message.
- **Known gap:** Closing the dialog (X / overlay / Cancel) calls `handleClose`, which clears wizard state but never cancels a running job — the backend job continues orphaned (AITourWizard.tsx:236-249).

#### Feature: AI job status monitoring
- **Pages/Components:** `components/features/ai/AIJobStatus.tsx`, `hooks/useAIJobWebSocket.ts`, `api/ai.ts` (getJobStatus, cancelJob)
- **User flow:** 1. A job id is passed in. 2. Component fetches `GET /ai/jobs/:id`, subscribes to the WebSocket, and falls back to 2s polling when the socket is unavailable (grace period 5s while connecting). 3. Progress bar, status badge, job-type label, estimated/actual duration, error message, and (optionally) a Cancel button render. 4. Terminal states (`completed`/`failed`/`canceled`) invoke `onComplete`/`onError` exactly once.
- **User story:** "As a user running AI jobs, I want live progress with cancellation, so that I know when results are ready and can stop mistakes."
- **Expected behavior:** WebSocket icon indicates realtime vs polling; terminal callbacks fire once per job id.
- **Acceptance criteria:**
  - Given a processing job, when the socket is connected, then progress updates without polling.
  - Given a Cancel click, when the job is cancellable, then `POST /ai/jobs/:id/cancel` runs and `onCancel` fires.

#### Feature: AI scene analysis
- **Pages/Components:** `components/features/ai/SceneAnalysis.tsx`, `components/features/ai/AiRetryError.tsx`, `api/ai.ts` (analyzeScenes)
- **User flow:**
  1. User opens "AI Scene Analysis" from the editor More menu; the dialog shows scene count and "Start Analysis".
  2. `POST /ai/tours/:id/analyze` → job; `AIJobStatus` monitors it.
  3. Results list per scene: room type with confidence (icon + label), suggested title, quality score, quality issues, detected features (badges). All scenes pre-selected; Apply Titles/Apply Descriptions checkboxes control what is applied; Select/Deselect all.
  4. "Apply to N Scenes" → `handleApplySceneAnalysis` in TourEditPage issues `PATCH /scenes/:id` per selected scene (title/description), invalidates scenes, and toasts success/failure.
- **User story:** "As a creator, I want AI to label my rooms and flag quality issues, so that my tours are organized and presentable."
- **Expected behavior:** Re-analyze reruns the job; "no results returned" state offers re-analyze; apply is disabled with zero selection or both toggles off.
- **Acceptance criteria:**
  - Given scenes, when analysis completes, then each scene shows a room type, confidence, and quality score.
  - Given selected scenes with Apply Titles on, when Apply is clicked, then each scene title is updated via `PATCH /scenes/:id`.

#### Feature: AI descriptions
- **Pages/Components:** `components/features/ai/DescriptionGenerator.tsx`, `api/ai.ts` (generateDescriptions)
- **User flow:**
  1. User opens "AI Descriptions"; chooses tone (professional/casual/luxury/friendly), length (short/medium/long), optional target audience.
  2. "Generate Descriptions for N Scenes" → `POST /ai/tours/:id/descriptions` → job status.
  3. Results render per scene with inline edit (Edit3), copy-to-clipboard, reset-to-generated, and per-scene "Modified" badges; "Regenerate All" reruns.
  4. "Apply Descriptions" → `PATCH /scenes/:id` per edited description (TourEditPage `handleApplyDescriptions`).
- **User story:** "As a creator, I want tailored scene descriptions, so that my tours read professionally without writing copy."
- **Expected behavior:** Edits before apply are preserved; apply is disabled when nothing was generated.
- **Acceptance criteria:**
  - Given a tone and length, when generation completes, then descriptions appear and can be edited per scene.
  - Given an edited description, when Apply is clicked, then the scene's description is persisted.

#### Feature: AI hotspot suggestions
- **Pages/Components:** `components/features/ai/HotspotSuggestions.tsx`, `api/ai.ts` (suggestHotspots)
- **User flow:**
  1. User opens "AI Hotspots" (editor More menu, disabled without a selected scene); the scene preview shows suggestion markers overlaid at approximate yaw/pitch positions.
  2. "Analyze Scene" → `POST /ai/scenes/:id/hotspots` → job status.
  3. Suggestion cards list type (navigation/info), suggested title, target scene (navigation), reasoning, confidence %; markers on the preview are clickable to toggle selection; all pre-selected.
  4. "Add N Hotspots" → TourEditPage `handleApplyHotspotSuggestions` creates each via `POST /scenes/:sceneId/hotspots` (navigation → `content.kind: navigation` + target; info → `content.kind: info` with reasoning text; icons arrow-right/info).
- **User story:** "As a creator, I want AI to propose where hotspots should go, so that I can add navigation and info markers in one click."
- **Expected behavior:** Re-analyze available; apply disabled with zero selection; scenes invalidated after apply.
- **Acceptance criteria:**
  - Given a scene with suggestions, when a navigation suggestion is applied, then a hotspot linking to the suggested target scene is created.
  - Given a deselected suggestion, when Apply is clicked, then that suggestion is skipped.

#### Feature: 360 reel generation
- **Pages/Components:** `components/features/ai/ReelGeneratorModal.tsx`, `components/features/VideoPlayer.tsx`, `api/ai.ts` (generateReel)
- **User flow:**
  1. User opens "Create 360 Reel" (TourViewPage or editor More menu); configure step lists scenes (ordered, checkbox inclusion, up/down reorder) and a seconds-per-scene slider (2–6s, default 3); estimated length shown.
  2. "Generate Reel" → `POST /ai/tours/:id/reel` with `scene_ids`, `scene_duration` → job status.
  3. Done step: 9:16 preview (VideoPlayer), scene count/duration/dimensions, "Download" (Cloudinary `fl_attachment` URL), "Copy link", "Create another".
- **User story:** "As a marketer, I want a vertical video reel from my tour, so that I can post it on social media."
- **Expected behavior:** State resets when the modal closes; errors show a retry step.
- **Acceptance criteria:**
  - Given selected scenes, when Generate is clicked, then a reel job starts.
  - Given a completed job, when the done step shows, then the video previews and Download/Copy actions work.

### 6. Tour Editing (Scenes, Hotspots, Settings, Branding, Floor Plans)

#### Feature: Editor shell, save & publish guard
- **Pages/Components:** `pages/tours/TourEditPage.tsx`, `stores/tourEditorStore.ts`, `lib/router.tsx` (useBlocker)
- **User flow:**
  1. User opens `/tours/:id/edit`; `GET /tours/:id` + `GET /tours/:id/scenes` load; the store is seeded once (`setCurrentTour`) when it doesn't already hold the tour.
  2. Toolbar shows title, status badge, "Unsaved changes" badge, scene count, Save (⌘S/Ctrl+S), Publish/Unpublish, Activity, Collaborators, Upload, Preview, Settings, and a More menu (branding, floor plans, AI tools, reel, duplicate, analytics, delete).
  3. Editing any draftable field (`updateTourDraft`) sets `hasUnsavedChanges`; navigation away triggers a blocker dialog ("Leave without saving?"), and closing/refreshing triggers `beforeunload`.
  4. Save → `PATCH /tours/:id` (title/description/status/visibility/settings) → toast + `markAsSaved`.
  5. Publish → `POST /tours/:id/publish` (disabled with reason when unsaved changes exist or zero scenes); Unpublish → `POST /tours/:id/unpublish`. Duplicate → `POST /tours/:id/duplicate` then navigates to the copy's editor; Delete → confirm dialog → `DELETE /tours/:id` → `/tours`.
  6. Preview → opens `/view/:id` in a new tab. Escape deselects scene / exits placement; `h` toggles placement mode.
- **User story:** "As a creator, I want a safe editor that guards my unsaved work and publishes deliberately, so that I never lose edits or go live by accident."
- **Expected behavior:** Save is disabled without unsaved changes. The store no longer ships an undo/redo stack or draft scene/hotspot mutators (removed as dead code in the fix pass — see the FIXED note below).
- **Acceptance criteria:**
  - Given unsaved changes, when the user navigates away, then a blocker dialog appears with Stay/Leave.
  - Given zero scenes, when Publish is clicked, then it is disabled with "Add at least one scene before publishing."
  - Given a successful Save, when the toast appears, then the Unsaved Changes badge disappears.
- **Known gap:** Scene/hotspot edits persist through feature components (ScenePanel/HotspotPanel/modals) that invalidate TanStack queries, but the editor store's `currentTour` is only (re)seeded when it doesn't already hold the tour (TourEditPage.tsx:539-549). After any scene/hotspot mutation the store copy — which drives the UI — is stale until a full reload, e.g. a deleted scene still renders in the scene panel. **FIXED:** TourEditPage now watches the `[SCENES, tourId]` query and merges refetched data into the store via a new `mergeScenes` action (`stores/tourEditorStore.ts`), so every mutation that invalidates the scenes query (hotspot create/update/delete, scene add/delete/reorder, drag, AI applies) is reflected in the viewer markers, ScenePanel, HotspotPanel, and the scene-delete recovery effect without a full reload. The deprecated draft mutators and the undo/redo engine were removed from the store as dead code.

#### Feature: Scene management (panel, upload, reorder, delete)
- **Pages/Components:** `components/features/ScenePanel.tsx`, `components/features/BulkUploader.tsx`, `lib/sceneUpload.ts`
- **User flow:**
  1. The left ScenePanel lists scenes by `order_index` with thumbnails and hotspot counts; selecting a scene loads it in the viewer.
  2. "+" upload: file picker validates (JPG/PNG/WebP, ≤50MB), then `uploadSceneFiles` uploads with concurrency 4 (`POST /upload` → `POST /tours/:id/scenes`), reporting per-file progress and a combined toast.
  3. Drag-and-drop reorders (dnd-kit): optimistic `setQueryData` then `POST /tours/:id/scenes/reorder`; failure refetches to restore order.
  4. Delete: confirm dialog → `DELETE /scenes/:id`; if the current scene was deleted, the selection moves to the first remaining scene.
  5. The BulkUploader (editor "Upload" button) is a dialog with previews, per-file states, overall progress, "Retry Failed" (transport errors only), and a close-during-upload confirmation.
- **User story:** "As a creator, I want to add, reorder, and remove scenes, so that the tour reflects the real walkthrough order."
- **Expected behavior:** Panel collapses to a rail; uploads never block other edits; invalid files get inline reasons.
- **Acceptance criteria:**
  - Given multiple files, when uploaded via the panel, then each becomes a scene and the list refreshes.
  - Given a drag reorder, when dropped, then order persists via reorder endpoint and the panel shows the new order.
  - Given a scene deletion of the selected scene, when confirmed, then selection moves to the next scene.

#### Feature: Hotspot management (create, edit, position, delete)
- **Pages/Components:** `components/features/HotspotPanel.tsx`, `components/features/HotspotEditorModal.tsx`, `components/features/HotspotIconPicker.tsx`, `components/features/hotspotIcons.ts`
- **User flow:**
  1. The right HotspotPanel lists the selected scene's hotspots (icon chip, type badge, title, description); clicking selects (highlights in the viewer), edit/delete buttons appear on hover.
  2. Add (panel "+" or "Add Hotspot" overlay): in the editor, the "Add Hotspot" button arms placement mode (`h`), the user clicks the panorama, `onPositionClick` (degrees) opens the editor modal pre-positioned. Alternatively the modal opens without a position (yaw/pitch 0,0) and the user types coordinates.
  3. The modal has six types: navigation (target scene required; disabled without a second scene), info (title/description), audio (http(s) URL), video (YouTube/Vimeo/direct URL), link (http/https/mailto/tel + new-tab switch), custom (HTML). Validation is per-type; yaw/pitch clamped to ±180/±90.
  4. Appearance tab: icon name, color, size with live preview; Position tab: numeric yaw/pitch.
  5. Save: create → `POST /scenes/:sceneId/hotspots`; edit → `PATCH /hotspots/:id`; both invalidate scenes and toast. Delete → confirm → `DELETE /hotspots/:id`.
  6. Drag-to-reposition in the viewer (editor mode): `onHotspotDrag` → `PUT /hotspots/:id/position` → toast.
- **User story:** "As a creator, I want to place and configure interactive hotspots, so that viewers can navigate and explore details."
- **Expected behavior:** Marker selection syncs between panel and viewer; validation errors block save with inline messages; manual position entry is clamped.
- **Acceptance criteria:**
  - Given placement mode armed, when the user clicks the panorama, then the editor opens at that yaw/pitch.
  - Given a navigation hotspot without a target scene, when saving, then an inline validation error blocks the save.
  - Given a link hotspot with a non-allowlisted protocol, when saving, then the save is blocked.
  - Given a drag, when released, then the position persists via `PUT /hotspots/:id/position`.

#### Feature: Panorama viewer (rendering, VR, markers)
- **Pages/Components:** `components/features/PanoramaViewer.tsx`, `utils/coordinates.ts`
- **User flow:**
  1. The viewer renders the active scene's panorama; markers are applied only after `isViewerReady` (PSV drops pre-ready markers); scene changes run through a serialized queue with a "cannot be loaded" retry state.
  2. Auto-rotate (hand-rolled rAF) respects `tourSettings.auto_rotate`/`auto_rotate_speed` and `prefers-reduced-motion`.
  3. When `enable_vr` (and gyroscope) are enabled, Gyroscope/Stereo plugins load; VR buttons enable stereo (Cardboard) / gyroscope with persisted intent (`360g:vr:gyroscope` / `360g:vr:stereo`); iOS gesture-gated gyroscope prompts.
  4. Editor mode: no navbar, `click-handler` reports yaw/pitch degrees to parents (hotspot placement/calibration), markers become draggable.
  5. Hotspot titles/colors/sizes are sanitized (`escapeHtml`, `safeColor`, `safeSize`) before interpolation.
- **User story:** "As a viewer and editor, I want smooth 360 rendering with VR controls, so that tours feel immersive and markers are accurate."
- **Expected behavior:** Reduced motion disables auto-rotate; VR prefs persist; marker injection is XSS-hardened.
- **Acceptance criteria:**
  - Given `enable_vr` on, when the viewer loads, then gyroscope/stereo controls are available where supported.
  - Given an invalid hotspot color string, when markers render, then the fallback color is used.
  - Given a scene change mid-load, when the previous panorama is still loading, then the latest requested scene wins without an abort error.

#### Feature: Tour settings (general, viewer, embed)
- **Pages/Components:** `components/features/TourSettingsPanel.tsx`, `utils/embedCode.ts`
- **User flow:**
  1. User opens Settings (toolbar or More menu). General tab: title, description, visibility (private/unlisted/public), starting scene (`initial_scene_id`).
  2. Viewer tab: auto-rotate (+ speed slider 0.1–5), show navigation bar, enable fullscreen, VR mode, gyroscope (+ auto-start gyroscope).
  3. Embed tab: read-only share link (copy), embed options (width/height), iframe embed code, and responsive 16:9 embed code.
  4. "Save Changes" → `handleSettingsSave` → `updateTourDraft(updates)` + `PATCH /tours/:id` → toast + panel closes (Save shows a saving state while in flight). Cancel just closes, discarding in-progress edits.
- **User story:** "As a creator, I want to tune how a tour behaves for viewers and grab embed code, so that the tour matches my site and audience."
- **Expected behavior:** Title is required to save; embed options map to `/embed/:id?scene=&autoplay=&navbar=&fullscreen=&vr=&rotate=&branding=&minimal=&autohide=` URL params.
- **Acceptance criteria:**
  - Given visibility set to Unlisted, when saved, then `PATCH /tours/:id` persists `visibility: unlisted`.
  - Given auto-rotate enabled with speed 2, when saved, then the public viewer auto-rotates at that speed.
  - Given a copy-embed click, when the clipboard succeeds, then the iframe snippet is copied and the button shows "Copied!".
- **Known gap:** The panel's local state is only re-synced from the tour prop when `tour` changes (sync effect deps `[tour]`, TourSettingsPanel.tsx:97-103); Cancel does **not** discard edits, so reopening the panel after an unsaved edit shows the stale edits instead of the persisted values. **FIXED:** the sync effect now resets the form whenever the dialog opens (deps are the persisted field values plus `open`, not the `tour` object reference), so Cancel truly discards in-progress edits and reopening shows the persisted values.

#### Feature: Tour branding
- **Pages/Components:** `components/features/BrandingPanel.tsx`
- **User flow:**
  1. User opens Branding (More menu). Options: logo upload (PNG/JPG/SVG/WebP ≤2MB → `POST /upload` folder `branding`), primary/secondary/accent colors (6 preset themes or custom), font (10 options), watermark position + visibility, custom viewer colors.
  2. A desktop/mobile preview shows the result. "Save" → TourEditPage `handleBrandingSave` merges into tour settings and `PATCH /tours/:id` via `saveTourSettings` → toast.
- **User story:** "As an agency, I want to brand tours with my logo, colors, and fonts, so that my clients see my identity."
- **Expected behavior:** Uploaded logo URL persists only on successful upload (failed preview blobs never saved); settings reset on open.
- **Acceptance criteria:**
  - Given a logo upload, when it succeeds, then the logo URL is saved with the branding settings.
  - Given a theme preset, when saved, then the public viewer uses the theme's primary color.
  - Given an oversized logo, when uploaded, then an inline error appears and nothing persists.

#### Feature: Floor plans
- **Pages/Components:** `components/features/FloorPlanEditor.tsx`, `components/features/FloorPlanOverlay.tsx`
- **User flow:**
  1. User opens Floor Plans (More menu): manage multiple floors (add/delete/move with renumbering), upload a floor plan image (`POST /upload`, folder `floor-plans`).
  2. Marker mode: pick a scene from the list, then click the floor-plan image to place/update its marker (percentage x/y).
  3. Save → TourEditPage `handleFloorPlansSave` merges `floor_plans` into tour settings → `PATCH /tours/:id`.
  4. Public viewers see `FloorPlanOverlay` (bottom-left): expand/collapse, floor up/down (multi-floor), clickable markers navigate to scenes (marker for the current scene is highlighted with a ping).
- **User story:** "As a creator, I want visitors to navigate a tour from a floor plan, so that they can jump straight to rooms."
- **Expected behavior:** Public pages prefer `settings.floor_plans` and fall back to `GET /public/tours/:id/floor-plans`; overlay is hidden when no plans exist.
- **Acceptance criteria:**
  - Given a floor plan with markers, when a viewer clicks a marker, then the tour navigates to that scene.
  - Given multiple floors, when the overlay arrows are used, then the displayed floor changes and the counter updates.
  - Given a marker placement, when saved, then the marker coordinates persist in tour settings.
- **Known gap:** The dedicated floor-plan CRUD endpoints (`toursApi.getFloorPlans/getFloorPlan/createFloorPlan/updateFloorPlan/updateFloorPlanMarkers/deleteFloorPlan`, tours.ts:295-338) are unused; the editor persists floor plans only inside `settings.floor_plans`, so the standalone floor-plan API surface is dead code.

#### Feature: Publish flow, preview, and live state
- **Pages/Components:** `pages/tours/TourEditPage.tsx`, `pages/tours/TourViewPage.tsx`
- **User flow:** 1. Creator finishes edits → Save → Publish (`POST /tours/:id/publish`). 2. Toolbar badge flips to `published` and the button becomes Unpublish. 3. Preview opens `/view/:id` in a new tab; the Tours list shows "View Live" for published tours. 4. Unpublish returns status to `draft`.
- **User story:** "As a creator, I want a deliberate publish/unpublish toggle, so that only finished tours are publicly reachable."
- **Expected behavior:** Publishing is blocked by unsaved changes or zero scenes; share buttons on TourViewPage unlock only when published.
- **Acceptance criteria:**
  - Given a draft with scenes and no unsaved changes, when Publish is clicked, then the tour status becomes `published` and the badge updates.
  - Given a published tour, when Unpublish is clicked, then status becomes `draft` and the public page is no longer reachable.

#### Feature: AI apply flows (from editor)
- **Pages/Components:** `pages/tours/TourEditPage.tsx` (handleApplySceneAnalysis, handleApplyDescriptions, handleApplyHotspotSuggestions)
- **User flow:** 1. User runs an AI tool in the More menu. 2. Apply calls in TourEditPage persist results directly: scene analysis/descriptions via per-scene `PATCH /scenes/:id`; hotspot suggestions via per-suggestion `POST /scenes/:sceneId/hotspots`. 3. Success/failure toasts; scenes query invalidated.
- **User story:** "As a creator, I want one-click application of AI results, so that accepted suggestions are saved immediately."
- **Expected behavior:** Apply is client-side fan-out to scene/hotspot endpoints — the `aiApi.applySceneAnalysis` / `applyHotspotSuggestions` endpoints are never called.
- **Acceptance criteria:**
  - Given an accepted analysis update, when Apply is clicked, then `PATCH /scenes/:id` is issued for each selected scene.
  - Given a partial failure, when applying multiple updates, then an error toast appears and successful updates still persist.

#### Feature: Collaboration & activity
- **Pages/Components:** `pages/tours/TourEditPage.tsx` (Collaborators popover), `components/features/ActivityFeed.tsx`, `stores/collaborationStore.ts`, `api/collaboration.ts`
- **User flow:**
  1. "Collaborators" opens a popover listing collaborators (`GET /tours/:id/collaborators`) with avatar, name, role; owners cannot be removed.
  2. Invite: enter email + role (viewer/editor) → `POST /tours/:id/collaborators` → toast; remove → confirm → `DELETE /tours/:id/collaborators/:userId`.
  3. "Activity" opens a sheet with the activity feed (`GET /tours/:id/activities`): actions (created/updated/deleted/commented/published/invited/left) grouped by date with an action filter and manual refresh.
- **User story:** "As a team lead, I want to invite teammates and see what changed, so that we can collaborate on tours."
- **Expected behavior:** Activity loads on demand when the sheet opens; collaborators fetch on popover open with retry on error.
- **Acceptance criteria:**
  - Given a valid email, when Invite is clicked, then the collaborator appears in the list.
  - Given an owner collaborator, when remove is attempted, then no remove control is rendered.
  - Given activities exist, when the sheet opens, then items render grouped by date.

### 7. Media Library

#### Feature: Media library (browse, filter, delete, preview)
- **Pages/Components:** `pages/media/MediaLibraryPage.tsx`, `api/upload.ts`
- **User flow:**
  1. User opens `/media`; `GET /upload/media` lists files (24/page, cursor pagination) with search and type filter (all/images/videos).
  2. Grid/list toggle; multi-select checkboxes with a bulk action bar (Select all / Clear / Delete with confirmation → per-file `DELETE /upload/media/:id`, partial failures reported).
  3. Preview modal shows image or plays video; "Open in new tab" links to the raw file; per-file delete with confirm.
  4. Files appear here automatically from any `POST /upload` (scenes, branding, floor plans, captures).
- **User story:** "As a creator, I want to see and manage every uploaded file, so that I can clean up storage."
- **Expected behavior:** Search/filter reset pagination and selection; bulk delete always refreshes and clears selection; file size/type/dimensions/visibility shown.
- **Acceptance criteria:**
  - Given uploaded files, when `/media` loads, then thumbnails with name/size/type render.
  - Given selected files, when bulk Delete is confirmed, then they are deleted and the list refreshes.
  - Given a video file, when previewed, then an inline video player with controls plays it.
- **Known gap:** `components/features/VideoUploader.tsx` (a full video upload dialog with thumbnails and retry) is exported from the features barrel but **not wired into any page** — video files can only reach the library through other flows.

### 8. Public Tour Viewing

#### Feature: Public tour viewer
- **Pages/Components:** `pages/PublicTourPage.tsx`, `components/features/PanoramaViewer.tsx`, `components/features/FloorPlanOverlay.tsx`, `components/features/HotspotContentModal.tsx`, `components/features/ShareModal.tsx`, `components/common/MetaTags.tsx`
- **User flow:**
  1. Visitor opens `/view/:id` (from share links/QR/mobile app). `GET /public/tours/:id?track=false` returns the tour with scenes and settings; floor plans come from `settings.floor_plans` (fallback `GET /public/tours/:id/floor-plans`).
  2. Initial scene resolves: `?scene=` param → `settings.initial_scene_id` → first scene; per-scope viewer state keeps public/embed sessions isolated and clears on unmount.
  3. Visitor pans/zooms; navigation hotspots switch scenes; two-finger swipe (touch) or Shift+←/→ / N / P keys navigate; F fullscreen, M mute, I info, S share, `?` shortcuts (all guarded against input fields).
  4. Top bar shows logo (branding), title, and info/share/like/mute/keyboard/fullscreen buttons; a bottom thumbnail strip (when `show_navbar` and >1 scene) with a scene counter; scene-title badge; watermark ("Powered by 360 Viewer") unless branding hides it.
  5. Non-navigation hotspot clicks open `HotspotContentModal` (info/audio/video/link/custom — custom HTML sanitized + CSP sandboxed iframe); link hotspots open directly in a new tab when a URL exists.
  6. URL params override settings: `autoplay`, `navbar`, `fullscreen`, `vr`, `rotate` (autoplay=false forces auto-rotate off).
  7. Visitor leaves; session analytics are flushed (see below).
- **User story:** "As a buyer, I want to explore a property tour on any device without an account, so that I can judge the space before visiting."
- **Expected behavior:** Loading spinner → "Tour Not Found" (no tour) or "No rooms available" (zero scenes); SEO meta + JSON-LD structured data; keyboard shortcuts never fire while typing.
- **Acceptance criteria:**
  - Given a published tour URL with `?scene=<id>`, when loaded, then that scene is the first rendered.
  - Given a navigation hotspot click, when clicked, then the viewer transitions to the target scene.
  - Given `?navbar=false`, when loaded, then the thumbnail strip is hidden.
  - Given a custom-HTML hotspot, when opened, then content renders inside a sandboxed iframe with CSP.
- **Known gap:** Any fetch failure (network, 5xx, non-404 errors) falls into the same `if (!tour)` branch as a genuine 404, showing "Tour Not Found" — errors and not-found are conflated (PublicTourPage.tsx:382-387).

#### Feature: Tour likes
- **Pages/Components:** `pages/PublicTourPage.tsx`, `api/tours.ts` (likePublicTour/unlikePublicTour)
- **User flow:** 1. Visitor clicks the heart → optimistic toggle → `POST /public/tours/:id/like` or `DELETE /public/tours/:id/like` (with `x-session-id` header). 2. On failure the state reverts; rapid double-clicks are guarded by `isLiking`.
- **User story:** "As a visitor, I want to like a tour, so that the owner knows it was valuable."
- **Expected behavior:** The heart fills red when liked; like state persists server-side per session.
- **Acceptance criteria:**
  - Given a click on the heart, when the request succeeds, then the heart stays filled.
  - Given a failed like request, when the request rejects, then the heart reverts to unliked.
- **Known gap:** Like state is never hydrated — `isLiked` starts `false` on every load and there is no API to fetch the visitor's existing like, so a previously liked tour always renders unliked (PublicTourPage.tsx:60).

#### Feature: Public analytics tracking
- **Pages/Components:** `hooks/usePublicTourTracking.ts`, `api/tours.ts` (trackEvent)
- **User flow:** 1. On tour load, `tour_view` (once per mount) and `session_start` fire with a sessionStorage-backed session id. 2. Each scene change fires `scene_view`; hotspot clicks `hotspot_click`; fullscreen enter/exit, VR enter/exit, and share-platform clicks fire ad-hoc events (`POST /public/tours/:id/events`). 3. On unmount, `session_duration` is sent via `fetch(..., {keepalive})` (fallback `sendBeacon`). Failures are silent.
- **User story:** "As an owner, I want engagement data from public viewers, so that analytics pages reflect real usage."
- **Expected behavior:** Tracking never blocks rendering; one session id per browser tab/session.
- **Acceptance criteria:**
  - Given a published tour load, when the tour becomes ready, then `tour_view` and `session_start` events are posted.
  - Given a scene change, when it happens, then a `scene_view` event for the new scene is posted.
  - Given page close, when the session ends, then `session_duration` is sent with keepalive.

### 9. Embed & Share

#### Feature: Share modal (link, QR, social, embed)
- **Pages/Components:** `components/features/ShareModal.tsx`, `utils/embedCode.ts`, `utils/qrCode.ts`
- **User flow:**
  1. User opens Share (TourViewPage when published, PublicTourPage top bar, or editor More menu → "Share & Embed" → Settings embed tab).
  2. Link tab: share URL = backend `/share/tours/:id?redirect=<origin>/view/:id>`; copy button (2s "copied" state); social buttons open Facebook/Twitter/LinkedIn/WhatsApp/Email share URLs in a popup (`noopener`).
  3. QR tab: QR code auto-generates on open (200px), downloadable as PNG or SVG (512px).
  4. Embed tab: width/height options regenerate the iframe snippet with all URL params; copy button.
  5. From PublicTourPage, platform shares are tracked (`tour_share` event with platform).
- **User story:** "As a creator, I want to share a tour by link, QR code, or embed, so that it reaches buyers wherever they are."
- **Expected behavior:** Share URL is the same everywhere (single source via `generateShareUrl`); copy failures surface an error toast.
- **Acceptance criteria:**
  - Given a copy-link click, when the clipboard succeeds, then a success toast appears and the button shows a check.
  - Given the QR tab, when the modal opens, then a QR for the share URL renders and both download formats work.
  - Given embed options changed, when the code is copied, then the iframe includes the corresponding query params.
- **Known gap:** Custom-domain support (`components/features/CustomDomainSetup.tsx` + `api/customDomains.ts`) is fully implemented but wired to no page — there is no UI to add/verify/delete a custom domain, so share links always use the app origin.

#### Feature: Embed viewer (iframe + postMessage protocol)
- **Pages/Components:** `pages/EmbedTourPage.tsx`, `types/embedMessages.ts`, `public/embed.js` (SDK mirror)
- **User flow:**
  1. A website embeds `/embed/:id` via the generated iframe (sandbox `allow-scripts allow-same-origin allow-popups allow-forms`).
  2. On load the embed posts `ready` to the parent (title, scene count, initial scene); scene changes post `sceneChange`; hotspot clicks post `hotspotClick`; fullscreen changes post `fullscreenChange`; load errors post `error`.
  3. The parent can post commands `goToScene`, `nextScene`, `previousScene`, `toggleFullscreen`; inbound messages are origin-checked (`event.source === parent/window`).
  4. URL options: `scene`, `autoplay`, `navbar`, `branding`, `minimal` (arrows-only chrome), `autohide` (controls fade after 3s), `fullscreen`, `vr`, `rotate`. `editmode=1` turns the embed into an editor surface that posts `panoramaClick` (yaw/pitch degrees) to the parent.
  5. The embed also runs the same public analytics tracking.
- **User story:** "As a developer or the mobile app, I want to embed a tour in an iframe and control it programmatically, so that it integrates with my site or app."
- **Expected behavior:** Watermark respects `branding` param; minimal mode hides logo/navbar/floor plans; cross-origin messaging falls back to `*` only when the parent origin is inaccessible.
- **Acceptance criteria:**
  - Given an embedded iframe, when the tour loads, then the parent receives `ready` with tour metadata.
  - Given a `goToScene` command for an existing scene, when received, then the embed navigates to that scene.
  - Given `?minimal=true&autohide=true`, when loaded, then chrome is limited to arrows/counter and controls fade out after inactivity.
  - Given a tour fetch error, when it occurs, then the parent receives an `error` message and an error screen renders.

### 10. 3D Viewing & Lab

#### Feature: 3D world viewer
- **Pages/Components:** `pages/View3DPage.tsx`, `hooks/useSkyboxRenderer.ts`
- **User flow:**
  1. Visitor opens `/view3d/:id` (or the tour sets a 3D world). `GET /public/tours/:id` returns settings.
  2. If `settings.world_3d.mesh_url` exists, a custom canvas renderer (skybox/mesh) loads; errors show "Failed to load the 3D world" with a fallback link to `/view/:id`.
  3. Legacy tours with `world_3d.viewer_url` render a full-screen iframe (`fullscreen; xr-spatial-tracking`).
  4. Otherwise: "3D world not available" + fallback link.
- **User story:** "As a buyer, I want to view a 3D reconstruction of a property, so that I get a richer sense of space."
- **Expected behavior:** No chrome; loading spinner; graceful fallback to the 360 tour on any failure.
- **Acceptance criteria:**
  - Given a tour with a mesh URL, when loaded, then the canvas viewer renders and errors show a fallback link.
  - Given a tour without a world, when loaded, then the "not available" state with a fallback link renders.

#### Feature: Splat Lab (Gaussian-splat pipeline)
- **Pages/Components:** `pages/lab/SplatLabPage.tsx`, `hooks/useSplatPipeline.ts`, `api/lab.ts`
- **User flow:**
  1. User opens `/lab`; past jobs load (`GET /lab/jobs`).
  2. Create job: title, drop video(s) (MP4/MOV/MKV), toggles 360° video and mask people, quality preset (fast ~10min / balanced ~25min / quality ~60min).
  3. "Start Pipeline" → `POST /lab/jobs` then `POST /lab/jobs/:id/upload-video?filename=…` (presigned URL) then `POST /lab/jobs/:id/start`.
  4. The active job view renders an 8-stage pipeline tracker (uploading → extracting → converting → sfm → training → compressing → collision → ready) with progress; failure shows the stage (estimated from progress) and a GPU-required banner when the error mentions `GPU_REQUIRED`.
  5. Ready: "Download splat", "Open in SuperSplat" (iframe preview tab), Quick Preview iframe vs Self-Hosted (coming soon) tabs.
  6. Past jobs can be re-selected or deleted (`DELETE /lab/jobs/:id` + reload).
- **User story:** "As a power user, I want to turn 360° video into a navigable Gaussian splat, so that I can offer 3D tours."
- **Expected behavior:** Header stats (total/completed/failed); delete is hover-only; GPU banner offers a Luma AI link and a disabled "Request GPU Access" button.
- **Acceptance criteria:**
  - Given a video file, when Start Pipeline is clicked, then a job is created and uploaded with progress.
  - Given a ready job, when the viewer renders, then splat download and SuperSplat links work.
  - Given a `GPU_REQUIRED` failure, when the job fails, then the GPU warning banner appears.

#### Feature: Dollhouse editor (splat scene composer)
- **Pages/Components:** `pages/lab/DollhouseEditorPage.tsx`
- **User flow:**
  1. User opens `/lab/editor` from the Lab; a Three.js canvas renders three splat models (`/splats/room1.splat`, `hallway`, `room2`) with grid, orbit controls, and transform gizmos.
  2. Bottom toolbar switches translate/rotate/scale and "connect" mode (click the floor to place a yellow Door/Portal marker between the active model and the next).
  3. Right panel lists models, shows live transform values, and lists connections with delete.
  4. Top bar: "Back to Lab", grid toggle, and a disabled "Save Tour" button ("not wired up yet").
- **User story:** "As a lab user, I want to compose multiple splat models into one connected walkthrough, so that multi-room 3D tours become possible."
- **Expected behavior:** Layout is in-memory only (no persistence); dragging disables orbit.
- **Acceptance criteria:**
  - Given the editor, when a model is transformed, then transform values update in the panel.
  - Given connect mode, when the floor is clicked, then a Door/Portal marker appears in the connections list.
  - Given a click on Save Tour, then the button is disabled with an explanatory title.

#### Feature: Kitchen tour (constrained GS standpoint navigation)
- **Pages/Components:** `pages/lab/KitchenTourPage.tsx`, `components/SplatTourViewer.tsx`, `types/tourSpatial.ts`
- **User flow:** 1. User opens `/lab/kitchen-tour` (from Splat Lab header). 2. `public/splats/kitchen_manifest.json` is fetched; `SplatTourViewer` renders `public/splats/kitchen.splat` with standpoint/waypoint navigation (no free-flight). 3. "Advanced free-fly (SuperSplat)" opens the PlayCanvas editor with the splat loaded.
- **User story:** "As a lab user, I want a constrained walkthrough demo, so that I can validate standpoint navigation for gaussian splats."
- **Expected behavior:** Errors explain missing `kitchen.splat`/`kitchen_manifest.json`; a spinner shows while the manifest loads.
- **Acceptance criteria:**
  - Given the manifest exists, when the page loads, then the constrained tour viewer renders.
  - Given a missing manifest, when the fetch fails, then an error alert names the missing files.

#### Feature: Local tour harness (dev-only)
- **Pages/Components:** `pages/LocalTourPage.tsx`
- **User flow:**
  1. A developer runs the dev server (the Vite plugin serves `seed_properties/<id>/tour.json` — not in production builds).
  2. `/local/:propertyId` fetches the JSON, builds Scene/Hotspot objects (image paths resolved under `/seed_properties/<propertyId>/`), and renders them in the production `PanoramaViewer` with room steppers, a thumbnail rail, and keyboard shortcuts (←/→, F, ?).
  3. `?calibrate=1` adds an editor flag that logs yaw/pitch (1-decimal degrees) of panorama clicks and shows them in a badge — used to verify hotspot placement math without uploading.
- **User story:** "As a developer, I want to preview a spatial tour locally, so that I can verify doorway hotspot coordinates before upload."
- **Expected behavior:** Missing `tour.json` renders an error with a pointer to the generator tool (`backend/tools/build_spatial_tour.py`).
- **Acceptance criteria:**
  - Given a property folder with `tour.json`, when `/local/:propertyId` loads, then scenes render with working hotspots.
  - Given `?calibrate=1`, when the panorama is clicked, then the badge shows the clicked yaw/pitch in degrees.

### 11. Analytics

#### Feature: Per-tour analytics
- **Pages/Components:** `pages/tours/TourAnalyticsPage.tsx`, `utils/analytics.ts`
- **User flow:**
  1. User opens `/tours/:id/analytics`; default range = last 30 days. `GET /tours/:id/analytics?start_date&end_date`, `GET /tours/:id` and `GET /tours/:id/scenes` load; `GET /tours/:id/heatmap?scene_id&start_date&end_date` loads when a scene is chosen.
  2. Stat cards: total views, unique visitors, avg session, total shares; views-over-time area chart; device-breakdown pie; top-countries bar; scene-performance bar (top 10); hotspot-engagement bar; interaction heatmap scatter (yaw/pitch/intensity, all-scenes or per-scene selector); detailed metrics table.
  3. Date range picker with presets refetches analytics + heatmap; Export → CSV or JSON (`downloadAnalyticsCSV/JSON`), with a success toast.
  4. Error/empty states: analytics error card with retry; "No analytics in this range" empty state; per-chart "No data" placeholders.
- **User story:** "As a creator, I want per-tour engagement metrics over time, so that I can measure what works."
- **Expected behavior:** Scene/hotspot charts map IDs to titles from the scenes query; heatmap respects the selected scene and date range.
- **Acceptance criteria:**
  - Given a date range change, when applied, then analytics and heatmap refetch for that range.
  - Given analytics data, when Export CSV is clicked, then a CSV file downloads and a success toast appears.
  - Given a scene selected in the heatmap dropdown, when data loads, then the scatter only reflects that scene.

#### Feature: Cross-tour analytics overview
- **Pages/Components:** `pages/analytics/AnalyticsPage.tsx`
- **User flow:**
  1. User opens `/analytics`; `GET /tours?status=published&limit=50` and `GET /dashboard/stats` load; the first published tour is auto-selected.
  2. Overview cards: published tours, total views, total scenes, total tours. The tour selector (dropdown with view counts) drives `GET /tours/:id/analytics` for the detail section (metric cards, daily-views line, device pie, scene views, country bars).
  3. The comparison table lists all published tours (views/likes/shares/scenes, row-select, Details link → per-tour analytics); Export CSV for the selected tour.
- **User story:** "As an agency owner, I want one screen comparing all published tours, so that I can spot winners and laggards."
- **Expected behavior:** Overview error doesn't block per-tour analytics; no published tours → empty state linking to Tours.
- **Acceptance criteria:**
  - Given published tours, when `/analytics` loads, then the first tour's analytics render and the comparison table lists all tours.
  - Given a row click, when selected, then that tour's detail section and export target update.

### 12. Profile & Settings

#### Feature: Profile management
- **Pages/Components:** `pages/settings/ProfilePage.tsx`, `api/users.ts`
- **User flow:**
  1. User opens `/profile`; profile photo card shows the current avatar; "Change Photo" validates (image type, ≤2MB) and uploads via `POST /users/me/profile-image` → `setUser(updatedUser)`.
  2. Personal info form: full name (≤100 chars), phone; email is read-only ("contact support to change"). Save (enabled only when dirty) → `PUT /users/me` → form resets to the saved values + toast.
  3. Account info card: account status (active/inactive) and role badge.
- **User story:** "As a user, I want to keep my name, phone, and photo current, so that collaborators and tours show the right identity."
- **Expected behavior:** After save, the store user and cached `[user]` queries refresh; uploads show a spinner overlay on the avatar.
- **Acceptance criteria:**
  - Given a valid image ≤2MB, when uploaded, then the avatar updates and a success toast appears.
  - Given an oversized image, when selected, then an error toast appears and nothing changes.
  - Given a dirty form, when Save is clicked, then `PUT /users/me` runs and the form resets to the new values.

#### Feature: Settings (appearance, notifications, security)
- **Pages/Components:** `pages/settings/SettingsPage.tsx`, `api/auth.ts` (changePassword), `stores/uiStore.ts`
- **User flow:**
  1. User opens `/settings`. Appearance: theme light/dark/system via `useUIStore` (persisted).
  2. Notifications: two switches (email notifications, marketing emails) that optimistically `PUT /users/me {notification_settings}` and revert on error.
  3. Security: change password form (current + new ≥8 chars + confirm) → `authApi.changePassword` (re-authenticates via Supabase with current password, then updates) → reset + toast.
  4. Delete Account card is informational only ("contact support").
- **User story:** "As a user, I want to control theme, notifications, and my password, so that the app fits my preferences and stays secure."
- **Expected behavior:** Notification toggles save immediately without a submit button; wrong current password surfaces the mapped error.
- **Acceptance criteria:**
  - Given a theme click, when chosen, then the theme applies app-wide and persists.
  - Given a notification toggle, when changed, then `PUT /users/me` runs and a "saving" status appears.
  - Given mismatched new passwords, when submitting, then an error toast blocks the update.
  - Given the correct current password, when submitted, then a success toast appears and the form clears.

#### Feature: App shell (header, sidebar, navigation)
- **Pages/Components:** `components/layout/DashboardLayout.tsx`, `components/layout/Header.tsx`, `components/layout/Sidebar.tsx`
- **User flow:**
  1. Every protected page renders inside DashboardLayout: skip-to-content link, Sidebar (Dashboard/Tours/Media/Analytics/Splat Lab/Settings, active highlight, collapse rail, mobile drawer with Escape/overlay close), Header (mobile menu, sidebar toggle, search box, New Tour button, theme toggle, notifications, user menu with Profile/Settings/Logout).
  2. Logout clears auth and navigates to `/login`.
- **User story:** "As a user, I want consistent chrome and quick navigation, so that I can move between areas efficiently."
- **Expected behavior:** Sidebar nav highlights the active route; mobile drawer locks body scroll.
- **Acceptance criteria:**
  - Given the header user menu, when Logout is clicked, then the session ends and `/login` loads.
  - Given a collapsed sidebar, when the toggle is clicked, then the rail expands and labels reappear.
  - Given the New Tour button, when clicked, then `/tours/create` loads.
- **Known gap:** The header search input is decorative (no handler, Header.tsx:62-72), and the Notifications (Header) plus "Help & Support" / "Feedback" (Sidebar bottom items) buttons are hard-disabled placeholders — none perform actions.

---

# Mobile App — 360 Tours: Features & User Flows

The mobile app is a Flutter client for **360 Tours**: a real-estate photographer captures a room as a guided 16-shot 360° panorama on their phone, the app stitches the frames on-device (with a cloud re-stitch fallback), uploads the result to the 360ghar backend (`api.360ghar.com`), and publishes a shareable public link with QR code and embed snippet. A capture can grow into a multi-room walkable tour (rooms + navigation hotspots), a 3D world (cloud job), and carries view analytics. Auth is Supabase; tours/scenes/uploads go through a typed `BackendApi`; all asset/room data is stored locally in JSON collections (`LocalStore`) with an upload queue that persists each pipeline step so uploads survive crashes and offline periods.

How to read this doc: Section 2 is the route/screen inventory. Sections 3–13 document every feature as user stories with expected behavior derived from the code (file paths + line refs). "Known gap" lines flag behavior that is missing, silently skipped, or dead — they describe the current state only, nothing is fixed here. Section 13 is the cross-app contract with the web viewer. This doc is the contract for a later verification-and-fix pass: every expected behavior is concrete and testable.

## Screen / Route Inventory

| Route | Screen file | Purpose |
|---|---|---|
| `/splash` | `core/router.dart` (`_SplashScreen`) | Parking screen while the auth session restores |
| `/signin` | `features/auth/presentation/sign_in_screen.dart` | Email/password + Apple (iOS) + Google sign-in / sign-up |
| `/` | `features/assets/presentation/asset_list_screen.dart` | Local asset library (grid of scans, status badges) |
| `/capture` | `features/capture/presentation/capture_screen.dart` | Guided 360° capture, fullscreen dialog; `?assetId=` turns it into "add a room" for an existing asset |
| `/lidar` | `features/lidar/presentation/lidar_scan_screen.dart` | Apple RoomPlan LiDAR room scan (Pro iPhones) |
| `/settings` | `features/settings/presentation/settings_screen.dart` | Processing preference + capture hardware (LiDAR, Insta360) |
| `/asset/:id` | `features/assets/presentation/asset_detail_screen.dart` | Asset detail: status, actions hub, delete |
| `/asset/:id/view` | `features/viewer/presentation/viewer_screen.dart` | In-app WebView viewer (`mode=pano` → embed, `mode=3d` → view3d) |
| `/asset/:id/share` | `features/share/presentation/share_screen.dart` | Public link, native share sheet, QR code, embed code |
| `/asset/:id/rooms` | `features/tours/presentation/room_list_screen.dart` | Room list of a multi-room tour (+ add room, delete room) |
| `/asset/:id/rooms/:roomId/hotspots` | `features/tours/presentation/hotspot_editor_screen.dart` | Hotspot placement via web embed in edit mode |
| `/asset/:id/generate3d` | `features/threed/presentation/generate_3d_screen.dart` | Cloud 3D-world job (polling) + on-device photogrammetry |
| `/asset/:id/floorplan` | `features/tours/presentation/floor_plan_screen.dart` | Floor plan images served by the backend |
| `/asset/:id/analytics` | `features/analytics/presentation/analytics_screen.dart` | Views / time spent / "request showing" stats |

## Features & User Stories

### 1. Authentication & Session

#### Feature: Sign in / sign up (email, Google, Apple) with session restore

- **Screens/Components:** `features/auth/presentation/sign_in_screen.dart`, `features/auth/data/supabase_auth_repository.dart`, `core/router.dart` (`AuthNotifier` + redirect), `core/api/api_client.dart` (JWT attach + 401 refresh), `features/assets/presentation/asset_list_screen.dart` (sign-out)
- **User flow:**
  1. App starts → `/splash` spinner while the first auth-stream event settles (`router.dart` `restoring` flag; a transient null during token refresh must not bounce a signed-in user out).
  2. No session → redirected to `/signin`; signed-in users land on `/` (asset list). Splash/signin never flash for restoring sessions.
  3. User signs in with email+password, or toggles "Create account" (email sign-up requires confirmation — error text tells the user to check their inbox), or taps Continue with Google (iOS also gets Continue with Apple).
  4. Google/Apple native sign-in hands an id token to Supabase (`signInWithIdToken`); Google client IDs are fetched at runtime from `GET /auth/config` (`supabase_auth_repository.dart`, `backend_api.dart` `getAuthConfig`), never baked in.
  5. On success the router redirect takes over (`/`). On failure a friendly message is shown: "Wrong email or password.", "Check your inbox to confirm your email.", or a generic connection message; user-cancelled provider flows show nothing.
  6. Sign-out is triggered from the asset list (confirmation dialog); Supabase session is dropped and the router redirects to `/signin`.
  7. Every API call attaches `Authorization: Bearer <accessToken>`; on a 401 the client single-flights one `refreshSession()` and replays the request once (`api_client.dart:41-58`).
- **User story:** "As a photographer, I want to sign in with the account I already use, so that my scans are stored under my identity and survive app restarts."
- **Expected behavior:**
  - Missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` at launch shows a hard failure screen with setup instructions instead of failing at first sign-in (`main.dart` `_MissingEnvApp`).
  - Route guard: unauthenticated access to any non-`/signin` route redirects to `/signin`; authenticated users on `/signin`/`/splash` redirect to `/`.
  - Auth stream errors (dropped connection mid-refresh) do not sign the user out (`router.dart` `onError` keeps last known user).
  - Provider buttons disable while busy; the submit button shows a spinner.
- **Acceptance criteria:**
  1. Fresh install with valid env starts at `/signin`; a user with a persisted session starts at `/` without flashing `/signin`.
  2. Email sign-in with wrong credentials shows "Wrong email or password." and stays on `/signin`.
  3. Email sign-up for a confirmed account reaches the asset list; unconfirmed accounts get the inbox-check message.
  4. Google sign-in succeeds when `/auth/config` returns a valid iOS client id; when it doesn't (iOS), an explanatory error is shown.
  5. Sign-out shows a confirm dialog, signs out, and lands on `/signin`.
- **Known gap:** auth expiry mid-upload has no recovery: if the single 401 refresh fails (e.g. refresh token expired), the request fails and the upload job just backoff-retries into `failed`; there is no forced re-auth prompt or queue pause (`core/api/api_client.dart:41-58`, `core/upload/upload_queue.dart` `_failWithBackoff`).

### 2. Asset Library (List & Detail)

#### Feature: Local asset list with live status

- **Screens/Components:** `features/assets/presentation/asset_list_screen.dart`, `features/assets/presentation/asset_providers.dart` (`assetTickProvider` stream), `features/assets/data/local_asset_repository.dart` (`LocalStore` `assets` collection)
- **User flow:**
  1. Signed-in user lands on `/`: a 2-column grid of the user's own scans (filtered by `ownerId`), newest first, live-updating from the `LocalStore` watch stream.
  2. Each card shows a thumbnail (or placeholder icon), name, relative creation date, and a status badge when not `ready`: "Capturing", "Stitching…", "Uploading…" (pendingCloudStitch), "Building 3D…", "Failed".
  3. Pull-to-refresh re-reads local state; a load error shows "Could not load your scans." with Retry.
  4. Empty state explains the flow: "Stand in the middle of a room, tap Scan, and follow the dots. Sixteen shots, under a minute."
  5. App bar: Settings (→ `/settings`), Sign out (→ confirm dialog). FAB "Scan a room" → `/capture`.
  6. Tap a card → `/asset/:id`.
- **User story:** "As a photographer, I want to see all my scans with their processing state, so that I know which ones are ready to share."
- **Expected behavior:**
  - Only the signed-in owner's assets appear; cards update in place when status/thumbnail change (queue writes re-emit the stream).
  - Badge colors: capturing=dim, stitching/pendingCloudStitch=accent, processing3d=accent, failed=danger, ready=no badge.
  - Deleted assets disappear from the list without a restart.
- **Acceptance criteria:**
  1. Two scans for the same user render in newest-first order with correct badges.
  2. A status change (stitching → ready) updates the card without user interaction.
  3. Tapping a card navigates to the matching `/asset/:id`.
  4. Sign-out from the app bar signs out after confirmation.

#### Feature: Asset detail hub (actions + delete + retry)

- **Screens/Components:** `features/assets/presentation/asset_detail_screen.dart`, `features/assets/presentation/asset_providers.dart` (`assetProvider`)
- **User flow:**
  1. Open `/asset/:id`: hero panorama preview (local file or placeholder), name, status line ("Ready to share", "Stitching and uploading. The share link is minutes away.", etc.).
  2. Action list with enable/disable gating: **View 360°** and **Share link** need `status == ready && remoteTourId != null`; **Rooms & hotspots**, **Floor plan**, **Analytics** need only `remoteTourId`; **Generate 3D world** (or "View 3D world" once `model3dUrl` exists) needs ready + remote. Disabled rows show "Available after upload completes".
  3. When status is `failed`, a "Retry upload" button appears: it sets status back to `stitching`, re-enqueues the upload (`repo.enqueueUpload`), shows "Retrying upload…"; on enqueue failure it reverts the status to `failed` and shows "Could not retry the upload." (`asset_detail_screen.dart:149-163`).
  4. "Delete scan" → confirmation dialog ("The panorama, its share link and the published tour are removed.") → `deleteAsset` removes local records, upload jobs, rooms, and local files; best-effort `DELETE /tours/:id`; navigates back to `/`.
- **User story:** "As a photographer, I want one screen that tells me the state of a scan and lets me view, share, extend, or delete it."
- **Expected behavior:**
  - Every action row is disabled with a hint until its precondition is met.
  - Retry only re-runs the upload pipeline (it does not re-stitch).
  - Delete removes: `assets` + `rooms` + `upload_queue` entries, local panorama/thumbnail/frames, and best-effort remote tour/scene.
- **Acceptance criteria:**
  1. A `failed` asset shows Retry upload; tapping it flips status to `stitching` and enqueues a job.
  2. All action rows are disabled with the upload hint while `remoteTourId == null`.
  3. Delete confirmation cancels on Cancel and, on confirm, removes the card from the list and returns to `/`.
- **Known gap:** a stitch failure is a dead end: `_stitchAndUpload` marks the asset `failed` (`capture_controller.dart:356`) with no panorama produced, and "Retry upload" (`asset_detail_screen.dart:149-163`) only re-enqueues the upload pipeline, which then fails at "panorama file missing" (`upload_queue.dart:172`) — there is no "re-stitch" path.

### 3. Guided 360° Capture

#### Feature: 16-shot guided capture with auto-shutter

- **Screens/Components:** `features/capture/presentation/capture_screen.dart`, `features/capture/presentation/capture_controller.dart`, `features/capture/presentation/widgets/target_overlay.dart`, `features/capture/domain/capture_targets.dart`, `features/capture/domain/orientation_engine.dart`
- **User flow:**
  1. `/capture` opens as a fullscreen dialog; camera permission requested; denied → "Camera access is required to scan a room." with "Open Settings".
  2. Back camera initializes at 1080p (`ResolutionPreset.high`), session dir created under `Documents/captures/<timestamp>`, orientation engine (accelerometer + magnetometer, low-pass filtered, yaw zeroed at start) starts streaming at ~30 Hz.
  3. Overlay shows the current target dot (16 targets: 8 horizon @ 45°, 4 up @ +45°, 4 down @ -45°), a center reticle, ghost dots for upcoming targets, and an edge arrow when the target is off-screen. Text instructions: "Turn left/right", "Tilt up/down", "Hold the phone upright" (roll > 15°), "Hold…".
  4. When the phone is aimed within 5° of the target and stable (±2° over the recent window), a 400 ms dwell ring fills and the frame auto-captures; manual shutter and "Skip" are always available. A haptic fires on every saved frame.
  5. After the 16th target (or skipping the last with ≥4 frames) the review sheet appears: frame strip, name field ("Living room"), "Save scan". With <4 frames it stays aiming with "Need N more shots — turn toward an uncovered area".
  6. "Save scan" (existing asset context: "Add room") creates a `ScanAsset`/`Room` locally with `status: stitching`, then kicks off stitching + upload in the background (`unawaited`) and returns to `/` (or to `/asset/:id/rooms` for a room).
  7. App backgrounding pauses the camera + orientation stream; resume re-initializes them.
- **User story:** "As a photographer, I want to be guided through a complete room capture in under a minute, so that I never miss a coverage angle."
- **Expected behavior:**
  - Exposure locks after the first frame to keep seams consistent (best-effort).
  - Shutter pose is read *before* `takePicture()` so the recorded yaw/pitch matches the frame (`capture_controller.dart` `captureFrame`).
  - Frames and orientations are saved in parallel lists (`framePaths`, `frameOrientations`) and persisted as part of the asset/room record.
  - Camera errors show the error message with Retry.
- **Acceptance criteria:**
  1. Capturing all 16 targets with ≥4 frames reaches the review sheet with 16 thumbnails.
  2. Skipping every target still allows finishing with ≥4 frames; with <4 the app demands more shots.
  3. Manual shutter captures at any time and increments the frame count.
  4. Save creates a local asset named from the field ("Untitled room" fallback) with status `stitching` and returns to `/`.
  5. Backgrounding during capture does not crash; resuming restores the camera preview.

#### Feature: Add a room to an existing tour (capture-in-asset mode)

- **Screens/Components:** `capture_screen.dart` (`intoAssetId`), `capture_controller.dart` (`saveScan` → `_stitchRoomAndUpload`), `tours/presentation/room_list_screen.dart` (entry)
- **User flow:**
  1. From `/asset/:id/rooms` tap "Add room" → `/capture?assetId=<id>`.
  2. Capture proceeds identically; review sheet says "Name this room"; Save creates a `Room` (uuid, `remoteSceneId` null) in the `rooms` collection, stitches in the background, then `enqueueRoom` uploads it (room pipeline: presign → putCloudinary → confirm → createScene), then navigates to the room list.
- **User story:** "As a photographer, I want to add extra rooms to an existing tour, so that one property becomes a walkable multi-room tour."
- **Expected behavior:**
  - Room upload waits for the main asset's tour job (`_advanceRoom` returns `idle` until `asset.remoteTourId` exists).
  - The room's scene gets `order_index = index+1` server-side.
- **Acceptance criteria:**
  1. Saving a room adds a tile to `/asset/:id/rooms` and eventually shows "Uploaded".
  2. The room's panorama uploads to the same tour as the main asset.
- **Known gap:** a failed room stitch/upload is invisible forever: `_stitchRoomAndUpload` swallows errors ("Room stays without a panorama; user can delete and recapture", `capture_controller.dart:382`) and `Room` has no status field, so the room list renders any room without `remoteSceneId` as "Uploading…" indefinitely — including rooms whose job terminally failed (`upload_queue.dart` `_advanceRoom` has no `onGiveUp`).

### 4. Stitching & Processing

#### Feature: On-device stitch ladder + cloud re-stitch

- **Screens/Components:** `capture/domain/stitcher_service.dart`, `capture/domain/capture_targets.dart` (FOV constants), `core/models/models.dart` (`AssetStatus`)
- **User flow:**
  1. After Save, `StitcherService.stitch` runs in the background: Rung 1 = OpenCV spherical stitcher (frames downscaled to ≤1600 px, 90 s timeout, output padded to 2:1 equirect); Rung 2 = pure-Dart naive compositing (isolate, 2048×1024, per-frame yaw/pitch inverse-mapped through a pinhole model) which always succeeds.
  2. When `ProcessingPreference.cloudFirst` is set, the OpenCV rung is skipped and frames go straight to the cloud (`preferDevice: false`).
  3. A thumbnail (640 px) is written next to the panorama; both paths are stored on the asset (`panoramaPath`, `thumbnailPath`).
  4. Naive result → asset status `pendingCloudStitch` (raw frames will ride along to the backend); OpenCV result → status stays `stitching` until upload completes.
- **User story:** "As a photographer, I want stitching to always produce a panorama, so that a capture is never wasted on a device that is too slow."
- **Expected behavior:**
  - Naive stitching must not throw; it is the never-fails fallback.
  - Output is equirectangular 2:1 (the web viewer's expected format).
  - Cloud re-stitch (`POST /scenes/:id/stitch` with `frame_urls`) replaces the scene image server-side; the naive pano stays visible until then.
- **Acceptance criteria:**
  1. With `deviceFirst`, 16 frames produce a panorama via OpenCV or, if that fails/times out, via naive compositing — never an error state.
  2. With `cloudFirst`, no OpenCV attempt happens and the asset goes straight to `pendingCloudStitch`.
  3. Stitch output is 2:1; a thumbnail file exists next to the panorama.
- **Known gap:** cloud re-stitch is silently skipped when fewer than 2 frames were uploaded: `if (urls.length >= 2)` (`upload_queue.dart:253-254`) — and missing local frame files are skipped without error during `uploadFrames` — while the asset is still marked `ready`.

### 5. Upload Queue & Background Reliability

#### Feature: Persistent, resumable publish pipeline

- **Screens/Components:** `core/upload/upload_queue.dart`, `core/storage/local_store.dart` (`upload_queue` collection), `core/api/backend_api.dart`, `main.dart` (startup pump)
- **User flow:**
  1. Saving a scan/room enqueues a persisted job: asset jobs (`id = assetId`, kind `asset`) run `createTour → presign → putCloudinary → confirm → createScene → publish → [uploadFrames → requestStitch]`; room jobs (`id = room-<roomId>`, kind `room`) run `presign → putCloudinary → confirm → createScene`.
  2. `enqueue` skips duplicates (one active job per asset); a previously `failed` job is reset via `_resumeStep` with `attempts = 0`.
  3. A single-flight drain processes jobs sequentially; each step persists (`LocalStore.upsert`) before the next, so a crash resumes mid-pipeline without duplicate tours.
  4. `createTour` (`POST /tours`, unlisted, public) stores `remoteTourId` on the asset; `publish` (`POST /tours/:id/publish`) captures `short_code` and, when the asset is `pendingCloudStitch`, switches the job to frame upload + `POST /scenes/:id/stitch` (one frame per pass, resumable).
  5. On failure: attempts++ with exponential backoff (5 s … 5 min) and a re-pump timer; after 8 attempts the job is marked `failed` and the asset status flips to `failed` (asset jobs) — room jobs get no status update.
  6. Connectivity listener re-pumps whenever the network returns; `retry(assetId)` resets failed jobs to their resume step and re-pumps; startup calls `queue.pump()` once to resume interrupted uploads (`main.dart:68`).
  7. UI feedback: none during queue progress — status text comes from the asset record ("Stitching…", "Uploading frames for cloud stitch…"); terminal failure shows the "Failed" badge + Retry upload.
- **User story:** "As a photographer, I want uploads to survive a crash or a dead zone, so that a finished capture is not lost to a flaky connection."
- **Expected behavior:**
  - Each successful step is persisted before the next API call (no duplicated tours on resume).
  - `_resumeStep` never recreates a tour once `tourId` exists, and re-presigns when the stored Cloudinary signature may be expired (`upload_queue.dart:371-380`).
  - Deleting an asset drops its queue jobs and stops pumps from reading its files (`local_asset_repository.dart` `deleteAsset`).
  - Connectivity re-establishment resumes pending jobs automatically.
- **Acceptance criteria:**
  1. A job killed between `createTour` and `presign` resumes at `presign` (not `createTour`) with the same `tourId` after restart.
  2. A failed asset job is retryable from the detail screen and its attempts reset.
  3. Enqueueing the same asset twice produces one active job.
  4. Deleting an asset removes its job and its rooms' jobs.
- **Known gap:** expired Cloudinary presigns on crash-restart burn retries: `_resumeStep` (re-presign) runs only from `enqueue`/`retry` (`upload_queue.dart:75,392`), not from the startup `queue.pump()` (`main.dart:68`), so a job that crashed mid-`putCloudinary`/`confirm` resumes with the stale signature and consumes backoff attempts until it fails.
- **Known gap:** queue failures are invisible to the user (TD-016): there is no progress UI and no per-step error surfacing; the only visible state is the terminal `failed` status, and room-job failures never surface at all (see section 3).

### 6. Tour Management (Rooms & Hotspots)

#### Feature: Room list (multi-room tour)

- **Screens/Components:** `features/tours/presentation/room_list_screen.dart`, `features/assets/data/local_asset_repository.dart` (`rooms` collection)
- **User flow:**
  1. `/asset/:id/rooms` lists the main capture (surfaced as "<name> (main)") plus all saved rooms, newest last; each tile shows a panorama thumbnail, "Uploaded" or "Uploading…", and (non-main, uploaded) a delete button.
  2. "Add room" → `/capture?assetId=…`. Tap an uploaded room → hotspot editor. Empty state (no rooms) explains walkable tours and offers "Add room".
  3. Delete room → confirm dialog → `deleteRoom` removes the local record + panorama file and best-effort `DELETE /scenes/:id`.
- **User story:** "As a photographer, I want to manage the rooms of a property, so that a tour covers every room."
- **Expected behavior:**
  - The main capture is scene 0 and is never deletable from this screen.
  - Rooms without `remoteSceneId` are not tappable (hotspot editing requires an uploaded scene).
- **Acceptance criteria:**
  1. A freshly saved room appears as "Uploading…" and flips to "Uploaded" once its scene is created.
  2. Deleting a room removes it from the list and (best-effort) from the backend.

#### Feature: Hotspot placement (web embed in edit mode)

- **Screens/Components:** `features/tours/presentation/hotspot_editor_screen.dart`, `core/api/backend_api.dart` (`createHotspot`), `core/env.dart` (`viewerBase`)
- **User flow:**
  1. Tap a room in the list → `/asset/:id/rooms/:roomId/hotspots`: a WebView loads `${viewerBase}/embed/<tourId>?editmode=1&minimal=1` with a JavaScript bridge injected (`FlutterBridge`).
  2. The user taps a doorway in the panorama; the embed posts `panoramaClick {yaw, pitch, sceneId}` (degrees), which the bridge relays.
  3. A bottom sheet lists candidate destinations (every uploaded room plus the main scene, minus the tapped one); if none exist, a snackbar says "Add another room first: a hotspot needs somewhere to go."
  4. On selection, angles are clamped (±180° yaw, ±90° pitch) and `POST /scenes/<sceneId>/hotspots` creates a navigation hotspot (`type: navigation`, `target_scene_id`); the `__main__` destination is resolved to the real first-scene id via `GET /tours/:id` (lowest `order_index`).
  5. Success → "Hotspot to 'X' placed" snackbar + WebView reload so the marker appears immediately; failure → error snackbar.
- **User story:** "As a photographer, I want to link rooms by tapping doorways, so that visitors can walk the property in the browser."
- **Expected behavior:**
  - Webview load failures show a retryable error surface.
  - Hotspots are created only against real backend scene ids.
- **Acceptance criteria:**
  1. Tapping the panorama with ≥1 other uploaded scene creates a hotspot and the embed reloads showing it.
  2. With zero other scenes, no API call happens and the explanatory snackbar shows.
  3. A network error on create shows an error snackbar and re-enables placement.
- **Known gap:** the hotspot editor is write-only: it never lists, edits, or deletes existing hotspots, `BackendApi.deleteHotspot` (`backend_api.dart:88`) is never called, and the locally persisted `Room.hotspots`/`Hotspot.remoteId` (`models.dart`) are never populated or read — reloading the embed is the only way to see placed hotspots.

### 7. Floor Plans & LiDAR

#### Feature: Floor plan gallery

- **Screens/Components:** `features/tours/presentation/floor_plan_screen.dart`
- **User flow:**
  1. `/asset/:id/floorplan` (needs `remoteTourId`) fetches `GET /tours/:id/floor-plans` and renders each plan's `image_url` (cached network image) in a list.
  2. Empty → "No floor plan yet." explains plans come from a LiDAR scan, with "Open LiDAR scan" → `/lidar`.
- **User story:** "As a photographer, I want to attach a measured floor plan to a tour, so that buyers see real room dimensions."
- **Expected behavior:**
  - Image load failures show "Image unavailable"; API errors show the error text.
- **Acceptance criteria:**
  1. A tour with floor plans renders one image per plan.
  2. A tour without plans shows the empty state with the LiDAR CTA.

#### Feature: LiDAR room scan (Apple RoomPlan)

- **Screens/Components:** `features/lidar/presentation/lidar_scan_screen.dart`, `app/packages/lidar_scanner/`
- **User flow:**
  1. `/lidar` checks capability (`LidarScanner.checkCapability`); unsupported devices get "LiDAR not available on this device." with a "Use guided photo scan" CTA → `/capture`.
  2. "Start scanning" launches the native RoomPlan session; the app shows live instruction, progress bar, and wall count from `scanEvents`.
  3. "Finish scan" (or the native Done button) → `stopScan` → measurements list (label, meters, "±2 cm" lidar accuracy or "estimate").
  4. "Share 3D scan" shares the USDZ via the system sheet; "Scan again" restarts.
- **User story:** "As a photographer on a Pro iPhone, I want true-to-scale room measurements, so that listings can show real dimensions."
- **Expected behavior:**
  - Popping the screen mid-scan stops the native session (camera release).
  - Errors (start/session/stop) surface as inline error text.
- **Acceptance criteria:**
  1. Unsupported device shows the fallback screen, not a crash.
  2. A completed scan lists measurements with accuracy labels and can share the USDZ.
- **Known gap:** the LiDAR scan is not wired into the asset pipeline — the USDZ is only shared to the system sheet; there is no upload of the scan to the tour in the app code (the floor plan association is backend-side, and the floor plan screen is read-only). Note `AssetType.lidar` (`models.dart`) is defined but never used.

### 8. Publishing & Sharing

#### Feature: Publish tour + public link, QR code, embed code

- **Screens/Components:** `features/share/presentation/share_screen.dart`, `features/share/data/api_share_repository.dart`, `features/share/domain/embed_code.dart`, `core/models/models.dart` (`ShareLink`)
- **User flow:**
  1. `/asset/:id/share` (needs `remoteTourId`): `ApiShareRepository.createLink` reuses the asset's `shareCode` if present; otherwise `POST /tours/:id/publish` mints it, and the code is persisted back to the asset.
  2. The public link is `${apiRoot}/v/<code>` — a backend OG page that redirects to the web viewer; if the backend returns no `short_code`, the fallback URL is `${viewerBase}/view/<tourId>`.
  3. "Share" opens the system share sheet with the link; "Copy link" copies it; QR code loads from `GET /tours/:id/qr-code` (rendered as bytes; "QR unavailable" on error).
  4. The embed section shows a generated iframe (`generateEmbedCode(tourId)`: `src="${viewerBase}/embed/<tourId>"`, width 100%, height 480, allowfullscreen, sandbox, lazy-loading, `style="border: none; border-radius: 8px;"`), copyable.
  5. Publish failures surface as "Could not publish the tour. Check your connection and try again." with a Try again button (`SharePublishException`).
- **User story:** "As a photographer, I want a shareable link, QR, and embed snippet for every tour, so that I can put the tour in front of clients in any channel."
- **Expected behavior:**
  - Publishing happens once: a persisted `shareCode` is never re-published.
  - The link is selectable (long-press copy) and opens any device's browser.
- **Acceptance criteria:**
  1. First visit to Share with no `shareCode` calls `POST /tours/:id/publish` once and persists the code.
  2. Second visit uses the persisted code with no API call.
  3. Copy link / copy embed code show snackbar confirmations.
  4. A publish network failure shows the friendly error and allows retry (invalidate).
- **Known gap:** dead code: `ShareLink.embedCode` getter (`models.dart:334`, an `<iframe src="$url?embed=1" width="800" height="450">` snippet) is never used — the share screen uses `generateEmbedCode` from `embed_code.dart` instead; `ShareRepository.getLink` is a stub returning null (`api_share_repository.dart:66`) and never called in-app. `url_launcher` is declared in `pubspec.yaml` but unused anywhere in `lib/`.

### 9. Tour Viewing (Embed / 3D)

#### Feature: In-app WebView viewer

- **Screens/Components:** `features/viewer/presentation/viewer_screen.dart`, `core/env.dart` (`viewerBase`)
- **User flow:**
  1. From the asset detail "View 360°" → `/asset/:id/view` (pano mode): a WebView loads `${viewerBase}/embed/<tourId>?minimal=1&branding=0` — the same chromeless renderer the public share link uses.
  2. "View 3D world" → `/asset/:id/view?mode=3d` loads `${viewerBase}/view3d/<tourId>`.
  3. While `remoteTourId` is missing, the screen shows a spinner ("still loading") or "This tour is still uploading…"; terminal states show an actionable "not available to view yet" message.
  4. Load errors show "Could not load the tour." with Retry (reloads the same tour id); main-frame errors only.
- **User story:** "As a photographer, I want to preview exactly what my client will see, so that I can verify the tour before sharing it."
- **Expected behavior:**
  - The load is kicked off once per tour id (`_loadStarted` guard), from `didChangeDependencies` or a provider listener — never from `build`.
  - pano vs 3d mode selects the URL only; both live in the same screen.
- **Acceptance criteria:**
  1. A ready asset with a tour id loads the embed and clears the loading spinner on page finish.
  2. mode=3d loads `/view3d/<tourId>`; mode=pano loads `/embed/<tourId>?minimal=1&branding=0`.
  3. Retry after a web-resource error reloads the same URL.

### 10. Analytics

#### Feature: Tour view analytics

- **Screens/Components:** `features/analytics/presentation/analytics_screen.dart`, `features/share/data/api_share_repository.dart` (`getAnalytics`)
- **User flow:**
  1. `/asset/:id/analytics` (needs `remoteTourId`) fetches `GET /tours/:id/analytics` and maps `total_views` → Views, summed `session_durations` → Time spent (formatted s/m/h), summed `hotspot_clicks` values → "Showing requests" (viewers who tapped "Request showing").
  2. Zero views → a CTA card "Share your tour to start getting views." → `/asset/:id/share`.
  3. Pull-to-refresh invalidates and re-fetches; API errors show "Analytics unavailable".
- **User story:** "As a photographer, I want to see how many people opened my tour and how long they stayed, so that I can prove engagement to clients."
- **Expected behavior:**
  - Stats render as three cards with labels and details; refresh works without leaving the screen.
- **Acceptance criteria:**
  1. A tour with data renders Views, Time spent, and Showing requests from the API payload fields.
  2. A zero-view tour shows the share CTA linking to the share screen.
  3. Pull-to-refresh re-fetches from the backend.

### 11. 3D World Generation

#### Feature: Cloud 3D world job (with polling) + on-device photogrammetry

- **Screens/Components:** `features/threed/presentation/generate_3d_screen.dart`, `core/api/backend_api.dart` (`generate3dWorld`, `getAiJob`), `core/models/models.dart` (`model3dUrl`)
- **User flow:**
  1. `/asset/:id/generate3d` (needs `remoteTourId`; otherwise a message says upload first): "Generate 3D world" → `POST /tours/:id/generate-3d` → job id captured.
  2. The screen polls `GET /ai/jobs/:id` every 5 s, showing a progress bar (5–99%). "completed" → saves `model3dUrl = ${viewerBase}/view3d/<tourId>` and `type: model3d` on the asset, shows "Your 3D world is ready." with "View 3D world" → `/asset/:id/view?mode=3d`. "failed" → error message from the job. Poll errors: 5 consecutive failures or 360 polls (30 min) → "Lost contact…"/"Generation is taking longer than expected."
  3. If the asset has local frames and no job is running/done, an alternate "Build on device (photogrammetry)" button runs RealityKit photogrammetry (iOS 17+, LiDAR-class) over the frames and shares the resulting USDZ.
  4. Assets with an existing `model3dUrl` show "View 3D world" directly (both from this screen and the detail screen's action label).
- **User story:** "As a photographer, I want a walkable 3D version of a room, so that buyers can experience depth, not just a panorama."
- **Expected behavior:**
  - Progress is job-driven; completion persists `model3dUrl` so the detail screen's action becomes "View 3D world" after a restart.
  - Leaving the screen cancels polling but not the backend job.
- **Acceptance criteria:**
  1. Starting generation calls `POST /tours/:id/generate-3d` and polls the returned job id.
  2. On "completed", the asset persists `model3dUrl` and the UI offers "View 3D world".
  3. On "failed", the job's error message is shown and Retry restarts.
  4. Photogrammetry shares a USDZ or shows the iOS-17/LiDAR-unsupported message.
- **Known gap:** `AssetStatus.processing3d` is never set — the enum and its UI badge ("Building 3D…", `asset_list_screen.dart:242`) exist, but the 3D screen only keeps widget-local `_jobId/_progress/_done` state, and the job state is not persisted: killing the app mid-generation loses the job id, and reopening shows "Generate 3D world" again (which would start a new job) instead of resuming.

### 12. Settings & Processing Preferences

#### Feature: Processing preference + capture hardware

- **Screens/Components:** `features/settings/presentation/settings_screen.dart`, `features/settings/domain/processing_preference.dart`, `app/packages/insta360_capture/`
- **User flow:**
  1. `/settings` shows a radio group: "On-device first" (default; cloud only steps in when device stitching fails) vs "Cloud first" (ship raw frames to the backend stitcher; needs a connection).
  2. The choice persists to `SharedPreferences` (`processing_preference`), written before the UI state flips; a failed write reverts the selection and shows "Could not save the preference. Try again."
  3. "LiDAR room scan" tile → `/lidar`. "Insta360 camera" tile probes the network (`Insta360Capture.discoverCameras`): "Looking for a camera…" → "None found. Join the camera's WiFi and reopen." or "<name> detected. SDK linkage pending".
- **User story:** "As a photographer, I want to choose where heavy processing runs, so that weak phones still produce good panoramas."
- **Expected behavior:**
  - The preference is read by the capture controller at save time (`preferDevice = pref != cloudFirst`) and honored by the stitch ladder.
- **Acceptance criteria:**
  1. Selecting Cloud first persists across app restarts and makes captures skip the OpenCV rung.
  2. A failed preference write keeps the radio on the persisted value and shows the error snackbar.
  3. The Insta360 tile shows the three states (searching / none / detected) without crashing on unlinked SDK.

### 13. Cross-App Flows (Mobile ↔ Web Viewer)

The mobile `viewer` and `share` features load web routes at runtime over WebView. Root `AGENTS.md` requires byte-parity between `mobile/app/lib/features/share/domain/embed_code.dart` and `web/src/utils/embedCode.ts` (covered by `mobile/app/test/embed_code_test.dart`), and the web routes involved are `/view/:id`, `/view3d/:id`, `/embed/:id` (`web/src/constants/routes.ts`).

#### Feature: Mobile publish → web public viewer

- **Flow:** Mobile upload pipeline publishes the tour (`POST /tours/:id/publish`) and stores `short_code` (`upload_queue.dart` publish step). The share screen surfaces `${apiRoot}/v/<code>` (`Env.apiRoot`, `https://api.360ghar.com`) — a backend OG page that redirects to the web public viewer route `/view/:id` (`web/src/constants/routes.ts` `PUBLIC_TOUR`). Fallback for backends without short codes: `${viewerBase}/view/<tourId>` directly.
- **User story:** "As a photographer, I want the link I share from my phone to open the full public web viewer on any device."
- **Expected behavior:** the URL is browser-openable without auth; the asset's `shareCode` persists so the same link is stable across app restarts.
- **Acceptance criteria:** a published tour's share URL contains the tour's short code and resolves to the web viewer route; reopening Share after restart shows the same URL without a new publish call.

#### Feature: Mobile share → embed code → web /embed/:id

- **Flow:** `generateEmbedCode(tourId)` produces an iframe with `src="${Env.viewerBase}/embed/<tourId>"` (no query params by default) and iframe attributes (`allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope"`, `sandbox="allow-scripts allow-same-origin allow-popups allow-forms"`, `referrerpolicy="strict-origin-when-cross-origin"`, `allowfullscreen`, `loading="lazy"`, `style="border: none; border-radius: 8px;"`). The embed page is the chromeless public embed route `EMBED_TOUR` (`/embed/:id`).
- **User story:** "As a photographer, I want to paste one snippet into my listing site, so that the tour renders inline."
- **Acceptance criteria:** the copied snippet contains the viewer host, the tour id, and the sandbox/allow attributes; pasting it into an HTML page loads the embed.

#### Feature: Mobile viewer screen → web /embed/:id and /view3d/:id

- **Flow:** the in-app viewer (`viewer_screen.dart`) loads `${viewerBase}/embed/<tourId>?minimal=1&branding=0` for pano mode and `${viewerBase}/view3d/<tourId>` for 3d mode — the same web pages public visitors use, in a chromeless frame.
- **User story:** "As a photographer, I want to preview the exact public experience in the app before sharing."
- **Acceptance criteria:** pano mode loads the embed URL with `minimal=1&branding=0`; 3d mode loads `/view3d/<tourId>`; both clear the loading spinner on page-finish.

#### Feature: Hotspot editor → web /embed/:id?editmode=1&minimal=1

- **Flow:** `hotspot_editor_screen.dart` loads `${viewerBase}/embed/<tourId>?editmode=1&minimal=1` and injects a `message` listener bridging `window.parent` posts to a `FlutterBridge` JavaScript channel. The embed posts `panoramaClick {yaw, pitch, sceneId}`; the app creates the navigation hotspot via the backend, then reloads the embed.
- **User story:** "As a photographer, I want to place room-to-room links by tapping the panorama itself."
- **Acceptance criteria:** a panorama tap triggers exactly one `createHotspot` call with clamped angles and a valid `target_scene_id`, and the embed reloads showing the marker.

#### Parity contract & current divergence (bytes)

- **Contract:** `embed_code.dart` "keep the iframe attributes in sync" with `web/src/utils/embedCode.ts`; the Dart test `embed_code_test.dart` pins the iframe attributes, the URL host, and `minimal=1&branding=0`.
- **Current divergence (verified against both files):**
  - **Height:** mobile default `height: 480` (`embed_code.dart` `generateEmbedCode`) vs web `DEFAULT_OPTIONS.height = 500` (`web/src/utils/embedCode.ts`).
  - **Query params:** mobile emits `minimal=1` and `branding=0` (`embed_code.dart`) while web emits `minimal=true` / `branding=false` (boolean strings, `buildQueryParams`); the web generator also adds `autoplay=true` by default, which the mobile snippet never includes.
  - **Dimensions:** web formats numeric dimensions with a `px` suffix (`formatDimension`) and defaults `width: '100%'`; mobile hardcodes `width="100%"`, `height="480"`.
- **Known gap:** `embed_code_test.dart` is self-referential — it asserts the Dart constants (including `height="480"` and `minimal=1&branding=0`) against themselves, not against `web/src/utils/embedCode.ts`, so it cannot catch the divergences above; the doc-level contract in root `AGENTS.md` is not mechanically enforced.

#### Feature: Deep links into the app

- **Flow:** `main.dart` listens on `AppLinks().uriLinkStream` and routes `/v/{code}` (share links) and `/view/{id}` / `/view3d/{id}` (viewer links) to the matching local asset when this device owns it, navigating to `/asset/:id` (`main.dart:97-115`).
- **User story:** "As a photographer, I want to tap my own share link on my phone and land on the tour, so that I can manage it immediately."
- **Expected behavior:** only assets owned by the signed-in user match; unmatched links are ignored.
- **Acceptance criteria:** tapping a `/v/<code>` link for an owned asset opens that asset's detail screen.
- **Known gap:** deep-link gaps — `/view3d` and `/view` links both land on the plain detail screen (no 3D viewer routing, `main.dart:111-112`), links for assets not on this device are silently ignored, and cold-start links are dropped because only the streaming API is subscribed (`uriLinkStream`, no `getInitialUri`), so a link that launched the app never arrives.

## Cross-cutting notes

- **Persistence:** all app data lives in JSON collections under the app documents dir (`assets`, `rooms`, `upload_queue`), written atomically (tmp file + rename) and streamed via `LocalStore.watch`.
- **Known gap:** `LocalStore` quarantines corrupt JSON only on `FormatException` (`local_store.dart:44`) — other malformed shapes (e.g. a wrong-typed entry) propagate and can break the whole list read.
- **Known gap:** there is no boot-time sweep for orphaned capture frames: `main()` only pumps the upload queue (`main.dart:68`), so `Documents/captures/*` directories from aborted capture sessions are never cleaned.
- **Dead code inventory:** `ShareLink.embedCode` (`models.dart:334`), `getLink` stub (`api_share_repository.dart:66`), `AssetType.lidar` (never assigned), `BackendApi.deleteHotspot` (never called), `url_launcher` dependency (`pubspec.yaml:44`), and the `assets`/`viewer` features have no domain/data layers (presentation-only).
