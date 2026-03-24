import { HeroSection } from "./_components/hero-section";
import { AboutSection } from "./_components/about-section";
import { PricingSection } from "./_components/pricing-section";
import { CtaSection } from "./_components/cta-section";

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <AboutSection />
      <PricingSection />
      <CtaSection />
    </>
  );
}
