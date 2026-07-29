import { useRef } from 'react';
import { Sparkles, Target, Puzzle, FileText } from 'lucide-react';
import { useInView } from '@/components/animations';
import { AnimatedCounter } from './AnimatedCounter';
import { cn } from '@/utils';

const features = [
  {
    id: 'scene-detection',
    icon: Target,
    title: 'AI Scene Detection',
    description: 'Upload images. We identify every room automatically.',
    metric: { value: 95, suffix: '%', label: 'Accuracy' },
    large: true,
  },
  {
    id: 'auto-hotspots',
    icon: Sparkles,
    title: 'Auto Hotspots',
    description: 'Smart navigation placed automatically between scenes.',
    metric: null,
    large: false,
  },
  {
    id: 'tour-assembly',
    icon: Puzzle,
    title: 'Tour Assembly',
    description: 'Optimal tour flow generated in seconds.',
    metric: { value: 5, suffix: 'min', label: 'Avg. time' },
    large: false,
  },
  {
    id: 'ai-descriptions',
    icon: FileText,
    title: 'AI Descriptions',
    description: 'Generate SEO-friendly copy for every scene.',
    metric: null,
    large: false,
  },
];

export function AIShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { threshold: 0.15 });

  return (
    <section
      ref={sectionRef}
      id="features"
      className="landing-section bg-[var(--landing-bg)]"
    >
      <div className="max-w-[1400px] mx-auto">
        {/* Section header */}
        <div
          className={cn(
            'max-w-2xl',
            isInView && 'landing-animate-fade-in-up'
          )}
        >
          <span className="landing-eyebrow">AI-First Platform</span>
          <h2 className="mt-4 landing-headline text-[clamp(2rem,4vw,3rem)]">
            Let AI do the heavy lifting
          </h2>
          <p className="mt-4 landing-body text-lg max-w-xl">
            Our Vision Language Models understand your spaces and create professional tours automatically.
          </p>
        </div>

        {/* Bento grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Large feature card - Scene Detection */}
          <div
            className={cn(
              'lg:col-span-2 lg:row-span-2',
              'relative p-8 md:p-10 rounded-3xl',
              'bg-gradient-to-br from-[var(--landing-accent-subtle)] to-[var(--landing-bg)]',
              'border border-[var(--landing-accent)]/10',
              'group hover:border-[var(--landing-accent)]/30 transition-all duration-300',
              isInView && 'landing-animate-fade-in-up landing-delay-200'
            )}
          >
            {/* Decorative gradient orb */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--landing-accent)] opacity-[0.08] rounded-full blur-3xl" />

            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-[var(--landing-accent)] flex items-center justify-center">
                <Target className="w-7 h-7 text-white" />
              </div>

              <h3 className="mt-6 landing-headline text-2xl md:text-3xl">
                {features[0].title}
              </h3>

              <p className="mt-3 landing-body text-lg max-w-md">
                {features[0].description}
              </p>

              {/* Visual demo area */}
              <div className="mt-8 p-6 rounded-2xl bg-white/50 dark:bg-white/5 border border-[var(--landing-text-hero)]/5">
                <div className="grid grid-cols-4 gap-3">
                  {['Living Room', 'Kitchen', 'Bedroom', 'Bathroom'].map((room, idx) => (
                    <div
                      key={room}
                      className="aspect-square rounded-xl bg-gradient-to-br from-[var(--landing-text-hero)]/5 to-[var(--landing-text-hero)]/10 flex items-center justify-center text-xs font-medium text-[var(--landing-text-muted)] text-center p-2"
                      style={{
                        fontFamily: 'var(--font-body)',
                        animationDelay: `${idx * 100 + 500}ms`,
                      }}
                    >
                      {room}
                    </div>
                  ))}
                </div>
              </div>

              {/* Metric badge */}
              <div className="mt-6 inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white dark:bg-[#1A1A1F] shadow-lg">
                <span className="landing-headline text-xl landing-accent-text">
                  <AnimatedCounter end={95} suffix="%" isInView={isInView} />
                </span>
                <span className="text-sm text-[var(--landing-text-muted)]" style={{ fontFamily: 'var(--font-body)' }}>
                  Detection Accuracy
                </span>
              </div>
            </div>
          </div>

          {/* Smaller feature cards */}
          {features.slice(1).map((feature, idx) => (
            <div
              key={feature.id}
              className={cn(
                'relative p-6 md:p-8 rounded-3xl',
                'bg-white dark:bg-[#111111]',
                'border border-[var(--landing-text-hero)]/5',
                'group hover:border-[var(--landing-accent)]/30 hover:-translate-y-1',
                'transition-all duration-300',
                isInView && 'landing-animate-fade-in-up',
              )}
              style={{ animationDelay: `${(idx + 2) * 150}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-[var(--landing-accent-subtle)] flex items-center justify-center group-hover:bg-[var(--landing-accent)] transition-colors duration-300">
                <feature.icon className="w-6 h-6 text-[var(--landing-accent)] group-hover:text-white transition-colors duration-300" />
              </div>

              <h3 className="mt-5 landing-headline text-xl">
                {feature.title}
              </h3>

              <p className="mt-2 landing-body text-sm">
                {feature.description}
              </p>

              {feature.metric && (
                <div className="mt-4 pt-4 border-t border-[var(--landing-text-hero)]/5">
                  <span className="landing-headline text-lg landing-accent-text">
                    <AnimatedCounter
                      end={feature.metric.value}
                      suffix={feature.metric.suffix}
                      isInView={isInView}
                    />
                  </span>
                  <span className="ml-2 text-xs text-[var(--landing-text-muted)]" style={{ fontFamily: 'var(--font-body)' }}>
                    {feature.metric.label}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
