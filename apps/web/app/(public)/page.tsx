import { HeroSection } from "./_components/hero-section";
import { AboutSection } from "./_components/about-section";
import { RegionalLeadersSection } from "./_components/regional-leaders-section";
import { PricingSection } from "./_components/pricing-section";
import { CtaSection } from "./_components/cta-section";

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <AboutSection />
      <RegionalLeadersSection />
      <PricingSection />
      <CtaSection />
    </>
  );
}
