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
  markHablado,
  archiveContact,
  type CmsContact,
  type CmsOperatorNotes,
  type CmsStatus,
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
const NOTES_PANEL_GAP = 32;
const PAGE_LIMIT = 25;

type Tab = { key: CmsTabFilter; label: string; statKey: keyof CmsStats | null };

const TABS: Tab[] = [
  { key: "todos", label: "Todos", statKey: "total" },
  { key: "nuevo", label: "No hablados", statKey: "nuevos" },
  { key: "hablado", label: "Hablados", statKey: "hablados" },
  { key: "respondieron", label: "Contestaron", statKey: "respondieron" },
  { key: "archivado", label: "Archivados", statKey: "archivados" },
];

function mergeContactForActiveTab(
  prev: CmsContact[],
  contact: CmsContact,
  previousStatus: string,
  activeTab: CmsTabFilter,
): CmsContact[] {
  const belongsInTab = activeTab === "todos" || contact.cms_status === activeTab;
  const wasInTab = activeTab === "todos" || previousStatus === activeTab;

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
}

function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 32);
}

function dedupeAndSortTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeTagName(tag);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function normalizeContactTagsMap(input: Record<string, string[]>): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [contactId, tags] of Object.entries(input)) {
    next[contactId] = dedupeAndSortTags(tags ?? []);
  }
  return next;
}

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
  const [archivingContactId, setArchivingContactId] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [contactTagsById, setContactTagsById] = useState<Record<string, string[]>>({});
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>("__all");

  const sseRef = useRef<{ close: () => void } | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTabRef = useRef(activeTab);
  const selectedContactIdRef = useRef<string | null>(selectedContactId);
  activeTabRef.current = activeTab;
  selectedContactIdRef.current = selectedContactId;

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
  const selectedContactTags = selectedContactId ? (contactTagsById[selectedContactId] ?? []) : [];
  const filteredContacts = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return contacts.filter((contact) => {
      const contactTags = contactTagsById[contact.id] ?? [];
      const matchesTagFilter = selectedTagFilter === "__all"
        || contactTags.some((tag) => tag.toLowerCase() === selectedTagFilter.toLowerCase());

      if (!matchesTagFilter) return false;
      if (!query) return true;

      const textBlock = [
        contact.nombre,
        contact.telefono,
        contact.zona,
        contact.distrito,
        contact.candidato_preferido,
        contact.encuestador,
        contact.cms_operator_notes?.comentarios ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesTagSearch = contactTags.some((tag) => tag.toLowerCase().includes(query));
      return textBlock.includes(query) || matchesTagSearch;
    });
  }, [contacts, contactTagsById, debouncedSearch, selectedTagFilter]);

  const fetchContacts = useCallback(async () => {
    if (!activeCampaignId) return;

    setLoading(true);
    setOffset(0);
    setUiError(null);

    const [contactsRes, statsRes] = await Promise.all([
      listCmsContacts(activeCampaignId, activeTab, PAGE_LIMIT, 0, ""),
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
  }, [activeCampaignId, activeTab]);

  const handleLoadMore = useCallback(async () => {
    if (!activeCampaignId || loadingMore) return;

    setLoadingMore(true);
    const nextOffset = offset + PAGE_LIMIT;
    const res = await listCmsContacts(
      activeCampaignId,
      activeTab,
      PAGE_LIMIT,
      nextOffset,
      "",
    );

    if (res.ok) {
      setContacts((prev) => [...prev, ...res.contacts]);
      setOffset(nextOffset);
    } else {
      setUiError(res.error ?? "No se pudieron cargar mas contactos");
    }

    setLoadingMore(false);
  }, [activeCampaignId, activeTab, loadingMore, offset]);

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
    if (!activeCampaignId) {
      setAvailableTags([]);
      setContactTagsById({});
      setSelectedTagFilter("__all");
      return;
    }

    try {
      const storedTags = window.localStorage.getItem(`cms:tags:${activeCampaignId}`);
      const storedContactTags = window.localStorage.getItem(`cms:contact-tags:${activeCampaignId}`);
      setAvailableTags(storedTags ? dedupeAndSortTags(JSON.parse(storedTags) as string[]) : []);
      setContactTagsById(
        storedContactTags
          ? normalizeContactTagsMap(JSON.parse(storedContactTags) as Record<string, string[]>)
          : {},
      );
    } catch {
      setAvailableTags([]);
      setContactTagsById({});
    }
  }, [activeCampaignId]);

  useEffect(() => {
    if (!activeCampaignId) return;
    window.localStorage.setItem(
      `cms:tags:${activeCampaignId}`,
      JSON.stringify(dedupeAndSortTags(availableTags)),
    );
  }, [activeCampaignId, availableTags]);

  useEffect(() => {
    if (!activeCampaignId) return;
    window.localStorage.setItem(
      `cms:contact-tags:${activeCampaignId}`,
      JSON.stringify(normalizeContactTagsMap(contactTagsById)),
    );
  }, [activeCampaignId, contactTagsById]);

  useEffect(() => {
    if (selectedTagFilter === "__all") return;
    const exists = availableTags.some((tag) => tag.toLowerCase() === selectedTagFilter.toLowerCase());
    if (!exists) {
      setSelectedTagFilter("__all");
    }
  }, [selectedTagFilter, availableTags]);

  useEffect(() => {
    if (!filteredContacts.length) {
      setSelectedContactId(null);
      return;
    }

    setSelectedContactId((prev) => {
      if (prev && filteredContacts.some((contact) => contact.id === prev)) {
        return prev;
      }
      return filteredContacts[0]?.id ?? null;
    });
  }, [filteredContacts]);

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

    async function syncSelectedContactMessages(contactId: string): Promise<void> {
      if (!contactId) return;
      if (selectedContactIdRef.current !== contactId) return;

      const res = await getContactWhatsAppMessages(campaignId, contactId);
      if (selectedContactIdRef.current !== contactId) return;

      if (res.ok) {
        setMessagesByContact((prev) => ({ ...prev, [contactId]: res.messages }));
        setMessagesErrorByContact((prev) => ({ ...prev, [contactId]: null }));
      } else {
        setMessagesErrorByContact((prev) => ({
          ...prev,
          [contactId]: res.error ?? "No se pudieron cargar los mensajes",
        }));
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
          const selectedId = selectedContactIdRef.current;
          if (selectedId) {
            void syncSelectedContactMessages(selectedId);
          }
          return;
        }

        if (event === "heartbeat") return;

        if (event === "contact.updated") {
          const payload = data as CmsSseContactUpdated;
          const contact = payload.contact;
          const previousStatus = payload.previous_status;
          const active = activeTabRef.current;

          setContacts((prev) => mergeContactForActiveTab(prev, contact, previousStatus, active));

          if (selectedContactIdRef.current === contact.id) {
            void syncSelectedContactMessages(contact.id);
          }

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

        // New WhatsApp message (inbound or outbound from another tab/operator)
        if (event === "message.new") {
          const payload = data as { contact_id: string; direction: string; message_id: string };
          // Reload messages if this contact is currently selected
          if (selectedContactIdRef.current === payload.contact_id) {
            void syncSelectedContactMessages(payload.contact_id);
          }
        }

        // WhatsApp message status update (delivered, read, etc.)
        if (event === "message.status") {
          const payload = data as { contact_id: string; twilio_sid: string; status: string };
          if (selectedContactIdRef.current === payload.contact_id) {
            void syncSelectedContactMessages(payload.contact_id);
          }
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

  const handleCreateTag = useCallback((rawName: string): string | null => {
    const normalized = normalizeTagName(rawName);
    if (!normalized) return null;

    const existing = availableTags.find((tag) => tag.toLowerCase() === normalized.toLowerCase());
    const canonical = existing ?? normalized;

    setAvailableTags((prev) => {
      const hasTag = prev.some((tag) => tag.toLowerCase() === canonical.toLowerCase());
      if (hasTag) return prev;
      return dedupeAndSortTags([...prev, canonical]);
    });

    return canonical;
  }, [availableTags]);

  const handleAssignTag = useCallback((contactId: string, rawName: string): boolean => {
    const tag = normalizeTagName(rawName);
    if (!tag) return false;

    setContactTagsById((prev) => {
      const current = prev[contactId] ?? [];
      if (current.some((item) => item.toLowerCase() === tag.toLowerCase())) return prev;
      return {
        ...prev,
        [contactId]: dedupeAndSortTags([...current, tag]),
      };
    });

    return true;
  }, []);

  const handleRemoveTag = useCallback((contactId: string, tagName: string) => {
    setContactTagsById((prev) => {
      const current = prev[contactId] ?? [];
      const next = current.filter((item) => item.toLowerCase() !== tagName.toLowerCase());
      if (next.length === current.length) return prev;
      return { ...prev, [contactId]: next };
    });
  }, []);

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

    if (selectedContact?.cms_status === "nuevo") {
      const prevStatus: CmsStatus = selectedContact.cms_status;
      const habladoRes = await markHablado(activeCampaignId, selectedContactId);
      if (habladoRes.ok && habladoRes.contact) {
        const updated = habladoRes.contact;
        setContacts((prev) =>
          mergeContactForActiveTab(prev, updated, prevStatus, activeTabRef.current),
        );
        setNotesContact((prev) => (prev && prev.id === updated.id ? updated : prev));
      } else {
        setUiError((prev) => prev ?? "Mensaje enviado, pero no se pudo marcar como hablado");
      }
    }

    await loadMessages(selectedContactId, { silent: true });
    setSendingByContact((prev) => ({ ...prev, [selectedContactId]: false }));
  }, [
    activeCampaignId,
    loadMessages,
    selectedContactId,
    selectedContact,
    selectedDraft,
    user?.id,
  ]);

  const handleArchiveContact = useCallback(async (contactId: string) => {
    if (!activeCampaignId) return;
    const current = contacts.find((item) => item.id === contactId);
    if (!current || current.cms_status === "archivado") return;

    setArchivingContactId(contactId);
    setUiError(null);

    const res = await archiveContact(activeCampaignId, contactId);
    if (res.ok && res.contact) {
      const updated = res.contact;
      setContacts((prev) =>
        mergeContactForActiveTab(prev, updated, current.cms_status, activeTabRef.current),
      );
      setNotesContact((prev) => (prev && prev.id === updated.id ? updated : prev));
    } else {
      setUiError(res.error ?? "No se pudo archivar el contacto");
    }

    setArchivingContactId(null);
  }, [activeCampaignId, contacts]);

  const handleSaveNotes = useCallback(
    async (
      id: string,
      notes: CmsOperatorNotes,
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

              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <select
                  value={selectedTagFilter}
                  onChange={(event) => setSelectedTagFilter(event.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: "1px solid #d6dde6",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 12,
                    fontFamily: FONT,
                    background: "#ffffff",
                    color: "#334155",
                  }}
                >
                  <option value="__all">Todas las etiquetas</option>
                  {availableTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const raw = window.prompt("Nueva etiqueta");
                    if (!raw) return;
                    const created = handleCreateTag(raw);
                    if (!created) return;
                    setSelectedTagFilter(created);
                  }}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#334155",
                    fontSize: 20,
                    lineHeight: 1,
                    cursor: "pointer",
                  }}
                  title="Crear etiqueta"
                  aria-label="Crear etiqueta"
                >
                  +
                </button>
              </div>
            </div>

            <div className="cms-chat-contact-list">
              {loading ? (
                <div style={{ padding: 22, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                  Cargando contactos...
                </div>
              ) : filteredContacts.length === 0 ? (
                <div style={{ padding: 22, textAlign: "center", color: "#64748b" }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {search || selectedTagFilter !== "__all"
                      ? "Sin resultados para los filtros aplicados"
                      : "No hay contactos en este filtro"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    {search || selectedTagFilter !== "__all"
                      ? "Prueba con otra búsqueda o etiqueta"
                      : "Los contactos aparecen cuando ingresan formularios"}
                  </div>
                </div>
              ) : (
                filteredContacts.map((contact) => (
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
                {filteredContacts.length} visibles · {contacts.length} cargados de {total}
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
              onArchiveContact={handleArchiveContact}
              archiving={Boolean(selectedContactId && archivingContactId === selectedContactId)}
              contactTags={selectedContactTags}
              availableTags={availableTags}
              onCreateTag={handleCreateTag}
              onAssignTag={handleAssignTag}
              onRemoveTag={handleRemoveTag}
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
            right: panelOpen ? NOTES_PANEL_WIDTH + NOTES_PANEL_GAP + 24 : 24,
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
          width: 100%;
          height: 100%;
          min-height: 0;
          border: 1px solid #d6dde6;
          border-radius: 16px;
          overflow: hidden;
          background: #f0f2f5;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
          display: flex;
          transition: width 240ms ease;
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
          .cms-chat-root.panel-open .cms-chat-shell {
            width: calc(100% - ${NOTES_PANEL_WIDTH + NOTES_PANEL_GAP}px);
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
