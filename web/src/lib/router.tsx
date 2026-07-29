/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense, Component } from 'react';
import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ROUTES } from '@/constants';
import { Button, PageLoader } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

// Layouts (eagerly loaded — needed immediately)
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';

// Auth guard component
import { ProtectedRoute } from '@/components/features/ProtectedRoute';

// Landing page (eagerly loaded — first paint)
import { HomePage } from '@/pages/HomePage';

// Auth Pages (eagerly loaded — common entry point)
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { AuthCallbackPage } from '@/pages/auth/AuthCallbackPage';

// Lazy-loaded pages
const DashboardPage = lazy(() =>
  import('@/pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage }))
);
const ToursPage = lazy(() =>
  import('@/pages/tours/ToursPage').then(m => ({ default: m.ToursPage }))
);
const TourCreatePage = lazy(() =>
  import('@/pages/tours/TourCreatePage').then(m => ({ default: m.TourCreatePage }))
);
const GuidedCapturePage = lazy(() =>
  import('@/pages/tours/GuidedCapturePage').then(m => ({ default: m.GuidedCapturePage }))
);
const TourEditPage = lazy(() =>
  import('@/pages/tours/TourEditPage').then(m => ({ default: m.TourEditPage }))
);
const TourViewPage = lazy(() =>
  import('@/pages/tours/TourViewPage').then(m => ({ default: m.TourViewPage }))
);
const TourAnalyticsPage = lazy(() =>
  import('@/pages/tours/TourAnalyticsPage').then(m => ({ default: m.TourAnalyticsPage }))
);
const MediaLibraryPage = lazy(() =>
  import('@/pages/media/MediaLibraryPage').then(m => ({ default: m.MediaLibraryPage }))
);
const AnalyticsPage = lazy(() =>
  import('@/pages/analytics/AnalyticsPage').then(m => ({ default: m.AnalyticsPage }))
);
const ProfilePage = lazy(() =>
  import('@/pages/settings/ProfilePage').then(m => ({ default: m.ProfilePage }))
);
const SettingsPage = lazy(() =>
  import('@/pages/settings/SettingsPage').then(m => ({ default: m.SettingsPage }))
);
const PublicTourPage = lazy(() =>
  import('@/pages/PublicTourPage').then(m => ({ default: m.PublicTourPage }))
);
const EmbedTourPage = lazy(() =>
  import('@/pages/EmbedTourPage').then(m => ({ default: m.EmbedTourPage }))
);
const LocalTourPage = lazy(() =>
  import('@/pages/LocalTourPage').then(m => ({ default: m.LocalTourPage }))
);
const SplatLabPage = lazy(() =>
  import('@/pages/lab/SplatLabPage').then(m => ({ default: m.SplatLabPage }))
);
const DollhouseEditorPage = lazy(() =>
  import('@/pages/lab/DollhouseEditorPage').then(m => ({ default: m.DollhouseEditorPage }))
);
const KitchenTourPage = lazy(() =>
  import('@/pages/lab/KitchenTourPage').then(m => ({ default: m.KitchenTourPage }))
);
const View3DPage = lazy(() =>
  import('@/pages/View3DPage').then(m => ({ default: m.View3DPage }))
);

// 404 page (eagerly loaded — users hitting unknown routes shouldn't see a spinner)
import { NotFoundPage } from '@/pages/NotFoundPage';

class ChunkErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center"
        >
          <p className="text-[var(--color-text-muted)]">
            Failed to load this page. Reload to get the latest app files.
          </p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <ChunkErrorBoundary>{children}</ChunkErrorBoundary>
    </Suspense>
  );
}

/**
 * Redirects authenticated users away from the public landing page to the
 * dashboard. Unauthenticated visitors fall through to the public landing.
 */
function RootRedirect({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to={ROUTES.DASHBOARD} replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  // Public routes
  {
    path: '/',
    element: (
      <RootRedirect>
        <PublicLayout />
      </RootRedirect>
    ),
    children: [{ index: true, element: <HomePage /> }],
  },

  // Auth routes
  {
    path: '/',
    element: <AuthLayout />,
    children: [
      { path: ROUTES.LOGIN, element: <LoginPage /> },
      { path: ROUTES.REGISTER, element: <RegisterPage /> },
      { path: ROUTES.FORGOT_PASSWORD, element: <ForgotPasswordPage /> },
    ],
  },

  // Protected dashboard routes
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: ROUTES.DASHBOARD,
        element: (
          <LazyPage>
            <DashboardPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.TOURS,
        element: (
          <LazyPage>
            <ToursPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.TOUR_CREATE,
        element: (
          <LazyPage>
            <TourCreatePage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.TOUR_CAPTURE,
        element: (
          <LazyPage>
            <GuidedCapturePage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.TOUR_CAPTURE_SESSION,
        element: (
          <LazyPage>
            <GuidedCapturePage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.TOUR_EDIT,
        element: (
          <LazyPage>
            <TourEditPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.TOUR_VIEW,
        element: (
          <LazyPage>
            <TourViewPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.TOUR_ANALYTICS,
        element: (
          <LazyPage>
            <TourAnalyticsPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.MEDIA,
        element: (
          <LazyPage>
            <MediaLibraryPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.ANALYTICS,
        element: (
          <LazyPage>
            <AnalyticsPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.PROFILE,
        element: (
          <LazyPage>
            <ProfilePage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.SETTINGS,
        element: (
          <LazyPage>
            <SettingsPage />
          </LazyPage>
        ),
      },

      {
        path: ROUTES.LAB,
        element: (
          <LazyPage>
            <SplatLabPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.LAB_EDITOR,
        element: (
          <LazyPage>
            <DollhouseEditorPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.LAB_KITCHEN_TOUR,
        element: (
          <LazyPage>
            <KitchenTourPage />
          </LazyPage>
        ),
      },

    ],
  },

  // OAuth (Google) redirect landing — no chrome, runs the code exchange
  {
    path: ROUTES.AUTH_CALLBACK,
    element: <AuthCallbackPage />,
  },

  // Public tour viewing (no auth required)
  {
    path: ROUTES.PUBLIC_TOUR,
    element: (
      <LazyPage>
        <PublicTourPage />
      </LazyPage>
    ),
  },

  // Minimal 3D world viewer (no auth required)
  {
    path: ROUTES.VIEW_3D,
    element: (
      <LazyPage>
        <View3DPage />
      </LazyPage>
    ),
  },

  // Embedded tour (no chrome, just viewer)
  {
    path: ROUTES.EMBED_TOUR,
    element: (
      <LazyPage>
        <EmbedTourPage />
      </LazyPage>
    ),
  },

  // Local spatial-tour harness (DEV ONLY) — renders properties/<id>/tour.json
  {
    path: ROUTES.LOCAL_TOUR,
    element: (
      <LazyPage>
        <LocalTourPage />
      </LazyPage>
    ),
  },

  // 404 fallback (eagerly loaded — no spinner on unknown routes)
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
