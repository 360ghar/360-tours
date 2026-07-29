import { useRef } from 'react';
import { Upload, Sparkles, Share2 } from 'lucide-react';
import { useInView } from '@/components/animations';
import { cn } from '@/utils';

const steps = [
  {
    number: '01',
    icon: Upload,
    title: 'Upload',
    subtitle: 'Drop your 360° images',
    description: 'Batch upload entire property shoots at once. We support all major formats.',
  },
  {
    number: '02',
    icon: Sparkles,
    title: 'AI Magic',
    subtitle: 'Our AI does the work',
    description: 'Scene detection, hotspot placement, and tour assembly—all automatic.',
  },
  {
    number: '03',
    icon: Share2,
    title: 'Share',
    subtitle: 'Publish anywhere',
    description: 'Custom domain, embed code, or direct link. Your tour, your way.',
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { threshold: 0.15 });

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="landing-section bg-[var(--landing-bg-dark)] text-white relative overflow-hidden"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0B] via-[#0F0F12] to-[#0A0A0B]" />

      {/* Decorative elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--landing-accent)] opacity-[0.03] rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[var(--landing-accent)] opacity-[0.05] rounded-full blur-3xl" />

      <div className="relative max-w-[1400px] mx-auto">
        {/* Section header */}
        <div
          className={cn(
            'text-center max-w-2xl mx-auto',
            isInView && 'landing-animate-fade-in-up'
          )}
        >
          <span className="landing-eyebrow">How It Works</span>
          <h2 className="mt-4 landing-headline text-[clamp(2rem,4vw,3rem)] text-white">
            Three steps. Five minutes.
            <br />
            <span className="text-[var(--landing-accent)]">Tour ready.</span>
          </h2>
        </div>

        {/* Steps */}
        <div className="mt-16 md:mt-24 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--landing-accent)]/30 to-transparent -translate-y-1/2" />

          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {steps.map((step, idx) => (
              <div
                key={step.number}
                className={cn(
                  'relative group',
                  isInView && 'landing-animate-fade-in-up'
                )}
                style={{ animationDelay: `${(idx + 1) * 200}ms` }}
              >
                {/* Large background number */}
                <span
                  className="absolute -top-8 left-0 text-[8rem] md:text-[10rem] font-bold opacity-[0.03] leading-none select-none pointer-events-none"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {step.number}
                </span>

                <div className="relative bg-white/[0.02] border border-white/[0.05] rounded-3xl p-8 md:p-10 hover:bg-white/[0.04] hover:border-[var(--landing-accent)]/20 transition-all duration-300">
                  {/* Icon */}
                  <div className="w-16 h-16 rounded-2xl bg-[var(--landing-accent)]/10 border border-[var(--landing-accent)]/20 flex items-center justify-center group-hover:bg-[var(--landing-accent)] group-hover:border-transparent transition-all duration-300">
                    <step.icon className="w-8 h-8 text-[var(--landing-accent)] group-hover:text-white transition-colors duration-300" />
                  </div>

                  {/* Content */}
                  <div className="mt-6">
                    <span
                      className="text-sm font-medium text-[var(--landing-accent)]"
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      Step {step.number}
                    </span>
                    <h3 className="mt-2 landing-headline text-2xl text-white">
                      {step.title}
                    </h3>
                    <p
                      className="mt-1 text-lg text-white/60"
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      {step.subtitle}
                    </p>
                    <p
                      className="mt-4 text-sm text-white/40 leading-relaxed"
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      {step.description}
                    </p>
                  </div>

                  {/* Arrow connector (mobile: down, desktop: right) */}
                  {idx < steps.length - 1 && (
                    <>
                      {/* Desktop arrow */}
                      <div className="hidden lg:block absolute -right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-[var(--landing-bg-dark)] border border-white/10 flex items-center justify-center z-10">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[var(--landing-accent)]">
                          <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      {/* Mobile arrow */}
                      <div className="lg:hidden flex justify-center mt-8">
                        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-[var(--landing-accent)] rotate-90">
                            <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Time comparison */}
        <div
          className={cn(
            'mt-16 md:mt-24 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12',
            isInView && 'landing-animate-fade-in-up landing-delay-800'
          )}
        >
          <div className="text-center">
            <span
              className="text-5xl md:text-6xl font-bold text-white/20 line-through"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              30+
            </span>
            <p className="mt-1 text-sm text-white/30" style={{ fontFamily: 'var(--font-body)' }}>
              Minutes before
            </p>
          </div>

          <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/20 to-transparent hidden md:block" />
          <div className="w-16 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent md:hidden" />

          <div className="text-center">
            <span
              className="text-5xl md:text-6xl font-bold text-[var(--landing-accent)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              5
            </span>
            <p className="mt-1 text-sm text-[var(--landing-accent)]" style={{ fontFamily: 'var(--font-body)' }}>
              Minutes with AI
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
