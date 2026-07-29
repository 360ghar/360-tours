import { Outlet, Link, useLocation } from 'react-router-dom';
import { ROUTES } from '@/constants';

export function AuthLayout() {
  const location = useLocation();
  const isLogin = location.pathname === ROUTES.LOGIN;

  return (
    <div className="flex min-h-screen">
      {/* Left Side - Form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          {/* Logo */}
          <div className="mb-8">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary">
                <span className="text-xl font-bold text-white">3</span>
              </div>
              <span className="text-xl font-bold text-[var(--color-text-primary)]">360 Viewer</span>
            </Link>
          </div>

          {/* Form Content */}
          <Outlet />

          {/* Footer Links */}
          <div className="mt-8 text-center text-sm text-[var(--color-text-muted)]">
            {isLogin ? (
              <>
                Don't have an account?{' '}
                <Link
                  to={ROUTES.REGISTER}
                  className="font-medium text-[var(--color-primary-600)] hover:text-[var(--color-primary-700)]"
                >
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <Link
                  to={ROUTES.LOGIN}
                  className="font-medium text-[var(--color-primary-600)] hover:text-[var(--color-primary-700)]"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right Side - Hero Image */}
      <div className="relative hidden w-0 flex-1 lg:block">
        <div className="absolute inset-0 gradient-primary opacity-90" />
        <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-white">
          <h2 className="mb-4 text-4xl font-bold">Create Stunning Virtual Tours</h2>
          <p className="max-w-md text-center text-lg text-white/90">
            Transform your 360° images into immersive virtual experiences. Easy to create, beautiful
            to view, powerful to share.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold">10K+</div>
              <div className="text-sm text-white/80">Tours Created</div>
            </div>
            <div>
              <div className="text-4xl font-bold">50K+</div>
              <div className="text-sm text-white/80">Active Users</div>
            </div>
            <div>
              <div className="text-4xl font-bold">1M+</div>
              <div className="text-sm text-white/80">Tour Views</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
