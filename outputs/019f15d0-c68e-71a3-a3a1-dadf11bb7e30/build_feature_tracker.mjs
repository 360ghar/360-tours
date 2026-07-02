import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputDir = new URL('.', import.meta.url).pathname;
const outputPath = `${outputDir}feature_story_tracker.xlsx`;

const statusOptions = [
  'Code inferred',
  'Tested - pass',
  'Tested - issues found',
  'Fixed - needs retest',
  'Retested - pass',
  'Blocked',
  'Backlog / unlinked',
];

const testStatusOptions = [
  'Pending',
  'Manual pass',
  'Automated pass',
  'Failing',
  'Blocked',
  'Needs coverage',
];

const fixStatusOptions = [
  'Not started',
  'Not needed',
  'In progress',
  'Fixed',
  'Retested',
  'Deferred',
];

const stories = [
  ['APP-001', 'App Shell', 'Boot, auth init, theme init', 'As a returning user, I want the app to restore my session and theme before showing protected content.', 'On launch, the app checks Supabase tokens, loads the current user when possible, preserves valid sessions during transient backend errors, applies light/dark/system theme, and shows a loading state while auth initializes.', 'src/App.tsx; src/stores/authStore.ts; src/stores/uiStore.ts', 'All routes', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['APP-002', 'App Shell', 'Protected routing', 'As an unauthenticated visitor, I want protected pages to redirect me to login while preserving my intended destination.', 'Protected routes only render after authentication; unauthenticated access redirects to login with route state; authenticated visits to root redirect to dashboard.', 'src/lib/router.tsx; src/components/features/ProtectedRoute.tsx', 'Protected routes', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['APP-003', 'App Shell', 'Global errors and recovery', 'As a user, I want clear recovery paths when the app or network fails.', 'The root mounts an error boundary, global error handler, offline indicator, toast stack, and styled confirmation dialog.', 'src/App.tsx; src/components/features/ErrorBoundary.tsx; src/components/common/GlobalErrorHandler.tsx; src/components/common/OfflineIndicator.tsx; src/components/ui/ConfirmDialog.tsx', 'All routes', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['APP-004', 'App Shell', 'Dashboard layout and navigation', 'As a signed-in user, I want stable navigation across core work areas.', 'Dashboard layout exposes sidebar/header navigation for Dashboard, Tours, Media, Analytics, Profile, and Settings, with responsive sidebar behavior.', 'src/components/layout/DashboardLayout.tsx; src/components/layout/Sidebar.tsx; src/components/layout/Header.tsx; src/constants/routes.ts', 'Protected layout', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['APP-005', 'App Shell', 'Toasts and confirmations', 'As a user, I want non-blocking feedback and consistent confirmations for risky actions.', 'Toast helpers show success/error/warning/info messages with auto-dismiss; confirmation store resolves styled destructive or normal confirmations.', 'src/hooks/useToast.ts; src/components/ui/Toaster.tsx; src/stores/confirmStore.ts; src/components/ui/ConfirmDialog.tsx', 'All routes', 'Code inferred', 'High', 'P1', 'Pending', 'DEF-001, DEF-002', 'Not started', '', 'Two upload flows still use native window.confirm.'],

  ['LAND-001', 'Landing', 'Public marketing home', 'As a visitor, I want to understand the product and start authentication quickly.', 'The home page renders SEO tags, hero, proof, AI showcase, process, features, pricing, and CTA sections inside the public layout.', 'src/pages/HomePage.tsx; src/components/landing/*', '/', 'Code inferred', 'Medium', 'P2', 'Pending', '', 'Not started', '', ''],
  ['LAND-002', 'Landing', 'Landing navigation for authenticated users', 'As a returning user, I want root access to take me to my workspace.', 'The root redirect sends authenticated users to dashboard and unauthenticated users to the landing page.', 'src/lib/router.tsx; src/pages/HomePage.tsx', '/', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],

  ['AUTH-001', 'Authentication', 'Login identifier channel selection', 'As a user, I want to sign in with either phone or email.', 'Login supports phone and email tabs, restores the last successful method, validates identifier input, and branches through identifier status.', 'src/pages/auth/LoginPage.tsx; src/api/auth.ts; src/lib/lastAuthMethod.ts', '/login', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['AUTH-002', 'Authentication', 'Login by existing password', 'As a verified user with a password, I want to sign in after entering my password.', 'Identifier status routes verified password-capable accounts to password entry; password visibility can be toggled; successful sign-in loads the user and redirects to the requested route or dashboard.', 'src/pages/auth/LoginPage.tsx; src/stores/authStore.ts; src/lib/supabaseAuth.ts', '/login', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['AUTH-003', 'Authentication', 'Login by OTP', 'As a user without a password or with an OTP flow, I want to sign in using a verification code.', 'The login flow requests OTP, focuses OTP entry, supports resend cooldown, uses WebOTP for phone where available, verifies the code, and records the auth method.', 'src/pages/auth/LoginPage.tsx; src/hooks/useResendTimer.ts; src/hooks/useWebOtp.ts; src/stores/authStore.ts', '/login', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['AUTH-004', 'Authentication', 'Mandatory password setup after OTP', 'As a newly verified user, I want to set a password before entering the app.', 'OTP-authenticated users who need setup must enter and confirm a valid password; mismatches and schema failures block completion.', 'src/pages/auth/LoginPage.tsx; src/pages/auth/RegisterPage.tsx; src/stores/authStore.ts; src/utils/validation.ts', '/login; /register', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['AUTH-005', 'Authentication', 'Registration with terms acceptance', 'As a new user, I want to create an account after providing identity details and accepting terms.', 'Registration requires full name, phone or email, and terms acceptance before OTP; Google sign-in is offered as an alternate path.', 'src/pages/auth/RegisterPage.tsx; src/components/features/GoogleSignInButton.tsx', '/register', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['AUTH-006', 'Authentication', 'Forgot password reset', 'As a user who forgot my password, I want to verify by OTP and set a new password.', 'Forgot password supports phone/email, prefilled route state, OTP request and resend, OTP verification, password validation, and a success screen linking back to login.', 'src/pages/auth/ForgotPasswordPage.tsx; src/api/auth.ts; src/utils/validation.ts', '/forgot-password', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['AUTH-007', 'Authentication', 'OAuth callback and staff gate', 'As a Google-authenticated user, I want callback handling that only permits authorized staff roles.', 'The callback exchanges the code, validates a safe next URL, loads the user, permits agent/admin roles, signs out disallowed roles, and surfaces not-staff errors.', 'src/pages/auth/AuthCallbackPage.tsx; src/stores/authStore.ts', '/auth/callback', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['AUTH-008', 'Authentication', 'Session expiry and retries', 'As a signed-in user, I want expired sessions handled clearly without losing valid sessions during outages.', 'The API client refreshes tokens once on 401, notifies auth expiry after refresh failure, retries 429 and server/network errors, and auth store preserves session on transient failures.', 'src/api/client.ts; src/stores/authStore.ts', 'All API calls', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],

  ['DASH-001', 'Dashboard', 'Dashboard overview metrics', 'As an operator, I want a quick view of business health.', 'Dashboard loads stats cards, recent tours, realtime daily views, and storage progress with loading, error, and retry states.', 'src/pages/dashboard/DashboardPage.tsx; src/api/tours.ts', '/dashboard', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['DASH-002', 'Dashboard', 'Recent tours launch points', 'As an operator, I want to reopen or inspect recent work quickly.', 'Recent tours list exposes tour details and actions; empty states guide users toward creating tours.', 'src/pages/dashboard/DashboardPage.tsx', '/dashboard', 'Code inferred', 'Medium', 'P2', 'Pending', '', 'Not started', '', ''],

  ['TOURS-001', 'Tours', 'Tour list search, filters, pagination', 'As a tour manager, I want to find tours by search, status, and page through results.', 'Tours page debounces search, filters by status, supports cursor-based next/previous paging, and resets pagination when filters change.', 'src/pages/tours/ToursPage.tsx; src/api/tours.ts', '/tours', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['TOURS-002', 'Tours', 'Grid and list tour browsing', 'As a tour manager, I want compact and visual list modes.', 'Tours can be shown as cards or rows, with loading skeletons, empty states, and status badges.', 'src/pages/tours/ToursPage.tsx', '/tours', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['TOURS-003', 'Tours', 'Tour lifecycle actions', 'As a tour manager, I want to duplicate, archive, unarchive, and delete tours safely.', 'Action menus call duplicate/archive/unarchive/delete APIs, invalidate tour queries, and use confirmations for destructive operations.', 'src/pages/tours/ToursPage.tsx; src/api/tours.ts', '/tours', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['TOURS-004', 'Tours', 'Published tour access', 'As a tour manager, I want a live link when a tour is published.', 'Published tours expose a public view link; draft tours do not offer the live view action.', 'src/pages/tours/ToursPage.tsx; src/pages/tours/TourViewPage.tsx', '/tours; /tours/:id', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['TOURS-005', 'Tours', 'Protected tour detail preview', 'As a tour manager, I want to preview a tour and inspect its settings before sharing.', 'Tour detail loads tour/scenes, shows a panorama preview, scene grid, metrics, settings, edit/share/analytics actions, and disables sharing while draft.', 'src/pages/tours/TourViewPage.tsx; src/components/features/PanoramaViewer.tsx', '/tours/:id', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],

  ['CREATE-001', 'Tour Creation', 'Create tour details', 'As a creator, I want to start a tour with title and optional description.', 'Create page validates required title, creates a draft tour, and supports returning to edit the info before uploading.', 'src/pages/tours/TourCreatePage.tsx; src/api/tours.ts', '/tours/create', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['CREATE-002', 'Tour Creation', 'Upload panorama images', 'As a creator, I want to add 360 images and see upload progress.', 'Selected or dropped images are validated, displayed with removal controls, uploaded with per-file and total progress, and converted into scenes.', 'src/pages/tours/TourCreatePage.tsx; src/api/upload.ts; src/utils/validation.ts', '/tours/create', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['CREATE-003', 'Tour Creation', 'AI tour generation wizard', 'As a creator, I want AI to generate a tour from panoramas.', 'Wizard accepts up to 50 images under 50 MB each, combines rejection errors, collects optional details and AI options, uploads files, tracks the job, reviews generated scenes, and completes into the editor.', 'src/components/features/ai/AITourWizard.tsx; src/api/ai.ts', '/tours/create', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['CREATE-004', 'Tour Creation', 'Skip upload and edit later', 'As a creator, I want to create a draft before assets are ready.', 'After creating tour details, users can skip uploads and continue to the editor with an empty tour.', 'src/pages/tours/TourCreatePage.tsx', '/tours/create', 'Code inferred', 'Medium', 'P2', 'Pending', '', 'Not started', '', ''],

  ['EDIT-001', 'Tour Editor', 'Editor load and scene selection', 'As an editor, I want the current tour, scenes, and selected scene to load reliably.', 'Editor fetches tour/scenes, initializes store state, recovers stale selections, and renders empty prompts when there are no scenes.', 'src/pages/tours/TourEditPage.tsx; src/stores/tourEditorStore.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['EDIT-002', 'Tour Editor', 'Unsaved change protection', 'As an editor, I want warnings before losing unsaved edits.', 'Pending settings or draft changes trigger route blocking, beforeunload protection, and an unsaved changes dialog.', 'src/pages/tours/TourEditPage.tsx; src/stores/tourEditorStore.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['EDIT-003', 'Tour Editor', 'Save, undo, redo keyboard flow', 'As an editor, I want to save and undo quickly from the keyboard.', 'Ctrl/Cmd+S saves tour/settings changes; undo/redo maintain bounded history and clear history after save or discard.', 'src/pages/tours/TourEditPage.tsx; src/stores/tourEditorStore.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['EDIT-004', 'Tour Editor', 'Publish and unpublish', 'As an editor, I want to control public availability.', 'Publish and unpublish actions update tour status, invalidate queries, and adjust available sharing/open actions.', 'src/pages/tours/TourEditPage.tsx; src/api/tours.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['EDIT-005', 'Tour Editor', 'Preview, duplicate, delete', 'As an editor, I want safe tour-level actions from the editor.', 'Editor can open public preview, duplicate a tour and navigate to the new editor, or delete with confirmation.', 'src/pages/tours/TourEditPage.tsx', '/tours/:id/edit', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['EDIT-006', 'Tour Editor', 'Scene panel upload and create', 'As an editor, I want to upload more panoramas directly from the scene panel.', 'Scene panel accepts images, validates files, uploads them, creates scenes, selects new scenes, and displays upload state.', 'src/components/features/ScenePanel.tsx; src/api/upload.ts; src/api/tours.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['EDIT-007', 'Tour Editor', 'Scene reorder', 'As an editor, I want to reorder scenes by drag and drop.', 'Scene panel uses sortable drag and drop, persists scene order, and keeps current selection intact.', 'src/components/features/ScenePanel.tsx; src/api/tours.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['EDIT-008', 'Tour Editor', 'Scene delete', 'As an editor, I want to delete unwanted scenes safely.', 'Scene delete requires confirmation, calls the scenes API, updates current selection when needed, and invalidates tour data.', 'src/components/features/ScenePanel.tsx', '/tours/:id/edit', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['EDIT-009', 'Tour Editor', 'Panorama render and controls', 'As an editor/viewer, I want panoramas to load with interactive controls and graceful errors.', 'PanoramaViewer initializes Photo Sphere Viewer, handles ready/error/retry states, applies initial view/FOV, marker rendering, keyboard marker activation, auto-rotate, fullscreen, gyroscope, and VR/stereo fallbacks.', 'src/components/features/PanoramaViewer.tsx', 'Editor, public, embed, local', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['EDIT-010', 'Tour Editor', 'Hotspot placement mode', 'As an editor, I want to click the panorama to place hotspots accurately.', 'Pressing H or using the UI enters placement mode, shows overlay instructions, captures yaw/pitch on click, opens the hotspot editor, and exits with Esc or cancel.', 'src/pages/tours/TourEditPage.tsx; src/components/features/PanoramaViewer.tsx; src/components/features/HotspotEditorModal.tsx', '/tours/:id/edit', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['EDIT-011', 'Tour Editor', 'Hotspot editing by type', 'As an editor, I want each hotspot type to collect the right content.', 'Hotspot editor supports navigation, info, audio, video, link, and custom types with required fields, appearance controls, icon picker, manual yaw/pitch, and create/update API calls.', 'src/components/features/HotspotEditorModal.tsx; src/components/features/HotspotIconPicker.tsx', '/tours/:id/edit', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['EDIT-012', 'Tour Editor', 'Hotspot list and deletion', 'As an editor, I want to manage hotspots from a side panel.', 'Hotspot panel lists current-scene hotspots, selects them, opens quick edit, and deletes after confirmation.', 'src/components/features/HotspotPanel.tsx; src/api/tours.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['EDIT-013', 'Tour Editor', 'Hotspot drag reposition', 'As an editor, I want to adjust hotspot placement visually.', 'Viewer marker drag events update hotspot yaw/pitch through editor callbacks and persist through hotspot update behavior.', 'src/components/features/PanoramaViewer.tsx; src/pages/tours/TourEditPage.tsx', '/tours/:id/edit', 'Code inferred', 'Medium', 'P1', 'Pending', '', 'Not started', '', ''],
  ['EDIT-014', 'Tour Editor', 'Tour settings and embed configuration', 'As an editor, I want to configure visibility and viewer options.', 'Settings panel supports title, description, visibility, starting scene, auto-rotate speed, navbar, fullscreen, VR, gyroscope, share link, and generated iframe embed code.', 'src/components/features/TourSettingsPanel.tsx; src/utils/embedCode.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['EDIT-015', 'Tour Editor', 'Share modal', 'As an editor, I want to share a published tour through links, QR, embeds, and social channels.', 'Share modal provides copyable public link and iframe, QR PNG/SVG download, and social share buttons with copy feedback.', 'src/components/features/ShareModal.tsx; src/utils/qrCode.ts; src/utils/embedCode.ts', '/tours/:id/edit; /tours/:id', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['EDIT-016', 'Tour Editor', 'Branding panel', 'As an editor, I want the viewer to match my brand.', 'Branding panel edits colors, font, button style, watermark, logo upload/removal, desktop/mobile preview, reset defaults, and avoids persisting failed blob logo URLs.', 'src/components/features/BrandingPanel.tsx; src/api/upload.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['EDIT-017', 'Tour Editor', 'Floor plan editor', 'As an editor, I want floor plans with scene markers.', 'Floor plan editor adds, deletes, reorders, renames plans, uploads plan images, places/moves/removes scene markers by clicking image coordinates, and saves plan data.', 'src/components/features/FloorPlanEditor.tsx; src/api/tours.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P1', 'Pending', 'DEF-003', 'Not started', '', 'Upload failure can persist a blob URL.'],
  ['EDIT-018', 'Tour Editor', 'AI scene analysis', 'As an editor, I want AI to identify rooms and suggest scene metadata.', 'Scene analysis starts an AI job, tracks progress, displays room type/confidence/quality/features, selects results, and applies selected titles/descriptions.', 'src/components/features/ai/SceneAnalysis.tsx; src/components/features/ai/AIJobStatus.tsx; src/api/ai.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P1', 'Pending', 'DEF-004', 'Not started', '', 'Selection indicator is visually clickable but inert.'],
  ['EDIT-019', 'Tour Editor', 'AI descriptions', 'As an editor, I want AI-written scene descriptions that I can edit before applying.', 'Description generator accepts tone, length, and audience, tracks an AI job, supports retry, edit/reset/copy per scene, regenerate all, and apply.', 'src/components/features/ai/DescriptionGenerator.tsx; src/components/features/ai/AiRetryError.tsx; src/api/ai.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['EDIT-020', 'Tour Editor', 'AI hotspot suggestions', 'As an editor, I want AI to recommend navigation/info hotspots.', 'Hotspot suggestions analyze the current scene, preview approximate marker positions, select/deselect suggestions, show target scenes/confidence, and add selected hotspots.', 'src/components/features/ai/HotspotSuggestions.tsx; src/api/ai.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['EDIT-021', 'Tour Editor', 'AI reel generation', 'As an editor, I want to generate a vertical social video from selected scenes.', 'Reel modal orders and selects scenes, adjusts seconds per scene, starts an AI job, tracks progress, cancels, previews result, downloads, copies link, and retries after error.', 'src/components/features/ai/ReelGeneratorModal.tsx; src/components/features/VideoPlayer.tsx; src/api/ai.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P2', 'Pending', 'DEF-006', 'Not started', '', 'VideoPlayer progress can produce NaN before metadata loads.'],
  ['EDIT-022', 'Tour Editor', 'Activity feed', 'As a collaborator, I want to see what changed on a tour.', 'Activity feed filters by action, groups by local date, shows actor/action/target/time/details, supports refresh, and summarizes count/last activity.', 'src/components/features/ActivityFeed.tsx; src/stores/collaborationStore.ts; src/api/collaboration.ts', '/tours/:id/edit', 'Code inferred', 'Medium', 'P2', 'Pending', '', 'Not started', '', ''],
  ['EDIT-023', 'Tour Editor', 'Collaborator management', 'As an owner/editor, I want to invite and remove collaborators.', 'Collaborator popover fetches collaborators, displays avatars/roles, invites editor/viewer by email, prevents owner removal, and confirms removals.', 'src/pages/tours/TourEditPage.tsx; src/stores/collaborationStore.ts; src/api/collaboration.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['EDIT-024', 'Tour Editor', 'Bulk scene uploader', 'As an editor, I want to upload multiple panoramas with resilient progress and retry.', 'Bulk uploader validates files, previews accepted images, uploads with bounded concurrency, shows per-file status/progress, retries failed files, clears/removes items, and invalidates scenes after success.', 'src/components/features/BulkUploader.tsx; src/api/upload.ts', '/tours/:id/edit', 'Code inferred', 'High', 'P1', 'Pending', 'DEF-001', 'Not started', '', 'Close flow uses native confirm.'],
  ['EDIT-025', 'Tour Editor', 'Custom domain setup', 'As a business user, I want to connect a branded subdomain.', 'Custom domain modal validates domain input, shows DNS CNAME/TXT records, copies values, verifies/removes domain, and displays SSL state.', 'src/components/features/CustomDomainSetup.tsx', 'Unlinked component', 'Code inferred', 'Medium', 'P3', 'Pending', 'DEF-005', 'Not started', '', 'Component appears unlinked and rejects recommended subdomain format.'],
  ['EDIT-026', 'Tour Editor', 'Video upload for hotspot media', 'As an editor, I want to upload 360 video content for hotspots.', 'Video uploader validates size/format, extracts duration and thumbnail, uploads the video and best-effort thumbnail, reports status/retry/remove, and returns durable media URLs.', 'src/components/features/VideoUploader.tsx; src/api/upload.ts', 'Hotspot/media modal', 'Code inferred', 'Medium', 'P2', 'Pending', 'DEF-002', 'Not started', '', 'Cancel flow uses native confirm.'],

  ['VIEW-001', 'Public Viewer', 'Public tour loading and settings', 'As a public viewer, I want a published tour to open with the intended scene and controls.', 'Public viewer fetches tour/scenes without duplicate tracking, merges URL params with viewer settings, initializes requested/default scene, and handles loading/error/empty states.', 'src/pages/PublicTourPage.tsx; src/stores/viewerStore.ts; src/api/tours.ts', '/view/:id', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['VIEW-002', 'Public Viewer', 'Scene navigation', 'As a public viewer, I want to move between rooms easily.', 'Viewer supports thumbnails, scene counter, current scene badge, two-finger swipe, and keyboard previous/next shortcuts.', 'src/pages/PublicTourPage.tsx; src/hooks/useTwoFingerSwipe.ts; src/components/features/PanoramaViewer.tsx', '/view/:id', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['VIEW-003', 'Public Viewer', 'Viewer keyboard and overlays', 'As a public viewer, I want keyboard shortcuts for common viewer actions.', 'Keyboard shortcuts toggle fullscreen, mute, info, share, hints, and close overlays with Esc.', 'src/pages/PublicTourPage.tsx', '/view/:id', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['VIEW-004', 'Public Viewer', 'Hotspot content playback', 'As a public viewer, I want hotspot content to be useful and safe.', 'Hotspot modal renders info, audio, video, link, and custom content; custom HTML is sandboxed; link hotspots can open external URLs and close modal.', 'src/pages/PublicTourPage.tsx; src/components/features/HotspotContentModal.tsx; src/components/features/VideoPlayer.tsx', '/view/:id', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['VIEW-005', 'Public Viewer', 'Public share and like', 'As a public viewer, I want to share or like a tour.', 'Viewer exposes share modal, optimistic like/unlike with rollback and double-click guard, and share tracking.', 'src/pages/PublicTourPage.tsx; src/components/features/ShareModal.tsx; src/hooks/usePublicTourTracking.ts', '/view/:id', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['VIEW-006', 'Public Viewer', 'Floor plan overlay', 'As a public viewer, I want spatial context from floor plans.', 'Overlay can minimize/expand, chooses the floor containing the current scene, supports floor switching, marker tooltips, and scene navigation from markers.', 'src/components/features/FloorPlanOverlay.tsx; src/pages/PublicTourPage.tsx', '/view/:id', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['VIEW-007', 'Public Viewer', 'Public analytics tracking', 'As an owner, I want public visits and interactions tracked without breaking viewing.', 'Public tour tracking initializes a session, tracks scene changes, shares, hotspot clicks, and likes with best-effort API calls.', 'src/hooks/usePublicTourTracking.ts; src/utils/analytics.ts; src/api/tours.ts', '/view/:id', 'Code inferred', 'Medium', 'P2', 'Pending', '', 'Not started', '', ''],

  ['EMBED-001', 'Embed Viewer', 'Embeddable tour loading and controls', 'As a site owner, I want to embed a tour with configurable chrome.', 'Embed viewer supports URL params for starting scene, autoplay, navbar, branding, minimal mode, autohide, fullscreen, VR, and rotation.', 'src/pages/EmbedTourPage.tsx; src/utils/embedCode.ts', '/embed/:id', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['EMBED-002', 'Embed Viewer', 'Parent page messaging', 'As an integrating website, I want to control the embedded tour and receive events.', 'Embed posts ready, sceneChange, hotspotClick, fullscreenChange, and error messages, and accepts goToScene, nextScene, previousScene, and toggleFullscreen from the parent/same window.', 'src/pages/EmbedTourPage.tsx', '/embed/:id', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['EMBED-003', 'Embed Viewer', 'Minimal and autohide chrome', 'As a site owner, I want unobtrusive embedded controls.', 'Embed hides or minimizes chrome based on params, auto-hides controls after inactivity, and keeps arrows/counter available in minimal mode.', 'src/pages/EmbedTourPage.tsx', '/embed/:id', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],

  ['LOCAL-001', 'Local Harness', 'Local seed tour rendering', 'As a developer, I want to preview seeded tours without backend upload.', 'Local route loads seed_properties/:propertyId/tour.json, converts rooms/hotspots to app scenes, renders a local tour, and shows actionable errors when seed data is missing.', 'src/pages/LocalTourPage.tsx; vite.config.ts', '/local/:propertyId', 'Code inferred', 'Medium', 'P3', 'Pending', '', 'Not started', '', ''],
  ['LOCAL-002', 'Local Harness', 'Calibration mode', 'As a developer, I want to capture yaw/pitch coordinates for seeded hotspots.', 'Adding ?calibrate=1 enables click capture with on-screen yaw/pitch readout and console output while preserving navigation controls.', 'src/pages/LocalTourPage.tsx', '/local/:propertyId?calibrate=1', 'Code inferred', 'Medium', 'P3', 'Pending', '', 'Not started', '', ''],

  ['MEDIA-001', 'Media Library', 'Media search, type filter, pagination', 'As a media manager, I want to find uploaded files quickly.', 'Media library fetches cursor-paginated media, debounces search, filters by mime type, and clears selections when the page changes.', 'src/pages/media/MediaLibraryPage.tsx; src/api/upload.ts', '/media', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['MEDIA-002', 'Media Library', 'Grid/list preview and download', 'As a media manager, I want to inspect and download files.', 'Media can be browsed in grid or list mode; preview modal renders image/video/other file types and download links.', 'src/pages/media/MediaLibraryPage.tsx', '/media', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['MEDIA-003', 'Media Library', 'Bulk and single delete', 'As a media manager, I want to delete one or many media files safely.', 'Users can select individual/all visible files, bulk delete with confirmation, clear selection, or delete single items with confirmation and partial-failure handling.', 'src/pages/media/MediaLibraryPage.tsx; src/api/upload.ts', '/media', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],

  ['ANALYTICS-001', 'Analytics', 'Account analytics overview', 'As an owner, I want a portfolio-level analytics overview.', 'Analytics page loads overview stats, published tours, selected tour details, charts for daily views/device/countries/scenes, and loading/error/empty states.', 'src/pages/analytics/AnalyticsPage.tsx; src/api/tours.ts', '/analytics', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['ANALYTICS-002', 'Analytics', 'Published tour selector', 'As an owner, I want to switch analytics between published tours.', 'Analytics auto-selects the first published tour and updates selected tour charts/table when the selection changes.', 'src/pages/analytics/AnalyticsPage.tsx', '/analytics', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['ANALYTICS-003', 'Analytics', 'CSV export', 'As an owner, I want to export analytics for reporting.', 'Analytics export creates CSV from the selected dataset and gives success/error feedback.', 'src/pages/analytics/AnalyticsPage.tsx; src/pages/tours/TourAnalyticsPage.tsx', '/analytics; /tours/:id/analytics', 'Code inferred', 'High', 'P2', 'Pending', '', 'Not started', '', ''],
  ['ANALYTICS-004', 'Analytics', 'Per-tour analytics and date range', 'As an owner, I want detailed analytics for one tour over a selected date range.', 'Tour analytics loads tour/scenes/analytics for a date range, supports CSV/JSON export, and shows stats, daily views, device/country charts, scene performance, and hotspot engagement.', 'src/pages/tours/TourAnalyticsPage.tsx; src/components/ui/DateRangePicker.tsx', '/tours/:id/analytics', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['ANALYTICS-005', 'Analytics', 'Heatmap visualization', 'As an owner, I want to understand interaction points in each scene.', 'Tour analytics loads heatmap data, lets users choose a scene, and renders scatter activity plus metrics table with empty states.', 'src/pages/tours/TourAnalyticsPage.tsx; src/api/tours.ts', '/tours/:id/analytics', 'Code inferred', 'Medium', 'P2', 'Pending', '', 'Not started', '', ''],

  ['PROFILE-001', 'Profile', 'Profile editing', 'As a user, I want to update my name and phone while viewing account status.', 'Profile page edits full name and phone, keeps email read-only, shows role/status badges, disables save until dirty, and updates user data.', 'src/pages/profile/ProfilePage.tsx; src/api/users.ts', '/profile', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['PROFILE-002', 'Profile', 'Avatar upload', 'As a user, I want to upload a profile photo.', 'Avatar upload sends selected image to user API, shows loading overlay, updates preview, and handles errors.', 'src/pages/profile/ProfilePage.tsx; src/api/users.ts', '/profile', 'Code inferred', 'High', 'P2', 'Pending', '', 'Not started', '', ''],
  ['SETTINGS-001', 'Settings', 'Theme preference', 'As a user, I want to choose light, dark, or system theme.', 'Settings updates the persisted UI theme and applies it immediately, including system preference listeners.', 'src/pages/settings/SettingsPage.tsx; src/stores/uiStore.ts', '/settings', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['SETTINGS-002', 'Settings', 'Notification preferences', 'As a user, I want notification preferences to save automatically.', 'Notification toggles update local settings state and show autosave-style behavior.', 'src/pages/settings/SettingsPage.tsx', '/settings', 'Code inferred', 'Medium', 'P2', 'Pending', '', 'Not started', '', ''],
  ['SETTINGS-003', 'Settings', 'Password change', 'As a user, I want to change my password securely.', 'Settings requires current password, new password, confirmation match, supports show/hide controls, and calls re-authentication plus update password.', 'src/pages/settings/SettingsPage.tsx; src/api/auth.ts', '/settings', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['SETTINGS-004', 'Settings', 'Account deletion guidance', 'As a user, I want to understand how account deletion works.', 'Delete account area communicates that users must contact support rather than offering an unsafe client-only destructive action.', 'src/pages/settings/SettingsPage.tsx', '/settings', 'Code inferred', 'Medium', 'P3', 'Pending', '', 'Not started', '', ''],

  ['API-001', 'API Contracts', 'Tour and scene API coverage', 'As the frontend, I need typed API clients for tour, scene, hotspot, public viewer, floor plan, and analytics operations.', 'Tour API exposes CRUD, publish/unpublish, duplicate, scenes, hotspots, public views/events/likes, floor plans, dashboard stats, analytics, realtime metrics, and heatmaps.', 'src/api/tours.ts; src/types/index.ts', 'API layer', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['API-002', 'API Contracts', 'Upload API coverage', 'As the frontend, I need upload APIs for files and media-library operations.', 'Upload API uploads single/batch files with progress, lists media with cursor params, deletes single media, and bulk-deletes with partial failure reporting.', 'src/api/upload.ts; src/types/index.ts', 'API layer', 'Code inferred', 'High', 'P0', 'Pending', '', 'Not started', '', ''],
  ['API-003', 'API Contracts', 'AI API coverage', 'As the frontend, I need AI job APIs for generation, analysis, descriptions, hotspots, reels, job status, and cancellation.', 'AI API starts jobs, uploads inputs where needed, polls status, cancels jobs, lists jobs, and applies suggestions.', 'src/api/ai.ts; src/hooks/useAIJobWebSocket.ts', 'API layer', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['API-004', 'API Contracts', 'Collaboration API coverage', 'As the frontend, I need activity and collaborator APIs for tour teamwork.', 'Collaboration API fetches activities/collaborators and invites/removes collaborators through the collaboration store.', 'src/api/collaboration.ts; src/stores/collaborationStore.ts', 'API layer', 'Code inferred', 'Medium', 'P2', 'Pending', '', 'Not started', '', ''],

  ['UTIL-001', 'Utilities', 'Validation utilities', 'As the app, I need shared validation so forms and uploads reject bad input consistently.', 'Validation helpers check image files, phone/email/password-like inputs, and surface user-friendly messages.', 'src/utils/validation.ts', 'Shared utilities', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['UTIL-002', 'Utilities', 'Embed and URL utilities', 'As the app, I need generated links and embeds to be consistent and safe.', 'Embed code builder and URL helpers produce share/embed URLs and iframe options used by settings/share flows.', 'src/utils/embedCode.ts; src/utils/url.ts', 'Shared utilities', 'Code inferred', 'High', 'P1', 'Pending', '', 'Not started', '', ''],
  ['UTIL-003', 'Utilities', 'Video URL parsing', 'As the app, I need external video links to render correctly.', 'Video utilities parse YouTube/Vimeo/raw URLs and build embed URLs with autoplay options for video hotspots.', 'src/utils/videoUrl.ts; src/components/features/HotspotContentModal.tsx', 'Shared utilities', 'Code inferred', 'High', 'P2', 'Pending', '', 'Not started', '', ''],
  ['UTIL-004', 'Utilities', 'Formatting utilities', 'As the app, I need consistent display for dates, bytes, durations, and server timestamps.', 'Formatting helpers normalize display values and parse server timestamps for activity/analytics views.', 'src/utils/format.ts', 'Shared utilities', 'Code inferred', 'High', 'P2', 'Pending', '', 'Not started', '', ''],
  ['UTIL-005', 'Utilities', 'QR code generation', 'As the app, I need share QR codes that can be displayed and downloaded.', 'QR utility creates QR data for the share modal and supports PNG/SVG download flows.', 'src/utils/qrCode.ts; src/components/features/ShareModal.tsx', 'Shared utilities', 'Code inferred', 'Medium', 'P2', 'Pending', '', 'Not started', '', ''],
];

const testCases = [
  ['TC-AUTH-001', 'AUTH-001..AUTH-008', 'Authentication state-machine', 'Unit + integration', 'Channel selection, last method restore, identifier status branches, OTP resend, password setup, callback role gate, transient auth failures, expired sessions.', 'src/test/user-behaviors/auth/authentication-flow.test.tsx', 'Planned'],
  ['TC-APP-001', 'APP-001..APP-005', 'App shell and layout', 'Unit + integration', 'Auth initialization loading, protected redirect, theme persistence/system listener, global error/offline/toast/confirm behavior.', 'src/test/user-behaviors/app/app-shell.test.tsx', 'Planned'],
  ['TC-TOURS-001', 'TOURS-001..TOURS-005', 'Tours management', 'Integration', 'Search debounce, status filter, cursor pagination, view mode, duplicate/archive/delete confirmation, draft/published link states.', 'src/test/user-behaviors/tours/tour-management.test.tsx', 'Planned'],
  ['TC-CREATE-001', 'CREATE-001..CREATE-004', 'Tour creation', 'Integration', 'Required title, draft creation, file validation, upload progress, scene creation, AI wizard limits/errors, skip later.', 'src/test/user-behaviors/tours/tour-creation.test.tsx', 'Planned'],
  ['TC-EDIT-001', 'EDIT-001..EDIT-017', 'Core editor workflows', 'Integration + component', 'Load states, unsaved blocking, save/undo/redo, scene upload/reorder/delete, hotspot placement/editor, settings/share/branding/floor plans.', 'src/test/user-behaviors/editor/editor-core.test.tsx', 'Planned'],
  ['TC-AI-001', 'EDIT-018..EDIT-021; API-003', 'AI workflows', 'Integration + unit', 'AI job start, WebSocket/poll fallback, cancel, retry, apply scene analysis/descriptions/hotspots, reel configure/progress/done/error.', 'src/test/user-behaviors/ai/ai-workflows.test.tsx', 'Planned'],
  ['TC-VIEW-001', 'VIEW-001..VIEW-007', 'Public viewer', 'Integration + component', 'Scene param, keyboard controls, hotspot content, share, like rollback, floor plan overlay, analytics tracking best-effort.', 'src/test/user-behaviors/viewer/public-viewer.test.tsx', 'Planned'],
  ['TC-EMBED-001', 'EMBED-001..EMBED-003', 'Embed viewer', 'Integration', 'URL param behavior, minimal/autohide UI, postMessage events, parent commands, branding visibility.', 'src/test/user-behaviors/viewer/embed-viewer.test.tsx', 'Planned'],
  ['TC-MEDIA-001', 'MEDIA-001..MEDIA-003; API-002', 'Media library', 'Integration + API', 'Search/filter/pagination, preview, download links, single/bulk delete, partial failures, selection clearing.', 'src/test/user-behaviors/media/media-library.test.tsx', 'Planned'],
  ['TC-ANALYTICS-001', 'ANALYTICS-001..ANALYTICS-005', 'Analytics', 'Integration + unit', 'Overview load, selected tour changes, empty states, date range, CSV/JSON export, heatmap scene selector.', 'src/test/user-behaviors/analytics/analytics.test.tsx', 'Planned'],
  ['TC-PROFILE-001', 'PROFILE-001..SETTINGS-004', 'Profile and settings', 'Integration', 'Profile dirty state, avatar upload, theme changes, notification toggles, password mismatch/success/errors, delete guidance.', 'src/test/user-behaviors/account/profile-settings.test.tsx', 'Planned'],
  ['TC-UTIL-001', 'UTIL-001..UTIL-005', 'Shared utilities', 'Unit', 'Validation edge cases, embed generation, video parsing, formatting, QR generation, clipboard fallbacks.', 'src/test/user-behaviors/shared/utilities.test.ts', 'Planned'],
  ['TC-E2E-001', 'Critical happy paths', 'Playwright smoke', 'Registration/login assumptions, tour creation, editor publish/share, public viewer, media library, analytics navigation.', 'e2e/user-behaviors/*.spec.ts', 'Planned'],
];

const defects = [
  ['DEF-001', 'EDIT-024', 'Bulk uploader close uses native browser confirm', 'BulkUploader calls window.confirm when uploads are pending, bypassing the styled confirmation system and producing inconsistent UX.', 'src/components/features/BulkUploader.tsx', 'P2', 'Open', 'Replace with confirmStore async confirmation and add coverage.', 'Pending'],
  ['DEF-002', 'EDIT-026', 'Video uploader cancel uses native browser confirm', 'VideoUploader calls window.confirm when pending/uploading videos exist, bypassing the app confirmation system.', 'src/components/features/VideoUploader.tsx', 'P2', 'Open', 'Replace with confirmStore async confirmation and add coverage.', 'Pending'],
  ['DEF-003', 'EDIT-017', 'Floor plan upload failure can persist blob URL', 'FloorPlanEditor falls back to URL.createObjectURL(file) on upload failure and can save that temporary blob as image_url, which will break after reload or for other users.', 'src/components/features/FloorPlanEditor.tsx', 'P1', 'Open', 'Do not persist temporary blob URLs; show preview-only failure state or block save until durable upload URL exists.', 'Pending'],
  ['DEF-004', 'EDIT-018', 'Scene analysis selection indicator is inert', 'The visual checkbox inside a scene analysis result stops propagation but does not toggle selection, so clicking the apparent control does nothing.', 'src/components/features/ai/SceneAnalysis.tsx', 'P2', 'Open', 'Toggle selection on the indicator or use the shared Checkbox component.', 'Pending'],
  ['DEF-005', 'EDIT-025', 'Custom domain validation rejects recommended subdomains', 'CustomDomainSetup recommends tours.yourcompany.com but the regex only accepts a single dot domain such as yourcompany.com.', 'src/components/features/CustomDomainSetup.tsx', 'P2', 'Open', 'Allow valid multi-label domains and reject malformed labels.', 'Pending'],
  ['DEF-006', 'EDIT-021', 'Video progress widths can render NaN before metadata loads', 'VideoPlayer computes buffered/duration and currentTime/duration while duration can be 0, producing NaN percent widths.', 'src/components/features/VideoPlayer.tsx', 'P3', 'Open', 'Clamp progress calculations through a safe percent helper.', 'Pending'],
];

defects.push([
  'DEF-007',
  'VIEW-007',
  'Unload analytics keepalive rejection can surface as an unhandled promise',
  'The public tracking hook fired a keepalive fetch during unmount without handling a rejected promise, so analytics network failures could leak into runtime or test errors.',
  'src/hooks/usePublicTourTracking.ts',
  'P2',
  'Open',
  'Catch and ignore keepalive fetch failures because unload analytics must be best-effort.',
  'Pending',
]);

const storyOverrideColumns = {
  status: 7,
  testStatus: 10,
  errorIds: 11,
  fixStatus: 12,
  testCaseFile: 13,
  notes: 14,
};

const storyOverrides = new Map([
  [
    'APP-002',
    {
      status: 'Tested - pass',
      testStatus: 'Automated pass',
      fixStatus: 'Not needed',
      testCaseFile: 'e2e/dashboard.spec.ts; e2e/tours.spec.ts',
      notes: 'Chromium E2E covers unauthenticated redirects for protected dashboard/profile/settings/analytics/tour routes.',
    },
  ],
  [
    'APP-005',
    {
      status: 'Retested - pass',
      testStatus: 'Automated pass',
      errorIds: 'DEF-001, DEF-002',
      fixStatus: 'Retested',
      testCaseFile: 'src/test/user-behaviors/editor/upload-confirmations.test.tsx',
      notes: 'Native confirms replaced with styled confirm flow for panorama and video uploaders.',
    },
  ],
  [
    'LAND-001',
    {
      status: 'Tested - pass',
      testStatus: 'Automated pass',
      fixStatus: 'Not needed',
      testCaseFile: 'e2e/landing.spec.ts; e2e/performance.spec.ts',
      notes: 'Chromium E2E covers landing render, navigation links, responsive viewports, SEO/meta smoke, and no page-load console errors.',
    },
  ],
  [
    'LAND-002',
    {
      status: 'Tested - pass',
      testStatus: 'Automated pass',
      fixStatus: 'Not needed',
      testCaseFile: 'e2e/landing.spec.ts; e2e/auth.spec.ts',
      notes: 'Unauthenticated root/login/register navigation is covered; authenticated-root redirect still needs a credentialed smoke check.',
    },
  ],
  [
    'AUTH-001',
    {
      status: 'Tested - pass',
      testStatus: 'Automated pass',
      fixStatus: 'Not needed',
      testCaseFile: 'e2e/auth.spec.ts',
      notes: 'Playwright covers identifier-first login, phone/email switching, required fields, and invalid phone validation.',
    },
  ],
  [
    'AUTH-005',
    {
      status: 'Tested - pass',
      testStatus: 'Automated pass',
      fixStatus: 'Not needed',
      testCaseFile: 'e2e/auth.spec.ts',
      notes: 'Playwright covers identifier-first registration, email mode, required terms, policy links, and login link.',
    },
  ],
  [
    'AUTH-008',
    {
      status: 'Tested - pass',
      testStatus: 'Automated pass',
      fixStatus: 'Not needed',
      testCaseFile: 'src/test/api/client.test.ts; src/test/stores/authStore.test.ts',
      notes: 'API retry/session expiry and auth-store transient failure behavior are covered by the existing automated suite.',
    },
  ],
  [
    'EDIT-009',
    {
      status: 'Tested - pass',
      testStatus: 'Automated pass',
      fixStatus: 'Not needed',
      testCaseFile: 'src/test/components/PanoramaViewer.test.tsx',
      notes: 'Viewer tests verify stable instance lifecycle and panorama updates when scene props change.',
    },
  ],
  [
    'EDIT-017',
    {
      status: 'Retested - pass',
      testStatus: 'Automated pass',
      errorIds: 'DEF-003',
      fixStatus: 'Retested',
      testCaseFile: 'src/test/user-behaviors/editor/floor-plan-editor.test.tsx',
      notes: 'Failed floor-plan uploads now show an inline error and do not persist blob URLs.',
    },
  ],
  [
    'EDIT-018',
    {
      status: 'Retested - pass',
      testStatus: 'Automated pass',
      errorIds: 'DEF-004',
      fixStatus: 'Retested',
      testCaseFile: 'src/test/user-behaviors/editor/scene-analysis.test.tsx',
      notes: 'Scene analysis result checkbox is keyboard and pointer operable.',
    },
  ],
  [
    'EDIT-021',
    {
      status: 'Retested - pass',
      testStatus: 'Automated pass',
      errorIds: 'DEF-006',
      fixStatus: 'Retested',
      testCaseFile: 'src/test/user-behaviors/viewer/video-player.test.tsx',
      notes: 'Video progress, buffer, and scrubber styles stay finite before metadata loads.',
    },
  ],
  [
    'EDIT-024',
    {
      status: 'Retested - pass',
      testStatus: 'Automated pass',
      errorIds: 'DEF-001',
      fixStatus: 'Retested',
      testCaseFile: 'src/test/user-behaviors/editor/upload-confirmations.test.tsx',
      notes: 'Bulk uploader close/cancel uses the styled confirmation dialog during active uploads.',
    },
  ],
  [
    'EDIT-025',
    {
      status: 'Retested - pass',
      testStatus: 'Automated pass',
      errorIds: 'DEF-005',
      fixStatus: 'Retested',
      testCaseFile: 'src/test/user-behaviors/account/custom-domain-setup.test.tsx',
      notes: 'Domain validation accepts and normalizes valid branded subdomains while rejecting malformed labels.',
    },
  ],
  [
    'EDIT-026',
    {
      status: 'Retested - pass',
      testStatus: 'Automated pass',
      errorIds: 'DEF-002',
      fixStatus: 'Retested',
      testCaseFile: 'src/test/user-behaviors/editor/upload-confirmations.test.tsx',
      notes: 'Video uploader close/cancel uses the styled confirmation dialog while pending uploads exist.',
    },
  ],
  [
    'VIEW-007',
    {
      status: 'Retested - pass',
      testStatus: 'Automated pass',
      errorIds: 'DEF-007',
      fixStatus: 'Retested',
      testCaseFile: 'src/test/stores/viewerStore.test.ts',
      notes: 'Unload tracking remains best-effort and catches rejected keepalive fetches.',
    },
  ],
  [
    'API-001',
    {
      status: 'Tested - pass',
      testStatus: 'Automated pass',
      fixStatus: 'Not needed',
      testCaseFile: 'src/test/api/toursContract.test.ts; src/test/integration/api.test.tsx',
      notes: 'Tour API contract and selected integration behavior are covered by the automated suite.',
    },
  ],
  [
    'UTIL-001',
    {
      status: 'Tested - pass',
      testStatus: 'Automated pass',
      fixStatus: 'Not needed',
      testCaseFile: 'src/test/utils/validation.test.ts',
      notes: 'Validation tests cover image/file limits, phone/email/password-like inputs, schemas, and edge cases.',
    },
  ],
  [
    'UTIL-002',
    {
      status: 'Tested - pass',
      testStatus: 'Automated pass',
      fixStatus: 'Not needed',
      testCaseFile: 'src/test/utils/embedCode.test.ts',
      notes: 'Embed/link generation behavior is covered by unit tests.',
    },
  ],
  [
    'UTIL-004',
    {
      status: 'Tested - pass',
      testStatus: 'Automated pass',
      fixStatus: 'Not needed',
      testCaseFile: 'src/test/utils/format.test.ts',
      notes: 'Date-only formatting and display helper behavior are covered by unit tests.',
    },
  ],
]);

for (const story of stories) {
  const override = storyOverrides.get(story[0]);
  if (!override) continue;

  for (const [key, value] of Object.entries(override)) {
    story[storyOverrideColumns[key]] = value;
  }
}

testCases.splice(
  2,
  0,
  [
    'TC-LAND-001',
    'LAND-001..LAND-002',
    'Landing and public marketing',
    'Playwright smoke',
    'Home render, title/meta, login/register links, responsive breakpoints, no page-load console errors, authenticated-root redirect gap documented.',
    'e2e/landing.spec.ts; e2e/performance.spec.ts',
    'Automated pass',
  ],
  [
    'TC-DASH-001',
    'DASH-001..DASH-002',
    'Dashboard overview',
    'Integration',
    'Stats loading/error/retry, recent tours empty/populated states, realtime daily views, storage progress, create/open-tour launch points.',
    'src/test/user-behaviors/dashboard/dashboard.test.tsx',
    'Planned',
  ]
);

const testCaseOverrides = new Map([
  ['TC-AUTH-001', { file: 'e2e/auth.spec.ts; src/test/stores/authStore.test.ts; src/test/api/client.test.ts', status: 'Automated partial' }],
  ['TC-APP-001', { file: 'src/test/stores/uiStore.test.ts; src/test/components/OfflineIndicator.test.tsx; src/test/user-behaviors/editor/upload-confirmations.test.tsx', status: 'Automated partial' }],
  ['TC-EDIT-001', { file: 'src/test/user-behaviors/editor/floor-plan-editor.test.tsx; src/test/user-behaviors/editor/upload-confirmations.test.tsx; src/test/components/PanoramaViewer.test.tsx', status: 'Automated partial' }],
  ['TC-AI-001', { file: 'src/test/user-behaviors/editor/scene-analysis.test.tsx', status: 'Automated partial' }],
  ['TC-VIEW-001', { file: 'src/test/user-behaviors/viewer/video-player.test.tsx; src/test/stores/viewerStore.test.ts', status: 'Automated partial' }],
  ['TC-UTIL-001', { file: 'src/test/utils/validation.test.ts; src/test/utils/embedCode.test.ts; src/test/utils/format.test.ts', status: 'Automated partial' }],
  ['TC-E2E-001', { file: 'e2e/*.spec.ts', status: 'Automated pass (Chromium smoke)' }],
]);

for (const testCase of testCases) {
  const override = testCaseOverrides.get(testCase[0]);
  if (!override) continue;

  testCase[5] = override.file;
  testCase[6] = override.status;
}

const defectResolutions = new Map([
  ['DEF-001', 'Replaced native confirm in BulkUploader with confirmStore and covered close/keep-open/confirm behavior.'],
  ['DEF-002', 'Replaced native confirm in VideoUploader with confirmStore and covered pending-upload close behavior.'],
  ['DEF-003', 'Removed blob URL persistence fallback; failed image uploads now surface an inline error and leave the saved URL unchanged.'],
  ['DEF-004', 'Made the scene-analysis selection indicator an accessible checkbox with pointer and keyboard toggling.'],
  ['DEF-005', 'Normalized custom-domain input and allowed valid multi-label hostnames while rejecting malformed labels.'],
  ['DEF-006', 'Added a safe progress percentage helper so zero/unknown duration never renders NaN styles.'],
  ['DEF-007', 'Added a catch handler to keepalive fetch during unload and covered the rejected-fetch path.'],
]);

for (const defect of defects) {
  const resolution = defectResolutions.get(defect[0]);
  if (!resolution) continue;

  defect[6] = 'Fixed';
  defect[7] = resolution;
  defect[8] = 'Retested - pass';
}

const targetFilesByArea = {
  'App Shell': 'src/test/user-behaviors/app/app-shell.test.tsx; e2e/dashboard.spec.ts',
  Landing: 'e2e/landing.spec.ts; e2e/performance.spec.ts',
  Authentication: 'e2e/auth.spec.ts; src/test/user-behaviors/auth/authentication-flow.test.tsx',
  Dashboard: 'src/test/user-behaviors/dashboard/dashboard.test.tsx',
  Tours: 'src/test/user-behaviors/tours/tour-management.test.tsx; e2e/tours.spec.ts',
  'Tour Creation': 'src/test/user-behaviors/tours/tour-creation.test.tsx; e2e/tour-create.spec.ts',
  'Tour Editor': 'src/test/user-behaviors/editor/editor-core.test.tsx; e2e/tour-edit.spec.ts',
  'Public Viewer': 'src/test/user-behaviors/viewer/public-viewer.test.tsx; e2e/public-viewer.spec.ts',
  'Embed Viewer': 'src/test/user-behaviors/viewer/embed-viewer.test.tsx; e2e/public-viewer.spec.ts',
  'Local Harness': 'src/test/user-behaviors/viewer/local-tour.test.tsx',
  'Media Library': 'src/test/user-behaviors/media/media-library.test.tsx',
  Analytics: 'src/test/user-behaviors/analytics/analytics.test.tsx',
  Profile: 'src/test/user-behaviors/account/profile-settings.test.tsx',
  Settings: 'src/test/user-behaviors/account/profile-settings.test.tsx',
  'API Contracts': 'src/test/api/*.test.ts; src/test/integration/api.test.tsx',
  Utilities: 'src/test/utils/*.test.ts',
};

const edgeCasesByArea = {
  'App Shell': 'cold start, expired auth, transient API failure, protected redirect, responsive navigation, offline/global error state',
  Landing: 'desktop/tablet/mobile viewport, missing images, SEO/meta tags, login/register navigation, no page-load console errors',
  Authentication: 'empty input, invalid phone/email, existing vs new identifier, OTP resend/cooldown, password mismatch, backend rejection, safe redirect',
  Dashboard: 'loading, empty stats, API error/retry, realtime metric update, storage limits, recent tour action links',
  Tours: 'empty list, debounced search, status filter reset, cursor pagination, destructive confirmations, duplicate/archive/delete API failure',
  'Tour Creation': 'missing title, oversized/invalid files, upload failure, partial upload, skip upload, AI wizard limits and cancellation',
  'Tour Editor': 'empty scene state, stale selected scene, save failure, unsaved changes, destructive confirmation, keyboard shortcuts, drag/drop, API retry',
  'Public Viewer': 'invalid tour, invalid scene param, missing hotspot data, mobile gestures, fullscreen fallback, share/like rollback, analytics failure',
  'Embed Viewer': 'invalid URL params, minimal chrome, autohide timing, postMessage origin/command handling, fullscreen fallback',
  'Local Harness': 'missing seed data, malformed tour JSON, calibration query param, hotspot coordinate capture',
  'Media Library': 'empty media, search/filter reset, pagination selection clearing, unsupported preview, partial bulk delete failure',
  Analytics: 'no published tours, date range changes, export failure, empty charts, heatmap scene without data',
  Profile: 'unchanged save disabled, invalid phone, avatar upload failure, backend update failure, read-only account fields',
  Settings: 'theme persistence/system listener, notification toggle persistence, password mismatch, auth failure, delete guidance',
  'API Contracts': 'auth refresh, rate-limit retry, network/server failure, payload shape drift, cursor parameters, partial failures',
  Utilities: 'boundary values, invalid types, malformed URLs, timezone-sensitive dates, clipboard/download fallback',
};

const storyTestCases = stories.map(story => {
  const [id, area, feature, _userStory, expectedBehavior, _source, route, status, _confidence, priority, testStatus, errorIds, fixStatus, testCaseFile, notes] = story;
  const targetFile = testCaseFile || targetFilesByArea[area] || 'src/test/user-behaviors/shared/unassigned.test.tsx';
  const automationStatus =
    testStatus === 'Automated pass'
      ? 'Implemented'
      : status === 'Tested - pass' || status === 'Retested - pass'
        ? 'Implemented / smoke'
        : 'Planned';

  return [
    `CASE-${id}`,
    id,
    area,
    feature,
    route,
    `Verify ${feature.toLowerCase()} follows the expected behavior: ${expectedBehavior}`,
    edgeCasesByArea[area] || 'loading, empty state, validation failure, API failure, navigation away, mobile viewport',
    targetFile,
    priority,
    automationStatus,
    testStatus,
    errorIds,
    fixStatus,
    notes,
  ];
});

const workbook = Workbook.create();

const summary = workbook.worksheets.add('Summary');
const tracker = workbook.worksheets.add('Story Tracker');
const matrix = workbook.worksheets.add('Test Matrix');
const caseSheet = workbook.worksheets.add('Story Test Cases');
const defectSheet = workbook.worksheets.add('Defects');
const notes = workbook.worksheets.add('Notes');

for (const sheet of [summary, tracker, matrix, caseSheet, defectSheet, notes]) {
  sheet.showGridLines = false;
}

const headerFill = '#1F2937';
const accentFill = '#FF5733';
const softFill = '#FFF4EF';
const border = '#D9DEE8';
const textMuted = '#6B7280';

const storyHeaders = [
  'ID',
  'Area',
  'Feature',
  'User story',
  'Expected behavior',
  'Source code',
  'Route / Surface',
  'Status',
  'Confidence',
  'Priority',
  'Test status',
  'Error IDs',
  'Fix status',
  'Test case file',
  'Notes',
];
tracker.getRangeByIndexes(0, 0, 1, storyHeaders.length).values = [storyHeaders];
tracker.getRangeByIndexes(1, 0, stories.length, storyHeaders.length).values = stories;
const storyRange = tracker.getRangeByIndexes(0, 0, stories.length + 1, storyHeaders.length);
storyRange.format.borders = { preset: 'all', style: 'thin', color: border };
tracker.getRangeByIndexes(0, 0, 1, storyHeaders.length).format = {
  fill: headerFill,
  font: { bold: true, color: '#FFFFFF' },
};
tracker.getRange('A1:O1').format.rowHeightPx = 32;
tracker.freezePanes.freezeRows(1);
tracker.freezePanes.freezeColumns(2);
tracker.getRange('A:A').format.columnWidthPx = 92;
tracker.getRange('B:B').format.columnWidthPx = 126;
tracker.getRange('C:C').format.columnWidthPx = 190;
tracker.getRange('D:D').format.columnWidthPx = 320;
tracker.getRange('E:E').format.columnWidthPx = 460;
tracker.getRange('F:F').format.columnWidthPx = 260;
tracker.getRange('G:G').format.columnWidthPx = 170;
tracker.getRange('H:H').format.columnWidthPx = 130;
tracker.getRange('I:I').format.columnWidthPx = 105;
tracker.getRange('J:J').format.columnWidthPx = 84;
tracker.getRange('K:K').format.columnWidthPx = 120;
tracker.getRange('L:L').format.columnWidthPx = 110;
tracker.getRange('M:M').format.columnWidthPx = 110;
tracker.getRange('N:N').format.columnWidthPx = 260;
tracker.getRange('O:O').format.columnWidthPx = 240;
tracker.getRangeByIndexes(1, 3, stories.length, 3).format.wrapText = true;
tracker.getRangeByIndexes(1, 5, stories.length, 1).format.wrapText = true;
tracker.getRangeByIndexes(1, 13, stories.length, 2).format.wrapText = true;
tracker.getRangeByIndexes(1, 0, stories.length, storyHeaders.length).format.rowHeightPx = 68;
tracker.getRangeByIndexes(1, 0, stories.length, storyHeaders.length).format.font = { color: '#111827' };
tracker.tables.add(`A1:O${stories.length + 1}`, true, 'StoryTrackerTable');
tracker.getRange(`H2:H${stories.length + 1}`).dataValidation = { rule: { type: 'list', values: statusOptions } };
tracker.getRange(`K2:K${stories.length + 1}`).dataValidation = { rule: { type: 'list', values: testStatusOptions } };
tracker.getRange(`M2:M${stories.length + 1}`).dataValidation = { rule: { type: 'list', values: fixStatusOptions } };

const matrixHeaders = [
  'Test ID',
  'Stories covered',
  'Behavior group',
  'Test level',
  'Key edge cases',
  'Planned file',
  'Status',
];
matrix.getRangeByIndexes(0, 0, 1, matrixHeaders.length).values = [matrixHeaders];
matrix.getRangeByIndexes(1, 0, testCases.length, matrixHeaders.length).values = testCases;
matrix.getRangeByIndexes(0, 0, testCases.length + 1, matrixHeaders.length).format.borders = {
  preset: 'all',
  style: 'thin',
  color: border,
};
matrix.getRangeByIndexes(0, 0, 1, matrixHeaders.length).format = {
  fill: headerFill,
  font: { bold: true, color: '#FFFFFF' },
};
matrix.freezePanes.freezeRows(1);
matrix.getRange('A:A').format.columnWidthPx = 120;
matrix.getRange('B:B').format.columnWidthPx = 165;
matrix.getRange('C:C').format.columnWidthPx = 220;
matrix.getRange('D:D').format.columnWidthPx = 150;
matrix.getRange('E:E').format.columnWidthPx = 520;
matrix.getRange('F:F').format.columnWidthPx = 330;
matrix.getRange('G:G').format.columnWidthPx = 110;
matrix.getRangeByIndexes(1, 4, testCases.length, 2).format.wrapText = true;
matrix.getRangeByIndexes(1, 0, testCases.length, matrixHeaders.length).format.rowHeightPx = 62;
matrix.tables.add(`A1:G${testCases.length + 1}`, true, 'TestMatrixTable');

const caseHeaders = [
  'Case ID',
  'Story ID',
  'Area',
  'Feature',
  'Route / Surface',
  'Happy path / expected assertion',
  'Edge cases',
  'Target file',
  'Priority',
  'Automation status',
  'Current test status',
  'Linked defects',
  'Fix status',
  'Notes',
];
caseSheet.getRangeByIndexes(0, 0, 1, caseHeaders.length).values = [caseHeaders];
caseSheet.getRangeByIndexes(1, 0, storyTestCases.length, caseHeaders.length).values =
  storyTestCases;
caseSheet.getRangeByIndexes(0, 0, storyTestCases.length + 1, caseHeaders.length).format.borders = {
  preset: 'all',
  style: 'thin',
  color: border,
};
caseSheet.getRangeByIndexes(0, 0, 1, caseHeaders.length).format = {
  fill: headerFill,
  font: { bold: true, color: '#FFFFFF' },
};
caseSheet.freezePanes.freezeRows(1);
caseSheet.freezePanes.freezeColumns(2);
caseSheet.getRange('A:A').format.columnWidthPx = 118;
caseSheet.getRange('B:B').format.columnWidthPx = 92;
caseSheet.getRange('C:C').format.columnWidthPx = 130;
caseSheet.getRange('D:D').format.columnWidthPx = 200;
caseSheet.getRange('E:E').format.columnWidthPx = 150;
caseSheet.getRange('F:F').format.columnWidthPx = 520;
caseSheet.getRange('G:G').format.columnWidthPx = 360;
caseSheet.getRange('H:H').format.columnWidthPx = 330;
caseSheet.getRange('I:I').format.columnWidthPx = 82;
caseSheet.getRange('J:J').format.columnWidthPx = 145;
caseSheet.getRange('K:K').format.columnWidthPx = 130;
caseSheet.getRange('L:L').format.columnWidthPx = 110;
caseSheet.getRange('M:M').format.columnWidthPx = 110;
caseSheet.getRange('N:N').format.columnWidthPx = 260;
caseSheet.getRangeByIndexes(1, 5, storyTestCases.length, 3).format.wrapText = true;
caseSheet.getRangeByIndexes(1, 13, storyTestCases.length, 1).format.wrapText = true;
caseSheet.getRangeByIndexes(1, 0, storyTestCases.length, caseHeaders.length).format.rowHeightPx =
  74;
caseSheet.tables.add(`A1:N${storyTestCases.length + 1}`, true, 'StoryTestCasesTable');

const defectHeaders = [
  'Defect ID',
  'Story ID',
  'Title',
  'Observed / Risk',
  'Source code',
  'Priority',
  'Status',
  'Resolution plan',
  'Retest status',
];
defectSheet.getRangeByIndexes(0, 0, 1, defectHeaders.length).values = [defectHeaders];
defectSheet.getRangeByIndexes(1, 0, defects.length, defectHeaders.length).values = defects;
defectSheet.getRangeByIndexes(0, 0, defects.length + 1, defectHeaders.length).format.borders = {
  preset: 'all',
  style: 'thin',
  color: border,
};
defectSheet.getRangeByIndexes(0, 0, 1, defectHeaders.length).format = {
  fill: headerFill,
  font: { bold: true, color: '#FFFFFF' },
};
defectSheet.freezePanes.freezeRows(1);
defectSheet.getRange('A:A').format.columnWidthPx = 95;
defectSheet.getRange('B:B').format.columnWidthPx = 95;
defectSheet.getRange('C:C').format.columnWidthPx = 260;
defectSheet.getRange('D:D').format.columnWidthPx = 520;
defectSheet.getRange('E:E').format.columnWidthPx = 360;
defectSheet.getRange('F:F').format.columnWidthPx = 82;
defectSheet.getRange('G:G').format.columnWidthPx = 100;
defectSheet.getRange('H:H').format.columnWidthPx = 450;
defectSheet.getRange('I:I').format.columnWidthPx = 110;
defectSheet.getRangeByIndexes(1, 2, defects.length, 2).format.wrapText = true;
defectSheet.getRangeByIndexes(1, 4, defects.length, 1).format.wrapText = true;
defectSheet.getRangeByIndexes(1, 7, defects.length, 1).format.wrapText = true;
defectSheet.getRangeByIndexes(1, 0, defects.length, defectHeaders.length).format.rowHeightPx = 74;
defectSheet.tables.add(`A1:I${defects.length + 1}`, true, 'DefectsTable');

summary.getRange('A1:H1').merge();
summary.getRange('A1').values = [['Matterport Clone Feature Story Tracker']];
summary.getRange('A1').format = {
  fill: accentFill,
  font: { bold: true, color: '#FFFFFF', size: 16 },
};
summary.getRange('A2:H2').merge();
summary.getRange('A2').values = [[`Canonical status workbook generated from code inventory. Last updated: ${new Date().toISOString().slice(0, 10)}`]];
summary.getRange('A2').format = { fill: softFill, font: { color: textMuted } };

summary.getRange('A4:B14').values = [
  ['Metric', 'Value'],
  ['Total stories', null],
  ['Open defects', null],
  ['P0 stories', null],
  ['P1 stories', null],
  ['Stories with pending tests', null],
  ['Stories with issue IDs', null],
  ['Planned test groups', null],
  ['Automated coverage complete', null],
  ['Story-level test cases', null],
  ['Implemented story cases', null],
];
summary.getRange('B5').formulas = [[`=COUNTA('Story Tracker'!A2:A${stories.length + 1})`]];
summary.getRange('B6').formulas = [[`=COUNTIF('Defects'!G2:G${defects.length + 1},"Open")`]];
summary.getRange('B7').formulas = [[`=COUNTIF('Story Tracker'!J2:J${stories.length + 1},"P0")`]];
summary.getRange('B8').formulas = [[`=COUNTIF('Story Tracker'!J2:J${stories.length + 1},"P1")`]];
summary.getRange('B9').formulas = [[`=COUNTIF('Story Tracker'!K2:K${stories.length + 1},"Pending")`]];
summary.getRange('B10').formulas = [[`=COUNTA('Defects'!B2:B${defects.length + 1})`]];
summary.getRange('B11').formulas = [[`=COUNTA('Test Matrix'!A2:A${testCases.length + 1})`]];
summary.getRange('B12').formulas = [[`=COUNTIF('Story Tracker'!K2:K${stories.length + 1},"Automated pass")`]];
summary.getRange('B13').formulas = [[`=COUNTA('Story Test Cases'!A2:A${storyTestCases.length + 1})`]];
summary.getRange('B14').formulas = [[`=COUNTIF('Story Test Cases'!J2:J${storyTestCases.length + 1},"Implemented")+COUNTIF('Story Test Cases'!J2:J${storyTestCases.length + 1},"Implemented / smoke")`]];
summary.getRange('A4:B4').format = { fill: headerFill, font: { bold: true, color: '#FFFFFF' } };
summary.getRange('A4:B14').format.borders = { preset: 'all', style: 'thin', color: border };
summary.getRange('A:A').format.columnWidthPx = 260;
summary.getRange('B:B').format.columnWidthPx = 140;

summary.getRange('D4:F11').values = [
  ['Status', 'Count', 'Notes'],
  ['Code inferred', null, 'Documented from implementation before full test pass.'],
  ['Tested - pass', null, 'Manual or automated behavior verified.'],
  ['Tested - issues found', null, 'Defect log contains matching IDs.'],
  ['Fixed - needs retest', null, 'Code changed and waiting for retest.'],
  ['Retested - pass', null, 'Post-fix behavior verified.'],
  ['Blocked', null, 'External dependency or missing environment.'],
  ['Backlog / unlinked', null, 'Code exists but no active entry point or deferred product surface.'],
];
for (let row = 5; row <= 11; row += 1) {
  summary.getRange(`E${row}`).formulas = [[`=COUNTIF('Story Tracker'!H2:H${stories.length + 1},D${row})`]];
}
summary.getRange('D4:F4').format = { fill: headerFill, font: { bold: true, color: '#FFFFFF' } };
summary.getRange('D4:F11').format.borders = { preset: 'all', style: 'thin', color: border };
summary.getRange('D:D').format.columnWidthPx = 160;
summary.getRange('E:E').format.columnWidthPx = 90;
summary.getRange('F:F').format.columnWidthPx = 420;
summary.getRange('F5:F11').format.wrapText = true;

notes.getRange('A1:D1').values = [['Workbook operating notes', '', '', '']];
notes.getRange('A1:D1').merge();
notes.getRange('A1').format = { fill: headerFill, font: { bold: true, color: '#FFFFFF', size: 14 } };
notes.getRange('A3:D13').values = [
  ['Purpose', 'Single canonical tracker for feature stories, expected behavior, story-level test cases, defects, and planned tests.', '', ''],
  ['Source of truth', 'Story Tracker sheet. Edit Status, Test status, Error IDs, Fix status, and Test case file as verification progresses.', '', ''],
  ['Status policy', 'Start as Code inferred, move to Tested - pass or Tested - issues found after behavior checks, then Fixed - needs retest and Retested - pass after fixes.', '', ''],
  ['Defect policy', 'Every UX/logistical error found during testing should have a Defects row and be linked from Story Tracker Error IDs.', '', ''],
  ['Test policy', 'Story Test Cases defines one behavior test case per story. Test Matrix defines the target folder/file structure for behavior-focused test suites. Automated partial means the listed behavior group now has executable coverage, but not every edge case in that group is fully automated yet.', '', ''],
  ['Repository', '/Users/sakshammittal/Documents/360ghar/github/360-tours-viewer/360-viewer', '', ''],
  ['Generated by', 'Codex goal audit from code inspection, behavior checks, fixes, and retest loop.', '', ''],
  ['Final app checks', 'npm run type-check, npm run lint, npm run test:run, npm run build.', '', ''],
  ['Final E2E check', 'npx playwright test e2e/auth.spec.ts --project=chromium --reporter=list.', '', ''],
  ['Automated test count', '355 app tests plus 87 Chromium end-to-end smoke tests passed before this final workbook refresh.', '', ''],
  ['Residual coverage note', 'Broad areas still marked Pending in Story Tracker are documented from code and need deeper manual/product acceptance or future automated expansion.', '', ''],
];
notes.getRange('A3:D13').format.borders = { preset: 'all', style: 'thin', color: border };
notes.getRange('A:A').format.columnWidthPx = 160;
notes.getRange('B:B').format.columnWidthPx = 680;
notes.getRange('B3:B13').format.wrapText = true;
notes.getRange('A3:A13').format = { fill: softFill, font: { bold: true } };

const renderTargets = [
  ['summary.png', 'Summary'],
  ['story_tracker.png', 'Story Tracker'],
  ['test_matrix.png', 'Test Matrix'],
  ['story_test_cases.png', 'Story Test Cases'],
  ['defects.png', 'Defects'],
  ['notes.png', 'Notes'],
];
for (const [filename, sheetName] of renderTargets) {
  const preview = await workbook.render({ sheetName, autoCrop: 'all', scale: 1, format: 'png' });
  await fs.writeFile(`${outputDir}${filename}`, new Uint8Array(await preview.arrayBuffer()));
}

const storyInspect = await workbook.inspect({
  kind: 'table',
  range: 'Story Tracker!A1:O8',
  include: 'values,formulas',
  tableMaxRows: 8,
  tableMaxCols: 15,
});
console.log(storyInspect.ndjson);

const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 300 },
  summary: 'final formula error scan',
});
console.log(errors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
