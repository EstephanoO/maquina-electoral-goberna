"use client";

/**
 * /candidatos/[slug]/decks — vista del candidato (y de su equipo) de los
 * decks que el consultor político subió + admin publicó.
 *
 * - Lista: cards con tipo, título, fecha publicación, autor consultor.
 * - Click → SlideOver con iframe sandbox del HTML completo + botón "abrir
 *   en pestaña nueva" + botón "descargar HTML".
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { FONT_STACK } from "@/lib/constants";
import { SlideOver } from "@/lib/ui";

type Deck = {
  id: string;
  candidato_id: number;
  candidato_nombres: string;
  uploader_full_name: string;
  uploader_email: string;
  title: string;
  type: "diagnostico" | "analisis" | "plan" | "episodico" | "otro";
  description: string | null;
  status: "draft" | "published" | "rejected";
  size_bytes: number | null;
  created_at: string;
  published_at: string | null;
};

const TYPE_LABEL: Record<Deck["type"], string> = {
  diagnostico: "Diagnóstico",
  analisis: "Análisis",
  plan: "Plan",
  episodico: "Episódico",
  otro: "Otro",
};

const TYPE_COLOR: Record<Deck["type"], string> = {
  diagnostico: "#0a1f4a",
  analisis: "#fbbf24",
  plan: "#0a1f4a",
  episodico: "#dc2626",
  otro: "#6b7280",
};

export default function CandidatoDecksPage() {
  const { campaigns, activeCampaignId } = useAuth();
  const { slug } = useParams<{ slug: string }>();

  const campaign =
    campaigns.find((c) => c.slug === slug) ??
    campaigns.find((c) => c.id === activeCampaignId);

  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Deck | null>(null);

  const fetchDecks = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; decks: Deck[] }>(
        `/api/candidato/decks?campaign_id=${cid}`,
      );
      if (res.ok && res.data) setDecks(res.data.decks ?? []);
      else setDecks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (campaign?.id) fetchDecks(campaign.id);
  }, [campaign?.id, fetchDecks]);

  if (!campaign) {
    return (
      <div style={{ padding: 32, fontFamily: FONT_STACK, color: "var(--color-text-tertiary)" }}>
        Selecciona una campaña primero.
      </div>
    );
  }

  return (
    <div style={{ padding: 32, fontFamily: FONT_STACK, minHeight: "100%" }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "var(--color-text-tertiary)", marginBottom: 4 }}>
          {campaign.name}
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "var(--color-text-primary)" }}>
          Presentaciones
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--color-text-secondary)" }}>
          Decks publicados por tus consultores Goberna.
        </p>
      </header>

      {loading ? (
        <div style={{ color: "var(--color-text-tertiary)" }}>Cargando…</div>
      ) : decks.length === 0 ? (
        <div
          style={{
            padding: "48px 32px",
            textAlign: "center",
            background: "var(--color-surface)",
            border: "1px dashed var(--color-border)",
            borderRadius: 12,
            color: "var(--color-text-tertiary)",
          }}
        >
          Tu consultor todavía no publicó decks. Cuando suba uno y admin lo apruebe, lo verás acá.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {decks.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d)}
              style={{
                textAlign: "left",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                padding: 0,
                cursor: "pointer",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                fontFamily: "inherit",
                transition: "transform 0.15s ease, border-color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.borderColor = "var(--goberna-blue-700, #1e3a8a)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.borderColor = "";
              }}
            >
              <div
                style={{
                  height: 8,
                  background: TYPE_COLOR[d.type],
                }}
              />
              <div style={{ padding: 18 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 1.5,
                    color: TYPE_COLOR[d.type],
                    marginBottom: 8,
                  }}
                >
                  {TYPE_LABEL[d.type]}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    lineHeight: 1.3,
                    marginBottom: 12,
                  }}
                >
                  {d.title}
                </div>
                {d.description ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                      lineHeight: 1.4,
                      marginBottom: 12,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {d.description}
                  </div>
                ) : null}
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-tertiary)",
                    borderTop: "1px solid var(--color-border)",
                    paddingTop: 10,
                    marginTop: 10,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{d.uploader_full_name}</span>
                  <span>
                    {d.published_at
                      ? new Date(d.published_at).toLocaleDateString("es-PE", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <SlideOver
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        width={1000}
      >
        {selected ? (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                {TYPE_LABEL[selected.type]} · subido por {selected.uploader_full_name}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a
                  href={`/api/decks/${selected.id}/raw`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "6px 12px",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    textDecoration: "none",
                    color: "var(--color-text-primary)",
                  }}
                >
                  Abrir en pestaña ↗
                </a>
                <a
                  href={`/api/decks/${selected.id}/raw`}
                  download={`${selected.title.replace(/[^\w\s.-]/g, "_")}.html`}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "6px 12px",
                    background: "#0a1f4a",
                    color: "#fff",
                    borderRadius: 6,
                    textDecoration: "none",
                  }}
                >
                  Descargar
                </a>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 400, background: "#fff" }}>
              <iframe
                src={`/api/decks/${selected.id}/raw`}
                sandbox="allow-same-origin allow-scripts"
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: 400,
                  border: "none",
                }}
                title={selected.title}
              />
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
