import { Link, useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui';
import { ROUTES } from '@/constants';

export function NotFoundPage() {
  const navigate = useNavigate();

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate(ROUTES.HOME);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] p-6">
      <main className="text-center" aria-labelledby="not-found-title">
        <p className="text-8xl font-bold text-[var(--color-primary-600)] sm:text-9xl">404</p>
        <h2 className="mt-4 text-2xl font-bold text-[var(--color-text-primary)]">
          <span id="not-found-title">Page Not Found</span>
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[var(--color-text-muted)]">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link to={ROUTES.HOME}>
            <Button>
              <Home className="h-4 w-4" />
              Go Home
            </Button>
          </Link>
          <Button variant="outline" onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
        </div>
      </main>
    </div>
  );
}
