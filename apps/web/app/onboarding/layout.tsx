"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth-context";

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, campaigns, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Extrae el slug de /onboarding/[slug]/fase-2
  const fase2SlugMatch = pathname?.match(/^\/onboarding\/([^/]+)\/fase-2/);
  const routeSlug = fase2SlugMatch?.[1] ?? null;

  // Candidato: solo puede ver la fase-2 de su propia campaign
  const isCandidatoOwnFase2 =
    user?.role === "candidato" &&
    routeSlug !== null &&
    campaigns.some((c) => c.slug === routeSlug);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const isConsultorOrAdmin = user.role === "admin" || user.role === "consultor";
    if (!isConsultorOrAdmin && !isCandidatoOwnFase2) {
      router.replace("/home");
    }
  }, [user, isLoading, router, isCandidatoOwnFase2]);

  if (isLoading) return null;
  const isConsultorOrAdmin = user?.role === "admin" || user?.role === "consultor";
  if (!user) return null;
  if (!isConsultorOrAdmin && !isCandidatoOwnFase2) return null;

  return <>{children}</>;
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <OnboardingGuard>{children}</OnboardingGuard>
    </AuthProvider>
  );
}
