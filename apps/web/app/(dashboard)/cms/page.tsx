"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../../lib/auth-context";
import {
  listCmsContacts,
  markHablado,
  markRespondieron,
  archiveContact,
  revertContact,
  updateContactNotes,
  getCmsStats,
  type CmsContact,
  type CmsStats,
  type CmsTabFilter,
  type CmsSseContactUpdated,
  type CmsSseNotesUpdated,
} from "../../../lib/services/cms";
import { ContactTableRow } from "./_components/contact-table-row";
import { ContactNotesPanel } from "./_components/contact-notes-panel";
import { TwilioConfigModal } from "./_components/twilio-config-modal";

/* ═══════════════════════════════════════════════════════════════════
   GOBERNA — CMS: Contactos para Operadoras Digitales
   SSE-driven state: all operators see all contacts in real time.
   ═══════════════════════════════════════════════════════════════════ */

const FONT = "var(--font-montserrat), system-ui, sans-serif";
const NOTES_PANEL_WIDTH = 400;

type Tab = { key: CmsTabFilter; label: string; statKey: keyof CmsStats | null };

const TABS: Tab[] = [
  { key: "nuevo", label: "NO HABLADOS", statKey: "nuevos" },
  { key: "hablado", label: "HABLADOS", statKey: "hablados" },
  { key: "respondieron", label: "CONTESTARON", statKey: "respondieron" },
  { key: "archivado", label: "ARCHIVADOS", statKey: "archivados" },
  { key: "todos", label: "TODOS", statKey: "total" },
];

export default function CmsPage() {
  const { user, activeCampaignId } = useAuth();

  const [activeTab, setActiveTab] = useState<CmsTabFilter>("nuevo");
  const [contacts, setContacts] = useState<CmsContact[]>([]);
  const [stats, setStats] = useState<CmsStats | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesContact, setNotesContact] = useState<CmsContact | null>(null);
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [twilioConfigOpen, setTwilioConfigOpen] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);

  const sseRef = useRef<{ close: () => void } | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const PAGE_LIMIT = 25;
  const panelOpen = notesContact !== null;

  // ── Fetch contacts (initial/tab change) ─────────────────────────

  const fetchContacts = useCallback(async () => {
    if (!activeCampaignId) return;
    setLoading(true);
    setOffset(0);
    const [contactsRes, statsRes] = await Promise.all([
      listCmsContacts(activeCampaignId, activeTab, PAGE_LIMIT, 0, search),
      getCmsStats(activeCampaignId),
    ]);
    if (contactsRes.ok) {
      setContacts(contactsRes.contacts);
      setTotal(contactsRes.total);
    }
    if (statsRes.ok && statsRes.stats) setStats(statsRes.stats);
    setLoading(false);
  }, [activeCampaignId, activeTab, search]);

  // ── Load more (append) ──────────────────────────────────────────

  const handleLoadMore = useCallback(async () => {
    if (!activeCampaignId || loadingMore) return;
    setLoadingMore(true);
    const nextOffset = offset + PAGE_LIMIT;
    const res = await listCmsContacts(activeCampaignId, activeTab, PAGE_LIMIT, nextOffset, search);
    if (res.ok) {
      setContacts((prev) => [...prev, ...res.contacts]);
      setOffset(nextOffset);
    }
    setLoadingMore(false);
  }, [activeCampaignId, activeTab, search, offset, loadingMore]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  // ── SSE: Real-time contact updates ──────────────────────────────
  // All state changes broadcast `contact.updated` with the full contact.
  // The frontend applies the change to the current view:
  //   - If the contact's NEW status matches the active tab → insert/update
  //   - If the contact's PREVIOUS status matches the active tab → remove
  //   - Stats are refreshed on every event

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
          // Persist SSE field state across chunk boundaries
          let currentEvent = "";
          let currentData = "";

          function processChunk(): Promise<void> {
            return reader.read().then(({ done, value }) => {
              if (done) {
                // Stream ended — fire any pending event before closing
                if (currentEvent && currentData) {
                  handleSseEvent(currentEvent, currentData);
                  currentEvent = "";
                  currentData = "";
                }
                return;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                if (line.startsWith("event: ")) {
                  // New event starting — flush any incomplete prior event
                  if (currentEvent && currentData) {
                    handleSseEvent(currentEvent, currentData);
                  }
                  currentEvent = line.substring(7).trim();
                  currentData = "";
                } else if (line.startsWith("data: ")) {
                  currentData += (currentData ? "\n" : "") + line.substring(6);
                } else if (line.trim() === "") {
                  // Empty line = end of SSE message
                  if (currentEvent && currentData) {
                    handleSseEvent(currentEvent, currentData);
                  }
                  currentEvent = "";
                  currentData = "";
                }
              }

              return processChunk();
            });
          }

          processChunk().catch(() => {
            setSseConnected(false);
            retryTimeout = setTimeout(connect, 5000);
          });

          sseRef.current = { close: () => controller.abort() };
        })
        .catch(() => {
          setSseConnected(false);
          retryTimeout = setTimeout(connect, 5000);
        });
    }

    function handleSseEvent(event: string, dataStr: string) {
      try {
        const data = JSON.parse(dataStr);

        if (event === "connected") {
          setSseConnected(true);
          return;
        }

        if (event === "heartbeat") return;

        if (event === "contact.updated") {
          const payload = data as CmsSseContactUpdated;
          const contact = payload.contact;
          const prevStatus = payload.previous_status;
          const newStatus = contact.cms_status;
          const tab = activeTabRef.current;

          setContacts((prev) => {
            // Does the contact's NEW status belong in the current tab?
            const belongsInTab = tab === "todos" || newStatus === tab;

            // Did the contact's PREVIOUS status belong in the current tab?
            const wasInTab = tab === "todos" || prevStatus === tab;

            if (belongsInTab && wasInTab) {
              // Contact stays in this tab (e.g. "todos" or status didn't change)
              // → in-place update only
              const idx = prev.findIndex((c) => c.id === contact.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = contact;
                return next;
              }
              // Wasn't loaded yet — prepend
              return [contact, ...prev];
            }

            if (belongsInTab) {
              // Contact is new to this tab — prepend
              return [contact, ...prev.filter((c) => c.id !== contact.id)];
            }

            if (wasInTab) {
              // Contact left this tab — remove it
              return prev.filter((c) => c.id !== contact.id);
            }

            return prev;
          });

          // Update stats from SSE payload (avoids extra network round-trip)
          if (payload.stats) {
            setStats(payload.stats);
          } else if (activeCampaignId) {
            // Fallback: fetch stats if backend didn't include them
            getCmsStats(activeCampaignId).then((r) => {
              if (r.ok && r.stats) setStats(r.stats);
            });
          }
        }

        if (event === "contact.notes_updated") {
          const payload = data as CmsSseNotesUpdated;
          const contact = payload.contact;

          setContacts((prev) =>
            prev.map((c) => (c.id === contact.id ? contact : c)),
          );

          // If the notes panel is open for this contact, update it
          setNotesContact((prev) => (prev && prev.id === contact.id ? contact : prev));
        }

        // Legacy events from claim/release (backwards compat with mobile)
        if (event === "contact.claimed" || event === "contact.released") {
          // Just refresh the current view
          if (activeCampaignId) {
            getCmsStats(activeCampaignId).then((r) => {
              if (r.ok && r.stats) setStats(r.stats);
            });
          }
        }
      } catch { /* ignore parse errors */ }
    }

    connect();

    return () => {
      sseRef.current?.close();
      clearTimeout(retryTimeout);
      setSseConnected(false);
    };
  }, [activeCampaignId]);

  // ── Actions ─────────────────────────────────────────────────────

  const handleHablado = useCallback(
    async (id: string) => {
      if (!activeCampaignId) return;
      setActionLoading(id);
      setActionError(null);
      const res = await markHablado(activeCampaignId, id);
      if (!res.ok) {
        setActionError(res.error ?? "Error marcando como hablado");
        setTimeout(() => setActionError(null), 4000);
      }
      // SSE will handle the state update for all operators
      setActionLoading(null);
    },
    [activeCampaignId],
  );

  const handleRespondieron = useCallback(
    async (id: string) => {
      if (!activeCampaignId) return;
      setActionLoading(id);
      setActionError(null);
      const res = await markRespondieron(activeCampaignId, id);
      if (!res.ok) {
        setActionError(res.error ?? "Error marcando como contestó");
        setTimeout(() => setActionError(null), 4000);
      }
      setActionLoading(null);
    },
    [activeCampaignId],
  );

  const handleArchive = useCallback(
    async (id: string) => {
      if (!activeCampaignId) return;
      setActionLoading(id);
      setActionError(null);
      const res = await archiveContact(activeCampaignId, id);
      if (!res.ok) {
        setActionError(res.error ?? "Error archivando contacto");
        setTimeout(() => setActionError(null), 4000);
      }
      if (notesContact?.id === id) setNotesContact(null);
      setActionLoading(null);
    },
    [activeCampaignId, notesContact],
  );

  const handleRevert = useCallback(
    async (id: string) => {
      if (!activeCampaignId) return;
      setReverting(id);
      setActionError(null);
      const res = await revertContact(activeCampaignId, id);
      if (!res.ok) {
        setActionError(res.error ?? "No se pudo revertir");
        setTimeout(() => setActionError(null), 4000);
      }
      setReverting(null);
    },
    [activeCampaignId],
  );

  const handleSaveNotes = useCallback(
    async (id: string, notes: { local_votacion: string; domicilio: string; comentarios: string }) => {
      if (!activeCampaignId) return;
      setSavingNotes(true);
      const res = await updateContactNotes(activeCampaignId, id, notes);
      if (res.ok) {
        // SSE will broadcast the update; close panel
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
        Selecciona una campaña para ver los contactos.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT, display: "flex", gap: 0, minHeight: "calc(100vh - 80px)" }}>
      {/* ── Main content ─────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          transition: "margin-right 0.25s ease",
          marginRight: panelOpen ? NOTES_PANEL_WIDTH : 0,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", margin: "0 0 4px", letterSpacing: "0.02em" }}>
                CONTACTOS CMS
              </h1>
              {/* SSE connection indicator */}
              <span
                title={sseConnected ? "Conectado en tiempo real" : "Reconectando..."}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: sseConnected ? "#16a34a" : "#d97706",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
            </div>
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
              Gestión de contactos vía WhatsApp
            </p>
          </div>
          {user?.role === "admin" && (
            <button
              type="button"
              onClick={() => setTwilioConfigOpen(true)}
              title="Configurar Twilio WhatsApp"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: FONT,
                color: "#25D366",
                background: "var(--color-surface)",
                border: "1px solid #bbf7d0",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <title>Configurar Twilio</title>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Twilio
            </button>
          )}
        </div>

        {/* Search + refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
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
              placeholder="Buscar nombre, teléfono, entrevistador..."
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

        {/* Tabs */}
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
                  {["FECHA / ORIGEN", "CIUDADANO", "TELÉFONO", "ESTADO", "ACCIONES"].map((h) => (
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
                        {search ? "Sin resultados para la búsqueda" : "No hay contactos en esta categoría"}
                      </div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        {search ? "Intenta con otro término" : "Los contactos aparecen al recibir formularios de campo"}
                      </div>
                    </td>
                  </tr>
                ) : (
                  contacts.map((c) => (
                    <ContactTableRow
                      key={c.id}
                      contact={c}
                      currentUserId={user?.id ?? ""}
                      onHablado={handleHablado}
                      onRespondieron={handleRespondieron}
                      onArchive={handleArchive}
                      onRevert={handleRevert}
                      onOpenNotes={setNotesContact}
                      actionLoading={actionLoading}
                      reverting={reverting}
                      isSelected={notesContact?.id === c.id}
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
              gap: 12,
            }}
          >
            <span>{contacts.length} de {total} contactos</span>
            {contacts.length < total && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                style={{
                  padding: "5px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: FONT,
                  color: "var(--goberna-blue-900)",
                  background: "var(--color-surface)",
                  border: "1px solid var(--goberna-blue-200)",
                  borderRadius: 6,
                  cursor: loadingMore ? "not-allowed" : "pointer",
                  opacity: loadingMore ? 0.6 : 1,
                  transition: "opacity 0.15s ease",
                }}
              >
                {loadingMore ? "Cargando..." : `Cargar más (${total - contacts.length} restantes)`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Notes panel ──────────────────────────────────────────── */}
      {notesContact && (
        <ContactNotesPanel
          contact={notesContact}
          onSave={handleSaveNotes}
          onClose={() => setNotesContact(null)}
          saving={savingNotes}
        />
      )}

      {/* Error toast */}
      {actionError && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: panelOpen ? NOTES_PANEL_WIDTH + 24 : 24,
            padding: "12px 20px",
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#dc2626",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: FONT,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 8,
            animation: "slideIn 0.2s ease",
            transition: "right 0.25s ease",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
            <title>Error</title>
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {actionError}
          <style>{"@keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }"}</style>
        </div>
      )}

      {/* Twilio config modal */}
      {twilioConfigOpen && activeCampaignId && (
        <TwilioConfigModal
          campaignId={activeCampaignId}
          onClose={() => setTwilioConfigOpen(false)}
        />
      )}
    </div>
  );
}
