/**
 * Landing page — proxies Astro SSG from VPS.
 *
 * The Astro build lives at api.goberna.us/landing/ and is served by Nginx.
 * This Server Component fetches the HTML at build/request time and injects it
 * directly, so the user sees the Astro landing while the URL stays at /.
 *
 * Fallback: if the VPS is unreachable, renders the original Next.js landing.
 */

import { HeroSection } from "./_components/hero-section";
import { AboutSection } from "./_components/about-section";
import { PricingSection } from "./_components/pricing-section";
import { CtaSection } from "./_components/cta-section";

const ASTRO_LANDING_URL =
  process.env.ASTRO_LANDING_URL ?? "https://api.goberna.us/landing/";

export const revalidate = 60; // ISR: re-fetch from VPS every 60s

async function getAstroHTML(): Promise<string | null> {
  try {
    const res = await fetch(ASTRO_LANDING_URL, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export default async function LandingPage() {
  const astroHTML = await getAstroHTML();

  if (astroHTML) {
    return (
      <div
        id="astro-landing"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: astroHTML }}
      />
    );
  }

  // Fallback: original Next.js landing
  return (
    <>
      <HeroSection />
      <AboutSection />
      <PricingSection />
      <CtaSection />
    </>
  );
}
