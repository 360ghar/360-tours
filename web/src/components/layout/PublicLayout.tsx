import { Outlet, Link, useLocation } from 'react-router-dom';
import { Moon, Sun, Monitor, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ROUTES } from '@/constants';
import { useUIStore } from '@/stores';
import { cn } from '@/utils';

export function PublicLayout() {
  const { theme, toggleTheme } = useUIStore();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isLandingPage = location.pathname === '/';
  const mobileMenuId = 'public-mobile-menu';
  const mobileMenuTabIndex = mobileMenuOpen ? undefined : -1;

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--landing-bg)]">
      {/* Header */}
      <header
        className={cn(
          'sticky top-0 z-[var(--z-sticky)] transition-all duration-300',
          isLandingPage
            ? 'border-b border-transparent bg-[var(--landing-bg)]/80 backdrop-blur-md'
            : 'border-b border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur'
        )}
      >
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6 md:px-12 lg:px-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--landing-accent)] transition-transform group-hover:scale-105">
              <span
                className="text-lg font-bold text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                360
              </span>
            </div>
            <span
              className="text-lg font-bold text-[var(--landing-text-hero)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Tours
            </span>
          </Link>

          {/* Desktop Navigation */}
          {isLandingPage ? (
            <nav className="hidden items-center gap-8 md:flex">
              <a
                href="#features"
                className="text-sm font-medium text-[var(--landing-text-body)] hover:text-[var(--landing-accent)] transition-colors"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Features
              </a>
              <a
                href="#pricing"
                className="text-sm font-medium text-[var(--landing-text-body)] hover:text-[var(--landing-accent)] transition-colors"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Pricing
              </a>
              <a
                href="#how-it-works"
                className="text-sm font-medium text-[var(--landing-text-body)] hover:text-[var(--landing-accent)] transition-colors"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                How It Works
              </a>
            </nav>
          ) : (
            <nav className="hidden items-center gap-8 md:flex">
              <a
                href="/#features"
                className="text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Features
              </a>
              <a
                href="/#pricing"
                className="text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Pricing
              </a>
            </nav>
          )}

          {/* Right side actions */}
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-[var(--landing-text-body)] transition-colors hover:bg-[var(--landing-accent-subtle)] hover:text-[var(--landing-accent)]"
              aria-label={`Switch theme. Current theme: ${theme}`}
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : theme === 'light' ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Monitor className="h-5 w-5" />
              )}
            </button>

            {/* Desktop auth links */}
            <div className="hidden items-center gap-3 md:flex">
              <Link
                to={ROUTES.LOGIN}
                className={cn(
                  'text-sm font-medium transition-colors',
                  isLandingPage
                    ? 'text-[var(--landing-text-body)] hover:text-[var(--landing-accent)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                )}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Sign in
              </Link>
              <Link
                to={ROUTES.REGISTER}
                className="rounded-full bg-[var(--landing-accent)] px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--landing-accent-hover)] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[var(--landing-accent)]/20"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Get Started
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden rounded-lg p-2 text-[var(--landing-text-body)] hover:bg-[var(--landing-accent-subtle)]"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls={mobileMenuId}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          id={mobileMenuId}
          aria-hidden={!mobileMenuOpen}
          className={cn(
            'md:hidden border-t border-[var(--landing-text-hero)]/5 bg-[var(--landing-bg)] overflow-hidden transition-all duration-300 ease-in-out',
            mobileMenuOpen ? 'max-h-96' : 'max-h-0 border-t-0 pointer-events-none'
          )}
        >
          <div className="px-6 py-4 space-y-3">
            {isLandingPage && (
              <>
                <a
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  tabIndex={mobileMenuTabIndex}
                  className="block py-2 text-sm font-medium text-[var(--landing-text-body)]"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  Features
                </a>
                <a
                  href="#pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  tabIndex={mobileMenuTabIndex}
                  className="block py-2 text-sm font-medium text-[var(--landing-text-body)]"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  Pricing
                </a>
                <a
                  href="#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  tabIndex={mobileMenuTabIndex}
                  className="block py-2 text-sm font-medium text-[var(--landing-text-body)]"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  How It Works
                </a>
              </>
            )}
            <div className="pt-3 border-t border-[var(--landing-text-hero)]/5 flex items-center gap-3">
              <Link
                to={ROUTES.LOGIN}
                onClick={() => setMobileMenuOpen(false)}
                tabIndex={mobileMenuTabIndex}
                className="text-sm font-medium text-[var(--landing-text-body)]"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Sign in
              </Link>
              <Link
                to={ROUTES.REGISTER}
                onClick={() => setMobileMenuOpen(false)}
                tabIndex={mobileMenuTabIndex}
                className="rounded-full bg-[var(--landing-accent)] px-5 py-2 text-sm font-semibold text-white"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-[var(--landing-bg-dark)] text-white py-16 px-6">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--landing-accent)]">
                  <span
                    className="text-lg font-bold text-white"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    360
                  </span>
                </div>
                <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  Tours
                </span>
              </div>
              <p
                className="mt-4 text-sm text-white/50 max-w-xs"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                AI-powered virtual tour creation. Create stunning tours in minutes, not hours.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4
                className="text-sm font-semibold uppercase tracking-wider text-white/70"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Product
              </h4>
              <ul className="mt-4 space-y-3">
                <li>
                  <a
                    href="/#features"
                    className="text-sm text-white/50 hover:text-white transition-colors"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="/#pricing"
                    className="text-sm text-white/50 hover:text-white transition-colors"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    Pricing
                  </a>
                </li>
                <li>
                  <span
                    aria-disabled="true"
                    className="text-sm text-white/30 cursor-not-allowed"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    API
                  </span>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4
                className="text-sm font-semibold uppercase tracking-wider text-white/70"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Company
              </h4>
              <ul className="mt-4 space-y-3">
                {['About', 'Blog', 'Careers', 'Contact'].map(item => (
                  <li key={item}>
                    <span
                      aria-disabled="true"
                      className="text-sm text-white/30 cursor-not-allowed"
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4
                className="text-sm font-semibold uppercase tracking-wider text-white/70"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Legal
              </h4>
              <ul className="mt-4 space-y-3">
                {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map(item => (
                  <li key={item}>
                    <span
                      aria-disabled="true"
                      className="text-sm text-white/30 cursor-not-allowed"
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-white/40" style={{ fontFamily: 'var(--font-body)' }}>
              © {new Date().getFullYear()} 360 Tours. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              {['Twitter', 'LinkedIn', 'GitHub'].map(social => (
                <span
                  key={social}
                  aria-disabled="true"
                  className="text-sm text-white/20 cursor-not-allowed"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {social}
                </span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
