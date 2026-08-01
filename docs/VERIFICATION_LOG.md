# 360-tours — Verification Log

Phase-2 verification results for every user story in `docs/FEATURES_AND_USER_FLOWS.md` (the canonical story doc). Each story's acceptance criteria were verified against the code by tracing implementation paths and running targeted existing tests; criteria requiring a live backend/device are marked `NOT-RUN(b)` (static trace only). Every error found is logged with file:line evidence and feeds the fix pass. Status key: **PASS** / **PARTIAL** / **FAIL** / **NOT-RUN(b)** = needs backend or device, static trace only.

Baselines: web `npm run test:run` — 382 tests pass (a first run showed 3 flaky failures in `src/test/user-behaviors/editor/upload-confirmations.test.tsx`; an immediate rerun passed all 382 — flaky timing, tracked in web fixes). Mobile `flutter test` — 32/32 pass.

# Verification Log — Web: Public, Auth, Viewer (Phase 2)

Verification of the web user stories in `docs/FEATURES_AND_USER_FLOWS.md` sections **Landing & Marketing** (incl. 404 page), **Authentication & Account**, **Public Tour Viewing**, **Embed & Share** (public parts), and **3D Viewing & Lab**, against the actual code in `web/src`.

Method: static trace of every acceptance criterion to `file:line`, targeted unit tests, and a vacuous-assertion audit of the four e2e specs (`landing.spec.ts`, `auth.spec.ts`, `public-viewer.spec.ts`, `performance.spec.ts`). No bugs were fixed — all issues are logged below.

**Status legend:** `PASS` = implemented in code (static trace and/or unit test); `PARTIAL` = implemented with a deviation; `FAIL` = not implemented / contradicts code; `NOT-RUN(b)` = requires a live backend/Supabase — static trace only, the traced path supports the criterion unless noted.

**Unit tests run** (all green, 9 files / 229 tests): `embedCode.test.ts` (44), `embedMessages.test.ts` (7), `hotspotContent.test.ts` (7), `client.test.ts` (19), `authStore.test.ts` (23), `validation.test.ts` (121), `EmbedTourPage.test.tsx` (1), `View3DPage.test.tsx` (5), `HotspotContentModal.test.tsx` (2).

---

## 1. Landing & Marketing

### Story: Marketing landing page

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: anonymous user at `/` renders hero, social proof, AI showcase, how-it-works, features, pricing, CTA in order | PASS | `HomePage.tsx:17-33` renders HeroSection → SocialProofBar → AIShowcase → HowItWorks → FeaturesGrid → PricingSection → FinalCTA in exactly this order; `HowItWorks.tsx:6-22` has exactly 3 steps (01/02/03) | Eagerly loaded; `router.tsx` (HomePage eager import) |
| AC2: authenticated user at `/` navigates to `/dashboard` | PASS | `router.tsx` `RootRedirect` (~L100-107): `if (isAuthenticated) return <Navigate to={ROUTES.DASHBOARD} replace />` | |
| AC3: click "Get Started" → `/register` | PASS | `PublicLayout.tsx` "Get Started" `Link to={ROUTES.REGISTER}`; Hero "Start Free" → `/register` (`HeroSection.tsx` CTA block) | |
| AC4: theme toggle applies light/dark/system and persists | PASS | `uiStore.ts` `persist` middleware, key `360viewer_theme`, `partialize` theme+sidebar; `applyTheme()` toggles `.dark`; `PublicLayout.tsx` toggle button; `App.tsx` `ThemeInitializer` reapplies on load | Cycle: light→dark→system→light |
| Expected: landing loads fast, no auth calls | PASS | HomePage has zero data fetches; router imports it eagerly. `AuthInitializer` (`App.tsx:28-62`) runs `checkAuth()` on every boot, but for anonymous visitors `checkAuth` short-circuits with no network call (`authStore.ts` ~L352-357) | Signed-in users never see the landing (RootRedirect) |
| Expected: demo auto-rotates, pauses on interaction, resumes after 2s idle, respects reduced-motion | PASS | `Demo360Viewer.tsx`: `RESUME_DELAY=2000` (L25), `startAutoRotate` skips when `prefers-reduced-motion` (L40, L52-54), pause/resume via pointerdown/wheel/touchstart (L109-111), `motionQuery` change listener (L112) | Remote panorama from `photo-sphere-viewer-data.netlify.app` — see error #8 |
| Expected: MetaTags sets title/description/keywords | PASS | `MetaTags.tsx:44-130` sets title, description, keywords, robots, OG + twitter tags, canonical | |
| Expected: mobile menu exposes same links, closes on Escape | PASS | `PublicLayout.tsx` mobile menu with `#features/#pricing/#how-it-works` + Sign in/Get Started; Escape listener (L40-50) | |

### Story: 404 page

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: unknown URL renders 404 with "Go Home" and "Go Back" | PASS | `NotFoundPage.tsx:14-33`; router `*` catch-all eagerly imports NotFoundPage (no spinner) | |
| AC2: history > 1 → Go Back navigates back, else `/` | PASS | `NotFoundPage.tsx:7-13` `handleGoBack`: `window.history.length > 1 ? navigate(-1) : navigate(ROUTES.HOME)` | |

---

## 2. Authentication & Account

### Story: Sign in (identifier → password or OTP)

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: verified account + correct password → return path + header shows name | NOT-RUN(b) | `LoginPage.tsx` `onSubmitPassword` (L202-208) → `authStore.loginWithPassword` (L200-214) → `supabaseAuth.signInWithEmailPassword/signInWithPassword` → `completeSupabaseSession` (GET `/users/me`) → `navigate(from)`; header name comes from `authStore.user` via DashboardLayout | Code path fully supports |
| AC2: unknown identifier → OTP sent, login completes only after set-password step | NOT-RUN(b) | `LoginPage.tsx` `onSubmitIdentifier` (L165-199): `checkIdentifierStatusSafe` → `next_step=otp`; `setRequiresPasswordSetup(!status.exists || !status.has_password)` (L186-188) → OTP step → mandatory `set-password` step (L210-224, 226-237) | |
| AC3: invalid OTP → inline error, step not advanced | PASS | `authStore.verifyLoginOtp` throws mapped error (`authErrors.ts` `invalid_credentials`/`invalid_grant` → "Invalid code…"); `LoginPage.tsx` `onSubmitOtp` catch sets `localError`, step stays `otp` (L216-224); `otpSchema` (validation.ts) blocks non-numeric/too-short input client-side | Live OTP round trip needs backend |
| AC4: 5xx on identifier-status → "unavailable" message, no OTP sent | PASS | `api/auth.ts` `checkIdentifierStatusSafe` returns `{unavailable:true}` on any transport/5xx error; `LoginPage.tsx` L170-175 sets `IDENTIFIER_STATUS_UNAVAILABLE_MESSAGE` and returns before any OTP call | |
| Expected: errors render inline `role="alert"`; OTP resend 30s cooldown; Google-callback errors render banner; return path validated, default `/dashboard` | PASS | `LoginPage.tsx` alert L90-95; `useResendTimer` (`useResendTimer.ts:25`, RESEND_OTP_SECONDS) gating resend; `callbackErrorMessage` + banner effect L124-128; `isSafeReturnPath`/`safeReturnPath` L33-63 (blocklist login/register/auth-callback, `//`, defaults to dashboard) | |
| Expected: last-used method pre-selected from localStorage | PARTIAL | `LoginPage.tsx` L116-121 pre-selects the **channel** only for email methods (`email_password`/`email_otp`); phone is the hard default and no method-level UI selection exists; hint text shows the last method | Doc overstates "the last-used method is pre-selected" |

### Story: Create account (register)

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: unverified identifier + valid inputs → OTP verified → set password → `/dashboard` | NOT-RUN(b) | `RegisterPage.tsx` step flow: `requestEmailOtp/requestOtp` with `shouldCreateUser: true` + `data:{full_name}` (L107-119) → OTP verify establishes session (L151-165) → `supabaseAuth.updatePassword` + `fetchCurrentUser()` → `navigate(ROUTES.DASHBOARD, {replace:true})` (L180-202) | |
| AC2: mismatched passwords → inline error blocks submission | PASS | `RegisterPage.tsx` `onSubmitSetPassword` L174-178: `Passwords do not match.` | |
| AC3: unchecked terms → inline terms error | PASS | `RegisterPage.tsx` L84-93 (`setTermsError`), rendered with `role="alert"` | |
| Expected: full name required; resend 30s cooldown after confirmed send; errors keep current step | PASS | `RegisterPage.tsx` L82-84 (`Full name is required.`); `resendTimer.start()` only after awaited send (L190); step state untouched on catch | |
| **Known gap (confirmed):** registration never checks identifier status; always `shouldCreateUser: true`, so an existing identifier's OTP can be verified and `updatePassword` overwrites that account's password | FAIL (gap confirmed) | `RegisterPage.tsx:107-119` (no `checkIdentifierStatus` call anywhere in the file); OTP verify L151-165; `updatePassword` L185-201. Doc cited `RegisterPage.tsx:112-146` — actual lines 107-119/151-201 | Account-hijack class issue; see Ranked Errors #1 |

### Story: Password reset (forgot password)

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: existing identifier → OTP verified → new password → success screen | NOT-RUN(b) | `ForgotPasswordPage.tsx` `onRequestOTP` (L96-128) → `requestPasswordResetEmailOTP/OTP` (`api/auth.ts` `shouldCreateUser:false`) → `verifyPasswordReset*OTP` → `reset` step → `authApi.updatePassword` → `success` step with "Back to sign in" (L58-83) | |
| AC2: wrong OTP → inline error, stays on verify step | PASS | `onVerifyOTP` catch sets `error`, step stays `verify` (L135-146) | Live OTP needs backend |
| Expected: resend with cooldown; errors keep step; success is a dead-end with link to `/login` | PASS | `resendOtp` gated on `resendTimer.isCoolingDown` (L70-87); success screen renders only Link to LOGIN (L63-66) | |
| **Known gap (confirmed):** request step reveals account existence | FAIL (gap confirmed) | `ForgotPasswordPage.tsx:111-115` `if (!status.exists)` → "No account found with this email or phone…" (doc cited :113 — exact) | Account enumeration; see Ranked Errors #2 |

### Story: Google OAuth sign-in & callback

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: staff Google account → lands on stashed path with session | NOT-RUN(b) | `LoginPage.tsx` `onGoogle` (L260-272) `stashOAuthNext(from)`; `AuthCallbackPage.tsx` `consumeOAuthNext` (L38) → `exchangeCodeForSession` (L51) → `getCurrentUser` → staff gate passes → `navigate(safeNext)` (L66) | |
| AC2: non-staff Google account → session cleared, `/login?error=not_staff` | NOT-RUN(b) | `AuthCallbackPage.tsx:54-59`: `!STAFF_ROLES.has(user.role)` → `signOut()` + `clearAuth()` + navigate `?error=not_staff`; `LoginPage.tsx` renders friendly banner (L20-29, 124-128) | `STAFF_ROLES = {agent, admin}` (L18) |
| AC3: callback without `code` → `/login?error=auth` | PASS | `AuthCallbackPage.tsx:45-47` | |
| Expected: return path survives OAuth round trip; double-invoke guarded | PASS | `stashOAuthNext`/`consumeOAuthNext` sessionStorage (`supabaseAuth.ts:96-126`); `handledRef` guard `AuthCallbackPage.tsx:23` | |
| **Known gap (confirmed):** next-path handling fragile in dev StrictMode | FAIL (gap confirmed) | `AuthCallbackPage.tsx:23-38`: `handledRef.current = true` before `consumeOAuthNext` (L38); a re-run after an interrupted first pass would consume/drop the stash | Doc cited `AuthCallbackPage.tsx:38` — exact |

### Story: Session lifecycle & route protection

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: unauthenticated on `/tours` → `/login`, returns to `/tours` after sign-in | NOT-RUN(b) | `ProtectedRoute.tsx:29-33` `Navigate to LOGIN state={{from: location}}`; `LoginPage.tsx` `safeReturnPath` reads `location.state.from` (L54-63) and navigates there after password/OTP/set-password; Google path preserves it via sessionStorage | Round trip needs live backend |
| AC2: expired access token → one refresh attempt before sign-out | PASS | `client.ts:107-151`: `MAX_TOKEN_RETRY_ATTEMPTS = 1` (L9), retry once with `tryRefreshToken`, then `expireSessionIfStillStale` → `supabaseAuth.signOut()` + `notifyAuthExpired()`; covered by `client.test.ts` (19 tests) | |
| AC3: 500 on dashboard call → stays signed in, error state | PASS | `client.ts` 5xx/network retry max 3, no sign-out (L169-179); `authStore.isAuthError` only 401/403/SESSION_EXPIRED (L19-35); `authStore.test.ts` "preserves the current session on transient current-user errors" | |
| Expected: 5xx/network never sign out; expired sessions redirect with `next` | PASS | `App.tsx:37-52` `onAuthExpired` → `/login?next=<path>` with blocklist (login/register/callback); `authStore.fetchCurrentUser`/`checkAuth` preserve session on transient errors | |
| **Known gap (confirmed):** public pages share the authed client — a 401 on a public endpoint triggers refresh → sign-out cascade | FAIL (gap confirmed) | `client.ts:107-151` (401 block applies to every request incl. `/public/tours/:id`); request interceptor attaches Bearer whenever tokens exist (L62-73), so `hadAuthHeader` guard doesn't protect signed-in public viewing; `App.tsx:37-52` then hard-redirects to login | See Ranked Errors #3 |

---

## 3. Public Tour Viewing

### Story: Public tour viewer

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: `?scene=<id>` → that scene renders first | PASS | `PublicTourPage.tsx` initial-scene effect (L160-178): `requestedScene || configuredInitialScene || sortedScenes[0].id`, `sceneExists` validated | |
| AC2: navigation hotspot click → transition to target scene | PASS | `PanoramaViewer.tsx:676-677` and `726-727`: navigation + `target_scene_id` → `onSceneChange(target_scene_id)`; public page wires `onSceneChange={setCurrentScene}` (PublicTourPage.tsx L449-451) | |
| AC3: `?navbar=false` hides thumbnail strip | PASS | `PublicTourPage.tsx` `viewerSettings` (L120-146): `show_navbar = (base.show_navbar ?? true) && navbarParam`; strip gated `showNavbar && sortedScenes.length > 1` (L490) | |
| AC4: custom-HTML hotspot renders in sandboxed iframe with CSP | PASS | `HotspotContentModal.tsx` `SandboxedHtml`: `sanitizeHotspotHtml` + `<meta http-equiv="Content-Security-Policy" content={HOTSPOT_HTML_CSP}>` + `sandbox="allow-popups"` + `referrerPolicy="no-referrer"`; covered by `HotspotContentModal.test.tsx` (2 tests) + `hotspotContent.test.ts` (7) | |
| Expected: loading spinner → "Tour Not Found" / "No rooms available"; SEO meta + JSON-LD; shortcuts guarded against inputs | PASS | Spinner L372-375; not-found L379-387; zero scenes L389-398; `MetaTags` + `VirtualTourStructuredData` L401-427; keyboard handler skips INPUT/TEXTAREA/SELECT/contenteditable L191-198 | JSON-LD `@type` is `ImageGallery` — see Ranked Errors #13 |
| **Known gap (confirmed):** any fetch failure (network/5xx/non-404) shows "Tour Not Found" — errors conflated with 404 | FAIL (gap confirmed) | `PublicTourPage.tsx:379-387` — the only error branch is `if (!tour)`; `isError` from the query is never read (unlike `EmbedTourPage.tsx:372-378,388-399` which distinguishes) | See Ranked Errors #5 |

### Story: Tour likes

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: successful like → heart stays filled | PASS | `PublicTourPage.tsx` `handleLikeToggle` (L340-368): optimistic `setIsLiked(next)`, revert only in `catch`; heart renders `text-red-500`/`fill-current` when liked (L498-504) | |
| AC2: failed like → reverts to unliked | PASS | `catch { setIsLiked(!next) }` (L362-364); `isLiking` guard prevents parallel toggles | |
| Expected: like persists server-side per session | NOT-RUN(b) | `tours.ts` `likePublicTour`/`unlikePublicTour` POST/DELETE `/public/tours/:id/like` with `x-session-id` header | |
| **Known gap (confirmed):** like state never hydrated — `isLiked` starts `false`, no fetch of existing like | FAIL (gap confirmed) | `PublicTourPage.tsx:60` `const [isLiked, setIsLiked] = useState(false)`; no hydration call anywhere; previously liked tour always renders unliked | See Ranked Errors #6 |

### Story: Public analytics tracking

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: tour load → `tour_view` and `session_start` posted | PASS | `usePublicTourTracking.ts`: `tour_view` once per mount via `hasTrackedViewRef` (L49-55); `session_start` on `tourLoaded` (L57-66) | |
| AC2: scene change → `scene_view` for new scene | PASS | `usePublicTourTracking.ts:105-111` effect on `currentSceneId` | |
| AC3: page close → `session_duration` with keepalive | PASS | `usePublicTourTracking.ts:67-103`: `fetch(url, {keepalive: true})` with Authorization header, `sendBeacon` legacy fallback | Failures silent (console.debug) |
| Expected: tracking never blocks rendering; one session id per tab | PASS | `getSessionId()` sessionStorage-backed with fallback (L9-24); all `trackEvent` calls are fire-and-forget | |

---

## 4. Embed & Share

### Story: Share modal (link, QR, social, embed)

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: copy link → success toast + check icon | PASS | `ShareModal.tsx` `handleCopyLink` (L72-90): `copyToClipboard` → toast + `setCopiedLink(true)` 2s; failure → error toast | |
| AC2: QR tab renders QR for share URL; PNG + SVG downloads work | PASS | `ShareModal.tsx` auto-generate on open (L58-70), 200px preview; `handleDownloadQR` (L102-116) → `downloadQRCodePNG/SVG` 512px (`qrCode.ts`) | |
| AC3: embed options → iframe includes corresponding query params | PASS | `ShareModal.tsx` embed tab (width/height inputs L203-260); `embedCode.ts` `generateIframeCode` → `buildQueryParams` maps autoplay/navbar/minimal/autohide/fullscreen/vr/rotate/branding/scene (boolean strings `true`/`false`); covered by `embedCode.test.ts` (44 tests) | UI exposes only width/height; other options use defaults |
| Expected: share URL single source via `generateShareUrl`; copy failures surface | PASS | `embedCode.ts` `generateShareUrl`: `${backend}/share/tours/${id}?redirect=${origin}/view/${id}`; used by ShareModal + copy handling above | |
| **Known gap (confirmed):** custom domains fully implemented but wired to no page | FAIL (gap confirmed) | `components/features/CustomDomainSetup.tsx` + `api/customDomains.ts` exist; only imported by its own unit test (`test/user-behaviors/account/custom-domain-setup.test.tsx`), no page/route imports it | Share links always use app origin |

### Story: Embed viewer (iframe + postMessage protocol)

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: embed loads → parent receives `ready` with metadata | PASS | `EmbedTourPage.tsx` ready post with title/sceneCount/currentSceneId (both camelCase + snake_case) (L222-248); covered by `EmbedTourPage.test.tsx` (1 test) + `embedMessages.test.ts` (7) | |
| AC2: `goToScene` for existing scene navigates; inbound origin-checked | PASS | `EmbedTourPage.tsx:264-313`: `event.source !== window.parent && event.source !== window` rejected; `goToScene` validates `sortedScenes.some(...)`; `nextScene`/`previousScene`/`toggleFullscreen` handled | |
| AC3: `?minimal=true&autohide=true` → chrome limited to arrows/counter, controls fade after 3s | PASS | `EmbedTourPage.tsx`: `minimalChrome` hides logo (L414-419), floor plans (L421-427), full navbar (L430-491), shows only arrows + compact counter (L493-526); autohide effect (L330-370) hides controls after 3000ms inactivity | |
| AC4: tour fetch error → `error` message posted + error screen | PASS | `EmbedTourPage.tsx:372-378` posts `{type:'error'}` on `tourError`; error screen L388-399 | |
| Expected: watermark respects `branding`; cross-origin post falls back to `*` only when parent origin inaccessible | PASS | `viewerSettings.branding.show_watermark = base && showBranding` (L126-146); `postMessage` try/catch `window.parent.postMessage(..., window.parent.origin)` → catch → `*` (L168-180) | |
| **Known gap (confirmed):** `embed.js` origin param unread | FAIL (gap confirmed) | `public/embed.js` `buildEmbedUrl` appends `origin=<embedding page>` (L90-100) and registers it in `ALLOWED_ORIGINS`, but `EmbedTourPage` never reads an `origin` query param — the param is dead weight | See Ranked Errors #10 |
| **NEW:** zero-scene or missing-tour embed renders "Tour not available" with **no** `error` postMessage | FAIL | `EmbedTourPage.tsx` `!tour || !scenes || scenes.length === 0 || !currentScene` → plain text screen (L400-407); only `tourError` (fetch failure) posts to the parent | Protocol gap: a parent (e.g. Flutter WebView) gets no signal that content failed; see Ranked Errors #12 |

---

## 5. 3D Viewing & Lab

### Story: 3D world viewer

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: tour with mesh URL → canvas viewer renders; errors show fallback link | PASS | `View3DPage.tsx` `SkyboxViewer` (L20-33): `useSkyboxRenderer` status `error` → "Failed to load the 3D world" + `TourFallbackLink` to `/view/:id`; covered by `View3DPage.test.tsx` (5 tests) | |
| AC2: tour without world → "3D world not available" + fallback link | PASS | `View3DPage.tsx:95-103` | |
| Expected: no chrome; loading spinner; legacy `viewer_url` iframe | PASS | Spinner L33-38, L56-61; legacy iframe L75-84 | |
| **Known gap (confirmed):** legacy iframe has no `sandbox`/`referrerpolicy` | FAIL (gap confirmed) | `View3DPage.tsx:78-82`: `<iframe src allow="fullscreen; xr-spatial-tracking" title>` — no sandbox, no referrerpolicy | See Ranked Errors #11 |

### Story: Splat Lab (Gaussian-splat pipeline)

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: video → Start Pipeline → job created and uploaded with progress | PARTIAL | `useSplatPipeline.ts` `createAndStart`: `POST /lab/jobs` (with filenames) → per-file `POST /lab/jobs/:id/upload-video?filename=` presigned → `PUT` → `POST /lab/jobs/:id/start` → 3s poll (`lab.ts`); `SplatLabPage.tsx` sets job with `status:'uploading', progress:0` | Upload phase has **no per-file progress** — the progress bar sits at 0% while the video PUTs; button just shows "Starting Pipeline…" spinner; see Ranked Errors #14 |
| AC2: ready job → download splat + SuperSplat links work | PASS | `SplatLabPage.tsx` `isReady` block: `Download splat` (`job.splat_url`, `download` attr) + `Open in SuperSplat` (`job.supersplat_url`, new tab) (L212-260) | |
| AC3: `GPU_REQUIRED` failure → GPU warning banner | PASS | `SplatLabPage.tsx` `isGpuError = job.error_message?.includes('GPU_REQUIRED')` (L175) → `GpuWarningBanner` (L90-125): Luma AI link + disabled "Request GPU Access" with explanatory title | |
| Expected: header stats; delete hover-only; failed stage estimated from progress | PASS | Stats strip (L450-470); hover-only delete (L540-560); `getStageState` estimates failed stage from progress (L31-60) | |

### Story: Dollhouse editor (splat scene composer)

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: transformed model → panel values update | PASS | `DollhouseEditorPage.tsx` `handleTransformChange` (L58-64) via TransformControls `onChange`; panel shows live Pos/Rot (L210-240) | |
| AC2: connect mode + floor click → Door/Portal marker + connection in list | PASS | invisible floor mesh in connect mode (L168-183) → `handlePlaceConnection` → yellow Door/Portal Html marker + connections list with Del (L185-200, L250-270) | |
| AC3: Save Tour disabled with explanatory title | PASS | `DollhouseEditorPage.tsx` Save button `disabled` + `title="Not wired up yet — layout persistence is coming in a later pass."` (L86-93) | |
| Expected: in-memory only; dragging disables orbit | PASS | No persistence calls anywhere; `dragging-changed` → `setOrbitEnabled(!e.value)` (L160-167), `OrbitControls enabled={orbitEnabled}` (L203) | |

### Story: Kitchen tour (constrained GS standpoint navigation)

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: manifest exists → constrained tour viewer renders | PASS | `KitchenTourPage.tsx` fetch `/splats/kitchen_manifest.json` (L27-44) → `SplatTourViewer` with `/splats/kitchen.splat`; "Advanced free-fly (SuperSplat)" PlayCanvas link (L61-68) | Asset presence is runtime |
| AC2: missing manifest → error alert names missing files | PASS | `KitchenTourPage.tsx:70-76` error branch: "Ensure public/splats/kitchen.splat and kitchen_manifest.json exist" | |

### Story: Local tour harness (dev-only)

| Criteria | Status | Evidence | Notes |
|---|---|---|---|
| AC1: property folder with `tour.json` → scenes render with working hotspots | PASS | `LocalTourPage.tsx` fetch `/seed_properties/:id/tour.json` (L106-113), builds Scene/Hotspot objects (L63-99), renders production `PanoramaViewer` | Runtime asset |
| AC2: `?calibrate=1` → click shows yaw/pitch in badge | PASS | `LocalTourPage.tsx` `handlePositionClick` rounds to 1 decimal (L151-156); calibrate badge renders `calibrate: yaw°, pitch°` (L190-193) | |
| Expected: missing tour.json → error + pointer to generator | PASS | `LocalTourPage.tsx` error branch names the file and `python backend/tools/build_spatial_tour.py` (L163-175) | |
| **Known gap (confirmed):** `/local/:propertyId` registered in the production router | FAIL (gap confirmed) | `router.tsx` registers `ROUTES.LOCAL_TOUR` unconditionally (no env guard); in prod builds the Vite dev middleware doesn't exist so the fetch 404s into the error state | See Ranked Errors #9 |

---

## E2E spec audit (vacuous assertions)

Root cause for the public-viewer file: `testTourId = 'test-tour-id'` is not a UUID and no backend runs under Playwright, so every `/view/:id`, `/embed/:id` load lands in the "Tour Not Found"/"Tour not available" state — the specs were written to pass regardless.

### `e2e/public-viewer.spec.ts` — 19 vacuous assertions

| # | Test (line) | Vacuous assertion | Meaningful assertion |
|---|---|---|---|
| PV1 | "should load the public tour page" (L16-24) | `expect(hasViewer || body.isVisible()).toBe(true)` — body always visible | With a real/fixture tour: expect `canvas` or `[data-testid="panorama-viewer"]` visible. With invalid id: expect `getByRole('heading', {name: 'Tour Not Found'})` |
| PV2 | "should display panorama canvas" (L28-38) | same `hasViewer || body` pattern | Same as PV1 |
| PV3 | "should support mouse drag navigation" (L42-58) | `if (await canvas.isVisible()) {...}` guard — canvas never visible → whole body skipped, test passes | After tour loads, drag and assert viewer yaw changed (expose via `PSV.getPosition()` in `page.evaluate`) or assert no error state |
| PV4 | "should support scroll zoom" (L62-75) | same `if (canvas.isVisible())` guard | Scroll and assert zoom level changed, or at minimum assert canvas remains visible **inside** the branch after asserting a non-error state first |
| PV5 | "should support keyboard navigation" (L79-91) | same guard; only presses arrows, asserts canvas visible | Navigate scenes with N/P and assert the scene badge/counter text changes |
| PV6 | "should display hotspot markers" (L97-104) | `expect(hotspotCount).toBeGreaterThanOrEqual(0)` — always true | With a tour that has hotspots (fixture), expect count > 0 |
| PV7 | "should show hotspot tooltip on hover" (L109-119) | `if (count > 0)` guard + `expect(tooltip.or(page.locator('body')).first()).toBeVisible()` — the known `.or(body)` pattern, always passes | Hover a known navigation hotspot and assert the marker's `aria-label`/tooltip text appears |
| PV8 | "should navigate to linked scene on hotspot click" (L123-135) | `if (count > 0)` guard + `expect(page.locator('body')).toBeVisible()` | Click a navigation hotspot and assert the scene counter/badge changes to the target scene |
| PV9 | "should show info popup on info hotspot click" (L139-152) | guard + `popup.or(page.locator('body')).first()).toBeVisible()` | Click an info hotspot and assert the `HotspotContentModal` dialog (`role="dialog"`) appears with the hotspot title |
| PV10 | "should have fullscreen button" (L158-167) | `if (count > 0)` guard with no fallback assertion | Assert the fullscreen button exists (`aria-label*="fullscreen"`) after tour loads |
| PV11 | "should toggle fullscreen on button click" (L171-181) | guard + `expect(body).toBeVisible()` | Click and assert `document.fullscreenElement` truthy via `page.evaluate` |
| PV12 | "should exit fullscreen on escape key" (L185-190) | only `expect(body).toBeVisible()` after pressing Escape | Enter fullscreen first, press Escape, assert `document.fullscreenElement === null` |
| PV13 | "should support touch drag navigation" (L198-212) | `if (canvas.isVisible())` guard — skipped on fake id | Load a real tour, dispatch touch drag on the canvas, assert no error and viewer responds |
| PV14 | "should support pinch-to-zoom" (L216-217) | `expect(body).toBeVisible()` with comment "verify page loads" | Assert the error state is NOT shown (tour loaded) — that is the only meaningful minimum |
| PV15 | "should have mobile-friendly controls" (L221-227) | `mobileControls.or(page.locator('body')).first()).toBeVisible()` — always passes | Assert the fullscreen/share/info buttons are within the viewport and tappable at 375px |
| PV16 | "should adapt layout for mobile viewport" (L231-245) | `if (viewerContainer.isVisible())` guard — skipped | Assert container width ≤ 375 **unconditionally** after a successful tour load |
| PV17 | "should load embedded tour page" (L251-253) | `expect(page.locator('body')).toBeVisible()` | Assert the embed viewer canvas is visible (not the "Tour not available" text) |
| PV18 | "should respect embed parameters" (L257-265) | `navbar.or(page.locator('body')).first()).toBeVisible()` — always passes | With `?navbar=false` assert the thumbnail strip / scene counter element is NOT visible |
| PV19 | "should start autorotation with autoplay parameter" (L269-275) | `waitForTimeout(1000)` + `expect(body).toBeVisible()` | Evaluate the viewer's current yaw before/after 2s and assert it changed (or assert no reduced-motion) |

### `e2e/landing.spec.ts` — 1 vacuous assertion (+1 soft spot)

| # | Test (line) | Issue | Meaningful assertion |
|---|---|---|---|
| L1 | "should be responsive" (L27-38) | `expect(page.locator('body')).toBeVisible()` at 1280/768/375 viewports — body is always visible; tests nothing | At 375px: hamburger visible + desktop nav hidden; click menu → nav links visible; Escape closes it; assert `document.documentElement.scrollWidth <= window.innerWidth` at each viewport |
| L2 | "should have working navigation links" (L11-24) | `if (!(await loginLink.first().isVisible())) { menuButton… }` guard — conditional fallback; semi-meaningful but the login-link visibility check gates the assertion path and can hide regressions on one viewport class | Assert desktop nav at 1280px and menu-driven nav at 375px as separate explicit steps |

### `e2e/performance.spec.ts` — 1 vacuous assertion (+2 weak)

| # | Test (line) | Issue | Meaningful assertion |
|---|---|---|---|
| P1 | "should have lazy-loaded images where appropriate" (L77-91) | `expect(lazyLoadedCount).toBeGreaterThanOrEqual(0)` — always true; the `imageCount > 3` guard means the landing page (~0 `<img>` tags) skips entirely | Assert specific known images (`img[loading="lazy"]`) in the public viewer thumbnail strip; or drop the guard and assert count > 0 when images exist |
| P2 | "should load landing page within acceptable time" (L8-14) | `loadTime < 5000` around `page.goto` — meaningful but flaky (includes full nav + dev-server compile) | Use `page.goto(..., {waitUntil:'domcontentloaded'})` and measure a stable metric, or assert LCP |
| P3 | "should have proper Open Graph tags" (L33-42) | `totalOgTags >= 1` passes with a single tag | Assert `og:title`, `og:description`, `og:type` each exist with non-empty content |
| P4 | "should not have console errors on page load" (L46-60) | Not vacuous, but the ignore list contains `'404'` which can mask genuine API 404s | Drop `'404'` from the ignore list or narrow to favicon only |

### `e2e/auth.spec.ts` — no vacuous assertions

All 9 tests assert concrete UI (headings, `aria-selected`, `required`, E.164 validation text, terms error, links). Note: "has a link to registration" is satisfied by the `AuthLayout.tsx` footer "Sign up" link, not the login form itself.

### Pattern-adjacent (outside the four audited specs, one line each)

- `e2e/auth.setup.ts:27-31` — `if (page.url().includes('/dashboard') || page.url().includes('/tours'))` early-save guard: if a stale session exists, setup saves storage state **without performing a login**; with the backend down this silently passes.
- `e2e/fixtures/auth.ts` `authenticatedPage` (L44-50) — `waitForURL(...).catch(console.warn)` swallows login failure and hands over an unauthenticated page; downstream specs then run against the login screen without failing.

---

## Ranked errors found

All previously documented known gaps were re-verified against current code and confirmed (each with corrected/confirmed line numbers). New issues found during this pass are marked **NEW**.

| # | Severity | Issue | Evidence | Status |
|---|---|---|---|---|
| 1 | **High (security)** | Registration can overwrite an existing account's password: no identifier-status check, always `shouldCreateUser: true`, and OTP verify + `updatePassword` on an already-existing identifier hijacks that account | `RegisterPage.tsx:107-119` (send OTP), `:151-165` (verify), `:185-201` (updatePassword + navigate dashboard) | Known gap — confirmed (doc cited 112-146; actual 107-201) |
| 2 | High (privacy) | Forgot-password account enumeration: request step reveals whether an identifier has an account | `ForgotPasswordPage.tsx:111-115` ("No account found…") | Known gap — confirmed (:113 exact) |
| 3 | High | Public 401 sign-out cascade: a signed-in user viewing a public tour can be logged out + hard-redirected when any authed request 401s (refresh fails), because public routes share the authed client; `_skipAuthExpiry` only protects `recordLastMethod` | `client.ts:107-151` (401 → `expireSessionIfStillStale` → signOut + `notifyAuthExpired`), request interceptor attaches Bearer unconditionally (L62-73); `App.tsx:37-52` redirects to `/login?next=…` | Known gap — confirmed (doc cited client.ts:89-130; actual block 107-151) |
| 4 | Medium | `GlobalErrorHandler` 401 branch drops the return path: `logout(); window.location.href = ROUTES.LOGIN` with no `next=` (only reachable for non-interceptor 401 rejections, e.g. `_skipAuthExpiry`/no-auth-header cases) | `GlobalErrorHandler.tsx:24-35` | Known gap — confirmed |
| 5 | Medium | PublicTourPage conflates all fetch failures with 404: any network/5xx error renders "Tour Not Found"; `isError` unused, unlike EmbedTourPage which has a distinct error screen + postMessage | `PublicTourPage.tsx:379-387` vs `EmbedTourPage.tsx:372-399` | Known gap — confirmed (doc cited ~382-387; actual 379-387) |
| 6 | Medium (UX) | Like state never hydrated: `isLiked` starts `false` on every load; no API exists to fetch the visitor's existing like, so returning visitors see an unliked heart (and can re-like) | `PublicTourPage.tsx:60`; like flow L340-368 | Known gap — confirmed (:60 exact) |
| 7 | Medium (dev) | AuthCallback next-path fragility: `consumeOAuthNext` runs inside an effect guarded by `handledRef`; under StrictMode double-invoke the sessionStorage stash can be consumed/dropped if the effect re-runs mid-flight | `AuthCallbackPage.tsx:23-38` | Known gap — confirmed (:38 exact) |
| 8 | Medium (UX) | Demo360Viewer CDN blank failure: remote panorama (`photo-sphere-viewer-data.netlify.app`) failure only `console.error`s — the hero renders an empty black box with no fallback/retry | `Demo360Viewer.tsx:113-115` (catch), panorama URL L63 | Known gap — confirmed |
| 9 | Low | `/local/:propertyId` registered in the production router (dev-only harness leaks to prod; always 404s there) | `router.tsx` (LOCAL_TOUR route, no env guard); `LocalTourPage.tsx` error branch | Known gap — confirmed |
| 10 | Low | `embed.js` SDK appends an `origin=` param to the embed URL that `EmbedTourPage` never reads; origin filtering only uses `event.origin` | `public/embed.js` `buildEmbedUrl` (L90-100); no `origin` parse in `EmbedTourPage.tsx` | Known gap — confirmed |
| 11 | Low | View3DPage legacy iframe has no `sandbox`/`referrerpolicy` (only `allow`) | `View3DPage.tsx:75-84` | Known gap — confirmed |
| 12 | Low | **NEW** — Embed zero-scene/missing-tour failure never posted to parent: `!tour || scenes.length === 0` renders "Tour not available" without an `error` postMessage (only fetch errors post). A parent (e.g. Flutter WebView hotspot editor) gets no failure signal | `EmbedTourPage.tsx:400-407` vs error post L372-378 | NEW |
| 13 | Low | **NEW** — JSON-LD mismatch: `VirtualTourStructuredData` emits `@type: "ImageGallery"` (not `VirtualTour`, which the component's own type union allows); PublicTourPage's structured data doesn't describe a virtual tour | `MetaTags.tsx` `VirtualTourStructuredData` → `<StructuredData type="ImageGallery">`; used at `PublicTourPage.tsx:411-420` | NEW |
| 14 | Low | **NEW** — Splat Lab upload phase shows no progress: the Progress bar is fixed at 0% while the video(s) PUT to the presigned URL (`Promise.all` of raw `fetch` PUTs); per-file progress never rendered — doc AC "uploaded with progress" overstates | `useSplatPipeline.ts` `createAndStart` (no progress reporting); `SplatLabPage.tsx` job set with `progress: 0`; `CreateJobForm` submit shows only a spinner label | NEW (doc mismatch) |
| 15 | Low | Footer dead links: Product/Company/Legal/social items are inert `aria-disabled` spans (About, Blog, Careers, Contact, Privacy Policy, Terms of Service, Cookie Policy, API, Twitter, LinkedIn, GitHub) | `PublicLayout.tsx:273-282`, `:299-302`, `:322-325`, `:343-346` | Known gap — confirmed (doc cited 264-312; actual spans above) |
| 16 | Low | Marketing stats inconsistency: Hero "10k+ Tours Created / 80% Time Saved / 95% AI Accuracy" (`HeroSection.tsx`) vs AuthLayout "10K+ Tours Created / 50K+ Active Users / 1M+ Tour Views" vs SocialProofBar "Trusted by 10,000+ real estate professionals" — contradictory claims across the same funnel | `HeroSection.tsx` stats row; `AuthLayout.tsx:60-72`; `SocialProofBar.tsx:37` | Known gap — confirmed |
| 17 | Trivial | Marquee seam: `landing-animate-marquee` translates `-50%` of a flex container whose inter-item `gap-16` (64px) makes half-width ≠ one full set + 6 gaps → ~32px jump at the loop point | `SocialProofBar.tsx` (duplicated logo sets, `gap-16`); `index.css` `@keyframes marquee { to { translateX(-50%) } }` | Known gap — confirmed |
| 18 | Trivial | **NEW** — RegisterPage Google OAuth doesn't stash a return path (LoginPage does via `stashOAuthNext`), so Google signup always lands on `/dashboard` even when the user started from a protected page | `RegisterPage.tsx` `onGoogle` (L193-201) — no stash call vs `LoginPage.tsx:260-272` | NEW |

---

## Status update — 2026-08-01 (post-refactor re-verification)

The table above was compiled against the pre-refactor commit. The 90-file
refactor (tour editor persistence rework, auth hardening, mobile reliability)
fixed several ranked items in the working tree; this pass re-verified each:

| Ranked # | Status now | Evidence (working tree) |
|---|---|---|
| 1 (registration account overwrite) | **FIXED (partially)** — OTP send is gated on `checkIdentifierStatusSafe`; resend path re-checks too. Residual TOCTOU (identifier created between send and verify) needs a backend-side guard; client can't distinguish. | `RegisterPage.tsx:117-123` (gate), `:211-223` (resend re-check), `api/auth.ts:22-46` |
| 2 (forgot-password enumeration) | **FIXED** — generic message regardless of existence | `ForgotPasswordPage.tsx:111-115` |
| 3 (public 401 cascade) | **FIXED** — public paths skip Bearer + `_skipAuthExpiry` | `client.ts:100-106`, `:137-141` |
| 4 (GlobalErrorHandler return path) | **FIXED** — preserves `next=` with auth-page blocklist | `GlobalErrorHandler.tsx:24-38` |
| 5 (PublicTourPage 404 conflation) | **FIXED** — non-404 errors show retryable error screen | `PublicTourPage.tsx:399-412` |
| 6 (like hydration) | **FIXED (client side)** — hydrates from `is_liked`/`like_count` in the public payload; backend must return them | `PublicTourPage.tsx:113-121` |
| 8 (Demo360Viewer CDN fallback) | **FIXED** — `panorama-error` listener + `loadFailed` fallback UI with Retry | `Demo360Viewer.tsx:127-133`, `:162-183` |
| 9 (/local in prod router) | **FIXED** — renders NotFoundPage outside DEV | `router.tsx:320-331` |
| 10 (embed.js origin param unread) | **FIXED** — `parseEmbedOriginParam` validates and uses the param as postMessage targetOrigin + inbound origin gate | `types/embedMessages.ts:79-104`, `EmbedTourPage.tsx:187-207, 334` |
| 11 (View3DPage iframe sandbox) | **FIXED** — sandbox + referrerPolicy added | `View3DPage.tsx:81-86` |
| 12 (embed zero-scene signal) | **FIXED** — posts `tour_error` when content can't render | `EmbedTourPage.tsx:439-454` |
| 13 (JSON-LD `@type`) | **FIXED** — `VirtualTourStructuredData` emits `type="VirtualTour"` | `MetaTags.tsx:228` |
| 18 (Register Google return path) | **FIXED** — stashes return path with auth-page blocklist | `RegisterPage.tsx:237-246` |

Still open (tracked in `docs/FEATURES_AND_USER_FLOWS.md`): #7 (AuthCallback
StrictMode fragility — by design, guarded), #14 (Splat Lab upload progress),
#15/#16/#17 (marketing content decisions).

---

## Report summary

- **Stories verified: 17** (Landing 2, Auth 5, Public viewing 3, Embed & Share 2, 3D & Lab 5)
- **Criteria status counts:** 41 PASS, 1 PARTIAL (Splat Lab upload progress), 0 FAIL-by-implementation, 8 NOT-RUN(b) (needs live backend — all traced code paths support the criterion)
- **All 12 documented known gaps in scope re-verified and confirmed** (line citations corrected where the doc was slightly off)
- **New issues found: 4** (#12 embed failure signal, #13 JSON-LD @type, #14 Splat Lab upload progress, #18 register Google return path)
- **E2E vacuous count: 21** (19 in `public-viewer.spec.ts`, 1 in `landing.spec.ts`, 1 in `performance.spec.ts`) + 2 pattern-adjacent guards (`auth.setup.ts:27-31`, `fixtures/auth.ts` `waitForURL` swallow) and 3 weak-but-not-vacuous assertions (landing L2 guard, performance P2/P3)
- **Unit tests: 9 files / 229 tests — all pass** (embedCode 44, embedMessages 7, hotspotContent 7, client 19, authStore 23, validation 121, EmbedTourPage 1, View3DPage 5, HotspotContentModal 2)
- **Doc-vs-code mismatches flagged:** LoginPage "last method pre-selected" is only channel pre-selection (PARTIAL); Splat Lab "uploaded with progress" overstates upload-phase UI (#14); EmbedTourPage error-vs-"not available" split is a real UX difference from PublicTourPage's conflation (#5 vs #12).

---

# Verification Log — Web: Dashboard, Tours, Editor, Media, Analytics, Settings (Phase 2)

Verified against `docs/FEATURES_AND_USER_FLOWS.md` (web sections 3–7, 11–12) and the code at `web/src`. README-ONLY pass: no code was changed; every issue is logged below.

**Method:** per story, the expected behavior + acceptance criteria in the doc were traced through the actual code (pages, feature components, stores, api clients). Targeted tests were run (`npx vitest run` — see below). Criteria whose outcome is decided by a live backend (real uploads, realtime WebSocket, VR hardware, public-viewer rendering) are marked `NOT-RUN(b)` = "needs backend — static trace only"; the client-side wiring was traced and is cited.

**Test run (2025-07-30, `web/`, vitest 3.2.7):** 12 test files / 67 tests — all passed:
- `src/test/stores/tourEditorStore.test.ts` (30) — undo/redo + draft-mutator semantics pass; the deprecated mutators themselves are dead code in the app (see E-8).
- `src/test/stores/viewerStore.test.ts` (16)
- `src/test/api/toursContract.test.ts` (3)
- `src/test/components/PanoramaViewer.test.tsx` (2)
- `src/test/components/BulkUploader.test.tsx` (2) — preview-URL cleanup
- `src/test/components/HotspotContentModal.test.tsx` (2)
- `src/test/user-behaviors/editor/upload-confirmations.test.tsx` (2)
- `src/test/user-behaviors/editor/scene-analysis.test.tsx` (1)
- `src/test/user-behaviors/editor/floor-plan-editor.test.tsx` (1)
- `src/test/user-behaviors/account/custom-domain-setup.test.tsx` (5)
- `src/test/user-behaviors/viewer/video-player.test.tsx` (2)
- `src/test/pages/ProfilePage.test.tsx` (1) — avatar upload + auth-store hydration

No existing tests cover ToursPage, TourCreatePage, GuidedCapturePage, TourEditPage (the editor), HotspotPanel/HotspotEditorModal mutations, TourSettingsPanel, AITourWizard, TourViewPage, TourAnalyticsPage, MediaLibraryPage, AnalyticsPage, DashboardPage, or the app shell — those are verified by static trace only here.

**Status tallies:** 28 stories, 77 criteria → PASS 55 · PARTIAL 7 · FAIL 3 · NOT-RUN(b) 12. All 20 known gaps from the doc were re-confirmed against code (cited below), plus 4 new findings (E-2, E-4, E-9, E-11).

---

## 3. Dashboard & Tour Management

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Dashboard overview | 4 stat cards + storage bar + views chart + ≤5 recent tours render | PASS | DashboardPage.tsx:28-58 (3 parallel queries), :117-143 (cards), :145-160 (storage cap `Math.min(100, …)`), :162-215 (chart), :217-284 (recent tours, `limit: 5` at :39) | |
| Dashboard overview | Stats error → error card with "Try again" + refetch | PARTIAL | DashboardPage.tsx:63-80 (`isStatsError` early-returns a **full-page** card) | Doc says "scoped error card per widget"; code replaces the entire page (chart + recent tours hidden) until stats recover. Retry works. Doc/code mismatch. |
| Dashboard overview | "Create Tour" → `/tours/create` | PASS | DashboardPage.tsx:86-92 (`Link to ROUTES.TOUR_CREATE`) | |
| Tour list | 300ms debounced search resets pagination | PASS | ToursPage.tsx:36 (`useDebounce(…, 300)`), :52-58 (query key), :62-67 (cursor reset effect) | |
| Tour list | Archive → status `draft`, list refreshes | PASS | ToursPage.tsx:93-101 (`archiveMutation` → `PATCH` `status: archived\|draft`), :102 (`invalidateQueries [TOURS]`) | "Unarchive" label toggles at :332-335. |
| Tour list | Delete confirm → `DELETE /tours/:id` + refresh; cancel = no-op | PASS | ToursPage.tsx:160-174 (`confirm()`), :87-92 (mutation + invalidate) | |
| Tour actions | View Live opens `/view/:id` new tab, published only | PASS | ToursPage.tsx:315-326 (`<a href={/view/${tour.id}} target="_blank">`, rendered only when `status === 'published'`) | |
| Tour actions | Delete accepted → removed; cancelled → nothing | PASS | ToursPage.tsx:160-174, :87-92 | |
| Tour detail & preview | Working 360 preview + 4 stat cards | PARTIAL | TourViewPage.tsx:89-105 (`PanoramaViewer scene={firstScene} hotspots={firstScene.hotspots \|\| []}` — **no** `onHotspotClick`/`onSceneChange`/`onHotspotSelect`); markers render but clicks no-op (PanoramaViewer.tsx:675-680 optional-chained) | Preview hotspots are dead: no click, no navigation (known gap). Panorama itself renders. |
| Tour detail & preview | Draft tour → Share disabled + tooltip | PASS | TourViewPage.tsx:65-85 | |
| Tour detail & preview | Zero scenes → Create Reel disabled + tooltip | PASS | TourViewPage.tsx:86-91 (`disabled={!scenes \|\| scenes.length === 0}`) | |

## 4. Tour Creation (Upload & Guided Capture)

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Create-tour wizard | Valid images → each becomes a scene, tour list refreshes | NOT-RUN(b) | TourCreatePage.tsx:200-219 (`uploadApi.uploadFile` → `addSceneMutation` → `createScene`; `invalidateQueries [TOURS]` at :214-215) | Static trace complete; live upload not exercised. |
| Create-tour wizard | Invalid file type → marked error, not uploaded | PASS | TourCreatePage.tsx:141-158 (`validateImageFile`, status `error` + reason), :233-240 | |
| Create-tour wizard | Edit Info → `PATCH /tours/:id` → back to upload | PASS | TourCreatePage.tsx:100-113 (`updateTourMutation`), :472-474 ("Edit Info" button) | |
| Guided capture | 8 yaws captured → "Continue to review" appears | PASS | GuidedCapturePage.tsx:22 (`YAW_TARGETS_DEG` 0–315), :629-633 (`allYawsDone &&` "Continue to review") | |
| Guided capture | Pipeline → draft tour with 1 scene/frame, editor link works | NOT-RUN(b) | GuidedCapturePage.tsx:331-429 (`updateSession uploading` → per-frame `uploadFile`+`registerFrame` → `completeSession` → `createTour` → `createScene` "Room · yaw°" → `setPhase('done')`) | Static trace complete; needs live backend. Retakes replace same yaw (:290-309); already-uploaded frames skipped on retry (:333-336). |
| Guided capture | Resumed session restores title + camera phase | FAIL | GuidedCapturePage.tsx:184-204 (resume effect restores `title` + `phase('camera')` **only**); frames live in component state :104 and are never reloaded | **E-1** — all captured frames lost on reload of `/tours/capture/:sessionId` (known gap). |

## 5. AI Tour Generation

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| AI tour wizard | ≥1 image → job starts, progress shown | NOT-RUN(b) | AITourWizard.tsx `handleStartGeneration` → `aiApi.generateTour` (api/ai.ts:83-105) → `AIJobStatus`; `canProceed()` gates on `images.length > 0`; combined rejection message + count cap (:48-93) | Static trace complete. |
| AI tour wizard | Job complete → review → "Complete" navigates to editor | PASS | AITourWizard.tsx `handleComplete` → `onComplete` → TourCreatePage.tsx:126-131 (`handleAIComplete` → `navigate(/tours/${tour.id}/edit)`) | |
| AI tour wizard | Job failure → returns to options with error | PASS | AITourWizard.tsx `handleJobError` (`setStep('options')` + error + toast) | |
| AI job status | WebSocket progress; 2s polling fallback | NOT-RUN(b) | AIJobStatus.tsx:139-145 (`useAIJobWebSocket`), :183-201 (polling + 5s connecting grace), :96-113 | Needs live WS/backend. Wifi/WifiOff indicator verified (:246-258). |
| AI job status | Cancel → `POST /ai/jobs/:id/cancel` + `onCancel` fires | PASS | AIJobStatus.tsx:337-344 (`handleCancel` → `aiApi.cancelJob` → `onCancel`) | |
| AI scene analysis | Analysis completes → room type/confidence/quality per scene | NOT-RUN(b) | SceneAnalysis.tsx:103 (`aiApi.analyzeScenes`), results list with confidence/quality; Re-analyze at :234, :403-412 | Static trace complete. |
| AI scene analysis | Apply with titles on → `PATCH /scenes/:id` per scene | PASS | SceneAnalysis.tsx:166-170 (per-scene updates filtered by `applyTitles`/`applyDescriptions`) → TourEditPage.tsx:443-459 (`handleApplySceneAnalysis`) | Apply disabled at :425 when zero selection or both toggles off. |
| AI descriptions | Tone/length → descriptions appear, editable per scene | NOT-RUN(b) | DescriptionGenerator.tsx:71 (`aiApi.generateDescriptions`), inline edit state; Regenerate All :309 | Static trace complete. |
| AI descriptions | Edited description applied → persisted | PASS | DescriptionGenerator.tsx:136-137 (`onApply(editedDescriptions)`) → TourEditPage.tsx:468-479 (`handleApplyDescriptions` → `PATCH /scenes/:id`) | Apply disabled when nothing edited (:419). |
| AI hotspot suggestions | Navigation suggestion applied → hotspot to target scene created | NOT-RUN(b) | HotspotSuggestions.tsx:63 (`aiApi.suggestHotspots`) → TourEditPage.tsx:493-523 (`handleApplyHotspotSuggestions` → `POST /scenes/:sceneId/hotspots`, navigation → `content.kind: 'navigation'` + target) | Static trace complete. |
| AI hotspot suggestions | Deselected suggestion skipped | PASS | HotspotSuggestions.tsx:118 (`onApply(selected)` — only selected suggestions passed) | Apply disabled at :405 with zero selection. |
| 360 reel | Selected scenes → reel job starts | NOT-RUN(b) | ReelGeneratorModal.tsx `handleGenerate` → `aiApi.generateReel` (scene_ids + duration) → `AIJobStatus` | Static trace complete. |
| 360 reel | Done step → preview + Download/Copy work | PASS | ReelGeneratorModal.tsx done step (`VideoPlayer`, `buildDownloadUrl` fl_attachment, `handleCopyLink`) | |

## 6. Tour Editing (Scenes, Hotspots, Settings, Branding, Floor Plans)

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Editor shell | Unsaved changes → blocker dialog Stay/Leave | PASS | TourEditPage.tsx:159-166 (`useBlocker`), :1124-1140 (blocked dialog) | |
| Editor shell | Zero scenes → Publish disabled with reason | PASS | TourEditPage.tsx:564-569 (`publishDisabledReason`), tooltip + `disabled` :631-638 | |
| Editor shell | Save → toast → Unsaved Changes badge disappears | PASS | TourEditPage.tsx:196-202 (`markAsSaved()` on success), badge :617 | |
| Scene management | Upload → each becomes a scene, list refreshes | FAIL | ScenePanel.tsx:271 (upload `invalidateQueries [SCENES, tourId]` **only**) | **E-1 core** — the panel is fed from the stale store copy (TourEditPage.tsx:946 `scenes={currentTour?.scenes \|\| []}`); new scenes appear only after full reload. |
| Scene management | Drag reorder persists + panel shows new order | FAIL | ScenePanel.tsx:231-237 (optimistic `setQueryData` writes the **query cache only**; panel never reads it) + :204-214 | Panel shows old order until reload (store never re-seeded). |
| Scene management | Delete selected scene → selection moves to next | PARTIAL | ScenePanel.tsx:301-304 (`onSceneSelect(remainingScenes[0]?.id \|\| null)`) | Selection moves, but the deleted card stays visible in the stale list (and is re-selectable → broken viewer scene). |
| Hotspot management | Placement mode → panorama click opens editor pre-positioned | PASS | TourEditPage.tsx:344-352 (`handlePositionClick`), :953-963 (placement UI), `h` toggle :247-251 | |
| Hotspot management | Navigation hotspot without target → inline error blocks save | PASS | HotspotEditorModal.tsx:107-137 (`getValidationError`), :582-586 (inline error), :683-686 (save disabled) | |
| Hotspot management | Link hotspot with non-allowlisted protocol blocked | PASS | HotspotEditorModal.tsx:139-145 (`isSafeLinkUrl` http/https/mailto/tel) | |
| Hotspot management | Drag released → position persists via `PUT /hotspots/:id/position` | PARTIAL | TourEditPage.tsx:369-379 (`handleHotspotDrag` → `updateHotspotPosition` + toast) | PUT is issued and toasts, but the viewer marker reads `currentScene.hotspots` (store, :958) — marker does not move until reload. |
| Panorama viewer | `enable_vr` → gyro/stereo available where supported | NOT-RUN(b) | PanoramaViewer.tsx (GyroscopePlugin/StereoPlugin gated on `tourSettings.enable_vr`) | Needs hardware/backend; static wiring verified. |
| Panorama viewer | Invalid hotspot color → fallback used | PASS | PanoramaViewer.tsx:56-58 (`safeColor`), applied :565-650 | |
| Panorama viewer | Scene change mid-load → latest wins, no abort error | PASS | PanoramaViewer.tsx:437-485 (serialized `setPanorama` queue; retry state :112, :366) | |
| Tour settings | Visibility unlisted → `PATCH /tours/:id` persists | PASS | TourSettingsPanel.tsx `handleSave` → TourEditPage.tsx:313-334 (`handleSettingsSave` → `updateTour` PATCH) | Static trace; live persist is NOT-RUN(b). |
| Tour settings | Auto-rotate speed 2 → public viewer rotates at that speed | NOT-RUN(b) | TourSettingsPanel.tsx viewer tab (auto_rotate + 0.1–5 slider) → settings in PATCH payload | Needs live public tour. |
| Tour settings | Copy embed → "Copied!" + clipboard | PASS | TourSettingsPanel.tsx `handleCopyEmbed` → `copyToClipboard` + 2s "Copied!" | |
| Tour branding | Logo upload success → logo URL saved | PASS | BrandingPanel.tsx:171-184 (upload `folder: 'branding'`; `updateSetting('logo_url', public_url)` only on success), :124-127, :233-245 (failed upload blocks save) | |
| Tour branding | Theme preset → public viewer uses primary color | NOT-RUN(b) | BrandingPanel.tsx:219-225 (`handleApplyPreset`) → settings merged in `handleBrandingSave` (TourEditPage.tsx:393-408) | Needs live public tour. |
| Tour branding | Oversized logo → inline error, nothing persists | PASS | BrandingPanel.tsx:103 (`MAX_LOGO_SIZE_BYTES` 2MB), :161-167 | |
| Floor plans | Viewer clicks marker → navigates to scene | NOT-RUN(b) | FloorPlanOverlay.tsx:75 (`onSceneChange(marker.scene_id)`), :171-175 (marker onClick) | Static trace complete. |
| Floor plans | Multi-floor arrows change floor + counter | NOT-RUN(b) | FloorPlanOverlay.tsx:213-230 (up/down + "Floor N" counter) | Static trace complete. |
| Floor plans | Marker placement → saved in tour settings | PASS | FloorPlanEditor.tsx:162-191 (marker x/y %), :224 (`onSave(localFloorPlans)`) → TourEditPage.tsx:410-420 (`handleFloorPlansSave` → `settings.floor_plans`) | |
| Publish flow | Draft + scenes + saved → Publish → badge flips to published | PARTIAL | TourEditPage.tsx:267-272 (`publishMutation` invalidates `[TOUR, id]` **only**) | Badge/button read `currentTour?.status` (store, :614-616) — server is updated but the toolbar still shows `draft` and the Publish button until reload (**E-2**). |
| Publish flow | Unpublish → status `draft`, public page unreachable | PARTIAL | TourEditPage.tsx:279-285 (invalidate `[TOUR, id]` only) | Same stale-store symptom as above; public-page reachability is backend (NOT-RUN(b)). |
| AI apply flows | Accepted analysis → `PATCH /scenes/:id` per scene | PASS | TourEditPage.tsx:443-459 (`handleApplySceneAnalysis` — client-side fan-out; `aiApi.applySceneAnalysis` never called, api/ai.ts:218-226) | |
| AI apply flows | Partial failure → error toast, successful updates persist | PARTIAL | TourEditPage.tsx:449-458 (`Promise.all`; catch toasts error but **skips** `invalidateQueries` in `.then`) | Successful updates persist server-side but the UI never refreshes on partial failure. |
| Collaboration | Valid email invite → collaborator appears | PASS | TourEditPage.tsx:706-725 (`inviteCollaborator` → toast; fetch on popover open :692-697) | Static trace; list refresh needs backend. |
| Collaboration | Owner cannot be removed | PASS | TourEditPage.tsx:749-751 (`c.role !== 'owner'` gates remove button) | |
| Collaboration | Activities grouped by date | PASS | ActivityFeed.tsx:117-124 (grouped by `getLocalDateKey`), :114-115 (action filter) | |

## 7. Media Library

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Media library | Files render with name/size/type | PASS | MediaLibraryPage.tsx:46-54 (query), grid :290-307, list :344-352 | |
| Media library | Bulk delete confirmed → deleted + list refreshes + selection cleared | PASS | MediaLibraryPage.tsx:75-84 (`bulkDeleteMutation`), :86-93 (`onSettled` invalidate + `clearSelection`), :129-145 (confirm) | Uses batch `deleteMediaFiles` (api/upload.ts:84-90, per-file DELETE with partial-failure report). |
| Media library | Video preview → inline player with controls | PASS | MediaLibraryPage.tsx:418-420 (`<video controls>`) | |
| Media library | Search/filter reset pagination + selection | PASS | MediaLibraryPage.tsx:56-64 (`resetToFirstPage` clears cursor + selection) | **E-10** — no debounce: every keystroke fires a request (known gap). |

## 11. Analytics

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Per-tour analytics | Date range change → analytics + heatmap refetch | PASS | TourAnalyticsPage.tsx:60-67 (analytics query key incl. dates), :96-106 (heatmap key incl. dates) | |
| Per-tour analytics | Export CSV → file downloads + success toast | PASS | TourAnalyticsPage.tsx:179-187 (`downloadAnalyticsCSV` + toast) | |
| Per-tour analytics | Heatmap dropdown → scatter reflects that scene | PASS | TourAnalyticsPage.tsx:96-106 (heatmap query key includes `heatmapSceneId`), dropdown :459-475 | **E-5** — heatmap also fires on mount (`enabled: !!id`, no scene gate); `StatCard` `change`/`changeLabel` props dead (no call site passes them). |
| Cross-tour analytics | Published tours load → first tour's analytics + comparison table | PASS | AnalyticsPage.tsx:35-42 (`getTours({limit:50, status:'published'})`), :76-84 (auto-select first), comparison table :316-362 | |
| Cross-tour analytics | Row click → detail + export target update | PASS | AnalyticsPage.tsx:363-381 (`TourRow` onSelect), Export CSV :218-224 | |

## 12. Profile & Settings

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Profile | Valid image ≤2MB → avatar updates + toast | PASS | ProfilePage.tsx:47-72; test `src/test/pages/ProfilePage.test.tsx` (avatar upload stores `profile_image_url`) | |
| Profile | Oversized image → error toast, nothing changes | PASS | ProfilePage.tsx:59-63 (`MAX_PROFILE_IMAGE_SIZE_BYTES` 2MB) | |
| Profile | Dirty form save → `PUT /users/me` + form resets | PASS | ProfilePage.tsx:28-45 (`updateMutation` onSuccess `reset(...)`), :144-146 (`disabled={!isDirty}`) | |
| Settings | Theme applies app-wide + persists | PASS | SettingsPage.tsx:130-150; `useUIStore` persist (stores/uiStore.ts) — covered by `src/test/stores/uiStore.test.ts` | |
| Settings | Notification toggle → `PUT /users/me` + "saving" status | PASS | SettingsPage.tsx:51-69 (optimistic + revert on error), :195-197 (`role="status"` saving label) | |
| Settings | Mismatched passwords → error toast blocks update | PASS | SettingsPage.tsx:92-100 | |
| Settings | Correct current password → success toast + form clears | PASS | SettingsPage.tsx:79-88 (`reset()` on success) | Static trace; backend auth is NOT-RUN(b). |
| App shell | Logout → session ends → `/login` | PASS | Header.tsx user menu → `authStore.logout()` (stores/authStore.ts) | |
| App shell | Collapsed sidebar → rail expands, labels return | PASS | Sidebar.tsx collapse rail (uiStore `sidebarCollapsed`) | |
| App shell | New Tour → `/tours/create` | PASS | Header.tsx:79 (`navigate(ROUTES.TOUR_CREATE)`) | |

---

## Critical path verification — editor store staleness (per-mutation trace)

**Question:** after each mutation type, does the editor UI (viewer markers, ScenePanel list, HotspotPanel list, scene-delete recovery) reflect the change **without a full page reload?**

**Answer: NO — for all 8 mutation types.** The editor UI is driven entirely by `useTourEditorStore.currentTour` (TourEditPage.tsx:147-148, :617 scene count, :946 ScenePanel `scenes` prop, :958/:1052/:1107 viewer `hotspots` prop, :1053/:1108 HotspotPanel props). The store is seeded once by the init guard and never re-synced after any mutation:

- **Store-init guard** — TourEditPage.tsx:536-550: `if (tour && scenes && tour.id === id) { const currentTour = useTourEditorStore.getState().currentTour; if (!currentTour || currentTour.id !== tour.id) { setCurrentTour({ ...tour, scenes }); } }`. Query refetches after invalidations hit this guard and are discarded because `currentTour.id === tour.id`.
- **Hotspot create** — HotspotEditorModal.tsx:281-295: `onSuccess` only `invalidateQueries([SCENES])` + toast + close. No store update.
- **Hotspot update** — HotspotEditorModal.tsx:297-308: same pattern.
- **Hotspot delete** — HotspotPanel.tsx:46-53: `invalidateQueries([SCENES])` + `selectHotspot(null)` + toast. No store update.
- **Scene add** — ScenePanel.tsx:271: `invalidateQueries([SCENES, tourId])` after `uploadSceneFiles`. No store update.
- **Scene delete** — ScenePanel.tsx:190-198 (`deleteMutation` onSuccess invalidates `[SCENES, tourId]`); selection move at :301-304 uses the stale prop list. No store update.
- **Scene reorder** — ScenePanel.tsx:231-237: optimistic `setQueryData` writes the **query cache** (unread by the panel); `reorderMutation` invalidates the cache. No store update.
- **Drag-to-reposition** — TourEditPage.tsx:369-379 (`handleHotspotDrag` → `PUT /hotspots/:id/position` → invalidate `[SCENES, id]` → toast). No store update.
- **AI applies** — TourEditPage.tsx:443-459 (scene analysis), :468-479 (descriptions), :493-523 (hotspots): PATCH/POST fan-out → `invalidateQueries([SCENES, id])` → toast. No store update.
- **Publish/Unpublish** — TourEditPage.tsx:267-272 / :279-285: invalidate `[TOUR, id]` only; badge/button read `currentTour?.status` (:617-618) → stale until reload.
- **Scene-delete recovery effect** — TourEditPage.tsx:552-562: `if (!sceneList.some(s => s.id === currentSceneId)) setCurrentScene(sceneList[0]?.id ?? null)` — reads the **stale** `currentTour.scenes`, so it can never detect a deletion; it only fires for selections that were never in the list.

The store even ships ready-made mutators for this (`addSceneDraft`/`updateSceneDraft`/`removeSceneDraft`/`reorderScenes`/`addHotspotDraft`/`updateHotspotDraft`/`removeHotspotDraft`, tourEditorStore.ts:41-74, 186-320) but they are marked `@deprecated` and **never called** from any component or page (verified by grep) — the doc's known gap is exact.

---

## Ranked errors found

Ranked by user impact × likelihood. All 20 known gaps from the doc are confirmed; E-1..E-4, E-9, E-11 add new file:line evidence or new symptoms.

1. **CRITICAL — Editor stale store: no scene/hotspot mutation reflects in the editor UI without a full reload (E-1, known gap, now fully traced).** Every mutation type (hotspot create/update/delete, scene add/delete/reorder, drag, AI applies) only invalidates TanStack queries while the store copy driving the UI stays frozen: guard TourEditPage.tsx:536-550; mutation onSuccess sites HotspotEditorModal.tsx:284-295/300-308, HotspotPanel.tsx:47, ScenePanel.tsx:193/207/271, TourEditPage.tsx:374/454/475/517. Consequences: deleted scenes remain selectable (broken viewer), new scenes invisible, reorder ignored, markers don't move after drag, AI-applied hotspots invisible. Scene-delete recovery effect (TourEditPage.tsx:552-562) is dead in practice because it reads the stale list.
2. **HIGH — Publish/Unpublish toolbar state goes stale (E-2, new symptom of E-1).** `publishMutation`/`unpublishMutation` only invalidate `[TOUR, id]` (TourEditPage.tsx:267-272, 279-285); the badge and Publish/Unpublish button read `currentTour?.status` from the store (:614-616), so after publishing the toolbar still shows "draft" + Publish until reload — the exact moment the user most needs feedback.
3. **HIGH — GuidedCapturePage: all captured frames lost on session reload (E-3, known gap).** Frames are component state (GuidedCapturePage.tsx:104); the resume effect (:184-204) restores only title + camera phase. A refresh mid-capture (mobile Safari tabs are notorious) silently discards every photo.
4. **HIGH — TourCreatePage: failed uploads can't be retried and "Continue to Editor" permits a zero-scene tour (E-4, known gap, lines pinned).** Errored files are terminal (`status: 'error'`); "Upload N Files" filters only `pending` (TourCreatePage.tsx:185); "Continue to Editor" renders whenever `!isUploading && pendingCount === 0` (:546-548), which is true when **all** files failed. No retry affordance exists.
5. **MEDIUM-HIGH — AITourWizard close orphans the backend job (E-5, known gap).** `handleClose` (AITourWizard.tsx) clears local state and `setJobId(null)` but never calls `aiApi.cancelJob`; X/overlay/step-1 Cancel during processing leaves the job running server-side with no UI to find it.
6. **MEDIUM — Partial AI-apply failure skips the UI refresh (E-6, new).** `handleApplySceneAnalysis`/`handleApplyDescriptions`/`handleApplyHotspotSuggestions` (TourEditPage.tsx:449-458, 473-482, 506-520) put `invalidateQueries` only in `.then`; on any single failure the catch toasts an error and the successful updates never refetch → UI shows stale data even though some updates persisted.
7. **MEDIUM — ToursPage mutations are silent on success (E-7, known gap).** delete/duplicate/archive `onSuccess` only invalidate `[TOURS]` (ToursPage.tsx:87-103); only errors toast. Duplicating a tour gives zero feedback and no link to the copy.
8. **MEDIUM — TourAnalyticsPage: heatmap fires on mount; StatCard has dead props (E-8, known gap).** Heatmap query `enabled: !!id` (TourAnalyticsPage.tsx:96-106) issues an all-scenes heatmap request before any selection; `StatCard`'s `change`/`changeLabel` props (interface :38-44) are never passed by any of the 4 call sites (:310-329).
9. **MEDIUM — HotspotEditorModal disables Save without a visible reason (E-9, known gap).** Save button `disabled={!canSave}` (HotspotEditorModal.tsx:683-686) while the only error text renders inside the Content tab (:582-586) — on the Appearance or Position tabs the button is silently dead (aria-describedby points at a hidden element).
10. **LOW-MEDIUM — TourSettingsPanel Cancel does not discard edits (E-10, known gap).** Local state syncs only on `[tour]` change (TourSettingsPanel.tsx:98-103); Cancel just closes (:683), so reopening shows stale unpersisted edits.
11. **LOW — TourViewPage preview hotspots are dead (E-11, known gap).** Preview passes no click handlers (TourViewPage.tsx:89-105); marker clicks no-op (PanoramaViewer.tsx:675-680) — users cannot preview navigation, only pan.
12. **LOW — Dashboard stats failure hides the whole page (E-12, doc mismatch).** Doc promises a scoped error card; DashboardPage.tsx:63-80 early-returns a full-page card, dropping the chart and recent tours widgets even though they have their own retry states.
13. **LOW — MediaLibrary search has no debounce (E-13, known gap).** `searchQuery` is raw in the query key (MediaLibraryPage.tsx:46-54); every keystroke issues a request.
14. **LOW — Reel "Copy link" gives no toast (E-14, known gap).** ReelGeneratorModal `handleCopyLink` only flips button text; no success/error toast (contrast ShareModal's copy, which toasts).
15. **LOW — Dead code confirmed client-side (known gap).** Floor-plan CRUD API (`toursApi.getFloorPlans`…`deleteFloorPlan`, tours.ts:295-338) unused; `aiApi.applySceneAnalysis`/`applyHotspotSuggestions` (ai.ts:218-241) never called (apply is client-side fan-out, TourEditPage.tsx:443-523); deprecated store draft mutators (tourEditorStore.ts:41-74) never called; `CustomDomainSetup` (wired to no page) and `VideoUploader` (no page) exported only from the features barrel (components/features/index.ts:11,13); header search decorative (Header.tsx:67-70, no handler) + Notifications (Header.tsx:95) and Help & Support / Feedback (Sidebar.tsx:143) hard-disabled.
16. **LOW — Upload orphaning on createScene failure (known gap).** TourCreatePage.tsx:200-208: `uploadFile` succeeds (object lands in Media Library) then `createScene` can fail → file marked error, uploaded object orphaned server-side; no cleanup call.
17. **OBSERVATION — `HotspotPanel` delete invalidates `[SCENES]` without the tour id (HotspotPanel.tsx:47).** Works via prefix matching but also invalidates scenes queries for every other tour page; harmless today, worth id-scoping for consistency.

---

## Doc-vs-code mismatches (doc written by another agent)

- Dashboard "scoped error card per widget" vs full-page early return (DashboardPage.tsx:63-80) — see E-12.
- Media Library "per-file `DELETE /upload/media/:id`, partial failures reported" — code uses batch `uploadApi.deleteMediaFiles` (MediaLibraryPage.tsx:75-93, upload.ts:84-90) which internally does per-file deletes and reports `failed[]`; behavior matches intent, API shape differs from the doc's wording.
- "Tour detail & preview … a working 360 preview" implies interactive preview; actual preview hotspots are dead (E-11).
- All other expected behaviors matched the code as written (including the known gaps, which the doc already flags accurately).

---

# Verification Log — Mobile: Auth, Assets, Capture, Stitch, Queue, Settings (Phase 2)

Method: read-only static trace of `mobile/app/lib` against the user stories in `docs/FEATURES_AND_USER_FLOWS.md` (mobile sections 1–5, 6.1, 12), plus the targeted test run below. No code changes made. Criteria needing a device/backend (camera, Supabase, `api.360ghar.com`, Cloudinary) are marked **NOT-RUN(b)** = needs device/backend — static trace only. Tests run (all 27 passed):

```
cd mobile/app && flutter test test/upload_queue_test.dart test/capture_controller_test.dart test/local_store_test.dart test/orientation_engine_test.dart test/capture_targets_test.dart test/stitcher_test.dart
→ 00:09 +27: All tests passed!
```

Status legend: **PASS** (verified in code/tests, static) · **PARTIAL** (code supports the happy path but a covered failure case violates the criterion) · **FAIL** (code contradicts the criterion) · **NOT-RUN(b)** (needs device/backend; static trace only).

---

## 1. Authentication & Session — Story: "Sign in / sign up (email, Google, Apple) with session restore"

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Auth | Missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` → hard failure screen with setup instructions at launch | PASS | `main.dart:25-27`, `_MissingEnvApp` `main.dart:137-155` | Fails at startup, not at first sign-in |
| Auth | Route guard: unauth → `/signin`; signed-in on `/signin`/`/splash` → `/`; no bounce while restoring | PASS | `core/router.dart:66-76` (`redirect`), `restoring` flag `router.dart:45-48,71-73` | Splash parking prevents flash |
| Auth | Auth-stream errors keep the last known user (no sign-out on dropped connection) | PASS | `router.dart:32-38` (`onError` sets `restoring=false`, keeps `currentUser`) | |
| Auth | Provider buttons disabled while busy; spinner on submit | PASS | `sign_in_screen.dart:33,113,150,157` (`_busy ? null : …`) | |
| Auth | AC1: fresh install → `/signin`; persisted session → `/` without flashing `/signin` | NOT-RUN(b) | `router.dart:66-76`; `AuthNotifier` `router.dart:24-43` | Static trace supports it; needs real Supabase session to run end-to-end |
| Auth | AC2: wrong credentials → "Wrong email or password." and stays on `/signin` | PASS | `sign_in_screen.dart:49-61` (`_friendly`: `Invalid login credentials` → message at :52) | Message mapping is code-verified; depends on Supabase error string |
| Auth | AC3: sign-up — confirmed accounts reach asset list; unconfirmed get "Check your inbox to confirm your email." | PARTIAL | `supabase_auth_repository.dart:50-57` throws only when `res.user == null` | See error #9 — with email confirmation on, supabase-dart returns a non-null unconfirmed user (no session), so the inbox message may be unreachable and the router silently parks the user on `/signin` (no message at all) |
| Auth | AC4: Google sign-in — iOS client id fetched from `GET /auth/config` at runtime; missing id → explanatory error | PASS | `supabase_auth_repository.dart:63-79` (`_initGoogle`, throws "Google sign-in isn't available…" :76-79); `backend_api.dart:187-192` (`getAuthConfig`) | Actual Google/Apple sign-in is NOT-RUN(b) |
| Auth | AC5: sign-out — confirm dialog, session dropped, lands on `/signin` | PASS | `asset_list_screen.dart:103-130` (dialog :106-121, `signOut` :124); router redirect `router.dart:75` | |

## 2. Asset Library (List) — Story: "I want to see all my scans with their processing state"

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| List | Only owner's assets, newest first, live updates | PASS | `local_asset_repository.dart:31-37` (`watchAssets` filters by `ownerId`, sorts `createdAt` desc); `asset_providers.dart:16-26` (`assetTickProvider`) | Stream re-emits on every `LocalStore` write |
| List | Status badge when not `ready`; colors capturing=dim, stitching/pendingCloudStitch/processing3d=accent, failed=danger | PASS | `asset_list_screen.dart:235-247` (`_StatusBadge`); badge rendered only when `status != ready` (:235) | |
| List | Thumbnail or placeholder, name, relative date | PASS | `asset_list_screen.dart:171-214` (`_AssetCard`), `_relativeDate` :261-269 | |
| List | Pull-to-refresh; load error → "Could not load your scans." + Retry | PASS | `asset_list_screen.dart:69-78` (error state), :95 (`RefreshIndicator` → `ref.refresh(provider.future)`) | Wrong-shape JSON file never reaches this error state — see error #8 |
| List | Empty state explains flow | PASS | `asset_list_screen.dart:140-152` (`_EmptyState`) | |
| List | App bar Settings / Sign out; FAB "Scan a room" → `/capture` | PASS | `asset_list_screen.dart:36-52` | |
| List | AC1: two scans newest-first with correct badges | PASS | `local_asset_repository.dart:31-37`; `asset_list_screen.dart:235-247` | Covered partially by `local_store_test.dart` "watchAssets filters by owner and sorts newest first" |
| List | AC2: status change updates the card without interaction | PASS | `asset_list_screen.dart:22` (`ref.watch(provider)`); queue writes → `LocalStore.watch` re-emit (`local_store.dart:87-93`) | |
| List | AC3: tap card → `/asset/:id` | PASS | `asset_list_screen.dart:170-172` | |
| List | AC4: sign-out from app bar after confirmation | PASS | `asset_list_screen.dart:103-130` | |

## 3. Asset Library (Detail) — Story: "One screen that tells me the state of a scan and lets me view, share, extend, or delete it"

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Detail | Hero panorama preview + status line | PASS | `asset_detail_screen.dart:38-56,137-147` (`_statusLine`) | |
| Detail | Action gating: View 360°/Share/Generate 3D need `ready && remoteTourId`; Rooms/Floor plan/Analytics need `remoteTourId`; disabled hint "Available after upload completes" | PASS | `asset_detail_screen.dart:88-126` (`enabled: ready && hasRemote` :89,96,110; `enabled: hasRemote` :103,117,124); `_Action` disabled hint :190-196 | "View 3D world" label swap when `model3dUrl != null` :110 |
| Detail | AC1: `failed` asset shows Retry upload; tap → status `stitching` + enqueue; failure reverts + "Could not retry the upload." | PASS | `asset_detail_screen.dart:78-86` (button), `_retryUpload` :149-168; reset of failed job in `upload_queue.dart:74-79` | Retry re-runs upload only — dead end for stitch failures, see focus (a) |
| Detail | AC2: all rows disabled with upload hint while `remoteTourId == null` | PASS | `asset_detail_screen.dart:88-126` | |
| Detail | AC3: delete — confirm dialog (Cancel/Delete), removes card, returns to `/` | PASS | `asset_detail_screen.dart:171-204`; `local_asset_repository.deleteAsset` `local_asset_repository.dart:58-106` | Deletes assets + rooms + queue jobs + local files + best-effort `DELETE /tours/:id` |

## 4. Guided 360° Capture — Story: "Guided through a complete room capture in under a minute"

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Capture | Camera permission; denied → "Camera access is required to scan a room." + Open Settings | PASS | `capture_screen.dart:102-106,137-145` (`_MessageScaffold`, `openAppSettings`) | Permission dialog itself NOT-RUN(b) |
| Capture | Back camera at 1080p (`ResolutionPreset.high`), session dir under `Documents/captures/<ts>` | PASS | `capture_controller.dart:124-139` (`ResolutionPreset.high` :131, session dir :134) | |
| Capture | Orientation engine ~30 Hz, yaw zeroed at start, low-pass accel+mag | PASS | `orientation_engine.dart:44-76` (`start`, `zero`), :119-126 (`Timer.periodic` 33 ms); tests `orientation_engine_test.dart` (4 fusion tests) | |
| Capture | Overlay: target dot, reticle, ghost dots, edge arrow; text instructions incl. roll > 15° | PASS | `target_overlay.dart:14-107` (painter, ghosts :93-102), `instructionFor` :111; `capture_screen.dart:135,150` | Roll text guidance verified; roll value from `orientation_engine.dart:164-166` |
| Capture | 5° alignment + ±2° stability + 400 ms dwell → auto-capture | PASS | `capture_controller.dart:165-196` (`_onOrientation` stability window :170-175, dwell :192-196); `capture_targets.dart:76-88` (`kAlignToleranceDeg=5`, `kStableToleranceDeg=2`, `kDwell=400ms`) | |
| Capture | Manual shutter + Skip always available; haptic per saved frame | PASS | `capture_screen.dart:277-306` (shutter `onTap: controller.captureFrame` :282, Skip :300); haptic via `ref.listen` frame-count diff `capture_screen.dart:116-122` | |
| Capture | Exposure locked after first frame (best-effort); shutter pose read before `takePicture()` | PASS | `capture_controller.dart:215-228` (exposure lock :216, pose snapshot :222-224 before `takePicture` :227) | |
| Capture | 16th target with ≥4 frames → review sheet; <4 → "Need N more shots" | PASS | `capture_controller.dart:231-251` (review :239-243, `needMoreShots` :245-250); tests `capture_controller_test.dart` "skip on last target with too few frames sets needMoreShots" / "…with >= 4 frames goes to review" | |
| Capture | AC1: 16 targets → review with 16 thumbnails | PASS | `capture_targets_test.dart` "16 targets: 8 on the horizon, 4 up, 4 down"; review strip `capture_screen.dart:359-374` | Thumbnails from saved frames |
| Capture | AC2: skipping all still finishes with ≥4; <4 demands more | PASS | `capture_controller.dart:260-286` (`skipTarget`), tests above | |
| Capture | AC3: manual shutter at any time increments frame count | PASS | `capture_screen.dart:282`; `capture_controller.dart:207-258` (`captureFrame`) | |
| Capture | AC4: Save creates local asset ("Untitled room" fallback) with `status: stitching`, returns to `/` | PASS | `capture_controller.dart:292-331` (`saveScan` :298-331, fallback :303); `capture_screen.dart:388-396` (`context.go('/')` :394) | Stitch runs `unawaited` (:330) |
| Capture | AC5: backgrounding pauses camera+sensors; resume re-initializes | PASS | `capture_screen.dart:74-92` (`didChangeAppLifecycleState`); `capture_controller.dart:98-107` (`pauseCamera`) | Device NOT-RUN(b) |

## 5. Add a room to an existing tour (capture-in-asset mode) — Story: "Add extra rooms so one property becomes a walkable multi-room tour"

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Add-room | `/capture?assetId=` → same guided flow → "Name this room" → Save creates `Room` (uuid, `remoteSceneId` null), stitches in background, `enqueueRoom`, navigates to room list | PASS | `router.dart:78-83` (query param); `capture_controller.dart:304-315` (`saveScan` room branch), `_stitchRoomAndUpload` :360-382; `capture_screen.dart:396-399` (`context.go('/asset/$intoAssetId/rooms')`) | |
| Add-room | AC1: saving a room adds a tile and eventually shows "Uploaded" | PARTIAL | Tile: `room_list_screen.dart:31-33,118`; "Uploaded" only when `remoteSceneId != null` `room_list_screen.dart:96,118` | Failure case is invisible forever — focus (g): `_stitchRoomAndUpload` swallows errors (`capture_controller.dart:381`) and `_advanceRoom` has no `onGiveUp` (`upload_queue.dart:336`), so a failed room shows "Uploading…" indefinitely, violating "eventually shows Uploaded" |
| Add-room | AC2: room panorama uploads to the same tour; `order_index = index+1` | PASS | `upload_queue.dart:279-337` (`_advanceRoom` uses `asset.remoteTourId` :281-289, `orderIndex: rooms.indexWhere(...) + 1` :326-328); test `upload_queue_test.dart` "room job waits for the tour, then uploads a scene" | Backend behavior NOT-RUN(b) |

## 6. Stitching & Processing — Story: "Stitching should always produce a panorama, so a capture is never wasted"

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Stitch | Ladder: OpenCV spherical (≤1600 px, 90 s timeout, 2:1 pad) → naive pure-Dart (isolate, 2048×1024) that always succeeds | PASS | `stitcher_service.dart:54-84` (rung order), `_stitchOpenCv` :86-134 (downscale :92-102, timeout `_openCvTimeout` :41), `_naiveStitch` :158-221; naive caught by no throw — test `stitcher_test.dart` "naive compositing produces a 2:1 equirect with painted regions" | |
| Stitch | `cloudFirst` skips OpenCV rung | PASS | `stitcher_service.dart:69-71` (`if (preferDevice)`); `capture_controller.dart:298-299` (`preferDevice = pref != cloudFirst`) | |
| Stitch | Thumbnail 640 px written next to panorama; both paths stored | PASS | `stitcher_service.dart:75-78,141-152` (`_writeThumbnail` width 640); `capture_controller.dart:341-347` (status/`panoramaPath`/`thumbnailPath` on asset) | |
| Stitch | Naive result → `pendingCloudStitch`; OpenCV result → `stitching` | PASS | `capture_controller.dart:343-347` (`result.naive ? pendingCloudStitch : stitching`) | |
| Stitch | AC1: `deviceFirst` — 16 frames → OpenCV or naive, never an error state | PASS | `stitcher_service.dart:54-84` (catch/timeout fall through :69-74); `capture_controller.dart:334-358` | Camera frames NOT-RUN(b); `stitcher_test.dart` covers naive path |
| Stitch | AC2: `cloudFirst` — no OpenCV attempt, straight to `pendingCloudStitch` | PASS | `stitcher_service.dart:69-71`; `capture_controller.dart:298-299,343-347` | |
| Stitch | AC3: output is 2:1; thumbnail exists next to panorama | PASS | `_padToTwoToOne` `stitcher_service.dart:136-153`; `_writeThumbnail` :141-152; test `stitcher_test.dart` (2:1 assert) | |
| Stitch | Cloud re-stitch (`POST /scenes/:id/stitch`) replaces the scene image server-side; naive pano visible until then | NOT-RUN(b) | `upload_queue.dart:251-256` (`requestStitch`); `backend_api.dart:146-158` | Backend swap not verifiable here; the client-side skip bug is focus (h) |

## 7. Upload Queue & Background Reliability — Story: "Uploads survive a crash or a dead zone"

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Queue | Asset pipeline `createTour → presign → putCloudinary → confirm → createScene → publish → [uploadFrames → requestStitch]`; room pipeline `presign → put → confirm → createScene` | PASS | `upload_queue.dart:153-268` (`_advance` cases :163-262), `_advanceRoom` :279-337; test "full pipeline runs in order and marks the asset ready" | |
| Queue | `enqueue` dedupes (one active job per asset); failed job reset via `_resumeStep` with `attempts = 0` | PASS | `upload_queue.dart:64-89` (dedupe :66-72, reset :74-79) | |
| Queue | Single-flight sequential drain; every step persisted before the next API call | PASS | `upload_queue.dart:109-151` (`pump`/`_drain`), upsert after each case :265; test "recovers from a failed step without duplicating earlier ones" (asserts single `createTour`/`presign`) | Crash *between* API success and the post-step upsert can still duplicate a tour — error #11 |
| Queue | `createTour` stores `remoteTourId`; `publish` captures `short_code`; `pendingCloudStitch` job switches to frame upload + `requestStitch` (one frame per pass, resumable) | PASS | `upload_queue.dart:163-168` (tourId), :202-225 (publish; `needsCloudStitch` :204-206; frame init :220-223), :230-262 (uploadFrames) | |
| Queue | Failure: attempts++ with exponential backoff (5 s … 5 min) + re-pump timer; after 8 attempts → `failed`; asset jobs flip asset to `failed`, room jobs get no status update | PASS | `upload_queue.dart:38` (`_maxAttempts = 8`), `_failWithBackoff` :346-364 (delay `min(300, 2^attempts*5)` :362-363); `onGiveUp` asset-only :271-273 vs room :336 | |
| Queue | Connectivity listener re-pumps on network return; `retry(assetId)` resets failed jobs; startup `queue.pump()` | PASS | `upload_queue.dart:46-52` (connectivity), `retry` :384-397; `main.dart:68` | Startup resume caveat = focus (b) |
| Queue | UI feedback: none during progress (status from asset record); terminal failure shows Failed + Retry | PASS (as documented) | `asset_list_screen.dart:235-247`; `asset_detail_screen.dart:78-86`; nothing reads the `upload_queue` collection in UI code | Matches doc's own description; the invisibility gap = focus (c) |
| Queue | AC1: crash between `createTour` and `presign` resumes at `presign` with the same `tourId` | PASS | Step persisted before upsert (`upload_queue.dart:163-168`); resume path `_advance` :153-166 never recreates a tour when `tourId` exists; `_resumeStep` guards `createTour`+`tourId` :375-377 | No test instantiates a second queue mid-pipeline (crash-restart untested) — error #12 |
| Queue | AC2: failed asset job retryable from detail screen, attempts reset | PASS | `asset_detail_screen.dart:149-168`; `upload_queue.dart:74-79` and `retry` :384-397 (`attempts = 0`) | |
| Queue | AC3: enqueueing the same asset twice produces one active job | PASS | `upload_queue.dart:66-72` | |
| Queue | AC4: deleting an asset removes its job and its rooms' jobs | PASS | `local_asset_repository.dart:82-100` (jobs filtered by `assetId` :86-88, rooms deleted :92-96); test "deleted asset drops its queued job" | Room jobs carry the same `assetId` → covered by the same filter |

## 8. Room list (cross-reference for focus g) — Story: "Manage the rooms of a property"

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Rooms | Main capture surfaced as "<name> (main)", never deletable; rooms newest last | PASS | `room_list_screen.dart:88-99` (`_mainRoomEntry`), `_RoomTile` delete button only when `uploaded && !isMain` :126-131 | |
| Rooms | Rooms without `remoteSceneId` not tappable, show "Uploading…" | PASS (as coded) / PARTIAL (as a story) | `room_list_screen.dart:96-118,132-134` | The doc's own known gap: any room without `remoteSceneId` — including terminally failed ones — renders "Uploading…" forever; focus (g) |

## 9. Settings & Processing Preferences — Story: "Choose where heavy processing runs"

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Settings | Radio group On-device first (default) vs Cloud first | PASS | `settings_screen.dart:31-62`; default `deviceFirst` `processing_preference.dart:17-20` | |
| Settings | Choice persists to `SharedPreferences` before UI flips; failed write reverts + "Could not save the preference. Try again." | PASS | `processing_preference.dart:24-36` (`set` persists first :29-30, `state = previous` on failure :33-35); `settings_screen.dart:37-45` | |
| Settings | AC1: Cloud first persists across restarts and skips the OpenCV rung | PASS | `processing_preference.dart:24-30`; `capture_controller.dart:298-299`; `stitcher_service.dart:69-71` | |
| Settings | AC2: failed preference write keeps radio on persisted value + snackbar | PASS | `processing_preference.dart:33-35`; `settings_screen.dart:40-45` | |
| Settings | AC3: Insta360 tile three states (searching / none / detected) without crashing on unlinked SDK | PASS | `settings_screen.dart:92-137` (`FutureBuilder` :104-120, `_discover` catches `Insta360NotLinkedException` :133-137) | Device/network NOT-RUN(b) |

---

## Focus-path verdicts (a–h)

- **(a) Failed-stitch dead end — CONFIRMED.** `_stitchAndUpload` catch marks the asset `failed` with no panorama (`capture_controller.dart:354-357`); "Retry upload" (`asset_detail_screen.dart:149-168`) only re-saves status `stitching` + `enqueueUpload`; the job then throws `StateError('panorama file missing')` at `upload_queue.dart:171-172` (pano null) and backoff-fails after 8 attempts (`upload_queue.dart:346-364`). `StitcherService` is invoked in exactly two places — `capture_controller.dart:338` and `:371` (grep over `mobile/app/lib` for `StitcherService`/`.stitch(` returns only these) — **no path re-runs StitcherService**.
- **(b) Presign not re-issued on crash-restart — CONFIRMED.** Startup `main.dart:68 queue.pump()` → `_drain` → `_advance` (`upload_queue.dart:109-166`) runs the persisted step as-is; `_resumeStep` (re-presign logic `upload_queue.dart:371-380`) is called only from `enqueue` (`:75`) and `retry` (`:392`). A job persisted at `putCloudinary`/`confirm` resumes with the stale `presigned` map and burns backoff attempts (8 × 401/403) into `failed`. Refutes the doc's expected-behavior bullet "re-presigns when the stored Cloudinary signature may be expired" for the *startup-resume* path — true only for manual enqueue/retry.
- **(c) Queue failure visibility — CONFIRMED.** `lastError`/`lastStep` written only inside the queue JSON (`upload_queue.dart:353-357`); grep for `lastError`/`upload_queue` shows no widget or provider reads the `upload_queue` collection (only `local_asset_repository.dart:25,86-90` writes it for deletes). During backoff the user sees only the asset record's stale status badge ("Stitching…"/"Uploading…", `asset_list_screen.dart:235-247`), with no retry count or error; terminal failure flips the asset to `failed` (badge + Retry on detail); room-job failures never surface at all.
- **(d) Auth expiry during upload — CONFIRMED (with nuance).** Single-flight 401 refresh at `api_client.dart:41-58`; if `refreshSession()` fails the original error propagates (`:56-59`), the queue catches it and backoff-retries to `failed` (`upload_queue.dart:346-364`). There is no re-auth prompt or queue pause anywhere: grep for `signInWith` shows the only sign-in callers are `sign_in_screen.dart:150,157,176` (and the repo implementations). Nuance: supabase-flutter may emit `signedOut` on refresh failure, which the router honors (`router.dart:75`) and bounces the user to `/signin` with no context about the pending upload — the queue keeps burning attempts in the background.
- **(e) Orphaned capture frames — CONFIRMED.** The only `captures` reference in `lib` is session-dir creation `capture_controller.dart:134` (`Documents/captures/<ts>`); `_teardown` (`:384-389`) only cancels the sensor subscription and disposes the camera — no frame cleanup on cancel. Startup runs only `queue.pump()` (`main.dart:68`); there is no sweep of `Documents/captures`. Cancelled/abandoned sessions accumulate frames indefinitely (successful captures keep frames intentionally for cloud re-stitch).
- **(f) LocalStore quarantine — CONFIRMED (and worse than the known gap).** `readAll` catches only `FormatException` (`local_store.dart:44`); valid-but-wrong-shape JSON throws `TypeError` from `jsonDecode(...) as List` (`:39`) or `Map<String, dynamic>.from(e as Map)` (`:43`) with no quarantine. In `watch`, the throw happens inside the async `onListen` (`:118-119`) → unhandled zone error, the stream never emits and never errors → `assetTickProvider` spins forever (the "Could not load your scans." error state at `asset_list_screen.dart:69-78` is unreachable for this failure); the queue's `_drain` `readAll` (`upload_queue.dart:128`) also throws → pump dies silently.
- **(g) Room failure invisibility — CONFIRMED.** `_stitchRoomAndUpload` swallows every error (`capture_controller.dart:381` `catch (_) {}`); `Room` has no status field (`models.dart:229-290`); `room_list_screen.dart:96-118` renders `'Uploading…'` (accent) for any room with `remoteSceneId == null` and `_advanceRoom`'s `_failWithBackoff` has no `onGiveUp` (`upload_queue.dart:336` vs asset `:271-273`), so terminally failed room jobs leave the room stuck at "Uploading…" forever.
- **(h) Upload-frames skip — CONFIRMED.** `uploadFrames` silently skips missing local frames (`upload_queue.dart:237-249`: `if (file.existsSync())` guard, `frameIndex` still advances at `:249`); `requestStitch` runs only `if (urls.length >= 2)` (`:253`); below that (or all frames missing) the job is still marked done and the asset flipped to `ready` (`:255-262`), so the cloud re-stitch is silently skipped while the asset claims readiness.

---

## Ranked errors found

Known-gap items from the doc are re-confirmed with exact lines; NEW issues are marked **(NEW)**.

| # | Severity | Issue | File:line | Status vs known list |
|---|---|---|---|---|
| 1 | HIGH | Failed-stitch dead end: asset marked `failed` without a panorama; Retry re-enqueues only; job throws "panorama file missing" and fails again; no re-stitch path exists | `capture_controller.dart:354-357`; `asset_detail_screen.dart:149-168`; `upload_queue.dart:171-172` | known gap — CONFIRMED (a) |
| 2 | HIGH | Expired Cloudinary presign on crash-restart: startup `pump()` resumes at `putCloudinary`/`confirm` with a stale signature; `_resumeStep` re-presign only from enqueue/retry | `main.dart:68`; `upload_queue.dart:153-166,371-380` (re-presign call sites `:75,:392`) | known gap — CONFIRMED (b) |
| 3 | HIGH | **(NEW)** LocalStore quarantine catches only `FormatException`; wrong-shape-but-valid JSON throws an uncaught `TypeError` → asset list hangs on a perpetual spinner (error state unreachable), queue pump dies silently, and all reads/writes on that collection fail until manual file fix | `local_store.dart:39,43-44` (quarantine), `:118-119` (watch onListen); `upload_queue.dart:128` | extends known gap (f) |
| 4 | MED-HIGH | Queue failures invisible: `lastError`/`lastStep` persisted but never surfaced; backoff runs 5 s–5 min with no UI; room-job failures never surface | `upload_queue.dart:346-364`; no `upload_queue` reader in UI (grep) | known gap — CONFIRMED (c) |
| 5 | MED-HIGH | Room failure invisible forever: swallowed stitch errors + no `Room.status` + no `onGiveUp` → "Uploading…" indefinitely, contradicting the "eventually shows Uploaded" AC | `capture_controller.dart:381`; `models.dart:229-290`; `room_list_screen.dart:96-118`; `upload_queue.dart:336` | known gap — CONFIRMED (g) |
| 6 | MED | Auth expiry mid-upload: single 401 refresh fails → queue backoff → `failed`; no re-auth prompt or queue pause (user may be silently bounced to `/signin` by the SDK's signedOut event while jobs keep retrying) | `api_client.dart:41-58`; `upload_queue.dart:346-364`; `router.dart:75` | known gap — CONFIRMED (d) |
| 7 | MED | Cloud re-stitch silently skipped: missing frames dropped without error; <2 URLs → `requestStitch` never called but asset marked `ready` + job `done` | `upload_queue.dart:237-249,251-262` | known gap — CONFIRMED (h) |
| 8 | MED | Orphaned capture frames: cancelled sessions leave `Documents/captures/<ts>` frames forever; no startup sweep, no teardown cleanup | `capture_controller.dart:134,384-389`; `main.dart:68` | known gap — CONFIRMED (e) |
| 9 | MED | **(NEW)** Sign-up inbox-check message likely unreachable: `signUpWithEmail` throws only when `res.user == null`; supabase-dart returns a non-null unconfirmed user (no session) → no "Check your inbox" message and the router silently parks the user on `/signin` | `supabase_auth_repository.dart:50-57`; `sign_in_screen.dart:52-56`; `router.dart:66-76` | NEW — violates Auth AC3; needs device/backend to confirm SDK behavior |
| 10 | LOW-MED | **(NEW)** A tour already published can flip back to `failed`: publish marks `ready`, a later `uploadFrames`/`requestStitch` failure hits the asset-level `onGiveUp` → user sees Failed/Retry while the tour is live with the naive pano (retry eventually recovers) | `upload_queue.dart:202-225,271-273` | NEW — UX inconsistency |
| 11 | LOW | **(NEW)** Crash window between API success and post-step upsert can duplicate a tour (`createTour` succeeded, crash before `upsert` at `:265` → restart re-creates the tour; no idempotency key) | `upload_queue.dart:163-168,265` | NEW — small window |
| 12 | LOW-MED | **(NEW)** Test coverage gaps: no test for `uploadFrames`/`requestStitch`, the 8-attempt give-up, `retry()`/`_resumeStep`, crash-restart resume (a second queue instance), or room-job terminal failure | `upload_queue_test.dart` (4 tests: full pipeline, one backoff retry, delete, room-wait only) | NEW — verification gap; the 27 targeted tests all pass but do not exercise the known-gap paths |
| 13 | LOW | **(NEW)** `takePicture` failure is silent: `captureFrame` catch just returns to `aiming` with no message (disk-full/camera error invisible) | `capture_controller.dart:207-219` | NEW |
| 14 | LOW | Deep links: cold-start links dropped (`uriLinkStream` only, no `getInitialUri`); `/view` and `/view3d` both land on the plain detail screen | `main.dart:97,109-116` | known gap — CONFIRMED |
| 15 | LOW | Dead code: `ShareLink.embedCode` getter never called; `ApiShareRepository.getLink` returns `null` stub, never called; `AssetType.lidar` never used; `url_launcher` unused in lib; `_StatusBadge` `ready` branch unreachable | `models.dart:24,334-336`; `api_share_repository.dart:66-67`; `asset_list_screen.dart:235-239` | known gap — CONFIRMED |
| 16 | LOW | `processing3d` never set and 3D job state not persisted: badge/status-line reads exist but no producer; generate-3d only saves `model3dUrl`/`type`; job polling is screen-local | `asset_list_screen.dart:242`; `asset_detail_screen.dart:144`; `viewer_screen.dart:174`; `generate_3d_screen.dart:165-199` (no `AssetStatus.processing3d` write) | known gap — CONFIRMED |

## Summary counts

- Stories verified: 9 (Auth, Asset list, Asset detail, Guided capture, Add-room, Stitch ladder, Upload queue, Room list cross-ref, Settings) — 67 criteria rows.
- Status counts: **PASS (static/tests) 63 · PARTIAL 2 · FAIL 0 · NOT-RUN(b) 2** (auth AC1 session restore; cloud re-stitch server-side swap). PARTIAL: Auth AC3 (inbox message reachability, error #9) and Add-room AC1 ("eventually shows Uploaded", focus g).
- No story's *documented* expected behavior contradicts the code on the happy path — every doc story matches the code; the doc's own "Known gap" lines are all re-confirmed by the focus-path traces, and 6 NEW issues were found (#3, #9, #10, #11, #12, #13).
- Tests: 27/27 passed across the six targeted files; full-suite baseline not run here (per parent instructions).
- Note: `docs/VERIFICATION_LOG.md` does not exist yet (`docs/` currently contains only `FEATURES_AND_USER_FLOWS.md`); this `.part.md` is the Phase-2 deliverable for later consolidation.

---

# Verification Log — Mobile: Tours, LiDAR, Share, Viewer, Analytics, 3D, Cross-App (Phase 2)

Method: every acceptance criterion in `docs/FEATURES_AND_USER_FLOWS.md` sections "Tour Management (Rooms & Hotspots)", "Floor Plans & LiDAR", "Publishing & Sharing", "Tour Viewing (Embed / 3D)", "Analytics", "3D World Generation", "Cross-App Flows (Mobile ↔ Web Viewer)" traced against `mobile/app/lib` (README-ONLY; nothing fixed). Device/backend criteria are marked `NOT-RUN(b)` = "needs device/backend — static trace only". Tests run: `cd mobile/app && flutter test test/embed_code_test.dart` → **4/4 passed**.

**Totals: 13 stories verified across 7 sections, 28 criteria → 23 PASS, 3 PARTIAL, 2 NOT-RUN(b), 0 FAIL. Divergences (embed parity): 7, of which 0 break runtime. E2E vacuous/near-vacuous assertion sites: 54 (plus 7 conditional tests that silently skip).**

Test inventory under `mobile/app/test` (8 files): `capture_controller_test.dart`, `capture_targets_test.dart`, `embed_code_test.dart`, `local_store_test.dart`, `orientation_engine_test.dart`, `stitcher_test.dart`, `upload_queue_test.dart`, `widget_test.dart`. Only `embed_code_test.dart` covers share/viewer logic; **no test exists** for tours/lidar/analytics/threed screens (they are presentation-only with no widget tests).

## 6. Tour Management (Rooms & Hotspots)

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Room list (multi-room tour) | A freshly saved room appears as "Uploading…" and flips to "Uploaded" once its scene is created | PASS | `room_list_screen.dart:158-166` (`uploaded = isMain \|\| room.remoteSceneId != null`; subtitle `'Uploaded'`/`'Uploading…'`); `upload_queue.dart:315-320` (`saveRoom(room.copyWith(remoteSceneId: scene['id']))`) | Main entry always "Uploaded" (`room_list_screen.dart:76-79`). A terminally failed room shows "Uploading…" **forever** — `_advanceRoom` has no `onGiveUp` (`upload_queue.dart:336-337`) and `Room` has no status field (`models.dart:206-225`) → ranked error #4. |
| Room list (multi-room tour) | Deleting a room removes it from the list and (best-effort) from the backend | PASS | `room_list_screen.dart:174-208` (confirm dialog → `deleteRoom`); `local_asset_repository.dart:112-130` (local delete + best-effort `DELETE /scenes/:id`) | Delete button only for uploaded non-main rooms (`room_list_screen.dart:168-173`). |
| Hotspot placement (web embed in edit mode) | Tapping the panorama with ≥1 other uploaded scene creates a hotspot and the embed reloads showing it | PASS | `hotspot_editor_screen.dart:65` (URL `?editmode=1&minimal=1`), `84-97` (`_onViewerMessage`, single-flight `_placing`), `120-126` (destination filter), `176-192` (`createHotspot` → snackbar → `reload()`) | Angles clamped ±180/±90 (`110-113`); `__main__` resolved to lowest `order_index` scene via `getTour` (`152-166`). Web side posts `panoramaClick {yaw,pitch,sceneId}` (`web/src/pages/EmbedTourPage.tsx:195-202`). |
| Hotspot placement (web embed in edit mode) | With zero other scenes, no API call happens and the explanatory snackbar shows | PASS | `hotspot_editor_screen.dart:128-134` (`destinations.isEmpty` → snackbar "Add another room first…" before any API call) | |
| Hotspot placement (web embed in edit mode) | A network error on create shows an error snackbar and re-enables placement | PASS | `hotspot_editor_screen.dart:86-93` (catch → snackbar), `94-95` (`_placing = false` in `finally`) | Raw error text shown to user (line 90) → ranked error #8. Write-only editor (no list/edit/delete; `BackendApi.deleteHotspot` `backend_api.dart:88` never called; `Room.hotspots` never populated `models.dart:212,223`) → ranked error #5. |

## 7. Floor Plans & LiDAR

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Floor plan gallery | A tour with floor plans renders one image per plan | PASS | `floor_plan_screen.dart:20-26` (`GET /tours/:id/floor-plans`), `66-95` (`CachedNetworkImage` per plan, `errorWidget` → "Image unavailable") | |
| Floor plan gallery | A tour without plans shows the empty state with the LiDAR CTA | PASS | `floor_plan_screen.dart:73` (`plans.isEmpty` → `_Empty`), `97-130` ("Open LiDAR scan" → `context.push('/lidar')`) | |
| LiDAR room scan (Apple RoomPlan) | Unsupported device shows the fallback screen, not a crash | PASS | `lidar_scan_screen.dart:23` (`checkCapability`), `158-175` (`!cap.supported \|\| !roomPlanAvailable` → `_Unsupported`), `176-178` ("Use guided photo scan" → `context.go('/capture')`) | Static trace; native capability call not executed here. |
| LiDAR room scan (Apple RoomPlan) | A completed scan lists measurements with accuracy labels and can share the USDZ | NOT-RUN(b) | `lidar_scan_screen.dart:117-131` (`_stop` → `getMeasurements`), `179-205` (rows "±2 cm"/"estimate"), `139-157` ("Share 3D scan" → SharePlus with `usdzPath`) | Needs a RoomPlan-capable device. Known gap: scan is not wired into the asset pipeline (USDZ only shared; floor-plan screen is read-only). |

## 8. Publishing & Sharing

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Publish tour + public link, QR, embed | First visit to Share with no `shareCode` calls `POST /tours/:id/publish` once and persists the code | PASS | `api_share_repository.dart:42-53` (`code == null` → `publishTour` → `_saveAsset(copyWith(shareCode: code))`) | The upload queue's publish step already captures `short_code` (`upload_queue.dart:199-219`), so most assets arrive with `shareCode` set — no second publish. |
| Publish tour + public link, QR, embed | Second visit uses the persisted code with no API call | PASS | `api_share_repository.dart:39-42` (`var code = asset.shareCode; if (code == null) {…}`) | |
| Publish tour + public link, QR, embed | Copy link / copy embed code show snackbar confirmations | PASS | `share_screen.dart:121-129` ("Link copied"), `227-233` ("Embed code copied") | |
| Publish tour + public link, QR, embed | A publish network failure shows the friendly error and allows retry (invalidate) | PASS | `api_share_repository.dart:46-51` (`SharePublishException`); `share_screen.dart:68-92` (error state + "Try again" → `ref.invalidate(shareLinkProvider(assetId))`) | Dead code confirmed: `ShareLink.embedCode` (`models.dart:334-336`) never used; `getLink` stub (`api_share_repository.dart:66`, interface `repositories.dart:34`) has no call sites; `url_launcher` in `pubspec.yaml:44` unused → ranked #11. |

## 9. Tour Viewing (Embed / 3D)

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| In-app WebView viewer | A ready asset with a tour id loads the embed and clears the loading spinner on page finish | PASS | `viewer_screen.dart:58-62` (`_maybeStartLoad` guard), `66-70` (`didChangeDependencies`), `87-90` (provider listener — never from `build`), `38-40` (`onPageFinished` → `_loading = false`) | |
| In-app WebView viewer | mode=3d loads `/view3d/<tourId>`; mode=pano loads `/embed/<tourId>?minimal=1&branding=0` | PASS | `viewer_screen.dart:33-36`; routes registered `web/src/constants/routes.ts:22-23` | Web parses `minimal=1`/`branding=0` via `parseBooleanParam` (`web/src/utils/url.ts:1-11`). |
| In-app WebView viewer | Retry after a web-resource error reloads the same URL | PASS | `viewer_screen.dart:73-82` (`_retry` → `_load(_tourId)`) | Caveat: `e.isForMainFrame ?? true` (line 44) surfaces subframe errors as a full "Could not load the tour." → ranked error #7. |

## 10. Analytics

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Tour view analytics | A tour with data renders Views, Time spent, and Showing requests from the API payload fields | PASS | `api_share_repository.dart:70-87` (`total_views`, summed `session_durations`, summed `hotspot_clicks` values); `analytics_screen.dart:52-83` (three `_Stat` cards) | "Showing requests" = sum of `hotspot_clicks` values — a heuristic, matches doc intent. |
| Tour view analytics | A zero-view tour shows the share CTA linking to the share screen | PASS | `analytics_screen.dart:49` (`a.views == 0` → `_ZeroViewsCta`), `88-107` (→ `/asset/:id/share`) | |
| Tour view analytics | Pull-to-refresh re-fetches from the backend | PASS | `analytics_screen.dart:41-46` (`RefreshIndicator` → invalidate + await future) | Raw error text `'Analytics unavailable\n$e'` (line 37) → ranked error #8. |

## 11. 3D World Generation

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Cloud 3D world job (with polling) + on-device photogrammetry | Starting generation calls `POST /tours/:id/generate-3d` and polls the returned job id | PASS | `generate_3d_screen.dart:84-105` (`_start` → `generate3dWorld` → `_jobId` → `Timer.periodic` 5 s `_check`) | 5 s polling, 360-poll / 5-consecutive-failure caps (`63-76`, `118-135`). |
| Cloud 3D world job (with polling) + on-device photogrammetry | On "completed", the asset persists `model3dUrl` and the UI offers "View 3D world" | PASS | `generate_3d_screen.dart:123-142` (`saveAsset(model3dUrl: '${viewerBase}/view3d/<tourId>', type: model3d)`), `201-207` ("View 3D world" button); detail action flips via `asset.model3dUrl` (`asset_detail_screen.dart:109`) | |
| Cloud 3D world job (with polling) + on-device photogrammetry | On "failed", the job's error message is shown and Retry restarts | PASS | `generate_3d_screen.dart:143-148` (failed → `error_message`), `208-211` ("Retry generation" → `_start`) | |
| Cloud 3D world job (with polling) + on-device photogrammetry | Photogrammetry shares a USDZ or shows the iOS-17/LiDAR-unsupported message | NOT-RUN(b) | `generate_3d_screen.dart:27-69` (`_PhotogrammetryButton` → `LidarScanner.buildPhotogrammetry` → SharePlus; `PHOTOGRAMMETRY_UNSUPPORTED` snackbar) | Needs device. Known gap: `AssetStatus.processing3d` never set + job state widget-local → ranked error #2. |

## 13. Cross-App Flows (Mobile ↔ Web Viewer)

| Story | Criteria | Status | Evidence (file:line or test name) | Notes |
|---|---|---|---|---|
| Mobile publish → web public viewer | A published tour's share URL contains the tour's short code and resolves to the web viewer route; reopening Share after restart shows the same URL without a new publish call | PARTIAL | URL = `${Env.apiRoot}/v/<code>` (`models.dart:331-332`, `env.dart:9-12`); fallback `${viewerBase}/view/<id>` (`api_share_repository.dart:54-56`); `shareCode` persisted (`upload_queue.dart:208-216`, `api_share_repository.dart:48-53`); web `PUBLIC_TOUR '/view/:id'` registered (`routes.ts:21`) | "Contains short code" + "no re-publish" PASS by trace. "Resolves to the web viewer route" is the **backend** `/v/<code>` OG redirect — needs backend to execute: NOT-RUN(b). Mobile-side URL is a backend route, not the web route itself. |
| Mobile share → embed code → web `/embed/:id` | The copied snippet contains the viewer host, the tour id, and the sandbox/allow attributes; pasting it into an HTML page loads the embed | PARTIAL | `embed_code.dart:22-45` (`generateEmbedCode`: src=`viewerBase/embed/<tourId>`, allow/sandbox/referrerpolicy/allowfullscreen/loading=lazy/style); `share_screen.dart:215-242` (`_EmbedSection` copies code); `EMBED_TOUR` registered (`routes.ts:23`) | Snippet contents PASS by trace; actual paste-and-load needs a browser + published tour: NOT-RUN(b). |
| Mobile viewer screen → web `/embed/:id` and `/view3d/:id` | pano mode loads the embed URL with `minimal=1&branding=0`; 3d mode loads `/view3d/<tourId>`; both clear the loading spinner on page-finish | PASS | `viewer_screen.dart:33-40` | Web parses `1`/`0` correctly (`web/src/utils/url.ts:1-11`). |
| Hotspot editor → web `/embed/:id?editmode=1&minimal=1` | A panorama tap triggers exactly one `createHotspot` call with clamped angles and a valid `target_scene_id`, and the embed reloads showing the marker | PASS | `hotspot_editor_screen.dart:65` (URL), `84-97` (single-flight `_placing`, type filter `panoramaClick`), `110-113` (clamp), `120-166` (destinations + `__main__` resolution), `176-192` (create → reload) | Web reads `editmode` as string `'1'` (`EmbedTourPage.tsx:88`) — matches. |
| Deep links into the app | Tapping a `/v/<code>` link for an owned asset opens that asset's detail screen | PARTIAL | `main.dart:93-97` (`uriLinkStream` subscription), `100-115` (match `shareCode` → `go('/asset/<id>')`) | PASS warm-start only. Cold-start links dropped (no `getInitialUri`) → ranked #1. `/view` **and** `/view3d` both land on plain detail (`main.dart:111-115`) → ranked #6. Non-owned links silently ignored (`main.dart:105-116`) → ranked #9. |

**Flagged story mismatches (expected behavior vs code):**
- Deep links: the story's intent ("tap my own share link and land on the tour") holds only for warm starts on owned assets; cold starts, `/view3d` mode, and non-owned links diverge from intent.
- Room list: the doc's own "Known gap" (failed rooms stuck on "Uploading…") makes AC1's "flips to Uploaded" conditional on the job succeeding — confirmed, not a doc error.
- All other expected behaviors matched the code; no story's expected behavior was contradicted beyond the documented gaps.

## Embed parity divergence table

`mobile/app/lib/features/share/domain/embed_code.dart` vs `web/src/utils/embedCode.ts` — byte-level diff of both generators and of the actual runtime URLs the app builds (`viewer_screen.dart:33-36`, `hotspot_editor_screen.dart:65`).

| # | Aspect | Mobile (`embed_code.dart`) | Web (`embedCode.ts`) | Runtime impact | Severity |
|---|---|---|---|---|---|
| 1 | Default iframe height | `480` (bare int, line 27) | `500` → formatted `'500px'` (`DEFAULT_OPTIONS.height=500`; `formatDimension`, lines 104, 126-128) | iframe renders 480 vs 500 px tall | Cosmetic |
| 2 | Query-param value format | `minimal=1`, `branding=0`, `autoplay=1` (lines 14-19) | `minimal=true`, `branding=false`, `autoplay=true` (URLSearchParams booleans, `buildQueryParams` lines 69-99) | None — web `parseBooleanParam` accepts `'1'/'0'` (`web/src/utils/url.ts:1-11`); `editmode` compared as string `'1'` (`EmbedTourPage.tsx:88`) | Cosmetic |
| 3 | Params emitted by default | none (bare `/embed/<id>`) | `autoplay=true` plus all 8 options explicit (`navbar=true`, `minimal=false`, `autohide=false`, `fullscreen=true`, `vr=true`, `rotate=false`, `branding=true`) | None — web page defaults equal the explicit values (`EmbedTourPage.tsx:80-87`, `?? true`/`?? false`) | Cosmetic |
| 4 | Host source | `Env.viewerBase` compile-time constant (`env.dart:14-17`, `https://360viewer.360ghar.com`) | `window.location.origin` at runtime (`getBaseUrl`, lines 44-51) | None in prod (same origin); mobile must use the constant (WebView) | Cosmetic |
| 5 | HTML escaping of `src` | `_escapeHtmlAttr` on tour id (lines 47-53) | none | None (server-minted UUIDs) | Cosmetic |
| 6 | Iframe attribute template | 11 attributes, 2-space indent (lines 29-45) | identical (lines 130-145) | None — template is byte-identical | None |
| 7 | Param surface | `minimal`, `branding`, `autoplay` only | `scene`, `autoplay`, `navbar`, `minimal`, `autohide`, `fullscreen`, `vr`, `rotate`, `branding` | Mobile exposes a subset; every param the web parses | Cosmetic |

**Divergence count: 7; runtime-breaking: 0.** All differences are cosmetic because (a) the web boolean parser accepts `1/0` and `true/false` interchangeably, (b) the web embed page's own defaults equal the explicit values the web generator emits, and (c) the iframe attribute template is byte-identical.

**Test self-reference confirmed:** `mobile/app/test/embed_code_test.dart` asserts only Dart constants — `height="480"`, `minimal=1&branding=0`, host `https://360viewer.360ghar.com` — against the Dart implementation itself. It never imports or checks `web/src/utils/embedCode.ts` (500, `true/false`, px suffix), so it cannot catch any row in this table. Root `AGENTS.md`'s byte-parity contract is not mechanically enforced.

**Behavioral note (not a divergence):** the mobile in-app viewer URL (`?minimal=1&branding=0`, no `autoplay`) yields web default `autoplay=true` → auto-rotate is ON in the in-app preview, exactly as with the web generator's explicit `autoplay=true`. Both snippets auto-rotate by default.

## E2E spec audit

All specs run under every project (`playwright.config.ts:24-78`), including `chromium-authenticated` (storageState `e2e/.auth/user.json`), but every spec either guards on URL or hits a nonexistent tour id (`test-tour-id`). 54 vacuous/near-vacuous assertion sites across 6 specs; 7 more conditional tests silently skip when unauthenticated. `auth.spec.ts`, `landing.spec.ts`, `dashboard.spec.ts`, `auth.setup.ts` contain real assertions (selectors verified against `LoginPage.tsx:299,347-360,385,415,435`).

### public-viewer.spec.ts (19)

| File:line | Why vacuous | Meaningful assertion |
|---|---|---|
| 24-28, 34-40 | `expect(hasViewer \|\| body.isVisible()).toBe(true)` — body always visible; `/view/test-tour-id` shows "Tour Not Found" (`PublicTourPage.tsx:379-385`) | Fixture tour → `canvas` count === 1 |
| 46-61, 64-73, 77-90 | `if (await canvas.isVisible())` — canvas never exists; zero assertions execute | Drag/scroll/keypress then assert viewer still present, no error text |
| 100-106 | `expect(hotspotCount).toBeGreaterThanOrEqual(0)` — always true; selector `[data-testid="hotspot"], .hotspot, .hotspot-marker` matches nothing even on a real tour (PSV renders `.psv-marker`/`.psv-nav-marker`, `PanoramaViewer.tsx:549-564`) | Fixture tour with 2 hotspots → `[data-marker-id]` count === 2 |
| 112-122 | `tooltip.or(page.locator('body')).first()` — body always visible | Hover marker → tooltip with the hotspot label text |
| 127-139 | `if (count > 0)` guard never fires + body assertion | Click nav marker → scene counter/title changes |
| 144-157 | `popup.or(body)` — body always visible | Click info marker → dialog contains hotspot content |
| 166-174 | `if (count > 0)` guard never fires | Assert `aria-label="Enter fullscreen"` button exists |
| 178-188, 192-199 | `if (isVisible)` skip + body assertions | Click fullscreen → `document.fullscreenElement` set; Escape exits |
| 207-215, 219-223 | `if (canvas.isVisible())` skip + body | Touch tap → drag state; pinch → zoom (or assert no crash + controls) |
| 227-234 | `mobileControls.or(body)` | Assert scene-counter/thumb controls visible on 375px viewport |
| 238-251 | `if (viewerContainer.isVisible())` — on 404 no container → skip | Assert viewer container width ≤ 375 |
| 257-260 | embed page: body visible | Harness page listening for `ready` postMessage with sceneCount |
| 263-271 | `navbar.or(body)`; asserts nothing about navbar | `?navbar=false` → no thumbnail strip (`button[aria-label^="Open "]` count 0); default → present |
| 275-281 | body visible | `?autoplay=true` → rotation active / counter rendered |

### ai-features.spec.ts (13)

Every test wraps in `if (!page.url().includes('/login'))` (L22,36,52) or `if (!page.url().includes('/login') && !page.url().includes('/404'))` (L70,84,108,128,152,169,192,215,237,259) and ends in `X.or(page.locator('body')).first()).toBeVisible()` (L47,100,118,140,161,182,203,223,244,265,277) or `count >= 0` (L146). Unauthenticated → redirected to `/login` → whole body never runs; under `chromium-authenticated`, `/tours/test-tour-id/edit` never mounts the editor, so inner `if (count > 0)` guards skip too. Meaningful: fixture tour + authenticated state → open AI wizard → assert dialog title; click Analyze → assert `[data-testid="analysis-results"]` rows with room types.

### tour-create.spec.ts (6 vacuous + 4 conditional)

| File:line | Why vacuous | Meaningful assertion |
|---|---|---|
| 26-37 | `expect(isOnCreate \|\| isOnLogin).toBe(true)` — the URL is always one of the two | Assert the three chooser cards (Guided capture / Upload / AI) |
| 40-53 | `expect(hasFormElements \|\| page.url().includes('/login')).toBe(true)` — true whenever redirected | When authenticated, assert title input is present |
| 55-71 | conditional `expect(hasError)` — runs only if submit visible; selector `[role="alert"], .error, .text-red` over-broad | Assert the specific validation message for an empty title |
| 74-87, 89-104, 123-143 | conditional — skipped when redirected to login | Assert dropzone accepts image types; fill+assert title persists |
| 106-120 | `progressElements.or(body)` | Upload a fixture image → per-file progress appears |
| 145-159 | `expect(hasVisibilityOptions \|\| body.isVisible())` — tautology | Assert visibility select with draft/private defaults |
| 166-178 | `expect(isValidState).toBe(true)` — URL always matches one branch | Assert editor toolbar or an explicit 404 heading |
| 180-188 | `scenePanel.or(body)` | Assert scene panel exists with 0+ scene cards |

### tour-edit.spec.ts (10 vacuous + 2 near-vacuous + 3 conditional)

All gated by `if (!login && !/404)` (L14,23,39,59,80,98,115,132,152,172,186,202,220,232,243) — unauthenticated runs execute nothing; with the fixture-less `chromium-authenticated` run the page 404s/tour-not-found so counts are 0.

| File:line | Why vacuous | Meaningful assertion |
|---|---|---|
| 13-20 | `scenePanel.or(body)` | Scene panel with N cards from fixture |
| 22-36 | `expect(classList).not.toBeNull()` — an attached element always returns a class string | Assert `aria-current`/selected styling on the clicked card |
| 38-56 | `expect(firstSceneText).not.toBeNull()` — always true for an attached element | Read order before/after `dragTo`, assert it changed |
| 58-74 | `detailsVisible \|\| body.isVisible()` — tautology | Assert settings panel shows scene title |
| 79-95 | `hotspotCount >= 0` | Fixture scene with 2 hotspots → `[data-marker-id]` count 2 |
| 97-112 | `hotspotEditorModal.or('[role="dialog"]')` — any dialog passes | Assert modal title "Edit hotspot" |
| 114-129 | body visible after Add Hotspot click | Assert placement mode entered / modal opened |
| 131-149 | conditional fill — runs only when a hotspot exists | Fill title → save → toast + invalidated scenes |
| 151-166 | `typeSelector.or(modal).or(body)` — tautology | Assert 6 type options in the modal |
| 171-183 | `floorPlanVisible \|\| body` — tautology | Fixture with floor plans → overlay visible |
| 185-199, 242-260 | body / `dialog.or(success).or(body)` | Assert upload dialog opens; publish → confirmation + status badge |
| 201-215 | `markerCount >= 0` | Fixture plan with markers → marker count > 0 |
| 219-229, 231-240 | conditional visibility of Save/Publish | Assert Save disabled without changes, enabled after edit |

### tours.spec.ts (3)

| File:line | Why vacuous | Meaningful assertion |
|---|---|---|
| 29-35 | `/tours/test-tour-id/view` is an **unregistered route** (no `/tours/:id/view` in `router.tsx:129-331`; falls to `*` NotFoundPage `router.tsx:331-332`) → body assertion | Use `/view/<fixture-id>` or assert the 404 page content |
| 39-43, 45-50 | embed page body assertions | Harness-page `ready` message; `?navbar=false` hides strip |

### performance.spec.ts (1)

| File:line | Why vacuous | Meaningful assertion |
|---|---|---|
| 80-93 | `expect(lazyLoadedCount).toBeGreaterThanOrEqual(0)` — always true | With known landing images, assert ≥1 `loading="lazy"` |

### What real embed/share/public-viewer coverage would require

1. **A resolvable tour**: seed the backend with a published tour (scenes, hotspots, settings) or intercept `**/api/v1/public/tours/**` via `page.route()` with a fixture JSON (2+ scenes, one nav hotspot, one info hotspot, floor plans). The Vite proxy forwards `/api/*` to `:3600` (`web/CLAUDE.md` Gotchas), so interception is straightforward.
2. **Real tour ids**: replace `test-tour-id` everywhere with the fixture id.
3. **Embed postMessage verification**: a harness page (route or `public/` asset) with `<iframe src="/embed/<id>">` + a parent `message` listener capturing `ready` / `sceneChange` / `hotspotClick` / `error`; top-level embeds post to in-page listeners (`EmbedTourPage.tsx:117-130`), which a `page.evaluate` listener can assert.
4. **Authenticated flows**: use the existing `chromium-authenticated` project (`playwright.config.ts:70-77`) with a real session or route-mocked auth; replace the login-guard skips with hard assertions.
5. **Assertions against real DOM**: PSV canvas, `[data-marker-id]`/`.psv-marker`, `button[aria-label^="Open "]` (navbar), `aria-label="Enter fullscreen"`, "Tour Not Found" vs error states, share-modal tabs, embed-param behavior (`?navbar=false`, `?minimal=true&autohide=true`).
6. **Editor/analytics data**: mocked or seeded `/tours/:id`, `/tours/:id/scenes`, `/tours/:id/analytics` so editor and analytics specs exercise real UI instead of 404.

## Ranked errors found

Ranked by user impact × likelihood; all confirmed by static trace (device/backend items marked accordingly). Items 1-11 include the known gaps; 12-14 are new.

| Rank | Severity | Error | Evidence (file:line) | Impact |
|---|---|---|---|---|
| 1 | High | **Cold-start deep links dropped** — only `AppLinks().uriLinkStream` subscribed; no `getInitialUri` | `main.dart:93-97` | A share link that launches the app never arrives; user lands on the asset list and the tour is never opened. |
| 2 | High | **3D job state not persisted + `AssetStatus.processing3d` never set** — `_jobId/_progress/_done` are widget-local; grep shows `processing3d` only read (`asset_detail_screen.dart:144`, `asset_list_screen.dart:242`, `viewer_screen.dart:174`) | `generate_3d_screen.dart:63-76` | Kill the app mid-generation → job id lost → reopening starts a **second** backend job; "Building 3D…" badge never shows; detail screen can't resume. |
| 3 | High | **Cloud re-stitch silently skipped** — `if (urls.length >= 2)` skips with <2 frames; missing frame files advance without error; asset still marked `ready` | `upload_queue.dart:253`, `234-238`, `255-257` | Naive-composite panorama permanently shipped as final quality; user never told the OpenCV re-stitch did not happen. |
| 4 | High | **Room pipeline failures invisible** — `_stitchRoomAndUpload` swallows errors; `_advanceRoom` calls `_failWithBackoff` with no `onGiveUp`; `Room` has no status field | `capture_controller.dart:381-383`; `upload_queue.dart:336-337`, `279-339`; `models.dart:206-225` | Failed rooms show "Uploading…" forever with no retry path; breaks room-list AC1 for the failure case. |
| 5 | Medium-High | **Hotspot editor is write-only** — no list/edit/delete of existing hotspots; `BackendApi.deleteHotspot` (`backend_api.dart:88`) never called; `Room.hotspots`/`Hotspot.remoteId` never populated or read | `hotspot_editor_screen.dart` (whole); `models.dart:212,223` | A misplaced hotspot cannot be fixed from the app; reloading the embed is the only "read" path. |
| 6 | Medium | **`/view` and `/view3d` deep links both land on the plain asset detail screen** — no viewer/3D routing | `main.dart:111-115` | Viewer deep links never open the viewer or the 3D mode. |
| 7 | Medium | **Viewer error surface fires on subframe errors** — `e.isForMainFrame ?? true` treats unknown/subframe failures as main-frame | `viewer_screen.dart:44` | A failed subframe (thumbnail/image) shows "Could not load the tour." over a working WebView. |
| 8 | Medium | **Raw errors surfaced to users** — `'Analytics unavailable\n$e'`; floor-plan `Text('$e')`; hotspot-create snackbar `Text('$e')` | `analytics_screen.dart:37`; `floor_plan_screen.dart:63`; `hotspot_editor_screen.dart:90` | Dio/transport internals leak into UI copy. |
| 9 | Medium | **Non-owner / unmatched deep links silently ignored** | `main.dart:105-116` | No fallback (e.g., open the web viewer); confusing for links to tours not on this device. |
| 10 | Low | **Stitch-failure dead end** — "Retry upload" only re-enqueues the upload, which fails at "panorama file missing"; no re-stitch path | `capture_controller.dart:355-357`; `asset_detail_screen.dart:149-163`; `upload_queue.dart:172` | A failed stitch is unrecoverable from the UI. |
| 11 | Low | **Dead code** — `ShareLink.embedCode` (`models.dart:334-336`, a second iframe format `?embed=1` 800x450), `getLink` stub (`api_share_repository.dart:66`, interface `repositories.dart:34`, no call sites), `deleteHotspot` (`backend_api.dart:88`), `url_launcher` dependency (`pubspec.yaml:44`) | as cited | Two divergent iframe snippets exist; maintenance/confusion surface. |
| 12 | New | **`WebViewController` created inside `build()`** in the hotspot editor — side effect in build, while the sibling viewer screen explicitly documents "never from build" | `hotspot_editor_screen.dart:195` vs `viewer_screen.dart:58-62` | Controller rebuilt if `tourId` ever flips mid-session; violates the pattern the codebase itself prescribes. |
| 13 | New | **Silent no-op resolving `__main__` on a zero-scene tour** — returns without any user feedback | `hotspot_editor_screen.dart:164` | A tap does nothing with no explanation. |
| 14 | New | **In-app preview auto-rotates by default** — `?minimal=1&branding=0` omits `autoplay`, so web default `autoplay=true` applies (same as web's snippet — not a parity break) | `viewer_screen.dart:35`; `EmbedTourPage.tsx:80` | Behavioral note: the "minimal" preview starts rotating without user intent. |

### Regression guard

If this pass fixes anything, the minimum regression coverage is: `flutter test test/embed_code_test.dart` (parity pin, currently self-referential — extend it to assert the *effective* runtime semantics: `minimal=1`/`branding=0`/`autoplay=1` parse on the web side via `parseBooleanParam` equivalence), plus widget tests for `room_list_screen.dart` ("Uploading…"→"Uploaded" flip, delete confirm), `hotspot_editor_screen.dart` (destination sheet, no-op empty case), `analytics_screen.dart` (three cards, zero-view CTA), `generate_3d_screen.dart` (poll → completed persists `model3dUrl`), and `viewer_screen.dart` (URL selection, retry).

---

## Fixed by W3d

Dead-code inventory (E-15 + Embed/Share known gap #140) pass on `web/`: dead features wired up, dead code removed. No commits made.

### Wire-ups (dead → real)

| Feature | Approach | Evidence |
|---|---|---|
| Header search | Search input is now a real `<form>`; Enter submits and navigates to `/tours?search=<query>` (empty query → `/tours`). ToursPage seeds its search state from the `?search=` param and syncs when the param changes (ref-guarded so in-page typing is never clobbered) | `Header.tsx` (`handleSearchSubmit`); `ToursPage.tsx` (searchParams seed + sync effect) |
| Notifications bell | Replaces the disabled placeholder. `useUserNotifications` (WS `/ws/user`) feeds an in-session notification list shown in a DropdownMenu: unread badge on the bell, title/message/time per item, empty state ("No notifications yet"). Read-state is session-local only — the backend exposes no read endpoints, so there is deliberately **no** mark-read button | `Header.tsx` (notifications block) |
| Sidebar Help & Support / Feedback | Were permanently disabled buttons; now real `mailto:` links. No hosted help/FAQ URL exists in config or the landing footer, so both use `mailto:support@360ghar.com` with prefilled subjects (company domain verified from `RegisterPage.tsx` policy links to `https://360ghar.com`) | `Sidebar.tsx` (`bottomNavItems` + render) |
| CustomDomainSetup | Wired into `SettingsPage` as a new "Custom Domains" card: fetches published tours (`toursApi.getTours({status:'published'})`) for the loading/empty/populated states, and opens the `CustomDomainSetup` dialog (self-contained; calls `customDomainsApi` when no callbacks passed — no tour prop required) | `SettingsPage.tsx` (Custom Domains card) |
| VideoUploader | Wired into the video-hotspot **edit** form. NOTE: the video URL field lives in `HotspotEditorModal.tsx`, not `HotspotContentModal.tsx` (that file is the viewer-side display modal, kept as-is). "Upload video" button opens `VideoUploader`; `onUploadComplete` fills the Video URL input. Manual URL entry remains | `HotspotEditorModal.tsx` (video block) |

### Removed dead code (grep-verified zero consumers at removal time)

- API: `toursApi.getScene/getHotspots/getHotspot/getPublicTourScenes/getFloorPlans/getFloorPlan/createFloorPlan/updateFloorPlan/updateFloorPlanMarkers/deleteFloorPlan`; `aiApi.analyzeScene/suggestTourHotspots/generateSceneDescription/getJobs/applySceneAnalysis/applyHotspotSuggestions`; `uploadApi.uploadFiles/getMediaFile`; `captureApi.listSessions/getStatus`; `authApi.register`; `usersApi.getProfile` (duplicate of `authApi.getCurrentUser`, which has the call sites — kept)
- Kept `captureApi.cancelSession` — **GuidedCapturePage.tsx:675 uses it** in the discard-session flow (coordination with W3c's page)
- Stores: `viewerStore.currentSceneId/setCurrentScene/reset`; `collaborationStore.setActivities/addActivity/setLoadingActivities/setCollaborators/setLoadingCollaborators/clearCollaboration`; `authStore.setTokens/setLoading/setError/register` + `resetAuthListener` export; `uiStore.setSidebarCollapsed`
- Hooks (files deleted): `useDisclosure`, `useClickOutside`, `useKeyPress` (+`useEscapeKey`); trimmed `useWindowSize/useIsTablet/useIsDesktop` from `useMediaQuery.ts` (kept `useMediaQuery` + `useIsMobile` — TourEditPage uses `useIsMobile`)
- Feature flags: `ENABLE_ANALYTICS`, `ENABLE_VR_MODE`, `ENABLE_AI_FEATURES` (config.ts, constants/index.ts, .env.example, CLAUDE.md env table)
- Storage keys: `STORAGE_KEYS.USER`, `TOUR_DRAFTS`, `VIEWER_PREFERENCES` (queryKeys.ts)

### Tests

- Updated: `viewerStore.test.ts`, `authStore.test.ts` (register/setTokens/setLoading/setError suites removed), `uiStore.test.ts` (setSidebarCollapsed removed)
- Added: `Header.test.tsx` (search submit navigates with `?search=`; notifications empty state + renders WS item with unread badge), `SettingsPage.test.tsx` (custom-domains section, empty state, dialog opens), `HotspotEditorModal.test.tsx` (Upload video button; mocked `VideoUploader` fills the URL field; manual input fallback)
- Validation: `npx tsc --noEmit`, `npx eslint` on changed files, `npx vitest run` — see run results at the time of writing (rerun after concurrent agent churn)

### Coordination notes

- Touched `ToursPage.tsx` (additive param seeding) and `HotspotEditorModal.tsx` (video upload button) — both were unmodified by other agents when edited; the changes are additive and do not conflict with W3c/W3a work. `GuidedCapturePage.tsx` was **not** modified.
- `HotspotEditorModal` renders `DialogContent` without a `Dialog` root in `TourEditPage` (TourEditPage.tsx:1259) — Radix throws without the context; pre-existing, outside W3d's file ownership, flagged for the editor owner.
- Follow-up: `docs/technical/accessibility.md` still cites removed hooks (`useKeyPress`, `useEscapeKey`, `useClickOutside`) — docs/ tree owned by the parent agent.
## Fixed by W3a

Tour-editor cluster fix pass on `web/` (E-1, E-2, E-6, E-9, E-10 + store de-slop). No commits made.

| Error | One-line summary | Key files |
|---|---|---|
| E-1 (CRITICAL — editor stale store) | Added `mergeScenes` store action + a TourEditPage effect watching the `[SCENES, tourId]` query; every scene/hotspot mutation that invalidates the query (create/update/delete hotspot, scene add/delete/reorder, drag, AI applies) now lands in `currentTour.scenes` without a reload — viewer markers, ScenePanel, HotspotPanel, and the scene-delete recovery effect all re-render (fresh scenes/hotspots array references) | `stores/tourEditorStore.ts` (`mergeScenes`), `pages/tours/TourEditPage.tsx` (sync effect) |
| E-2 (publish/unpublish toolbar staleness) | Publish/Unpublish `onSuccess` now patches the store's status (`updateTourDraft` + `markAsSaved`, guarded on `!hasUnsavedChanges`) so the badge and Publish/Unpublish button flip immediately; unpublish also gained the missing error toast | `pages/tours/TourEditPage.tsx` (publishMutation/unpublishMutation) |
| E-6 (partial AI-apply failure skips refresh) | All three AI apply handlers switched to `Promise.allSettled`; the scenes query is always invalidated (successful parts persist in the UI) and partial failures surface as a warning toast with per-count details | `pages/tours/TourEditPage.tsx` (handleApplySceneAnalysis/Descriptions/HotspotSuggestions) |
| E-9 (Save disabled without visible reason) | The hotspot validation error now renders persistently above the footer (any active tab, `role="alert"`) instead of only inside the Content tab | `components/features/HotspotEditorModal.tsx` |
| E-10 (Settings Cancel doesn't discard) | Sync effect now resets the form whenever the dialog opens; deps are the persisted field values + `open` (not the `tour` object, whose identity changes on every scenes merge) | `components/features/TourSettingsPanel.tsx` |
| E-15 adjacent (dead code) | Removed from `tourEditorStore.ts`: deprecated draft mutators (add/update/removeSceneDraft, reorderScenes, add/update/removeHotspotDraft), `discardChanges`, and the undo/redo engine (undo/redo/canUndo/canRedo, `past`/`future`, `HISTORY_LIMIT`); removed Ctrl+Z/Ctrl+Y undo/redo keyboard shortcuts from TourEditPage | `stores/tourEditorStore.ts`, `pages/tours/TourEditPage.tsx` |
| Extra — hotspot selection | HotspotEditorModal selects the created/edited hotspot (`selectHotspot`) on save success so the user sees context in the viewer and HotspotPanel | `components/features/HotspotEditorModal.tsx` |
| Extra — saving state | Settings/branding/floor-plan saves now set an `isSavingSettings` state surfaced via the panels' `isLoading` prop | `pages/tours/TourEditPage.tsx`, panels |

### Tests

- Updated `src/test/stores/tourEditorStore.test.ts` (23 tests): removed dead-action/undo-redo suites, added `mergeScenes` suite (new array reference, preserves other fields, preserves draft/unsaved state, no-op without a tour, keeps selection).
- Added `src/test/components/TourSettingsPanel.test.tsx` (1 test): Cancel discards edits — edit → cancel → reopen shows persisted values.
- Added `src/test/components/HotspotEditorModal.test.tsx` (2 tests): mutation-sync contract — after a successful create/update the store's scenes contain the new/updated hotspot and it is selected (mocked `toursApi` + a `ScenesSync` harness mirroring TourEditPage's merge effect).

### Validation (all green)

- `npx vitest run src/test/stores/tourEditorStore.test.ts src/test/components/TourSettingsPanel.test.tsx src/test/components/HotspotEditorModal.test.tsx` → 26/26 pass; full `npx vitest run` → 36 files / 367 tests pass
- `npx tsc --noEmit` → clean
- `npx eslint` on TourEditPage, tourEditorStore, TourSettingsPanel, ScenePanel, HotspotPanel, HotspotEditorModal → clean

### Coordination notes

- `HotspotEditorModal.tsx` was concurrently modified by W3d (VideoUploader in the video type block) — my edits (mutation onSuccess selection, persistent validation error, store import) were applied around it and preserve it; both changes are additive.
- `docs/FEATURES_AND_USER_FLOWS.md` known-gap lines for the editor-stale-store and settings-Cancel were annotated **FIXED**, and the "undo/redo operate on the store's capped undo stack" expected-behavior line was updated (engine removed).

## Fixed by W3g

**Cross-app embed parity + CI** — closed all 7 rows of the "Embed parity divergence table" above and replaced the self-referential mobile test with a shared golden fixture.

- **Canonical contract (new):** `docs/embed-parity-golden.html` (repo root) pins the exact default iframe snippet. Placeholders: `__VIEWER_BASE__` (web resolves the embedding page origin; mobile uses `Env.viewerBase`) and `__TOUR_ID__`. Default height `500` → `height="500px"`; booleans lowercase `true|false`; full param surface `scene, autoplay, navbar, minimal, autohide, fullscreen, vr, rotate, branding` (web's documented order/format in `web/docs/features/player-embed.md`); iframe attribute template unchanged (already byte-identical).
- **Mobile** `mobile/app/lib/features/share/domain/embed_code.dart`: full param surface with nullable args on `generateEmbedUrl` (null → omitted, mirrors web's raw generator) and web's DEFAULT_OPTIONS on `generateEmbedCode` (all 8 params emitted by default); height now `500px`; removed `_escapeHtmlAttr` (web emits the raw URL; tour ids are server-minted UUIDs) — resolves rows 1, 2, 3, 5, 6, 7.
- **Tests:** `mobile/app/test/embed_code_test.dart` reads `../../docs/embed-parity-golden.html` (relative to package root `mobile/app`) and asserts byte equality; `web/src/test/utils/embedCode.test.ts` reads `../docs/embed-parity-golden.html` via `process.cwd()` (web/) — `new URL(..., import.meta.url)` is rewritten by Vite to a dev-server URL under jsdom and `?raw` imports outside the project root are denied, so a CWD-based fs read is the CI-robust option. Both suites pass; each fails loudly if the other side drifts.
- **CI:** `ci.yml` e2e-smoke now runs on every web-touching PR (was manual-dispatch-only) with dummy `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` baked into the build — `supabaseAuth.ts` throws at import when unset, which blanked every page and made the smoke fail even without a backend. Verified locally: all 13 auth+landing chromium specs pass with no backend. `harness.yml` gained a golden-presence step; both workflows trigger on `docs/embed-parity-golden.html` and carry comments documenting the enforcement.
- **Root `AGENTS.md`** contract sentence now names the golden fixture and both asserting suites; `web/docs/features/player-embed.md` notes the canonical `true|false` emission and the fixture.
- **Validation:** `vitest run src/test/utils/embedCode.test.ts` 45/45 pass; `tsc --noEmit` clean; `flutter test test/embed_code_test.dart` 6/6 pass; `flutter analyze` reports only pre-existing issues in `main.dart:109` (cold-start deep links) and `upload_queue.dart` (unused import/field) — none in changed files; mobile harness scripts pass. Full web suite still has pre-existing failures in `ForgotPasswordPage/PublicTourPage/RegisterPage/Header/EmbedTourPage` tests (present with this change stashed — parent's WIP, unrelated).
## Fixed by W3e

**Mobile core-reliability cluster** — closed focus-path verdicts (a)-(h) of the "Mobile: Auth, Assets, Capture, Stitch, Queue, Settings" section. All fixes live in files owned by W3e (models, upload queue, api client, local store, capture controller, asset detail screen); `main.dart`/`asset_providers.dart`/room list/generate-3d are untouched (coordination notes at the bottom).

- **(a) Failed-stitch dead end — FIXED.** New `retryStitch()` (`capture_controller.dart:41-86`) re-runs the stitch ladder for a failed asset with frames but no panorama, then enqueues the upload; returns `null` or a user-facing `"Stitching failed: <reason> — try re-capturing"`. The detail screen's Retry button routes there (`asset_detail_screen.dart:_retryUpload`, label "Retry stitching & upload") and shows the message via snackbar. The queue's presign step now throws a readable `StateError` ("The panorama file is missing from this device (stitching did not complete). Delete this scan and re-capture it.") that surfaces through `lastError` (`upload_queue.dart` presign case; same for rooms).
- **(b) Expired Cloudinary presign on crash-restart — FIXED.** Presigns persist `presignedAt` (epoch-ms) (`upload_queue.dart` presign cases); `_presignStale()` (`upload_queue.dart:468-476`) treats absent/>55-min signatures as stale; `_advance` and `_advanceRoom` re-issue the signature before continuing at `putCloudinary`/`confirm` on every resume — not only enqueue/retry. `_resumeStep` now also clears `presignedAt`.
- **(c) Queue failures invisible — FIXED.** `UploadQueue.watchJob(assetId)` exposes a live per-asset job stream backed by LocalStore's watcher (`upload_queue.dart:76-82`). Backoff persists `nextRetryAt` so the detail screen renders "Upload paused — retrying in N s" with the last error (live countdown ticker), and terminal failures show the actual error text (truncated to 220 chars) (`asset_detail_screen.dart:_QueueStatus`). No `asset_providers.dart` change needed.
- **(d) Auth expiry during upload — FIXED.** `api_client.dart` exposes `authExpiredStream` (fires once per expiry episode when the single-flight 401 refresh fails, reset on the next authed success). The queue holds affected jobs in a new `waiting-auth` state instead of burning attempts (`_failWithBackoff` auth check, `upload_queue.dart:428-438`); `pump()`/`_drain` resumes `waiting-auth` jobs via `_resumeStep` on the next pump (app start, connectivity return, re-auth) and a still-expired session re-holds them. The detail screen shows a "Session expired — please sign in again" banner + Sign in (→ `/signin`), plus a per-asset auth-hold notice.
- **(e) Orphaned capture frames — FIXED (logic; call pending).** `sweepOrphanedCaptures({store, docsDir, maxAge})` (`capture_controller.dart:89-130`) deletes `Documents/captures/<ts>` dirs older than 24h (age from the epoch-ms dir name, mtime fallback) with no asset/room path reference. **W3f must call it once at startup in main.dart after `LocalStore` is constructed** (one additive line, e.g. `unawaited(sweepOrphanedCaptures(store: store));`) — main.dart was not modified by this pass (owned by W3f).
- **(f) LocalStore wrong-shape quarantine — FIXED.** `readAll` now validates shape per collection (top-level `List`; every entry a Map) and catches `FormatException` **and** `TypeError`, quarantining the file to `.corrupt-<ts>` and returning `[]` (`local_store.dart:_quarantineAndReset`). The assets stream and queue pump no longer die on valid-JSON-wrong-shape files; `watch` emits `[]` instead of hanging.
- **(g) Room failure invisibility — FIXED.** `Room.status` (`'uploading'|'ready'|'failed'`, null = not started) and `Room.lastError` added (`models.dart`). `_stitchRoomAndUpload` sets `uploading` before work, `ready` on stitch success, `failed` + reason on stitch failure (`capture_controller.dart`). `_advanceRoom` saves `status: 'ready'` on scene creation and its `_failWithBackoff` gets an `onGiveUp` that marks the room `failed` with the error (`upload_queue.dart` room catch). **W3f:** `room_list_screen.dart:96-118` should render `room.status == 'failed'` (with `lastError`) instead of "Uploading…" for any room without `remoteSceneId`.
- **(h) Cloud re-stitch silently skipped — FIXED.** `uploadFrames` counts missing local frames into `missingFrames`; `requestStitch` now: ≥2 URLs → cloud stitch + `ready`; <2 URLs with missing frames → asset `failed` with `"Only <n> of M frames uploaded — please re-capture"` in the job's `lastError`; <2 URLs with nothing lost → `ready` + logged skip reason (`upload_queue.dart`). Bonus: `enqueue` seeds `presign`+`tourId` when `asset.remoteTourId != null` so a re-enqueue never re-creates an existing tour.
- **DE-SLOP:** removed dead `ShareLink.embedCode` and unused `AssetType.lidar` from `models.dart`. `AssetStatus.processing3d` is still read-but-never-set — **W3f contract:** `generate_3d_screen.dart` should `saveAsset(fresh.copyWith(status: AssetStatus.processing3d))` while the job is `processing`, then `ready`/`failed` on completion (tracked TD-018).

**Tests added** (all in the three owned test files):
- `capture_controller_test.dart`: retryStitch success (re-stitch → enqueue → ready), retryStitch failure message + asset stays failed, retryStitch with no frames, sweepOrphanedCaptures (old+unreferenced swept, fresh kept, referenced kept).
- `upload_queue_test.dart`: stale-presign resume re-issues the signature, fresh-presign resume doesn't, enqueue-with-tour never re-creates a tour, auth-expired hold (waiting-auth, 0 attempts) + resume, missing-panorama readable failure, <2-frames-with-missing → failed + message, <2-frames-without-loss → ready + logged reason, room terminal failure marks the room failed (8 attempts), room success sets `ready`, `watchJob` emits job updates.
- `local_store_test.dart`: wrong-shape top-level object quarantined, list-with-non-objects quarantined, both collections recover after quarantine, `watch` survives wrong-shape JSON.

**Validation:** `flutter analyze` → no issues; `flutter test` → all W3e-owned tests pass (the 3 owned files: 32/32). Full-suite runs show 10-11 failures, all in **W3f's new in-flight files**, unrelated to this pass: `test/deep_links_test.dart` (8: test data uses custom scheme `360tours://` which starts with a digit and is rejected by `Uri.parse` — invalid per RFC 3986) and `test/hotspot_editor_test.dart` (2: `resolveMainSceneId` type error in `hotspot_editor_screen.dart:69` and a destination-filter/test mismatch) — W3f to fix. `./scripts/check_docs_harness.sh` and `dart run scripts/check_architecture.dart` pass (soft line-count warnings only on 5 files incl. 3 owned).

**Coordination notes for W3f:** (1) call `sweepOrphanedCaptures(store: store)` from main.dart startup; (2) render `Room.status`/`lastError` in room_list_screen; (3) set `AssetStatus.processing3d` in generate_3d_screen; (4) fix deep_links_test custom scheme + hotspot_editor failures (their files, not touched here); (5) `asset_providers.dart` untouched — all new state lives in `asset_detail_screen.dart`/`upload_queue.dart`; (6) `docs/FEATURES_AND_USER_FLOWS.md` not edited by this pass (outside ownership) — the room-list AC1 "eventually shows Uploaded" and detail-retry criteria now hold on the model/queue side and need doc sync once W3f wires the room-list rendering.
## Fixed by orchestrator (Phase-4 e2e validation)

**Web auth cold-load race — users with valid sessions dumped on /login (NEW: found during hermetic e2e bring-up).**

Symptom: with a stored Supabase session, direct navigation to a protected route (`/tours/:id/edit`, `/tours/create`) landed on `/login` even though `GET /api/v1/users/me` succeeded (200×3) and the store flipped `isAuthenticated: true` ~100 ms after the redirect. Root cause was three compounding defects:

1. **Store booted with `isLoading: false`** (`authStore.ts`). The first render therefore mounted the RouterProvider and `ProtectedRoute` rendered `<Navigate to="/login" replace>` before `AuthInitializer`'s effect ran `checkAuth()`. The router then sat on `/login` while auth completed; nothing redirects an authenticated user away from the login page.
2. **`mapEvent` collapsed `INITIAL_SESSION` into `SIGNED_IN`** (`supabaseAuth.ts`) — and auth-js 2.95 additionally emits a raw `SIGNED_IN` from `_recoverAndRefresh` at boot. Every cold load with a stored session therefore triggered the listener's "hydrate user" branch (a third `/users/me` call) — harmless per se, but wrong event semantics.
3. **`checkAuth` read tokens before the async boot restore settled** — `cachedSession` is populated asynchronously by `supabase.auth.getSession()` at module import; `getTokens()` could return null during the window, silently signing a valid-session user out (this race flips run to run; it was the original reason the hermetic specs flaked between "3× /users/me fired" and "0 requests fired").

Fixes:
- `supabaseAuth.ts`: exported `sessionReady: Promise<void>` (the boot-time `getSession()` restore, now with the module-level `void supabase.auth.getSession().then(...)` refactored into it); `checkAuth` awaits it before reading tokens.
- `authStore.ts`: initial `isLoading: true` (boot starts in the "checking" state, so `AuthInitializer` gates the router on the spinner and `ProtectedRoute` only redirects after `checkAuth` conclusively settles).
- `supabaseAuth.ts`: `mapEvent` now maps `INITIAL_SESSION` → `'INITIAL_SESSION'` (added to `SupabaseAuthEvent`); the listener's token-hydration runs for any session-bearing event, but the user-fetch only on genuine `SIGNED_IN`.
- Tests: `authStore.test.ts` initial-state assertion updated (`isLoading: true`, asserted against `getInitialState()` since the shared beforeEach resets to an idle state); e2e `tour-edit.spec.ts` scene-selection expectation updated (first scene is auto-selected on load — the W3a select-after-save behavior); e2e `ai-features.spec.ts` locators switched to exact/substring-safe matching (`'Tour Generation'` collided with the `'AI Tour Generation'` dialog heading; `/Processing/` collided with the `Cancel Processing` button).

Validation: full chromium e2e suite **61/61 pass** (was 52 pass / 9 fail at the previous cutoff — all 9 hermetic mocked-auth specs now green); vitest **396/396**; `tsc --noEmit` clean; `eslint` clean. The debug-spec scaffolding used to isolate the race was removed.
