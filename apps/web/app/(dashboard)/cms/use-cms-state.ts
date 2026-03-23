"use client";

/**
 * useCmsState — all CMS page state, SSE connection, data fetching, callbacks.
 * Extracted from cms/page.tsx (~500 lines of logic).
 *
 * NOTE: This hook exceeds the ~100-line ideal for hooks but encapsulates a
 * complex, tightly-coupled feature (SSE + optimistic updates + pagination).
 * Splitting further would create circular dependencies between sub-hooks.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  listCmsContacts,
  updateContactNotes,
  getCmsStats,
  getCmsTags,
  setContactTags as apiSetContactTags,
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
  type CmsSseTagsUpdated,
  type CmsTwilioMessage,
} from "@/lib/services/cms";

import {
  mergeContactForActiveTab,
  normalizeTagName,
  getContactLastInteractionMs,
  PAGE_LIMIT,
} from "./utils";

// ── Tab config ──────────────────────────────────────────────────────

export type Tab = {
  key: CmsTabFilter;
  label: string;
  statKey: keyof CmsStats | null;
};

export const TABS: Tab[] = [
  { key: "todos", label: "Todos", statKey: "total" },
  { key: "nuevo", label: "No hablados", statKey: "nuevos" },
  { key: "hablado", label: "Hablados", statKey: "hablados" },
  { key: "respondieron", label: "Contestaron", statKey: "respondieron" },
  { key: "archivado", label: "Archivados", statKey: "archivados" },
];

// ── Hook ────────────────────────────────────────────────────────────

export function useCmsState() {
  const { user, activeCampaignId } = useAuth();

  // ── Core state
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
  const [messagesByContact, setMessagesByContact] = useState<Record<string, CmsTwilioMessage[]>>({});
  const [messagesLoadingByContact, setMessagesLoadingByContact] = useState<Record<string, boolean>>({});
  const [messagesErrorByContact, setMessagesErrorByContact] = useState<Record<string, string | null>>({});
  const [draftByContact, setDraftByContact] = useState<Record<string, string>>({});
  const [sendingByContact, setSendingByContact] = useState<Record<string, boolean>>({});
  const [archivingContactId, setArchivingContactId] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>("__all");
  const [mobileActivePane, setMobileActivePane] = useState<"list" | "chat">("list");

  // ── Refs
  const sseRef = useRef<{ close: () => void } | null>(null);
  const contactListRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTabRef = useRef(activeTab);
  const selectedContactIdRef = useRef<string | null>(selectedContactId);
  activeTabRef.current = activeTab;
  selectedContactIdRef.current = selectedContactId;

  // ── Derived state
  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) ?? null,
    [contacts, selectedContactId],
  );
  const mobileChatOpen = mobileActivePane === "chat" && selectedContact !== null;
  const panelOpen = notesContact !== null;

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
  const selectedContactTags = selectedContact?.cms_tags ?? [];

  const filteredContacts = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    const filtered = contacts.filter((contact) => {
      const tags = contact.cms_tags ?? [];
      const matchesTagFilter =
        selectedTagFilter === "__all" ||
        tags.some((tag) => tag.toLowerCase() === selectedTagFilter.toLowerCase());
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
      const matchesTagSearch = tags.some((tag) => tag.toLowerCase().includes(query));
      return textBlock.includes(query) || matchesTagSearch;
    });
    return filtered.slice().sort((a, b) => getContactLastInteractionMs(b) - getContactLastInteractionMs(a));
  }, [contacts, debouncedSearch, selectedTagFilter]);

  // WebSocket for real-time WhatsApp messages — removed (CMS uses SSE instead)

  // ── Data fetching
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
    if (!activeCampaignId || loadingMoreRef.current) return;
    if (contacts.length >= total) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextOffset = offset + PAGE_LIMIT;
      const res = await listCmsContacts(activeCampaignId, activeTab, PAGE_LIMIT, nextOffset, "");
      if (res.ok) {
        setContacts((prev) => {
          const byId = new Map<string, CmsContact>();
          for (const item of prev) byId.set(item.id, item);
          for (const item of res.contacts) byId.set(item.id, item);
          return Array.from(byId.values());
        });
        setOffset(nextOffset);
      } else {
        setUiError(res.error ?? "No se pudieron cargar mas contactos");
      }
    } catch {
      setUiError("No se pudieron cargar mas contactos");
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [activeCampaignId, activeTab, contacts.length, offset, total]);

  const loadMessages = useCallback(
    async (contactId: string, opts?: { silent?: boolean }) => {
      if (!activeCampaignId) return;
      const silent = opts?.silent ?? false;
      if (!silent) setMessagesLoadingByContact((prev) => ({ ...prev, [contactId]: true }));

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
      if (!silent) setMessagesLoadingByContact((prev) => ({ ...prev, [contactId]: false }));
    },
    [activeCampaignId],
  );

  // ── Effects: infinite scroll
  useEffect(() => {
    if (loading || loadingMore) return;
    if (contacts.length >= total) return;
    const root = contactListRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void handleLoadMore();
      },
      { root, rootMargin: "180px 0px", threshold: 0.01 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [contacts.length, total, handleLoadMore, loading, loadingMore]);

  // ── Effects: fetch on tab/campaign change
  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // ── Effects: reset on campaign change
  useEffect(() => {
    setMessagesByContact({});
    setMessagesLoadingByContact({});
    setMessagesErrorByContact({});
    setDraftByContact({});
    setSendingByContact({});
  }, [activeCampaignId]);

  // ── Effects: load available tags
  useEffect(() => {
    if (!activeCampaignId) {
      setAvailableTags([]);
      setSelectedTagFilter("__all");
      return;
    }
    getCmsTags(activeCampaignId).then((res) => {
      if (res.ok) setAvailableTags(res.tags);
    });
  }, [activeCampaignId]);

  // ── Effects: reset tag filter if tag removed
  useEffect(() => {
    if (selectedTagFilter === "__all") return;
    const exists = availableTags.some((tag) => tag.toLowerCase() === selectedTagFilter.toLowerCase());
    if (!exists) setSelectedTagFilter("__all");
  }, [selectedTagFilter, availableTags]);

  // ── Effects: auto-select first contact
  useEffect(() => {
    if (!filteredContacts.length) { setSelectedContactId(null); return; }
    setSelectedContactId((prev) => {
      if (prev && filteredContacts.some((c) => c.id === prev)) return prev;
      return filteredContacts[0]?.id ?? null;
    });
  }, [filteredContacts]);

  // ── Effects: reset mobile pane
  useEffect(() => { if (!selectedContactId) setMobileActivePane("list"); }, [selectedContactId]);
  useEffect(() => { setMobileActivePane("list"); }, [activeCampaignId]);

  // ── Effects: keep notesContact in sync
  useEffect(() => {
    if (!notesContact) return;
    const refreshed = contacts.find((c) => c.id === notesContact.id);
    if (refreshed && refreshed !== notesContact) setNotesContact(refreshed);
  }, [contacts, notesContact]);

  // ── Effects: search debounce
  useEffect(() => {
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, []);

  // ── Effects: load messages for selected contact
  useEffect(() => {
    if (!selectedContactId) return;
    loadMessages(selectedContactId);
  }, [selectedContactId, loadMessages]);

  // ── SSE connection
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
      } catch { return false; }
    }

    async function syncSelectedContactMessages(contactId: string): Promise<void> {
      if (!contactId || selectedContactIdRef.current !== contactId) return;
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
          headers: { "x-campaign-id": campaignId, Accept: "text/event-stream" },
          signal: controller.signal,
          credentials: "same-origin",
        });

        if (res.status === 401) {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            res = await fetch("/api/cms/stream", {
              headers: { "x-campaign-id": campaignId, Accept: "text/event-stream" },
              signal: controller.signal,
              credentials: "same-origin",
            });
          }
        }

        if (!res.ok || !res.body) throw new Error(`CMS SSE error: ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "";
        let currentData = "";

        async function processChunk(): Promise<void> {
          const { done, value } = await reader.read();
          if (done) {
            if (currentEvent && currentData) handleSseEvent(currentEvent, currentData);
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              if (currentEvent && currentData) handleSseEvent(currentEvent, currentData);
              currentEvent = line.substring(7).trim();
              currentData = "";
            } else if (line.startsWith("data: ")) {
              currentData += (currentData ? "\n" : "") + line.substring(6);
            } else if (line.trim() === "") {
              if (currentEvent && currentData) handleSseEvent(currentEvent, currentData);
              currentEvent = "";
              currentData = "";
            }
          }
          return processChunk();
        }

        await processChunk();
        attempt = 0;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }

      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      attempt++;
      retryTimeout = setTimeout(connect, delay);
    }

    function handleSseEvent(event: string, dataStr: string) {
      try {
        const data = JSON.parse(dataStr);
        if (event === "connected") {
          attempt = 0;
          const selectedId = selectedContactIdRef.current;
          if (selectedId) void syncSelectedContactMessages(selectedId);
          return;
        }
        if (event === "heartbeat") return;

        if (event === "contact.updated") {
          const payload = data as CmsSseContactUpdated;
          setContacts((prev) => mergeContactForActiveTab(prev, payload.contact, payload.previous_status, activeTabRef.current));
          if (selectedContactIdRef.current === payload.contact.id) void syncSelectedContactMessages(payload.contact.id);
          if (payload.stats) {
            setStats(payload.stats);
          } else if (campaignId) {
            getCmsStats(campaignId).then((r) => { if (r.ok && r.stats) setStats(r.stats); });
          }
        }

        if (event === "contact.notes_updated") {
          const payload = data as CmsSseNotesUpdated;
          setContacts((prev) => prev.map((item) => (item.id === payload.contact.id ? payload.contact : item)));
          setNotesContact((prev) => (prev && prev.id === payload.contact.id ? payload.contact : prev));
        }

        if (event === "contact.tags_updated") {
          const payload = data as CmsSseTagsUpdated;
          setContacts((prev) => prev.map((item) => (item.id === payload.contact.id ? payload.contact : item)));
          if (campaignId) getCmsTags(campaignId).then((r) => { if (r.ok) setAvailableTags(r.tags); });
        }

        if (event === "message.new") {
          const payload = data as { contact_id: string };
          if (selectedContactIdRef.current === payload.contact_id) void syncSelectedContactMessages(payload.contact_id);
        }

        if (event === "message.status") {
          const payload = data as { contact_id: string };
          if (selectedContactIdRef.current === payload.contact_id) void syncSelectedContactMessages(payload.contact_id);
        }
      } catch { /* Ignore malformed events */ }
    }

    connect();
    return () => { sseRef.current?.close(); clearTimeout(retryTimeout); };
  }, [activeCampaignId]);

  // ── Callbacks exposed to the page
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(value), 350);
  }, []);

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

  const handleSelectContact = useCallback((contactId: string) => {
    setSelectedContactId(contactId);
    setMobileActivePane("chat");
  }, []);

  const handleBackToContactList = useCallback(() => setMobileActivePane("list"), []);

  const handleCreateTag = useCallback(
    (rawName: string): string | null => {
      const normalized = normalizeTagName(rawName);
      if (!normalized) return null;
      const existing = availableTags.find((tag) => tag.toLowerCase() === normalized.toLowerCase());
      const canonical = existing ?? normalized;
      setAvailableTags((prev) => {
        const hasTag = prev.some((tag) => tag.toLowerCase() === canonical.toLowerCase());
        if (hasTag) return prev;
        return [...prev, canonical].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
      });
      return canonical;
    },
    [availableTags],
  );

  const handleAssignTag = useCallback(
    (contactId: string, rawName: string): boolean => {
      if (!activeCampaignId) return false;
      const tag = normalizeTagName(rawName);
      if (!tag) return false;
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) return false;
      const currentTags = contact.cms_tags ?? [];
      if (currentTags.some((item) => item.toLowerCase() === tag.toLowerCase())) return false;

      const newTags = [...currentTags, tag];
      setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, cms_tags: newTags } : c)));

      apiSetContactTags(activeCampaignId, contactId, newTags).then((res) => {
        if (!res.ok) {
          setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, cms_tags: currentTags } : c)));
          setUiError(res.error ?? "No se pudo asignar la etiqueta");
        } else if (res.contact) {
          setContacts((prev) => prev.map((c) => (c.id === contactId ? res.contact! : c)));
        }
      });
      return true;
    },
    [activeCampaignId, contacts],
  );

  const handleRemoveTag = useCallback(
    (contactId: string, tagName: string) => {
      if (!activeCampaignId) return;
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) return;
      const currentTags = contact.cms_tags ?? [];
      const newTags = currentTags.filter((item) => item.toLowerCase() !== tagName.toLowerCase());
      if (newTags.length === currentTags.length) return;

      setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, cms_tags: newTags } : c)));

      apiSetContactTags(activeCampaignId, contactId, newTags).then((res) => {
        if (!res.ok) {
          setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, cms_tags: currentTags } : c)));
          setUiError(res.error ?? "No se pudo quitar la etiqueta");
        } else if (res.contact) {
          setContacts((prev) => prev.map((c) => (c.id === contactId ? res.contact! : c)));
        }
      });
    },
    [activeCampaignId, contacts],
  );

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
        setContacts((prev) => mergeContactForActiveTab(prev, updated, prevStatus, activeTabRef.current));
        setNotesContact((prev) => (prev && prev.id === updated.id ? updated : prev));
      } else {
        setUiError((prev) => prev ?? "Mensaje enviado, pero no se pudo marcar como hablado");
      }
    }

    await loadMessages(selectedContactId, { silent: true });
    setSendingByContact((prev) => ({ ...prev, [selectedContactId]: false }));
  }, [activeCampaignId, loadMessages, selectedContactId, selectedContact, selectedDraft, user?.id]);

  const handleArchiveContact = useCallback(
    async (contactId: string) => {
      if (!activeCampaignId) return;
      const current = contacts.find((item) => item.id === contactId);
      if (!current || current.cms_status === "archivado") return;

      setArchivingContactId(contactId);
      setUiError(null);

      const res = await archiveContact(activeCampaignId, contactId);
      if (res.ok && res.contact) {
        const updated = res.contact;
        setContacts((prev) => mergeContactForActiveTab(prev, updated, current.cms_status, activeTabRef.current));
        setNotesContact((prev) => (prev && prev.id === updated.id ? updated : prev));
      } else {
        setUiError(res.error ?? "No se pudo archivar el contacto");
      }
      setArchivingContactId(null);
    },
    [activeCampaignId, contacts],
  );

  const handleSaveNotes = useCallback(
    async (id: string, notes: CmsOperatorNotes) => {
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

  return {
    // Auth
    activeCampaignId,

    // Core state
    activeTab,
    setActiveTab,
    contacts,
    stats,
    total,
    loading,
    loadingMore,
    filteredContacts,
    search,
    uiError,
    setUiError,

    // Selection
    selectedContactId,
    selectedContact,
    mobileChatOpen,
    mobileActivePane,

    // Messages
    selectedMessages,
    selectedMessagesLoading,
    selectedMessagesError,
    selectedDraft,
    selectedSending,
    latestMessageByContact,

    // Notes
    notesContact,
    setNotesContact,
    savingNotes,
    panelOpen,

    // Tags
    availableTags,
    selectedTagFilter,
    setSelectedTagFilter,
    selectedContactTags,

    // Archive
    archivingContactId,

    // Refs
    contactListRef,
    loadMoreSentinelRef,

    // Handlers
    handleSearchChange,
    handleSelectContact,
    handleBackToContactList,
    handleDraftChange,
    handleSendMessage,
    handleRefreshMessages,
    handleArchiveContact,
    handleSaveNotes,
    handleCreateTag,
    handleAssignTag,
    handleRemoveTag,
  };
}
