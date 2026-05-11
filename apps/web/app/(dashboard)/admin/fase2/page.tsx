"use client";

/**
 * /admin/fase2 — Lista de decks Fase 2 esperando aprobación.
 *
 * El admin (proyecto@grupogoberna) ve todos los decks en pending_review
 * con filtros por consultor / jurisdicción / fecha. Click en una row
 * abre /admin/fase2/[slug].
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Clock, Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { PageHeader, Tabs } from "@/lib/ui";

type DeckStatus = "draft" | "pending_review" | "published" | "rejected";

type DeckRow = {
  id: string;
  candidato_id: number;
  candidato_nombres: string;
  campaign_slug: string | null;
  campaign_name: string | null;
  uploader_full_name: string;
  uploader_email: string;
  title: string;
  type: "diagnostico" | "analisis" | "plan" | "episodico" | "otro";
  status: DeckStatus;
  created_at: string;
  submitted_for_review_at: string | null;
  published_at: string | null;
  rejection_reason: string | null;
};

const STATUS_LABEL: Record<DeckStatus, string> = {
  draft: "Drafts",
  pending_review: "Por aprobar",
  published: "Publicados",
  rejected: "Rechazados",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-PE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminFase2ListPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [tab, setTab] = useState<DeckStatus>("pending_review");
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDecks = useCallback(async (status: DeckStatus) => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; decks: DeckRow[] }>(
        `/api/admin/decks?status=${status}`,
      );
      setDecks(res.ok && res.data ? res.data.decks : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) {
      router.push("/home");
      return;
    }
    fetchDecks(tab);
  }, [user, isAdmin, router, tab, fetchDecks]);

  // Filtrar solo decks Fase 2 (type='diagnostico' es la convención canónica)
  const fase2Decks = decks.filter((d) => d.type === "diagnostico");

  return (
    <div className="min-h-screen">
      <div style={{ padding: "32px 32px 0" }}>
        <PageHeader
          title="Fase 2 · Revisión"
          description="Diagnósticos esperando aprobación de proyecto@grupogoberna"
        />
      </div>

      <div style={{ padding: "0 32px 32px" }}>
        <Tabs
          tabs={[
            { id: "pending_review", label: STATUS_LABEL.pending_review },
            { id: "draft", label: STATUS_LABEL.draft },
            { id: "published", label: STATUS_LABEL.published },
            { id: "rejected", label: STATUS_LABEL.rejected },
          ]}
          activeTab={tab}
          onChange={(id) => setTab(id as DeckStatus)}
        />

        <div style={{ marginTop: 16 }}>
          {loading ? (
            <div
              style={{
                padding: 64,
                color: "var(--color-text-tertiary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : fase2Decks.length === 0 ? (
            <div
              style={{
                padding: 64,
                textAlign: "center",
                color: "var(--color-text-tertiary)",
              }}
            >
              No hay decks Fase 2 en {STATUS_LABEL[tab].toLowerCase()}.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {fase2Decks.map((d) => {
                const targetSlug = d.campaign_slug;
                return (
                  <button
                    key={d.id}
                    onClick={() =>
                      targetSlug
                        ? router.push(`/admin/fase2/${targetSlug}`)
                        : null
                    }
                    disabled={!targetSlug}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto auto auto",
                      gap: 16,
                      alignItems: "center",
                      padding: "14px 16px",
                      borderRadius: 8,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      cursor: targetSlug ? "pointer" : "not-allowed",
                      textAlign: "left",
                      transition: "background 0.15s",
                    }}
                    className="hover:bg-amber-400/5"
                  >
                    {/* Candidato + jurisdicción */}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--color-text-primary)",
                          fontSize: 15,
                          marginBottom: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.candidato_nombres}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--color-text-tertiary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.campaign_name ?? "—"} · {targetSlug ?? "sin slug"}
                      </div>
                    </div>

                    {/* Consultor */}
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                      por {d.uploader_full_name}
                    </div>

                    {/* Fecha relevante */}
                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                      <Clock className="size-3 inline mr-1" />
                      {fmtDate(
                        tab === "pending_review"
                          ? d.submitted_for_review_at
                          : tab === "published"
                            ? d.published_at
                            : d.created_at,
                      )}
                    </div>

                    {/* Status pill */}
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        padding: "4px 10px",
                        borderRadius: 999,
                        background:
                          d.status === "pending_review"
                            ? "rgba(251,191,36,0.15)"
                            : d.status === "published"
                              ? "rgba(16,185,129,0.15)"
                              : d.status === "rejected"
                                ? "rgba(239,68,68,0.15)"
                                : "rgba(156,163,175,0.15)",
                        color:
                          d.status === "pending_review"
                            ? "#fbbf24"
                            : d.status === "published"
                              ? "#10b981"
                              : d.status === "rejected"
                                ? "#ef4444"
                                : "#9ca3af",
                      }}
                    >
                      {STATUS_LABEL[d.status]}
                    </div>

                    <ChevronRight className="size-4 text-gray-500" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
