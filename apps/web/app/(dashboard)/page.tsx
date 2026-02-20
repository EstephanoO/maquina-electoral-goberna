"use client";

import { useAuth } from "../../lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Dashboard home — redirige según rol:
 *   admin     → /candidatos        (gestión de campañas)
 *   cualquier otro → /candidatos/[slug]/tierra  (mapa de su campaña activa)
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

    // Para cualquier otro rol (candidato, consultor, brigadista, etc.)
    // usar la campaña activa o la primera disponible
    const campaign =
      campaigns.find((c) => c.id === activeCampaignId) ?? campaigns[0];

    if (campaign?.slug) {
      router.replace(`/candidatos/${campaign.slug}/tierra`);
    } else {
      // Sin campaña asignada todavía — no redirigir en loop
      router.replace("/settings");
    }
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
