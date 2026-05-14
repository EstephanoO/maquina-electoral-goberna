"use client";

/**
 * /decks — Presentaciones de candidatos generadas a través del onboarding.
 *
 * Lista todos los candidatos con su estado de deck (sin presentación / borrador / publicado).
 * Cada fila enlaza a:
 *   - /onboarding/[slug]/perfil   → editar el formulario (Fase 2)
 *   - /onboarding/[slug]/fase-2   → ver la presentación interactiva
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Edit3, FileText, Plus } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { listCampaigns } from "@/lib/services";
import { FONT_STACK } from "@/lib/constants";
import { PageHeader, Button } from "@/lib/ui";
import type { Campaign } from "@/lib/types";

type DeckStatus = "draft" | "pending_review" | "published" | "rejected";

type DeckRow = {
  id: string;
  campaign_id: string | null;
  status: DeckStatus;
  consultor_form: Record<string, unknown>;
  updated_at: string;
};

type CampaignWithDeck = Campaign & { deck?: DeckRow };

const STATUS_CONFIG: Record<
  DeckStatus | "none",
  { label: string; bg: string; color: string }
> = {
  none: { label: "Sin presentación", bg: "#1e2a3a", color: "#64748b" },
  draft: { label: "Borrador", bg: "#1c2a1a", color: "#4ade80" },
  pending_review: { label: "Por aprobar", bg: "#2a1f0a", color: "#fbbf24" },
  published: { label: "Publicado", bg: "#0f2a1a", color: "#34d399" },
  rejected: { label: "Rechazado", bg: "#2a0f0f", color: "#f87171" },
};

export default function DecksPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [campaigns, setCampaigns] = useState<CampaignWithDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (user && !isAdmin) router.replace("/home");
  }, [user, isAdmin, router]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignsRes, decksRes] = await Promise.all([
        listCampaigns(),
        api.get<{ ok: boolean; decks: DeckRow[] }>("/api/admin/decks/all"),
      ]);

      const decksById: Record<string, DeckRow> = {};
      if (decksRes.ok && decksRes.data) {
        for (const d of decksRes.data.decks) {
          if (d.campaign_id) decksById[d.campaign_id] = d;
        }
      }

      if (campaignsRes.ok && campaignsRes.data) {
        const merged: CampaignWithDeck[] = campaignsRes.data.campaigns.map((c) => ({
          ...c,
          deck: decksById[c.id],
        }));
        setCampaigns(merged);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchAll();
  }, [isAdmin, fetchAll]);

  if (user && !isAdmin) return null;

  const filtered = campaigns.filter(
    (c) =>
      search.trim() === "" ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.cargo ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", fontFamily: FONT_STACK }}>
      <div style={{ padding: "32px 32px 0" }}>
        <PageHeader
          title="Presentaciones"
          description="Presentaciones interactivas generadas a través del onboarding de candidatos."
          actions={
            <Button variant="primary" size="sm" onClick={() => router.push("/onboarding")}>
              <Plus size={14} style={{ marginRight: 6 }} />
              Nuevo Candidato
            </Button>
          }
        />
      </div>

      <div style={{ padding: "24px 32px 32px" }}>
        {/* Buscador */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Buscar candidato o cargo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              maxWidth: 360,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              fontFamily: FONT_STACK,
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>

        {loading ? (
          <div style={{ padding: 32, color: "var(--color-text-tertiary)" }}>Cargando…</div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: "48px 32px",
              textAlign: "center",
              color: "var(--color-text-tertiary)",
              border: "1px dashed var(--color-border)",
              borderRadius: 12,
            }}
          >
            <FileText size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: 14 }}>
              {search ? "No hay candidatos que coincidan." : "No hay candidatos registrados."}
            </p>
            <button
              onClick={() => router.push("/onboarding")}
              style={{
                marginTop: 16,
                padding: "8px 20px",
                borderRadius: 20,
                border: "1px solid var(--color-border)",
                background: "transparent",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: FONT_STACK,
              }}
            >
              + Agregar primer candidato
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((c) => {
              const statusKey = (c.deck?.status ?? "none") as DeckStatus | "none";
              const st = STATUS_CONFIG[statusKey];
              const color1 = c.config?.color_primario ?? "#1e40af";
              const initials = c.name
                .split(" ")
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase();

              return (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 16,
                    alignItems: "center",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    padding: "14px 18px",
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      overflow: "hidden",
                      flexShrink: 0,
                      border: `2px solid ${color1}40`,
                      background: `${color1}20`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      fontSize: 15,
                      color: color1,
                    }}
                  >
                    {c.foto_url ? (
                      <img
                        src={c.foto_url}
                        alt={c.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      initials
                    )}
                  </div>

                  {/* Info */}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-text-primary)" }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                      {[c.cargo, c.partido].filter(Boolean).join(" · ") || "Sin cargo asignado"}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: st.bg,
                          color: st.color,
                        }}
                      >
                        {st.label}
                      </span>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={() => router.push(`/onboarding/${c.slug}/perfil`)}
                      title="Editar formulario"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "1px solid var(--color-border)",
                        background: "transparent",
                        color: "var(--color-text-secondary)",
                        cursor: "pointer",
                        fontSize: 12,
                        fontFamily: FONT_STACK,
                        fontWeight: 600,
                      }}
                    >
                      <Edit3 size={12} />
                      Editar
                    </button>
                    <button
                      onClick={() => router.push(`/onboarding/${c.slug}/fase-2`)}
                      title="Ver presentación"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "none",
                        background: color1,
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                        fontFamily: FONT_STACK,
                        fontWeight: 700,
                      }}
                    >
                      <ExternalLink size={12} />
                      Ver presentación
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
