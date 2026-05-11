"use client";

/**
 * /decks — Admin page for reviewing consultor-uploaded decks.
 *
 * Tabs: drafts (pendientes) · published · rejected.
 * Click a row → preview HTML in iframe sandbox + publish/reject actions.
 * Publish/reject mutate status server-side via /api/admin/decks/:id/{publish,reject}.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { FONT_STACK } from "@/lib/constants";
import { Button, PageHeader, Tabs, SlideOver } from "@/lib/ui";

type DeckStatus = "draft" | "pending_review" | "published" | "rejected";

type Deck = {
  id: string;
  candidato_id: number;
  candidato_nombres: string;
  uploader_full_name: string;
  uploader_email: string;
  title: string;
  type: "diagnostico" | "analisis" | "plan" | "episodico" | "otro";
  description: string | null;
  status: DeckStatus;
  rejection_reason: string | null;
  size_bytes: number | null;
  created_at: string;
  published_at: string | null;
};

const STATUS_LABEL: Record<DeckStatus, string> = {
  draft: "Drafts",
  pending_review: "Por aprobar",
  published: "Publicados",
  rejected: "Rechazados",
};

const TYPE_LABEL: Record<Deck["type"], string> = {
  diagnostico: "Diagnóstico",
  analisis: "Análisis",
  plan: "Plan",
  episodico: "Episódico",
  otro: "Otro",
};

export default function DecksAdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [tab, setTab] = useState<DeckStatus>("draft");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Deck | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Role guard
  useEffect(() => {
    if (user && !isAdmin) router.replace("/home");
  }, [user, isAdmin, router]);

  const fetchDecks = useCallback(async (status: DeckStatus) => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; decks: Deck[] }>(
        `/api/admin/decks?status=${status}`,
      );
      if (res.ok && res.data) setDecks(res.data.decks ?? []);
      else setDecks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchDecks(tab);
  }, [isAdmin, tab, fetchDecks]);

  const handlePublish = async (deck: Deck) => {
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean }>(`/api/admin/decks/${deck.id}/publish`);
      if (res.ok) {
        setSelected(null);
        await fetchDecks(tab);
      } else {
        alert("No se pudo publicar el deck");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (deck: Deck) => {
    if (rejectReason.trim().length < 2) {
      alert("Escribí un motivo de rechazo");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean }>(`/api/admin/decks/${deck.id}/reject`, {
        reason: rejectReason.trim(),
      });
      if (res.ok) {
        setSelected(null);
        setRejectReason("");
        await fetchDecks(tab);
      } else {
        alert("No se pudo rechazar el deck");
      }
    } finally {
      setBusy(false);
    }
  };

  if (user && !isAdmin) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", fontFamily: FONT_STACK }}>
      <div style={{ padding: "32px 32px 0" }}>
        <PageHeader
          title="Decks"
          description="Revisión de presentaciones subidas por consultores"
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
            <div style={{ padding: 32, color: "var(--color-text-tertiary)" }}>Cargando…</div>
          ) : decks.length === 0 ? (
            <div style={{ padding: 32, color: "var(--color-text-tertiary)" }}>
              No hay decks en {STATUS_LABEL[tab].toLowerCase()}.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {decks.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d)}
                  style={{
                    textAlign: "left",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    padding: 16,
                    cursor: "pointer",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {d.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                      {TYPE_LABEL[d.type]} · {d.candidato_nombres} · subido por {d.uploader_full_name}
                    </div>
                    {d.rejection_reason ? (
                      <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
                        Rechazado: {d.rejection_reason}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {new Date(d.created_at).toLocaleString("es-PE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <SlideOver
        open={selected !== null}
        onClose={() => {
          setSelected(null);
          setRejectReason("");
        }}
        title={selected?.title ?? ""}
        width={900}
      >
        {selected ? (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ padding: 16, borderBottom: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                <strong>{TYPE_LABEL[selected.type]}</strong> ·{" "}
                {selected.candidato_nombres} · subido por {selected.uploader_full_name} (
                {selected.uploader_email})
              </div>
              {selected.description ? (
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 8 }}>
                  {selected.description}
                </div>
              ) : null}
            </div>

            <div style={{ flex: 1, minHeight: 400 }}>
              <iframe
                src={`/api/decks/${selected.id}/raw`}
                sandbox="allow-same-origin allow-scripts"
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: 400,
                  border: "none",
                  background: "#fff",
                }}
                title={selected.title}
              />
            </div>

            {selected.status === "draft" || selected.status === "pending_review" ? (
              <div
                style={{
                  padding: 16,
                  borderTop: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    onClick={() => handlePublish(selected)}
                    disabled={busy}
                    variant="primary"
                  >
                    {selected.status === "pending_review" ? "Aprobar y publicar" : "Publicar"}
                  </Button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Motivo de rechazo (visible para el consultor)"
                    rows={2}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 6,
                      border: "1px solid var(--color-border)",
                      fontFamily: "inherit",
                      fontSize: 13,
                      resize: "vertical",
                    }}
                  />
                  <Button
                    onClick={() => handleReject(selected)}
                    disabled={busy || rejectReason.trim().length < 2}
                    variant="danger"
                  >
                    Rechazar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
