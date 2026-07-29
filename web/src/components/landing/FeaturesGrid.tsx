import { useRef } from 'react';
import {
  Palette,
  Globe,
  BarChart3,
  Map,
  Glasses,
  Video,
  Share2,
  Code2,
  Plug,
} from 'lucide-react';
import { useInView } from '@/components/animations';
import { cn } from '@/utils';

const features = [
  {
    icon: Palette,
    title: 'White-Label Branding',
    description: 'Custom logo, colors, and styling. Your brand, your tours.',
  },
  {
    icon: Globe,
    title: 'Custom Domains',
    description: 'Host tours on tours.yourbrand.com with automatic SSL.',
  },
  {
    icon: BarChart3,
    title: 'Advanced Analytics',
    description: 'Heatmaps, engagement metrics, and conversion tracking.',
  },
  {
    icon: Map,
    title: 'Floor Plan Integration',
    description: 'Interactive 2D floor plans linked to 3D views.',
  },
  {
    icon: Glasses,
    title: 'VR/WebXR Support',
    description: 'Immersive viewing on any VR headset or device.',
  },
  {
    icon: Video,
    title: 'Video Integration',
    description: 'Embed videos directly within your tour scenes.',
  },
  {
    icon: Share2,
    title: 'Social Sharing',
    description: 'One-click share to all major social platforms.',
  },
  {
    icon: Code2,
    title: 'Embed Anywhere',
    description: 'iframe, JavaScript SDK, or React component.',
  },
  {
    icon: Plug,
    title: 'API Access',
    description: 'Full REST API for custom integrations.',
  },
];

export function FeaturesGrid() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { threshold: 0.1 });

  return (
    <section
      ref={sectionRef}
      className="landing-section bg-[var(--landing-bg)]"
    >
      <div className="max-w-[1400px] mx-auto">
        {/* Section header - offset left for asymmetry */}
        <div
          className={cn(
            'md:ml-8 lg:ml-16',
            isInView && 'landing-animate-fade-in-up'
          )}
        >
          <span className="landing-eyebrow">Platform Capabilities</span>
          <h2 className="mt-4 landing-headline text-[clamp(2rem,4vw,3rem)]">
            Everything you need,
            <br />
            <span className="text-[var(--landing-text-muted)]">nothing you don&apos;t</span>
          </h2>
        </div>

        {/* Features grid */}
        <div className="mt-12 md:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {features.map((feature, idx) => (
            <div
              key={feature.title}
              className={cn(
                'group relative p-6 md:p-8 rounded-2xl',
                'bg-white dark:bg-[#111111]',
                'border border-[var(--landing-text-hero)]/5',
                'hover:border-[var(--landing-accent)]/30 hover:-translate-y-1 hover:shadow-xl',
                'transition-all duration-300',
                isInView && 'landing-animate-fade-in-up'
              )}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-[var(--landing-accent-subtle)] flex items-center justify-center group-hover:bg-[var(--landing-accent)] transition-colors duration-300">
                <feature.icon className="w-6 h-6 text-[var(--landing-accent)] group-hover:text-white transition-colors duration-300" />
              </div>

              {/* Content */}
              <h3 className="mt-5 landing-headline text-lg">
                {feature.title}
              </h3>
              <p className="mt-2 landing-body text-sm">
                {feature.description}
              </p>

              {/* Hover corner accent */}
              <div className="absolute bottom-0 right-0 w-16 h-16 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute bottom-2 right-2 w-8 h-8 border-b-2 border-r-2 border-[var(--landing-accent)]/20 rounded-br-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
