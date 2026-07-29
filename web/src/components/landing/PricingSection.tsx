import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, Sparkles } from 'lucide-react';
import { useInView } from '@/components/animations';
import { ROUTES } from '@/constants';
import { cn } from '@/utils';

const features = [
  'Unlimited tours & scenes',
  'Unlimited AI analyses',
  'All branding & customization',
  'Advanced analytics & insights',
  'Public sharing & embedding',
  'API access',
  'Team collaboration',
  'Priority community support',
];

export function PricingSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { threshold: 0.15 });

  return (
    <section
      ref={sectionRef}
      id="pricing"
      className="landing-section bg-[var(--landing-bg)]"
    >
      <div className="max-w-[1200px] mx-auto">
        <div
          className={cn(
            'text-center max-w-2xl mx-auto',
            isInView && 'landing-animate-fade-in-up'
          )}
        >
          <span className="landing-eyebrow">Pricing</span>
          <h2 className="mt-4 landing-headline text-[clamp(2rem,4vw,3rem)]">
            Everything included.
            <br />
            <span className="landing-accent-text">Nothing to upgrade.</span>
          </h2>
          <p className="mt-4 landing-body text-lg">
            All features are completely free for 360 Ghar users. No limits, no
            hidden fees.
          </p>
        </div>

        <div
          className={cn(
            'mt-12 md:mt-16 max-w-lg mx-auto',
            isInView && 'landing-animate-fade-in-up'
          )}
          style={{ animationDelay: '150ms' }}
        >
          <div className="relative z-0 rounded-3xl p-8 md:p-10 bg-white dark:bg-[#111111] border-2 border-[var(--landing-accent)] shadow-xl shadow-[var(--landing-accent)]/10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full uppercase tracking-wider bg-[var(--landing-accent-subtle)] text-[var(--landing-accent)]">
              <Sparkles className="w-3 h-3" />
              Completely Free
            </span>

            <h3
              className="mt-4 landing-headline text-2xl text-[var(--landing-text-hero)]"
            >
              Free
            </h3>

            <div className="mt-4 flex items-baseline gap-2">
              <span
                className="text-5xl font-bold text-[var(--landing-text-hero)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                $0
              </span>
              <span className="text-sm text-[var(--landing-text-muted)]" style={{ fontFamily: 'var(--font-body)' }}>
                forever
              </span>
            </div>

            <p
              className="mt-4 text-sm text-[var(--landing-text-body)]"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              All features for all 360 Ghar users at no cost.
            </p>

            <ul className="mt-8 space-y-4">
              {features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--landing-accent-subtle)] flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-[var(--landing-accent)]" />
                  </div>
                  <span
                    className="text-sm text-[var(--landing-text-body)]"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {feature}
                  </span>
                </li>
              ))}
            </ul>

            <Link
              to={ROUTES.REGISTER}
              className="mt-8 w-full landing-btn-primary justify-center group"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Link>

            <p
              className="mt-4 text-center text-xs text-[var(--landing-text-muted)]"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              No credit card required. Start creating in seconds.
            </p>

            <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-[var(--landing-accent)]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity -z-10" />
          </div>
        </div>
      </div>
    </section>
  );
}
