import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { consumeOAuthNext, supabaseAuth } from '@/lib/supabaseAuth';
import { authApi } from '@/api';
import { useAuthStore } from '@/stores';
import { setLastAuthMethod } from '@/lib/lastAuthMethod';
import { ROUTES } from '@/constants';
import { mapSupabaseAuthError } from '@/lib/authErrors';
import { PageLoader } from '@/components/ui';

/**
 * OAuth (Google) redirect landing. Exchanges the `code` for a Supabase session,
 * then sends the user to the stashed return path. Any signed-in 360Ghar user may
 * use 360 Tours, the same as with password and OTP sign-in. The Zustand store's onAuthStateChange listener also picks up the
 * session and hydrates the user.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  // Guard against React 18 StrictMode double-invoke and code reuse.
  const handledRef = useRef(false);
  // The OAuth return path is consumed exactly once. Reading it in render
  // would drop the stash on StrictMode's double-render; reading it inside the
  // handled effect makes it vulnerable to an effect re-run mid-flight. A
  // separate idempotent effect writes the ref once, and every later pass
  // (double-invoke, remount, re-navigation) sees the already-consumed value.
  const safeNextRef = useRef<string | null>(null);

  useEffect(() => {
    if (safeNextRef.current === null) {
      safeNextRef.current = consumeOAuthNext(searchParams.get('next'), ROUTES.DASHBOARD);
    }
  }, [searchParams]);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const code = searchParams.get('code');
    const errorParam = searchParams.get('error_description') || searchParams.get('error');
    // Prefer sessionStorage stash; URL ?next= is legacy fallback. The stash is
    // consumed by the effect above — this ref is StrictMode-stable.
    const safeNext = safeNextRef.current ?? ROUTES.DASHBOARD;

    async function handleCallback() {
      if (errorParam) {
        navigate(
          `${ROUTES.LOGIN}?error=${encodeURIComponent(errorParam)}`,
          { replace: true }
        );
        return;
      }
      if (!code) {
        navigate(`${ROUTES.LOGIN}?error=auth`, { replace: true });
        return;
      }

      try {
        await supabaseAuth.exchangeCodeForSession(code);

        const user = await authApi.getCurrentUser();

        setLastAuthMethod('google', user.email);
        void authApi.recordLastMethod('google');

        navigate(safeNext, { replace: true });
      } catch (err) {
        await supabaseAuth.signOut().catch(() => {});
        clearAuth();
        navigate(
          `${ROUTES.LOGIN}?error=${encodeURIComponent(mapSupabaseAuthError(err))}`,
          { replace: true }
        );
      }
    }

    void handleCallback();
  }, [searchParams, navigate, clearAuth]);

  return <PageLoader message="Completing sign-in..." />;
}
