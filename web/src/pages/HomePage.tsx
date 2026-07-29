import {
  HeroSection,
  SocialProofBar,
  AIShowcase,
  HowItWorks,
  FeaturesGrid,
  PricingSection,
  FinalCTA,
} from '@/components/landing';
import { MetaTags } from '@/components/common/MetaTags';

export function HomePage() {
  return (
    <>
      <MetaTags
        title="AI-Powered Virtual Tours"
        description="Create immersive 360 degree virtual tours with AI-assisted scene analysis, hotspot generation, sharing, embeds, analytics, branding, and floor plans."
        keywords={['360 virtual tours', 'AI tour builder', 'real estate virtual tours']}
      />

      {/* Hero Section - Full viewport with animated 360 demo */}
      <HeroSection />

      {/* Social Proof - Logo marquee */}
      <SocialProofBar />

      {/* AI Showcase - Bento grid of AI features */}
      <AIShowcase />

      {/* How It Works - 3-step process */}
      <HowItWorks />

      {/* Features Grid - All platform capabilities */}
      <FeaturesGrid />

      {/* Pricing - Free + Pro tiers */}
      <PricingSection />

      {/* Final CTA - Bold closing statement */}
      <FinalCTA />
    </>
  );
}
