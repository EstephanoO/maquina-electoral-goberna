"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  listCmsContacts,
  updateContactNotes,
  getCmsStats,
  getContactWhatsAppMessages,
  sendContactWhatsAppMessage,
  type CmsContact,
  type CmsStats,
  type CmsTabFilter,
  type CmsSseContactUpdated,
  type CmsSseNotesUpdated,
  type CmsTwilioMessage,
} from "@/lib/services/cms";
import {
  ChatContactListItem,
  ChatConversationPane,
  ContactNotesPanel,
  TwilioConfigModal,
} from "./_components";

const FONT = "var(--font-montserrat), system-ui, sans-serif";
const NOTES_PANEL_WIDTH = 400;
const PAGE_LIMIT = 25;

type Tab = { key: CmsTabFilter; label: string; statKey: keyof CmsStats | null };

const TABS: Tab[] = [
  { key: "todos", label: "Todos", statKey: "total" },
  { key: "nuevo", label: "No hablados", statKey: "nuevos" },
  { key: "hablado", label: "Hablados", statKey: "hablados" },
  { key: "respondieron", label: "Contestaron", statKey: "respondieron" },
  { key: "archivado", label: "Archivados", statKey: "archivados" },
];

export default function CmsPage() {
  const { user, activeCampaignId, campaigns } = useAuth();

  const [activeTab, setActiveTab] = useState<CmsTabFilter>("todos");
  const [contacts, setContacts] = useState<CmsContact[]>([]);
  const [stats, setStats] = useState<CmsStats | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesContact, setNotesContact] = useState<CmsContact | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [uiError, setUiError] = useState<string | null>(null);
  const [twilioConfigOpen, setTwilioConfigOpen] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [messagesByContact, setMessagesByContact] = useState<Record<string, CmsTwilioMessage[]>>({});
  const [messagesLoadingByContact, setMessagesLoadingByContact] = useState<Record<string, boolean>>({});
  const [messagesErrorByContact, setMessagesErrorByContact] = useState<Record<string, string | null>>({});
  const [draftByContact, setDraftByContact] = useState<Record<string, string>>({});
  const [sendingByContact, setSendingByContact] = useState<Record<string, boolean>>({});

  const sseRef = useRef<{ close: () => void } | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) ?? null,
    [contacts, selectedContactId],
  );
  const panelOpen = notesContact !== null;
  const activeCampaignSlug = campaigns.find((campaign) => campaign.id === activeCampaignId)?.slug;
  const latestMessageByContact = useMemo<Record<string, CmsTwilioMessage | undefined>>(() => {
    const next: Record<string, CmsTwilioMessage | undefined> = {};
    for (const [contactId, messages] of Object.entries(messagesByContact)) {
      if (messages.length > 0) {
        next[contactId] = messages[messages.length - 1];
      }
    }
    return next;
  }, [messagesByContact]);
  const selectedMessages = selectedContactId ? (messagesByContact[selectedContactId] ?? []) : [];
  const selectedMessagesLoading = selectedContactId ? Boolean(messagesLoadingByContact[selectedContactId]) : false;
  const selectedMessagesError = selectedContactId ? (messagesErrorByContact[selectedContactId] ?? null) : null;
  const selectedDraft = selectedContactId ? (draftByContact[selectedContactId] ?? "") : "";
  const selectedSending = selectedContactId ? Boolean(sendingByContact[selectedContactId]) : false;

  const fetchContacts = useCallback(async () => {
    if (!activeCampaignId) return;

    setLoading(true);
    setOffset(0);
    setUiError(null);

    const [contactsRes, statsRes] = await Promise.all([
      listCmsContacts(activeCampaignId, activeTab, PAGE_LIMIT, 0, debouncedSearch),
      getCmsStats(activeCampaignId),
    ]);

    if (contactsRes.ok) {
      setContacts(contactsRes.contacts);
      setTotal(contactsRes.total);
    } else {
      setContacts([]);
      setTotal(0);
      setUiError(contactsRes.error ?? "No se pudieron cargar los contactos");
    }

    if (statsRes.ok && statsRes.stats) {
      setStats(statsRes.stats);
    } else if (!contactsRes.ok) {
      setUiError((prev) => prev ?? statsRes.error ?? "No se pudieron cargar los totales");
    }

    setLoading(false);
  }, [activeCampaignId, activeTab, debouncedSearch]);

  const handleLoadMore = useCallback(async () => {
    if (!activeCampaignId || loadingMore) return;

    setLoadingMore(true);
    const nextOffset = offset + PAGE_LIMIT;
    const res = await listCmsContacts(
      activeCampaignId,
      activeTab,
      PAGE_LIMIT,
      nextOffset,
      debouncedSearch,
    );

    if (res.ok) {
      setContacts((prev) => [...prev, ...res.contacts]);
      setOffset(nextOffset);
    } else {
      setUiError(res.error ?? "No se pudieron cargar mas contactos");
    }

    setLoadingMore(false);
  }, [activeCampaignId, activeTab, debouncedSearch, loadingMore, offset]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    setMessagesByContact({});
    setMessagesLoadingByContact({});
    setMessagesErrorByContact({});
    setDraftByContact({});
    setSendingByContact({});
  }, [activeCampaignId]);

  useEffect(() => {
    if (!contacts.length) {
      setSelectedContactId(null);
      return;
    }

    setSelectedContactId((prev) => {
      if (prev && contacts.some((contact) => contact.id === prev)) {
        return prev;
      }
      return contacts[0]?.id ?? null;
    });
  }, [contacts]);

  useEffect(() => {
    if (!notesContact) return;
    const refreshedContact = contacts.find((contact) => contact.id === notesContact.id);
    if (refreshedContact && refreshedContact !== notesContact) {
      setNotesContact(refreshedContact);
    }
  }, [contacts, notesContact]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 350);
  }, []);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeCampaignId) return;
    const campaignId = activeCampaignId;

    let retryTimeout: ReturnType<typeof setTimeout>;
    let attempt = 0;

    async function tryRefreshToken(): Promise<boolean> {
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          credentials: "same-origin",
        });
        return res.ok;
      } catch {
        return false;
      }
    }

    async function connect() {
      const controller = new AbortController();
      sseRef.current = { close: () => controller.abort() };

      try {
        let res = await fetch("/api/cms/stream", {
          headers: {
            "x-campaign-id": campaignId,
            Accept: "text/event-stream",
          },
          signal: controller.signal,
          credentials: "same-origin",
        });

        if (res.status === 401) {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            res = await fetch("/api/cms/stream", {
              headers: {
                "x-campaign-id": campaignId,
                Accept: "text/event-stream",
              },
              signal: controller.signal,
              credentials: "same-origin",
            });
          }
        }

        if (!res.ok || !res.body) {
          throw new Error(`CMS SSE error: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "";
        let currentData = "";

        async function processChunk(): Promise<void> {
          const { done, value } = await reader.read();
          if (done) {
            if (currentEvent && currentData) {
              handleSseEvent(currentEvent, currentData);
            }
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              if (currentEvent && currentData) {
                handleSseEvent(currentEvent, currentData);
              }
              currentEvent = line.substring(7).trim();
              currentData = "";
            } else if (line.startsWith("data: ")) {
              currentData += (currentData ? "\n" : "") + line.substring(6);
            } else if (line.trim() === "") {
              if (currentEvent && currentData) {
                handleSseEvent(currentEvent, currentData);
              }
              currentEvent = "";
              currentData = "";
            }
          }

          return processChunk();
        }

        await processChunk();
        attempt = 0;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }

      setSseConnected(false);
      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      attempt++;
      retryTimeout = setTimeout(connect, delay);
    }

    function handleSseEvent(event: string, dataStr: string) {
      try {
        const data = JSON.parse(dataStr);

        if (event === "connected") {
          setSseConnected(true);
          attempt = 0;
          return;
        }

        if (event === "heartbeat") return;

        if (event === "contact.updated") {
          const payload = data as CmsSseContactUpdated;
          const contact = payload.contact;
          const previousStatus = payload.previous_status;
          const nextStatus = contact.cms_status;
          const active = activeTabRef.current;

          setContacts((prev) => {
            const belongsInTab = active === "todos" || nextStatus === active;
            const wasInTab = active === "todos" || previousStatus === active;

            if (belongsInTab && wasInTab) {
              const idx = prev.findIndex((item) => item.id === contact.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = contact;
                return next;
              }
              return [contact, ...prev];
            }

            if (belongsInTab) {
              return [contact, ...prev.filter((item) => item.id !== contact.id)];
            }

            if (wasInTab) {
              return prev.filter((item) => item.id !== contact.id);
            }

            return prev;
          });

          if (payload.stats) {
            setStats(payload.stats);
          } else if (campaignId) {
            getCmsStats(campaignId).then((response) => {
              if (response.ok && response.stats) {
                setStats(response.stats);
              }
            });
          }
        }

        if (event === "contact.notes_updated") {
          const payload = data as CmsSseNotesUpdated;
          const contact = payload.contact;

          setContacts((prev) =>
            prev.map((item) => (item.id === contact.id ? contact : item)),
          );

          setNotesContact((prev) => (prev && prev.id === contact.id ? contact : prev));
        }
      } catch {
        // Ignore malformed events
      }
    }

    connect();

    return () => {
      sseRef.current?.close();
      clearTimeout(retryTimeout);
      setSseConnected(false);
    };
  }, [activeCampaignId]);

  const loadMessages = useCallback(
    async (contactId: string, opts?: { silent?: boolean }) => {
      if (!activeCampaignId) return;
      const silent = opts?.silent ?? false;

      if (!silent) {
        setMessagesLoadingByContact((prev) => ({ ...prev, [contactId]: true }));
      }

      const res = await getContactWhatsAppMessages(activeCampaignId, contactId);
      if (res.ok) {
        setMessagesByContact((prev) => ({ ...prev, [contactId]: res.messages }));
        setMessagesErrorByContact((prev) => ({ ...prev, [contactId]: null }));
      } else {
        setMessagesErrorByContact((prev) => ({
          ...prev,
          [contactId]: res.error ?? "No se pudieron cargar los mensajes",
        }));
      }

      if (!silent) {
        setMessagesLoadingByContact((prev) => ({ ...prev, [contactId]: false }));
      }
    },
    [activeCampaignId],
  );

  useEffect(() => {
    if (!selectedContactId) return;
    loadMessages(selectedContactId);
  }, [selectedContactId, loadMessages]);

  useEffect(() => {
    if (!selectedContactId) return;
    const interval = setInterval(() => {
      loadMessages(selectedContactId, { silent: true });
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedContactId, loadMessages]);

  const handleDraftChange = useCallback(
    (value: string) => {
      if (!selectedContactId) return;
      setDraftByContact((prev) => ({ ...prev, [selectedContactId]: value }));
    },
    [selectedContactId],
  );

  const handleRefreshMessages = useCallback(() => {
    if (!selectedContactId) return;
    loadMessages(selectedContactId);
  }, [selectedContactId, loadMessages]);

  const handleSendMessage = useCallback(async () => {
    if (!activeCampaignId || !selectedContactId) return;

    const messageBody = selectedDraft.trim();
    if (!messageBody) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: CmsTwilioMessage = {
      id: tempId,
      contact_id: selectedContactId,
      campaign_id: activeCampaignId,
      direction: "outbound",
      body: messageBody,
      twilio_sid: null,
      status: "queued",
      sent_by: user?.id ?? null,
      created_at: new Date().toISOString(),
    };

    setSendingByContact((prev) => ({ ...prev, [selectedContactId]: true }));
    setMessagesErrorByContact((prev) => ({ ...prev, [selectedContactId]: null }));
    setDraftByContact((prev) => ({ ...prev, [selectedContactId]: "" }));
    setMessagesByContact((prev) => ({
      ...prev,
      [selectedContactId]: [...(prev[selectedContactId] ?? []), optimisticMessage],
    }));

    const res = await sendContactWhatsAppMessage(activeCampaignId, selectedContactId, messageBody);
    if (!res.ok) {
      setMessagesByContact((prev) => ({
        ...prev,
        [selectedContactId]: (prev[selectedContactId] ?? []).filter((msg) => msg.id !== tempId),
      }));
      setDraftByContact((prev) => ({ ...prev, [selectedContactId]: messageBody }));
      setMessagesErrorByContact((prev) => ({
        ...prev,
        [selectedContactId]: res.error ?? "No se pudo enviar el mensaje",
      }));
      setSendingByContact((prev) => ({ ...prev, [selectedContactId]: false }));
      return;
    }

    await loadMessages(selectedContactId, { silent: true });
    setSendingByContact((prev) => ({ ...prev, [selectedContactId]: false }));
  }, [
    activeCampaignId,
    loadMessages,
    selectedContactId,
    selectedDraft,
    user?.id,
  ]);

  const handleSaveNotes = useCallback(
    async (
      id: string,
      notes: { local_votacion: string; domicilio: string; comentarios: string },
    ) => {
      if (!activeCampaignId) return;

      setSavingNotes(true);
      setUiError(null);

      const res = await updateContactNotes(activeCampaignId, id, notes);
      if (res.ok) {
        setNotesContact(null);
      } else {
        setUiError(res.error ?? "No se pudieron guardar las notas");
      }

      setSavingNotes(false);
    },
    [activeCampaignId],
  );

  if (!activeCampaignId) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          fontFamily: FONT,
          color: "var(--color-text-tertiary)",
        }}
      >
        Selecciona una campana para ver los contactos.
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: "calc(100vh - 80px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "0.01em",
              }}
            >
              Contactos CMS
            </h1>
            <span
              title={sseConnected ? "Conectado en tiempo real" : "Reconectando..."}
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                display: "inline-block",
                background: sseConnected ? "#16a34a" : "#d97706",
              }}
            />
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Vista operativa tipo chat (modo claro)
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {activeCampaignSlug && (
            <Link
              href={`/candidatos/${activeCampaignSlug}/cms-metrics`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--goberna-blue-900)",
                background: "var(--goberna-blue-50)",
                border: "1px solid var(--goberna-blue-200)",
                borderRadius: 8,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Metricas</title>
                <path d="M18 20V10" />
                <path d="M12 20V4" />
                <path d="M6 20v-6" />
              </svg>
              Metricas
            </Link>
          )}

          {user?.role === "admin" && (
            <button
              type="button"
              onClick={() => setTwilioConfigOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 700,
                color: "#15803d",
                background: "#ecfdf3",
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
      </div>

      <div className={`cms-chat-root ${panelOpen ? "panel-open" : ""}`}>
        <div className="cms-chat-shell">
          <aside className="cms-chat-sidebar">
            <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #eef2f7" }}>
              <div style={{ position: "relative" }}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2"
                  style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
                >
                  <title>Buscar</title>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar o iniciar chat"
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 34px",
                    borderRadius: 10,
                    border: "1px solid #d6dde6",
                    background: "#f8fafc",
                    color: "#0f172a",
                    fontSize: 14,
                    outline: "none",
                    fontFamily: FONT,
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  overflowX: "auto",
                  paddingBottom: 2,
                }}
              >
                {TABS.map((tab) => {
                  const count = tab.statKey && stats ? stats[tab.statKey] : undefined;
                  const isActive = activeTab === tab.key;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      style={{
                        border: "none",
                        borderRadius: 999,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        padding: "7px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: FONT,
                        background: isActive ? "#0f172a" : "#eef2f7",
                        color: isActive ? "#ffffff" : "#475569",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {tab.label}
                      {count !== undefined && (
                        <span
                          style={{
                            fontSize: 11,
                            lineHeight: 1,
                            padding: "3px 6px",
                            borderRadius: 999,
                            background: isActive ? "rgba(255, 255, 255, 0.2)" : "#dbe3ec",
                            color: isActive ? "#ffffff" : "#334155",
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="cms-chat-contact-list">
              {loading ? (
                <div style={{ padding: 22, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                  Cargando contactos...
                </div>
              ) : contacts.length === 0 ? (
                <div style={{ padding: 22, textAlign: "center", color: "#64748b" }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {search ? "Sin resultados para la busqueda" : "No hay contactos en este filtro"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    {search
                      ? "Prueba con otro termino"
                      : "Los contactos aparecen cuando ingresan formularios"}
                  </div>
                </div>
              ) : (
                contacts.map((contact) => (
                  <ChatContactListItem
                    key={contact.id}
                    contact={contact}
                    selected={selectedContactId === contact.id}
                    lastMessage={latestMessageByContact[contact.id]}
                    onSelect={setSelectedContactId}
                    onOpenProfile={setNotesContact}
                  />
                ))
              )}
            </div>

            <div
              style={{
                padding: "10px 12px",
                borderTop: "1px solid #eef2f7",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 12, color: "#64748b" }}>
                {contacts.length} de {total} contactos
              </span>

              {contacts.length < total && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  style={{
                    border: "1px solid #d6dde6",
                    background: "#ffffff",
                    color: "#334155",
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: loadingMore ? "not-allowed" : "pointer",
                    opacity: loadingMore ? 0.65 : 1,
                  }}
                >
                  {loadingMore ? "Cargando..." : "Cargar mas"}
                </button>
              )}
            </div>
          </aside>

          <section className="cms-chat-main">
            <ChatConversationPane
              contact={selectedContact}
              sseConnected={sseConnected}
              messages={selectedMessages}
              loadingMessages={selectedMessagesLoading}
              messagesError={selectedMessagesError}
              draft={selectedDraft}
              sending={selectedSending}
              onOpenProfile={setNotesContact}
              onDraftChange={handleDraftChange}
              onSend={handleSendMessage}
              onRefreshMessages={handleRefreshMessages}
            />
          </section>
        </div>
      </div>

      {notesContact && (
        <ContactNotesPanel
          contact={notesContact}
          onSave={handleSaveNotes}
          onClose={() => setNotesContact(null)}
          saving={savingNotes}
        />
      )}

      {uiError && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: panelOpen ? NOTES_PANEL_WIDTH + 24 : 24,
            padding: "12px 16px",
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#dc2626",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 6px 18px rgba(15, 23, 42, 0.15)",
            zIndex: 9999,
            transition: "right 240ms ease",
            cursor: "pointer",
          }}
          onClick={() => setUiError(null)}
          title="Cerrar"
        >
          {uiError}
        </div>
      )}

      {twilioConfigOpen && activeCampaignId && (
        <TwilioConfigModal
          campaignId={activeCampaignId}
          onClose={() => setTwilioConfigOpen(false)}
        />
      )}

      <style>{`
        .cms-chat-root {
          flex: 1;
          min-height: 0;
          height: clamp(360px, calc(100dvh - 190px), 900px);
          transition: margin-right 240ms ease;
          overflow: hidden;
        }

        .cms-chat-shell {
          height: 100%;
          min-height: 0;
          border: 1px solid #d6dde6;
          border-radius: 16px;
          overflow: hidden;
          background: #f0f2f5;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
          display: flex;
        }

        .cms-chat-sidebar {
          width: min(380px, 100%);
          min-width: 320px;
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-right: 1px solid #d6dde6;
        }

        .cms-chat-contact-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          background: #ffffff;
        }

        .cms-chat-main {
          flex: 1;
          min-width: 0;
          min-height: 0;
          display: flex;
          overflow: hidden;
        }

        @media (min-width: 1025px) {
          .cms-chat-root.panel-open {
            margin-right: 400px;
          }
        }

        @media (max-width: 1024px) {
          .cms-chat-root {
            height: calc(100dvh - 220px);
          }

          .cms-chat-shell {
            flex-direction: column;
            min-height: 0;
          }

          .cms-chat-sidebar {
            width: 100%;
            min-width: 0;
            border-right: none;
            border-bottom: 1px solid #d6dde6;
            max-height: min(48dvh, 420px);
          }

          .cms-chat-main {
            min-height: 0;
          }
        }

        @media (max-width: 640px) {
          .cms-chat-root {
            height: calc(100dvh - 200px);
          }

          .cms-chat-sidebar {
            max-height: min(46dvh, 360px);
          }
        }
      `}</style>
    </div>
  );
}
