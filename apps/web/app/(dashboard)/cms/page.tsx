"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../../lib/auth-context";
import {
  listCmsContacts,
  claimContact,
  releaseContact,
  markHablado,
  markRespondieron,
  archiveContact,
  updateContactNotes,
  getCmsStats,
  type CmsContact,
  type CmsStats,
  type CmsTabFilter,
} from "../../../lib/services/cms";
import { ContactTableRow } from "./_components/contact-table-row";
import { ContactNotesPanel } from "./_components/contact-notes-panel";

/* ═══════════════════════════════════════════════════════════════════
   GOBERNA — CMS: Contactos para Operadoras Digitales
   Table-based layout with status filters, search, WhatsApp template
   ═══════════════════════════════════════════════════════════════════ */

const FONT = "var(--font-montserrat), system-ui, sans-serif";

type Tab = { key: CmsTabFilter; label: string; statKey: keyof CmsStats | null };

const TABS: Tab[] = [
  { key: "nuevo", label: "NO HABLADOS", statKey: "nuevos" },
  { key: "hablado", label: "HABLADOS", statKey: "hablados" },
  { key: "respondieron", label: "CONTESTO", statKey: "respondieron" },
  { key: "archivado", label: "ARCHIVADOS", statKey: "archivados" },
  { key: "todos", label: "TODOS", statKey: "total" },
];

type ClaimedInfo = { id: string; claimed_by: string; claimed_by_email: string };

export default function CmsPage() {
  const { user, activeCampaignId } = useAuth();

  const [activeTab, setActiveTab] = useState<CmsTabFilter>("nuevo");
  const [contacts, setContacts] = useState<CmsContact[]>([]);
  const [stats, setStats] = useState<CmsStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesContact, setNotesContact] = useState<CmsContact | null>(null);
  const [search, setSearch] = useState("");
  const [wspTemplateOpen, setWspTemplateOpen] = useState(false);

  const sseRef = useRef<{ close: () => void } | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Fetch contacts ──────────────────────────────────────────────

  const fetchContacts = useCallback(async () => {
    if (!activeCampaignId) return;
    setLoading(true);
    const [contactsRes, statsRes] = await Promise.all([
      listCmsContacts(activeCampaignId, activeTab, 100, 0, search),
      getCmsStats(activeCampaignId),
    ]);
    if (contactsRes.ok) {
      setContacts(contactsRes.contacts);
      setTotal(contactsRes.total);
    }
    if (statsRes.ok && statsRes.stats) setStats(statsRes.stats);
    setLoading(false);
  }, [activeCampaignId, activeTab, search]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    // The search state change triggers fetchContacts via useEffect
  }, []);

  // ── SSE for real-time locks ─────────────────────────────────────

  useEffect(() => {
    if (!activeCampaignId) return;

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("goberna_access_token")
        : null;
    if (!token) return;

    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      const controller = new AbortController();

      fetch("/api/cms/stream", {
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
            retryTimeout = setTimeout(connect, 5000);
          });

          sseRef.current = { close: () => controller.abort() };
        })
        .catch(() => {
          retryTimeout = setTimeout(connect, 5000);
        });
    }

    function handleSseEvent(event: string, dataStr: string) {
      try {
        const data = JSON.parse(dataStr);

        if (event === "snapshot") {
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
        } else if (event === "contact.hablado" || event === "contact.respondieron" || event === "contact.archived") {
          if (data.operator_id === user?.id) return;
          // Remove from current list and refetch stats
          setContacts((prev) => prev.filter((c) => c.id !== data.id));
          // Optimistic stats update
          if (activeCampaignId) getCmsStats(activeCampaignId).then(r => { if (r.ok && r.stats) setStats(r.stats); });
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
          prev ? { ...prev, nuevos: Math.max(0, prev.nuevos - 1), hablados: prev.hablados + 1, hablados_mios: prev.hablados_mios + 1 } : prev,
        );
      }
    },
    [activeCampaignId],
  );

  const handleRespondieron = useCallback(
    async (id: string) => {
      if (!activeCampaignId) return;
      const res = await markRespondieron(activeCampaignId, id);
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== id));
        setStats((prev) =>
          prev ? { ...prev, hablados: Math.max(0, prev.hablados - 1), respondieron: prev.respondieron + 1 } : prev,
        );
      }
    },
    [activeCampaignId],
  );

  const handleArchive = useCallback(
    async (id: string) => {
      if (!activeCampaignId) return;
      const res = await archiveContact(activeCampaignId, id);
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== id));
        setStats((prev) => {
          if (!prev) return prev;
          return { ...prev, archivados: prev.archivados + 1, total: Math.max(0, prev.total - 1) };
        });
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
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
            Contactos CMS
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
            Gestion de contactos via WhatsApp
          </p>
        </div>
      </div>

      {/* WhatsApp Template Collapsible */}
      <div
        style={{
          marginBottom: 16,
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          background: "var(--color-surface)",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={() => setWspTemplateOpen(!wspTemplateOpen)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: FONT,
            color: "#25D366",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366">
              <title>WhatsApp template</title>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Mensaje plantilla WhatsApp
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: wspTemplateOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s ease" }}
          >
            <title>Toggle</title>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {wspTemplateOpen && (
          <div style={{ padding: "0 16px 14px", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, borderTop: "1px solid var(--color-border)" }}>
            <div style={{ padding: "12px 14px", marginTop: 10, background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", fontFamily: "monospace", fontSize: 12 }}>
              Hola [NOMBRE], le habla [TU_NOMBRE] del equipo de [CANDIDATO].
              Queríamos saber si podemos contar con su apoyo para las próximas elecciones.
              ¿Tiene un momento para conversar?
            </div>
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 8, marginBottom: 0 }}>
              Al hacer clic en WSP, se abre WhatsApp con &quot;Hola [nombre]&quot;. Puedes copiar y adaptar el mensaje de arriba.
            </p>
          </div>
        )}
      </div>

      {/* Search + filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-tertiary)"
            strokeWidth="2"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
          >
            <title>Buscar</title>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Buscar nombre, telefono, entrevistador..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px 9px 34px",
              fontSize: 13,
              fontFamily: FONT,
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              outline: "none",
            }}
          />
        </div>

        {/* Refresh */}
        <button
          type="button"
          onClick={fetchContacts}
          style={{
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: FONT,
            color: "var(--color-text-secondary)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <title>Actualizar</title>
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 0,
          borderBottom: "2px solid var(--color-border)",
          overflowX: "auto",
        }}
      >
        {TABS.map((t) => {
          const isActive = activeTab === t.key;
          const count = t.statKey && stats ? stats[t.statKey] : undefined;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "10px 18px",
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                fontFamily: FONT,
                letterSpacing: "0.04em",
                color: isActive ? "var(--goberna-blue-900)" : "var(--color-text-tertiary)",
                background: "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid var(--goberna-blue-900)" : "2px solid transparent",
                cursor: "pointer",
                marginBottom: -2,
                display: "flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
              {count !== undefined && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 10,
                    background: isActive ? "var(--goberna-blue-900)" : "var(--color-border)",
                    color: isActive ? "#fff" : "var(--color-text-tertiary)",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderTop: "none",
          borderRadius: "0 0 10px 10px",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: FONT,
              tableLayout: "auto",
            }}
          >
            <thead>
              <tr style={{ background: "var(--goberna-blue-50)" }}>
                {["FECHA / ORIGEN", "CIUDADANO", "TELEFONO", "ESTADO", "ACCIONES"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 12px",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      color: "var(--goberna-blue-900)",
                      textAlign: h === "ACCIONES" ? "right" : "left",
                      borderBottom: "2px solid var(--goberna-blue-200, #bfdbfe)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 48, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
                    Cargando contactos...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 48, textAlign: "center", color: "var(--color-text-tertiary)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {search ? "Sin resultados para la busqueda" : "No hay contactos en esta categoria"}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      {search ? "Intenta con otro termino" : "Los contactos aparecen al recibir formularios de campo"}
                    </div>
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <ContactTableRow
                    key={c.id}
                    contact={c}
                    currentUserId={user?.id ?? ""}
                    onClaim={handleClaim}
                    onHablado={handleHablado}
                    onRespondieron={handleRespondieron}
                    onArchive={handleArchive}
                    onRelease={handleRelease}
                    onOpenNotes={setNotesContact}
                    claiming={claiming}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 16px",
            fontSize: 12,
            color: "var(--color-text-tertiary)",
            borderTop: "1px solid var(--color-border)",
            background: "var(--goberna-blue-50)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{contacts.length} de {total} contactos</span>
          {stats && (
            <span style={{ fontSize: 11 }}>
              En curso: {stats.claimed}
            </span>
          )}
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
