import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useInView } from '@/components/animations';
import { ROUTES } from '@/constants';
import { cn } from '@/utils';

export function FinalCTA() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { threshold: 0.2 });

  return (
    <section
      ref={sectionRef}
      className="relative py-24 md:py-32 overflow-hidden"
    >
      {/* Dark background */}
      <div className="absolute inset-0 bg-[var(--landing-bg-dark)]" />

      {/* Gradient orbs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--landing-accent)] opacity-[0.08] rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[var(--landing-accent)] opacity-[0.05] rounded-full blur-3xl" />

      {/* Animated particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-[var(--landing-accent)] rounded-full opacity-30"
            style={{
              left: `${20 + i * 15}%`,
              top: `${30 + (i % 3) * 20}%`,
              animation: `float ${4 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      <div className="relative max-w-[900px] mx-auto px-6 text-center">
        {/* Headline */}
        <h2
          className={cn(
            'landing-headline text-[clamp(2rem,5vw,3.5rem)] text-white',
            isInView && 'landing-animate-fade-in-up'
          )}
        >
          Ready to transform how you
          <br />
          <span className="landing-accent-text">create virtual tours?</span>
        </h2>

        {/* Subtext */}
        <p
          className={cn(
            'mt-6 text-lg text-white/60',
            isInView && 'landing-animate-fade-in-up landing-delay-200'
          )}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Join thousands of professionals who save hours every week with AI-powered tour creation.
        </p>

        {/* CTA */}
        <div
          className={cn(
            'mt-10',
            isInView && 'landing-animate-fade-in-up landing-delay-400'
          )}
        >
          <Link
            to={ROUTES.REGISTER}
            className="inline-flex items-center gap-3 px-8 py-5 bg-[var(--landing-accent)] text-white text-lg font-semibold rounded-full hover:scale-105 hover:shadow-[0_0_40px_rgba(255,87,51,0.4)] transition-all duration-300 landing-animate-pulse-glow group"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Start Creating for Free
            <ArrowRight className="w-6 h-6 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Trust line */}
        <p
          className={cn(
            'mt-6 text-sm text-white/40',
            isInView && 'landing-animate-fade-in-up landing-delay-600'
          )}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          No credit card required • Setup in 2 minutes • Cancel anytime
        </p>
      </div>
    </section>
  );
}
