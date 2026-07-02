import { useRef } from 'react';
import { useInView } from '@/components/animations';
import { cn } from '@/utils';

// Neutral professional categories (avoids implying endorsements from
// real, named companies that are not actually customers).
const logos = [
  { name: 'Real Estate Agents', width: 160 },
  { name: 'Property Developers', width: 180 },
  { name: 'Interior Designers', width: 170 },
  { name: 'Architecture Firms', width: 170 },
  { name: 'Hospitality Groups', width: 180 },
  { name: 'Rental Platforms', width: 160 },
];

export function SocialProofBar() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { threshold: 0.2 });

  return (
    <div
      ref={sectionRef}
      className={cn(
        'py-12 md:py-16 bg-[var(--landing-bg)] border-y border-[var(--landing-text-hero)]/5',
        'overflow-hidden'
      )}
    >
      <div
        className={cn(
          'text-center mb-8',
          isInView && 'landing-animate-fade-in-up'
        )}
      >
        <p
          className="landing-eyebrow"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Trusted by 10,000+ real estate professionals worldwide
        </p>
      </div>

      {/* Logo marquee */}
      <div className="relative">
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[var(--landing-bg)] to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[var(--landing-bg)] to-transparent z-10" />

        <div
          className={cn(
            'flex items-center gap-16',
            isInView && 'landing-animate-marquee'
          )}
          style={{ width: 'max-content' }}
        >
          {/* First set of logos */}
          {logos.map((logo, idx) => (
            <div
              key={`logo-1-${idx}`}
              className="flex items-center justify-center h-8 opacity-40 hover:opacity-70 transition-opacity"
              style={{ minWidth: logo.width }}
            >
              <span
                className="text-lg font-semibold text-[var(--landing-text-hero)] whitespace-nowrap"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {logo.name}
              </span>
            </div>
          ))}
          {/* Duplicate for seamless loop */}
          {logos.map((logo, idx) => (
            <div
              key={`logo-2-${idx}`}
              className="flex items-center justify-center h-8 opacity-40 hover:opacity-70 transition-opacity"
              style={{ minWidth: logo.width }}
            >
              <span
                className="text-lg font-semibold text-[var(--landing-text-hero)] whitespace-nowrap"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {logo.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
