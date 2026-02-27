"use client";

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
import { useChatWs } from "@/lib/hooks";
import {
  ChatContactListItem,
  ChatConversationPane,
  ContactNotesPanel,
} from "./_components";

const FONT = "var(--font-montserrat), system-ui, sans-serif";
const NOTES_PANEL_WIDTH = 400;
const NOTES_PANEL_GAP = 32;
const PAGE_LIMIT = 25;
const MOBILE_CHAT_BREAKPOINT_PX = 768;
const OPEN_MOBILE_SIDEBAR_EVENT = "goberna:open-mobile-sidebar";
const TAG_COLOR_PALETTE = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#84cc16",
  "#ec4899",
  "#6366f1",
] as const;

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

function hashTag(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getTagColor(tagName: string): string {
  const normalized = normalizeTagName(tagName).toLowerCase();
  if (!normalized) return TAG_COLOR_PALETTE[0];
  return TAG_COLOR_PALETTE[hashTag(normalized) % TAG_COLOR_PALETTE.length];
}

function withAlpha(hexColor: string, alpha: number): string {
  const sanitized = hexColor.replace("#", "");
  const fullHex = sanitized.length === 3
    ? sanitized.split("").map((ch) => `${ch}${ch}`).join("")
    : sanitized;

  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    return `rgba(59, 130, 246, ${alpha})`;
  }

  const r = Number.parseInt(fullHex.slice(0, 2), 16);
  const g = Number.parseInt(fullHex.slice(2, 4), 16);
  const b = Number.parseInt(fullHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

function getContactLastInteractionMs(contact: CmsContact): number {
  const updatedAt = (contact as CmsContact & { updated_at?: string }).updated_at;
  const dataLastInteraction = typeof contact.data?.last_interaction_at === "string"
    ? contact.data.last_interaction_at
    : null;
  const dataLastMessage = typeof contact.data?.last_message_at === "string"
    ? contact.data.last_message_at
    : null;

  return Math.max(
    toMs(contact.cms_respondieron_at),
    toMs(contact.cms_hablado_at),
    toMs(contact.cms_claimed_at),
    toMs(updatedAt),
    toMs(dataLastInteraction),
    toMs(dataLastMessage),
    toMs(contact.created_at),
  );
}

export default function CmsPage() {
  const { user, activeCampaignId } = useAuth();

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
  const [tagSearchSidebar, setTagSearchSidebar] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [mobileActivePane, setMobileActivePane] = useState<"list" | "chat">("list");
  const tagDropdownRef = useRef<HTMLDivElement | null>(null);

  const sseRef = useRef<{ close: () => void } | null>(null);
  const contactListRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTabRef = useRef(activeTab);
  const selectedContactIdRef = useRef<string | null>(selectedContactId);
  activeTabRef.current = activeTab;
  selectedContactIdRef.current = selectedContactId;

  // Close tag dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setShowTagDropdown(false);
      }
    }
    if (showTagDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTagDropdown]);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) ?? null,
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
  const selectedFilterColor = selectedTagFilter === "__all"
    ? "#3b82f6"
    : getTagColor(selectedTagFilter);

  // ── WebSocket for real-time WhatsApp messages ───────────────────
  const handleChatWsEvent = useCallback(
    (event: { type: string; contactId: string }) => {
      // Reload messages for the affected contact if it's currently selected
      if (!activeCampaignId) return;
      if (selectedContactIdRef.current !== event.contactId) return;
      getContactWhatsAppMessages(activeCampaignId, event.contactId).then((res) => {
        if (selectedContactIdRef.current !== event.contactId) return;
        if (res.ok) {
          setMessagesByContact((prev) => ({ ...prev, [event.contactId]: res.messages }));
          setMessagesErrorByContact((prev) => ({ ...prev, [event.contactId]: null }));
        }
      });
    },
    [activeCampaignId],
  );

  useChatWs({
    campaignId: activeCampaignId,
    contactId: selectedContactId,
    onMessageEvent: handleChatWsEvent,
  });

  const filteredContacts = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    const filtered = contacts.filter((contact) => {
      const tags = contact.cms_tags ?? [];
      const matchesTagFilter = selectedTagFilter === "__all"
        || tags.some((tag) => tag.toLowerCase() === selectedTagFilter.toLowerCase());

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
      const res = await listCmsContacts(
        activeCampaignId,
        activeTab,
        PAGE_LIMIT,
        nextOffset,
        "",
      );

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

  useEffect(() => {
    if (loading || loadingMore) return;
    if (contacts.length >= total) return;

    const root = contactListRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        void handleLoadMore();
      },
      {
        root,
        rootMargin: "180px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [contacts.length, total, handleLoadMore, loading, loadingMore]);

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
      setSelectedTagFilter("__all");
      return;
    }

    getCmsTags(activeCampaignId).then((res) => {
      if (res.ok) {
        setAvailableTags(res.tags);
      }
    });
  }, [activeCampaignId]);

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
    if (selectedContactId) return;
    setMobileActivePane("list");
  }, [selectedContactId]);

  useEffect(() => {
    setMobileActivePane("list");
  }, [activeCampaignId]);

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

        if (event === "contact.tags_updated") {
          const payload = data as CmsSseTagsUpdated;
          const contact = payload.contact;

          setContacts((prev) =>
            prev.map((item) => (item.id === contact.id ? contact : item)),
          );

          // Refresh available tags list since new tags may have been created
          if (campaignId) {
            getCmsTags(campaignId).then((res) => {
              if (res.ok) setAvailableTags(res.tags);
            });
          }
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

  const handleSelectContact = useCallback((contactId: string) => {
    setSelectedContactId(contactId);
    setMobileActivePane("chat");
  }, []);

  const handleBackToContactList = useCallback(() => {
    setMobileActivePane("list");
  }, []);

  const handleOpenMobileSidebar = useCallback(() => {
    window.dispatchEvent(new Event(OPEN_MOBILE_SIDEBAR_EVENT));
  }, []);

  const handleCreateTag = useCallback((rawName: string): string | null => {
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
  }, [availableTags]);

  const handleAssignTag = useCallback((contactId: string, rawName: string): boolean => {
    if (!activeCampaignId) return false;
    const tag = normalizeTagName(rawName);
    if (!tag) return false;

    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return false;
    const currentTags = contact.cms_tags ?? [];
    if (currentTags.some((item) => item.toLowerCase() === tag.toLowerCase())) return false;

    const newTags = [...currentTags, tag];

    // Optimistic update
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, cms_tags: newTags } : c)),
    );

    // Persist to backend
    apiSetContactTags(activeCampaignId, contactId, newTags).then((res) => {
      if (!res.ok) {
        // Rollback
        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? { ...c, cms_tags: currentTags } : c)),
        );
        setUiError(res.error ?? "No se pudo asignar la etiqueta");
      } else if (res.contact) {
        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? res.contact! : c)),
        );
      }
    });

    return true;
  }, [activeCampaignId, contacts]);

  const handleRemoveTag = useCallback((contactId: string, tagName: string) => {
    if (!activeCampaignId) return;

    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    const currentTags = contact.cms_tags ?? [];
    const newTags = currentTags.filter((item) => item.toLowerCase() !== tagName.toLowerCase());
    if (newTags.length === currentTags.length) return;

    // Optimistic update
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, cms_tags: newTags } : c)),
    );

    // Persist to backend
    apiSetContactTags(activeCampaignId, contactId, newTags).then((res) => {
      if (!res.ok) {
        // Rollback
        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? { ...c, cms_tags: currentTags } : c)),
        );
        setUiError(res.error ?? "No se pudo quitar la etiqueta");
      } else if (res.contact) {
        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? res.contact! : c)),
        );
      }
    });
  }, [activeCampaignId, contacts]);

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
      className="cms-page-root"
      style={{
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100dvh - 64px)",
        height: "calc(100dvh - 64px)",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
      }}
    >
      <div className={`cms-chat-root ${panelOpen ? "panel-open" : ""}`}>
        <div className={`cms-chat-shell ${mobileChatOpen ? "mobile-chat-mode" : "mobile-list-mode"}`}>
          <aside className={`cms-chat-sidebar ${mobileChatOpen ? "is-hidden-mobile" : ""}`}>
            <div className="cms-chat-sidebar-head" style={{ padding: "12px 12px 10px", borderBottom: "1px solid #eef2f7" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <button
                  type="button"
                  className="cms-mobile-menu-btn"
                  onClick={handleOpenMobileSidebar}
                  aria-label="Abrir menu"
                  title="Abrir menu"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    border: "none",
                    background: "var(--goberna-blue-900)",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.22)",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
                    <title>Menu</title>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>

                <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
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
              </div>

              <div
                className="cms-chat-tabs-row"
                style={{
                  marginTop: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  overflowX: "auto",
                  overflowY: "hidden",
                  paddingBottom: 2,
                  WebkitOverflowScrolling: "touch",
                  scrollbarWidth: "none",
                }}
              >
                {TABS.map((tab) => {
                  const count = tab.statKey && stats ? stats[tab.statKey] : undefined;
                  const isActive = activeTab === tab.key;

                  return (
                    <button
                      className="cms-chat-tab-btn"
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

              <div style={{ marginTop: 8, position: "relative" }} ref={tagDropdownRef}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {selectedTagFilter !== "__all" && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "5px 8px",
                        borderRadius: 999,
                        border: `1px solid ${withAlpha(selectedFilterColor, 0.55)}`,
                        background: withAlpha(selectedFilterColor, 0.14),
                        fontSize: 11,
                        color: selectedFilterColor,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: getTagColor(selectedTagFilter),
                          flexShrink: 0,
                        }}
                      />
                      <span>{selectedTagFilter}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTagFilter("__all");
                          setTagSearchSidebar("");
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: selectedFilterColor,
                          padding: 0,
                          cursor: "pointer",
                          fontSize: 13,
                          lineHeight: 1,
                          fontWeight: 700,
                        }}
                        aria-label="Quitar filtro de etiqueta"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  <input
                    type="text"
                    placeholder={selectedTagFilter === "__all" ? "Filtrar por etiqueta..." : "Cambiar etiqueta..."}
                    value={tagSearchSidebar}
                    onChange={(e) => setTagSearchSidebar(e.target.value)}
                    onFocus={() => setShowTagDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setTagSearchSidebar("");
                        setShowTagDropdown(false);
                        (e.target as HTMLInputElement).blur();
                      }
                      if (e.key === "Enter" && tagSearchSidebar.trim()) {
                        const query = tagSearchSidebar.trim().toLowerCase();
                        const match = availableTags.find((t) => t.toLowerCase().includes(query));
                        if (match) {
                          setSelectedTagFilter(match);
                          setTagSearchSidebar("");
                          setShowTagDropdown(false);
                        } else {
                          const created = handleCreateTag(tagSearchSidebar);
                          if (created) {
                            setSelectedTagFilter(created);
                            setTagSearchSidebar("");
                            setShowTagDropdown(false);
                          }
                        }
                      }
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: showTagDropdown ? "1px solid #93c5fd" : "1px solid #d6dde6",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 12,
                      fontFamily: FONT,
                      background: "#ffffff",
                      color: "#0f172a",
                      outline: "none",
                      boxShadow: showTagDropdown ? "0 0 0 3px rgba(59, 130, 246, 0.1)" : "none",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                    }}
                  />
                </div>

                {showTagDropdown && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      background: "#ffffff",
                      border: "1px solid #d6dde6",
                      borderRadius: 10,
                      boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
                      zIndex: 50,
                      maxHeight: 220,
                      overflowY: "auto",
                      animation: "tagDropdownIn 0.15s ease-out",
                    }}
                  >
                    {/* "Todas" option */}
                    {!tagSearchSidebar.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTagFilter("__all");
                          setTagSearchSidebar("");
                          setShowTagDropdown(false);
                        }}
                        style={{
                          display: "flex",
                          width: "100%",
                          alignItems: "center",
                          gap: 8,
                          textAlign: "left",
                          padding: "9px 12px",
                          fontSize: 12,
                          fontFamily: FONT,
                          border: "none",
                          borderBottom: availableTags.length > 0 ? "1px solid #f1f5f9" : "none",
                          background: selectedTagFilter === "__all" ? "#f0f7ff" : "transparent",
                          color: "#3b82f6",
                          cursor: "pointer",
                          fontWeight: 700,
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f7ff"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = selectedTagFilter === "__all" ? "#f0f7ff" : "transparent"; }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />
                        Todas las etiquetas
                        {selectedTagFilter === "__all" && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" style={{ marginLeft: "auto" }}>
                            <title>Seleccionado</title>
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                    )}

                    {/* Filtered tag list */}
                    {availableTags
                      .filter((t) => !tagSearchSidebar.trim() || t.toLowerCase().includes(tagSearchSidebar.trim().toLowerCase()))
                      .map((tag) => {
                        const isActive = selectedTagFilter.toLowerCase() === tag.toLowerCase();
                        const tagColor = getTagColor(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setSelectedTagFilter(tag);
                              setTagSearchSidebar("");
                              setShowTagDropdown(false);
                            }}
                            style={{
                              display: "flex",
                              width: "100%",
                              alignItems: "center",
                              gap: 8,
                              textAlign: "left",
                              padding: "9px 12px",
                              fontSize: 12,
                              fontFamily: FONT,
                              border: "none",
                              background: isActive ? withAlpha(tagColor, 0.08) : "transparent",
                              color: tagColor,
                              cursor: "pointer",
                              fontWeight: 600,
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = withAlpha(tagColor, 0.08); }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? withAlpha(tagColor, 0.08) : "transparent"; }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: tagColor, flexShrink: 0 }} />
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tag}</span>
                            {isActive && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tagColor} strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                <title>Seleccionado</title>
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            )}
                          </button>
                        );
                      })}

                    {/* Create new tag option */}
                    {tagSearchSidebar.trim() && !availableTags.some((t) =>
                      t.toLowerCase() === tagSearchSidebar.trim().toLowerCase(),
                    ) && (
                      <button
                        type="button"
                        onClick={() => {
                          const created = handleCreateTag(tagSearchSidebar);
                          if (created) {
                            setSelectedTagFilter(created);
                            setTagSearchSidebar("");
                            setShowTagDropdown(false);
                          }
                        }}
                        style={{
                          display: "flex",
                          width: "100%",
                          alignItems: "center",
                          gap: 8,
                          textAlign: "left",
                          padding: "9px 12px",
                          fontSize: 12,
                          fontFamily: FONT,
                          border: "none",
                          borderTop: "1px solid #f1f5f9",
                          background: "transparent",
                          color: getTagColor(tagSearchSidebar),
                          cursor: "pointer",
                          fontWeight: 600,
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: getTagColor(tagSearchSidebar), flexShrink: 0 }} />
                        <span>+ Crear &ldquo;{tagSearchSidebar.trim()}&rdquo;</span>
                      </button>
                    )}

                    {/* No results */}
                    {tagSearchSidebar.trim() &&
                      availableTags.filter((t) => t.toLowerCase().includes(tagSearchSidebar.trim().toLowerCase())).length === 0 &&
                      availableTags.some((t) => t.toLowerCase() === tagSearchSidebar.trim().toLowerCase()) && (
                        <div style={{ padding: "9px 12px", fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
                          No hay mas resultados
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>

            <div className="cms-chat-contact-list" ref={contactListRef}>
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
                    onSelect={handleSelectContact}
                    onOpenProfile={setNotesContact}
                  />
                ))
              )}

              {!loading && contacts.length < total && (
                <div ref={loadMoreSentinelRef} style={{ height: 1 }} />
              )}

              {!loading && loadingMore && (
                <div style={{ padding: "8px 12px", textAlign: "center", fontSize: 12, color: "#64748b" }}>
                  Cargando mas contactos...
                </div>
              )}
            </div>

            <div
              className="cms-chat-sidebar-footer"
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
            </div>
          </aside>

          <section className={`cms-chat-main ${!mobileChatOpen ? "is-hidden-mobile" : ""}`}>
            <ChatConversationPane
              contact={selectedContact}
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
              showMobileBackButton={mobileChatOpen}
              onBackToList={handleBackToContactList}
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

      <style>{`
        .cms-chat-root {
          flex: 1;
          min-height: 0;
          height: 100%;
          transition: margin-right 240ms ease;
          overflow: hidden;
          max-width: 100vw;
        }

        .cms-chat-shell {
          width: 100%;
          max-width: 100vw;
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
          max-width: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-right: 1px solid #d6dde6;
          overflow-x: hidden;
        }

        .cms-chat-contact-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          background: #ffffff;
        }

        .cms-chat-main {
          flex: 1;
          min-width: 0;
          max-width: 100%;
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
          .cms-chat-shell {
            flex-direction: column;
            min-height: 0;
          }

          .cms-chat-sidebar {
            width: 100%;
            min-width: 0;
            max-width: 100%;
            border-right: none;
            border-bottom: 1px solid #d6dde6;
            max-height: min(48dvh, 420px);
          }

          .cms-chat-main {
            min-height: 0;
          }
        }

        @media (max-width: ${MOBILE_CHAT_BREAKPOINT_PX}px) {
          .cms-page-root {
            min-height: 100dvh !important;
            height: 100dvh !important;
          }

          .cms-chat-root {
            height: 100%;
          }

          .cms-chat-shell {
            height: 100%;
            width: 100%;
            max-width: 100vw;
            border: none;
            border-radius: 0;
            box-shadow: none;
            background: #ffffff;
          }

          .cms-mobile-menu-btn {
            display: inline-flex !important;
          }

          .cms-chat-sidebar.is-hidden-mobile,
          .cms-chat-main.is-hidden-mobile {
            display: none;
          }

          .cms-chat-shell.mobile-list-mode .cms-chat-sidebar {
            max-height: none;
            height: 100%;
            border-bottom: none;
          }

          .cms-chat-sidebar-head {
            padding: 10px 10px 8px !important;
          }

          .cms-chat-tabs-row {
            gap: 6px !important;
            padding-bottom: 4px !important;
            scrollbar-width: none;
          }

          .cms-chat-tabs-row::-webkit-scrollbar {
            display: none;
          }

          .cms-chat-tab-btn {
            padding: 6px 10px !important;
            font-size: 11px !important;
          }

          .cms-chat-sidebar-footer {
            display: none !important;
          }

          .cms-chat-shell.mobile-chat-mode {
            height: 100%;
          }

          .cms-chat-shell.mobile-chat-mode .cms-chat-main {
            height: 100%;
          }
        }

        @media (min-width: ${MOBILE_CHAT_BREAKPOINT_PX + 1}px) {
          .cms-mobile-menu-btn {
            display: none !important;
          }
        }

        @keyframes tagDropdownIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
