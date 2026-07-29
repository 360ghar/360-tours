import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Demo360Viewer } from './Demo360Viewer';
import { useInView } from '@/components/animations';
import { ROUTES } from '@/constants';
import { cn } from '@/utils';

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { threshold: 0.1 });

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center overflow-hidden bg-[var(--landing-bg)] pt-16 md:pt-20 lg:pt-24"
    >
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-[var(--landing-accent)] opacity-[0.03] rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-[var(--landing-accent)] opacity-[0.05] rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-2 h-2 bg-[var(--landing-accent)] rounded-full opacity-40" />
        <div className="absolute top-1/2 left-1/3 w-1.5 h-1.5 bg-[var(--landing-accent)] rounded-full opacity-30" />
        <div className="absolute bottom-1/3 left-1/4 w-1 h-1 bg-[var(--landing-accent)] rounded-full opacity-50" />
      </div>

      <div className="relative w-full max-w-[1400px] mx-auto px-6 md:px-12 lg:px-16 py-8 md:py-12 lg:py-0">
        <div className="grid lg:grid-cols-[1.1fr,1fr] gap-12 lg:gap-16 items-center">
          {/* Left column - Content */}
          <div className="relative z-10">
            {/* Badge */}
            <div
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-full',
                'bg-[var(--landing-accent-subtle)] border border-[var(--landing-accent)]/20',
                isInView && 'landing-animate-fade-in-up'
              )}
            >
              <Sparkles className="w-4 h-4 text-[var(--landing-accent)]" />
              <span className="text-sm font-medium text-[var(--landing-accent)]" style={{ fontFamily: 'var(--font-body)' }}>
                AI-Powered Tour Creation
              </span>
            </div>

            {/* Headline */}
            <h1
              className={cn(
                'mt-8 landing-headline',
                'text-[clamp(2.5rem,6vw,4.5rem)]',
                isInView && 'landing-animate-fade-in-up landing-delay-200'
              )}
            >
              Create virtual tours in{' '}
              <span className="landing-accent-text">5 minutes</span>
              <span className="text-[var(--landing-text-muted)]">,</span>
              <br />
              not 30
            </h1>

            {/* Subheadline */}
            <p
              className={cn(
                'mt-6 text-lg md:text-xl max-w-lg landing-subhead',
                isInView && 'landing-animate-fade-in-up landing-delay-400'
              )}
            >
              AI-powered 360° tours that create themselves. Upload your images, let our AI handle scene detection, hotspot placement, and tour assembly.
            </p>

            {/* CTAs */}
            <div
              className={cn(
                'mt-10 flex flex-wrap gap-4',
                isInView && 'landing-animate-fade-in-up landing-delay-600'
              )}
            >
              <Link to={ROUTES.REGISTER} className="landing-btn-primary group">
                Start Free
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#pricing" className="landing-btn-secondary">
                View Pricing
              </a>
            </div>

            {/* Stats row */}
            <div
              className={cn(
                'mt-12 pt-8 border-t border-[var(--landing-text-hero)]/10',
                'grid grid-cols-3 gap-8',
                isInView && 'landing-animate-fade-in-up landing-delay-800'
              )}
            >
              <div>
                <div className="landing-headline text-2xl md:text-3xl">10k+</div>
                <div className="mt-1 text-sm text-[var(--landing-text-muted)]" style={{ fontFamily: 'var(--font-body)' }}>
                  Tours Created
                </div>
              </div>
              <div>
                <div className="landing-headline text-2xl md:text-3xl">80%</div>
                <div className="mt-1 text-sm text-[var(--landing-text-muted)]" style={{ fontFamily: 'var(--font-body)' }}>
                  Time Saved
                </div>
              </div>
              <div>
                <div className="landing-headline text-2xl md:text-3xl">95%</div>
                <div className="mt-1 text-sm text-[var(--landing-text-muted)]" style={{ fontFamily: 'var(--font-body)' }}>
                  AI Accuracy
                </div>
              </div>
            </div>
          </div>

          {/* Right column - 360 Viewer Demo */}
          <div
            className={cn(
              'relative lg:ml-8',
              isInView && 'landing-animate-fade-in-left landing-delay-700'
            )}
          >
            <div className="relative landing-animate-float">
              {/* Glow effect behind viewer */}
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--landing-accent)]/20 to-transparent rounded-2xl blur-2xl transform scale-105" />

              {/* The 360 viewer */}
              <Demo360Viewer className="relative transform rotate-[-2deg]" />

              {/* Floating label */}
              <div
                className="absolute -bottom-4 -left-4 md:-left-8 px-4 py-2 bg-white dark:bg-[#1A1A1F] rounded-xl shadow-xl"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-medium text-[var(--landing-text-hero)]">
                    Auto-rotating preview
                  </span>
                </div>
              </div>

              {/* Hotspot indicator */}
              <div
                className="absolute top-8 -right-2 md:-right-6 px-3 py-1.5 bg-[var(--landing-accent)] text-white rounded-lg shadow-lg text-sm font-medium"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                AI Hotspots
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-50">
        <span className="text-xs uppercase tracking-widest text-[var(--landing-text-muted)]" style={{ fontFamily: 'var(--font-body)' }}>
          Scroll
        </span>
        <div className="w-px h-8 bg-gradient-to-b from-[var(--landing-text-muted)] to-transparent" />
      </div>
    </section>
  );
}
