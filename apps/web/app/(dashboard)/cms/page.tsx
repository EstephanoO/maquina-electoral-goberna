"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../../lib/auth-context";
import {
  listCmsContacts,
  claimContact,
  releaseContact,
  markHablado,
  updateContactNotes,
  getCmsStats,
  type CmsContact,
  type CmsStats,
} from "../../../lib/services/cms";
import { ContactCard } from "./_components/contact-card";
import { ContactNotesPanel } from "./_components/contact-notes-panel";

/* ═══════════════════════════════════════════════════════════════════
   GOBERNA — CMS: Contactos para Operadoras Digitales
   - Tab Nuevos: contactos sin hablar, WSP button, bloqueo real-time
   - Tab Hablados: solo mis contactos hablados, con panel de notas
   ═══════════════════════════════════════════════════════════════════ */

const FONT = "var(--font-montserrat), system-ui, sans-serif";

type Tab = "nuevos" | "hablados";

type ClaimedInfo = { id: string; claimed_by: string; claimed_by_email: string };

export default function CmsPage() {
  const { user, activeCampaignId } = useAuth();

  const [tab, setTab] = useState<Tab>("nuevos");
  const [contacts, setContacts] = useState<CmsContact[]>([]);
  const [stats, setStats] = useState<CmsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesContact, setNotesContact] = useState<CmsContact | null>(null);

  const sseRef = useRef<EventSource | null>(null);

  // ── Fetch contacts ──────────────────────────────────────────────

  const fetchContacts = useCallback(async () => {
    if (!activeCampaignId) return;
    setLoading(true);
    const [contactsRes, statsRes] = await Promise.all([
      listCmsContacts(activeCampaignId, tab === "nuevos" ? "nuevo" : "hablado"),
      getCmsStats(activeCampaignId),
    ]);
    if (contactsRes.ok) setContacts(contactsRes.contacts);
    if (statsRes.ok && statsRes.stats) setStats(statsRes.stats);
    setLoading(false);
  }, [activeCampaignId, tab]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // ── SSE for real-time locks ─────────────────────────────────────

  useEffect(() => {
    if (!activeCampaignId) return;

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("goberna_access_token")
        : null;
    if (!token) return;

    // Use EventSource with auth via query param (SSE doesn't support headers)
    // Alternative: use fetch-based SSE
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      // We need to use fetch-based SSE since EventSource doesn't support headers
      const controller = new AbortController();
      const url = `/api/cms/stream`;

      fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-campaign-id": activeCampaignId!,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok || !res.body) return;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          function processChunk(): Promise<void> {
            return reader.read().then(({ done, value }) => {
              if (done) return;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              let currentEvent = "";
              let currentData = "";

              for (const line of lines) {
                if (line.startsWith("event: ")) {
                  currentEvent = line.substring(7);
                } else if (line.startsWith("data: ")) {
                  currentData = line.substring(6);
                } else if (line === "" && currentEvent && currentData) {
                  handleSseEvent(currentEvent, currentData);
                  currentEvent = "";
                  currentData = "";
                }
              }

              return processChunk();
            });
          }

          processChunk().catch(() => {
            // Connection lost, retry
            retryTimeout = setTimeout(connect, 5000);
          });

          // Store abort for cleanup
          sseRef.current = { close: () => controller.abort() } as EventSource;
        })
        .catch(() => {
          retryTimeout = setTimeout(connect, 5000);
        });
    }

    function handleSseEvent(event: string, dataStr: string) {
      try {
        const data = JSON.parse(dataStr);

        if (event === "snapshot") {
          // Initial snapshot of claimed contacts
          const claimed = data.claimed as ClaimedInfo[];
          setContacts((prev) =>
            prev.map((c) => {
              const info = claimed.find((cl) => cl.id === c.id);
              if (info && info.claimed_by !== user?.id) {
                return { ...c, is_locked: true, claimed_by_email: info.claimed_by_email, cms_status: "claimed" as const, cms_claimed_by: info.claimed_by };
              }
              return c;
            }),
          );
        } else if (event === "contact.claimed") {
          if (data.claimed_by === user?.id) return;
          setContacts((prev) =>
            prev.map((c) =>
              c.id === data.id
                ? { ...c, is_locked: true, claimed_by_email: data.claimed_by_name, cms_status: "claimed" as const, cms_claimed_by: data.claimed_by }
                : c,
            ),
          );
        } else if (event === "contact.released") {
          setContacts((prev) =>
            prev.map((c) =>
              c.id === data.id
                ? { ...c, is_locked: false, cms_status: "nuevo" as const, cms_claimed_by: null, claimed_by_email: undefined }
                : c,
            ),
          );
        } else if (event === "contact.hablado") {
          if (data.operator_id === user?.id) return;
          // Remove from nuevos list
          setContacts((prev) => prev.filter((c) => c.id !== data.id));
          // Update stats
          setStats((prev) =>
            prev ? { ...prev, nuevos: Math.max(0, prev.nuevos - 1) } : prev,
          );
        }
      } catch { /* ignore parse errors */ }
    }

    connect();

    return () => {
      sseRef.current?.close();
      clearTimeout(retryTimeout);
    };
  }, [activeCampaignId, user?.id]);

  // ── Actions ─────────────────────────────────────────────────────

  const handleClaim = useCallback(
    async (id: string) => {
      if (!activeCampaignId) return;
      setClaiming(id);
      const res = await claimContact(activeCampaignId, id);
      if (res.ok && res.contact) {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, cms_status: "claimed" as const, cms_claimed_by: user?.id ?? null, is_locked: false }
              : c,
          ),
        );
      }
      setClaiming(null);
    },
    [activeCampaignId, user?.id],
  );

  const handleHablado = useCallback(
    async (id: string) => {
      if (!activeCampaignId) return;
      const res = await markHablado(activeCampaignId, id);
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== id));
        setStats((prev) =>
          prev
            ? { ...prev, nuevos: Math.max(0, prev.nuevos - 1), hablados_mios: prev.hablados_mios + 1 }
            : prev,
        );
      }
    },
    [activeCampaignId],
  );

  const handleRelease = useCallback(
    async (id: string) => {
      if (!activeCampaignId) return;
      const res = await releaseContact(activeCampaignId, id);
      if (res.ok) {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, cms_status: "nuevo" as const, cms_claimed_by: null, is_locked: false }
              : c,
          ),
        );
      }
    },
    [activeCampaignId],
  );

  const handleSaveNotes = useCallback(
    async (id: string, notes: { local_votacion: string; domicilio: string; comentarios: string }) => {
      if (!activeCampaignId) return;
      setSavingNotes(true);
      const res = await updateContactNotes(activeCampaignId, id, notes);
      if (res.ok && res.contact) {
        setContacts((prev) =>
          prev.map((c) => (c.id === id ? { ...c, cms_operator_notes: notes } : c)),
        );
        setNotesContact(null);
      }
      setSavingNotes(false);
    },
    [activeCampaignId],
  );

  // ── Render ──────────────────────────────────────────────────────

  if (!activeCampaignId) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: FONT, color: "var(--color-text-tertiary)" }}>
        Selecciona una campana para ver los contactos.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Injected keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes goberna-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      ` }} />

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
          Contactos
        </h1>
        <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
          Contactar via WhatsApp y registrar resultados
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <StatCard label="Total" value={stats.total} color="var(--color-text-primary)" bg="var(--color-surface)" />
          <StatCard label="Nuevos" value={stats.nuevos} color="#dc2626" bg="#fef2f2" />
          <StatCard label="Mis Hablados" value={stats.hablados_mios} color="#16a34a" bg="#ecfdf5" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid var(--color-border)" }}>
        <TabButton active={tab === "nuevos"} onClick={() => setTab("nuevos")} count={stats?.nuevos}>
          Nuevos
        </TabButton>
        <TabButton active={tab === "hablados"} onClick={() => setTab("hablados")} count={stats?.hablados_mios}>
          Mis Hablados
        </TabButton>
      </div>

      {/* Contact list */}
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-tertiary)" }}>
            Cargando contactos...
          </div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-tertiary)" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {tab === "nuevos" ? "No hay contactos nuevos" : "Aun no has hablado con nadie"}
            </div>
          </div>
        ) : (
          contacts.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              currentUserId={user?.id ?? ""}
              onClaim={handleClaim}
              onHablado={handleHablado}
              onRelease={handleRelease}
              onOpenNotes={setNotesContact}
              isHabladoTab={tab === "hablados"}
              claiming={claiming}
            />
          ))
        )}

        {/* Footer */}
        <div
          style={{
            padding: "10px 16px",
            fontSize: 12,
            color: "var(--color-text-tertiary)",
            borderTop: "1px solid var(--color-border)",
            background: "var(--goberna-blue-50)",
          }}
        >
          {contacts.length} contactos
        </div>
      </div>

      {/* Notes panel */}
      {notesContact && (
        <ContactNotesPanel
          contact={notesContact}
          onSave={handleSaveNotes}
          onClose={() => setNotesContact(null)}
          saving={savingNotes}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "12px 16px",
        background: bg,
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>
        {value}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, count, children }: { active: boolean; onClick: () => void; count?: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 20px",
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
        color: active ? "var(--goberna-blue-900)" : "var(--color-text-tertiary)",
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid var(--goberna-blue-900)" : "2px solid transparent",
        cursor: "pointer",
        marginBottom: -2,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {children}
      {count !== undefined && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 10,
            background: active ? "var(--goberna-blue-900)" : "var(--color-border)",
            color: active ? "#fff" : "var(--color-text-tertiary)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
