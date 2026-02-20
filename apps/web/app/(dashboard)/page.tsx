"use client";

import { useAuth } from "../../lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Dashboard home — redirige según rol:
 *   admin      → /candidatos       (gestión de campañas)
 *   candidato  → /equipo           (gestión de equipo de su campaña)
 *   consultor  → /candidatos/[slug]/tierra  (mapa de la campaña activa)
 *   otros      → /equipo           (vista de equipo)
 *
 * Muestra un spinner mínimo mientras resuelve auth + campaña activa.
 */
export default function DashboardHomePage() {
  const { user, campaigns, activeCampaignId, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) return; // auth-context redirigirá a /login

    if (user.role === "admin") {
      router.replace("/candidatos");
      return;
    }

    // Candidato/jefe_campana → equipo (gestión de su equipo de campo)
    if (user.role === "candidato" || user.role === "jefe_campana" || user.role === "supervisor") {
      router.replace("/equipo");
      return;
    }

    // Consultor → mapa de territorio de la campaña activa
    if (user.role === "consultor") {
      const campaign =
        campaigns.find((c) => c.id === activeCampaignId) ?? campaigns[0];
      if (campaign?.slug) {
        router.replace(`/candidatos/${campaign.slug}/tierra`);
      } else {
        router.replace("/settings");
      }
      return;
    }

    // Otros roles (brigadista, agente, etc.) → equipo
    router.replace("/equipo");
  }, [isLoading, user, campaigns, activeCampaignId, router]);

  // Spinner mientras resuelve
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 12,
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
        color: "var(--color-text-tertiary)",
        fontSize: 14,
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          border: "2px solid var(--color-border)",
          borderTopColor: "var(--goberna-blue-600)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      Cargando...
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}
