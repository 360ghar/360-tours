import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabaseAuth } from '@/lib/supabaseAuth';
import { authApi } from '@/api';
import { useAuthStore } from '@/stores';
import { setLastAuthMethod } from '@/lib/lastAuthMethod';
import { ROUTES } from '@/constants';
import { PageLoader } from '@/components/ui';

/**
 * Roles allowed into this INTERNAL tour viewer/creator tool. Google sign-in is
 * open to any Google account, but the staff-gate below bounces anyone who is
 * not provisioned staff (mirrors the role guard in ProtectedRoute).
 */
const STAFF_ROLES = new Set(['agent', 'admin']);

/**
 * OAuth (Google) redirect landing. Exchanges the `code` for a Supabase session,
 * then enforces the internal-tool staff-gate before letting the user into the
 * dashboard. The Zustand store's onAuthStateChange listener also picks up the
 * session and hydrates the user.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  // Guard against React 18 StrictMode double-invoke and code reuse.
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const code = searchParams.get('code');
    const errorParam = searchParams.get('error_description') || searchParams.get('error');
    const nextParam = searchParams.get('next');
    const safeNext =
      nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
        ? nextParam
        : ROUTES.DASHBOARD;

    async function handleCallback() {
      if (errorParam || !code) {
        navigate(`${ROUTES.LOGIN}?error=auth`, { replace: true });
        return;
      }

      try {
        await supabaseAuth.exchangeCodeForSession(code);

        // Staff-gate: only provisioned staff may use this internal tool.
        const user = await authApi.getCurrentUser();
        if (!STAFF_ROLES.has(user.role)) {
          await supabaseAuth.signOut().catch(() => {});
          clearAuth();
          navigate(`${ROUTES.LOGIN}?error=not_staff`, { replace: true });
          return;
        }

        setLastAuthMethod('google', user.email);
        void authApi.recordLastMethod('google');

        navigate(safeNext, { replace: true });
      } catch {
        await supabaseAuth.signOut().catch(() => {});
        clearAuth();
        navigate(`${ROUTES.LOGIN}?error=auth`, { replace: true });
      }
    }

    void handleCallback();
  }, [searchParams, navigate, clearAuth]);

  return <PageLoader message="Completing sign-in..." />;
}
