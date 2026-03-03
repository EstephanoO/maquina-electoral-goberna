"use client";

/**
 * CMS Operadoras — Main page orchestrator.
 *
 * 3-pane WhatsApp-style layout:
 *   [Sidebar] — contact list, search, tabs, tag filter
 *   [Conversation] — chat messages, actions, compose, WhatsApp extension
 *   [Profile] — slide-in contact details, signal flags, notes (optional)
 *
 * Integrations:
 *   - SSE real-time updates (contact status changes from other operators)
 *   - Chrome extension `goberna:messageSent` event (auto-mark hablado)
 *   - Chrome extension `goberna:messageReceived` event (auto-mark respondieron)
 *   - Twilio WhatsApp API (send/receive messages)
 *   - WebSocket for live message updates
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  listCmsContacts,
  getCmsStats,
  getCmsTags,
  setContactTags as apiSetContactTags,
  getContactWhatsAppMessages,
  sendContactWhatsAppMessage,
  markHablado,
  markRespondieron,
  archiveContact,
  revertContact,
  updateContactNotes,
  type CmsContact,
  type CmsOperatorNotes,
  type CmsStats,
  type CmsTabFilter,
  type CmsTwilioMessage,
  type CmsSseContactUpdated,
} from "@/lib/services/cms";
import { useChatWs } from "@/lib/hooks";
import {
  CmsStatsBar,
  CmsSidebar,
  CmsConversationPane as ConversationPane,
  CmsContactProfile,
  TwilioConfigModal,
} from "./_components";

const PAGE_LIMIT = 25;

export default function CmsPage() {
  const { user, activeCampaignId } = useAuth();
  const campaignId = activeCampaignId;

  // ── Core state ──
  const [contacts, setContacts] = useState<CmsContact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CmsStats | null>(null);
  const [activeTab, setActiveTab] = useState<CmsTabFilter>("nuevo");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // ── Profile panel ──
  const [profileContact, setProfileContact] = useState<CmsContact | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  // ── Tags ──
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // ── Messages ──
  const [messages, setMessages] = useState<CmsTwilioMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Twilio config modal ──
  const [showTwilioConfig, setShowTwilioConfig] = useState(false);

  // ── Debounce ref for search ──
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ──
  const selectedContact = contacts.find((c) => c.id === selectedContactId) ?? null;

  // ── Data loading ──
  const fetchContacts = useCallback(async (tab: CmsTabFilter, search: string, offset = 0) => {
    if (!campaignId) return;
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    setError(null);

    const res = await listCmsContacts(campaignId, tab, PAGE_LIMIT, offset, search);
    if (res.ok) {
      setContacts((prev) => offset === 0 ? res.contacts : [...prev, ...res.contacts]);
      setTotal(res.total);
    } else {
      setError(res.error ?? "Error al cargar contactos");
    }
    setLoading(false);
    setLoadingMore(false);
  }, [campaignId]);

  const fetchStats = useCallback(async () => {
    if (!campaignId) return;
    const res = await getCmsStats(campaignId);
    if (res.ok && res.stats) setStats(res.stats);
  }, [campaignId]);

  const fetchTags = useCallback(async () => {
    if (!campaignId) return;
    const res = await getCmsTags(campaignId);
    if (res.ok) setAvailableTags(res.tags);
  }, [campaignId]);

  // Initial load — runs once when campaignId becomes available.
  // We intentionally capture the initial values of activeTab/searchQuery
  // via refs to avoid re-fetching on every state change.
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!campaignId || initialLoadDone.current) return;
    initialLoadDone.current = true;
    fetchContacts("nuevo", "");
    fetchStats();
    fetchTags();
  }, [campaignId, fetchContacts, fetchStats, fetchTags]);

  // Tab change
  const handleTabChange = useCallback((tab: CmsTabFilter) => {
    setActiveTab(tab);
    setSelectedContactId(null);
    setProfileContact(null);
    fetchContacts(tab, searchQuery);
  }, [fetchContacts, searchQuery]);

  // Debounced search
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchContacts(activeTab, query);
    }, 350);
  }, [fetchContacts, activeTab]);

  // Load more (infinite scroll)
  const handleLoadMore = useCallback(() => {
    fetchContacts(activeTab, searchQuery, contacts.length);
  }, [fetchContacts, activeTab, searchQuery, contacts.length]);

  // ── Messages ──
  const fetchMessages = useCallback(async (contactId: string) => {
    if (!campaignId) return;
    setLoadingMessages(true);
    setMessagesError(null);
    const res = await getContactWhatsAppMessages(campaignId, contactId);
    if (res.ok) setMessages(res.messages);
    else setMessagesError(res.error ?? "Error al cargar mensajes");
    setLoadingMessages(false);
  }, [campaignId]);

  const handleSelectContact = useCallback((id: string) => {
    setSelectedContactId(id);
    setDraft("");
    fetchMessages(id);
  }, [fetchMessages]);

  const handleSendMessage = useCallback(async () => {
    if (!campaignId || !selectedContactId || !draft.trim()) return;
    setSending(true);
    const res = await sendContactWhatsAppMessage(campaignId, selectedContactId, draft.trim());
    if (res.ok) {
      setDraft("");
      fetchMessages(selectedContactId);
    }
    setSending(false);
  }, [campaignId, selectedContactId, draft, fetchMessages]);

  // ── Contact actions ──
  const updateContactInList = useCallback((updated: CmsContact) => {
    setContacts((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    if (profileContact?.id === updated.id) setProfileContact(updated);
  }, [profileContact]);

  const handleMarkHablado = useCallback(async (id: string) => {
    if (!campaignId) return;
    setActionLoading("hablado");
    const res = await markHablado(campaignId, id);
    if (res.ok && res.contact) { updateContactInList(res.contact); fetchStats(); }
    setActionLoading(null);
  }, [campaignId, updateContactInList, fetchStats]);

  const handleMarkRespondieron = useCallback(async (id: string) => {
    if (!campaignId) return;
    setActionLoading("respondieron");
    const res = await markRespondieron(campaignId, id);
    if (res.ok && res.contact) { updateContactInList(res.contact); fetchStats(); }
    setActionLoading(null);
  }, [campaignId, updateContactInList, fetchStats]);

  const handleArchive = useCallback(async (id: string) => {
    if (!campaignId) return;
    setActionLoading("archive");
    const res = await archiveContact(campaignId, id);
    if (res.ok && res.contact) { updateContactInList(res.contact); fetchStats(); }
    setActionLoading(null);
  }, [campaignId, updateContactInList, fetchStats]);

  const handleRevert = useCallback(async (id: string) => {
    if (!campaignId) return;
    setActionLoading("revert");
    const res = await revertContact(campaignId, id);
    if (res.ok && res.contact) { updateContactInList(res.contact); fetchStats(); }
    setActionLoading(null);
  }, [campaignId, updateContactInList, fetchStats]);

  // ── Notes save ──
  const handleSaveNotes = useCallback(async (id: string, notes: CmsOperatorNotes) => {
    if (!campaignId) return;
    setSavingNotes(true);
    const res = await updateContactNotes(campaignId, id, notes);
    if (res.ok && res.contact) updateContactInList(res.contact);
    setSavingNotes(false);
  }, [campaignId, updateContactInList]);

  // ── Tags ──
  const handleCreateTag = useCallback((name: string) => {
    setAvailableTags((prev) => prev.includes(name) ? prev : [...prev, name]);
  }, []);

  const handleAssignTag = useCallback(async (contactId: string, tagName: string) => {
    if (!campaignId) return;
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    const newTags = [...new Set([...(contact.cms_tags || []), tagName])];
    // Optimistic update
    updateContactInList({ ...contact, cms_tags: newTags });
    await apiSetContactTags(campaignId, contactId, newTags);
  }, [campaignId, contacts, updateContactInList]);

  const handleRemoveTag = useCallback(async (contactId: string, tagName: string) => {
    if (!campaignId) return;
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    const newTags = (contact.cms_tags || []).filter((t) => t !== tagName);
    updateContactInList({ ...contact, cms_tags: newTags });
    await apiSetContactTags(campaignId, contactId, newTags);
  }, [campaignId, contacts, updateContactInList]);

  // ── WhatsApp extension integration ──
  const handleOpenWhatsApp = useCallback((phone: string, text?: string) => {
    // Dispatch event for Chrome extension interceptor
    const detail = { phone, text: text || "" };
    window.dispatchEvent(new CustomEvent("goberna:openWhatsApp", { detail }));

    // Fallback: also try chrome runtime message if extension is available
    try {
      const w = window as unknown as Record<string, unknown>;
      const cr = w.chrome as { runtime?: { sendMessage?: (msg: Record<string, string>) => void } } | undefined;
      if (cr?.runtime?.sendMessage) {
        cr.runtime.sendMessage({ action: "openChat", phone, text: text || "" });
      }
    } catch {
      // Extension not installed — ignore
    }
  }, []);

  // Listen for `goberna:messageSent` from Chrome extension — auto-mark hablado
  useEffect(() => {
    function handleMessageSent(e: Event) {
      const detail = (e as CustomEvent).detail;
      const phone = detail?.phone;
      if (!phone) return;

      // Find the contact matching this phone and auto-mark as hablado if nuevo
      const match = contacts.find((c) => {
        const digits = c.telefono?.replace(/\D/g, "") || "";
        const eventDigits = String(phone).replace(/\D/g, "");
        return digits.length >= 7 && eventDigits.length >= 7 && (digits.endsWith(eventDigits.slice(-9)) || eventDigits.endsWith(digits.slice(-9)));
      });

      if (match && match.cms_status === "nuevo") {
        handleMarkHablado(match.id);
      }
    }

    window.addEventListener("goberna:messageSent", handleMessageSent);
    return () => window.removeEventListener("goberna:messageSent", handleMessageSent);
  }, [contacts, handleMarkHablado]);

  // Listen for `goberna:messageReceived` from Chrome extension — auto-mark respondieron
  useEffect(() => {
    function handleMessageReceived(e: Event) {
      const detail = (e as CustomEvent<{ phone: string; preview: string; timestamp: number }>).detail;
      const phone = detail?.phone;
      if (!phone) return;

      // Find the contact matching this phone — transition hablado → respondieron
      const match = contacts.find((c) => {
        const digits = c.telefono?.replace(/\D/g, "") || "";
        const eventDigits = String(phone).replace(/\D/g, "");
        return digits.length >= 7 && eventDigits.length >= 7 &&
          (digits.endsWith(eventDigits.slice(-9)) || eventDigits.endsWith(digits.slice(-9)));
      });

      if (match && match.cms_status === "hablado") {
        handleMarkRespondieron(match.id);
      }
    }

    window.addEventListener("goberna:messageReceived", handleMessageReceived);
    return () => window.removeEventListener("goberna:messageReceived", handleMessageReceived);
  }, [contacts, handleMarkRespondieron]);

  // ── SSE real-time ──
  useEffect(() => {
    if (!campaignId) return;
    let controller: AbortController;
    let attempt = 0;
    let disposed = false;

    async function connect() {
      if (disposed) return;
      controller = new AbortController();

      try {
        const res = await fetch("/api/cms/stream", {
          headers: { "x-campaign-id": campaignId!, Accept: "text/event-stream" },
          credentials: "same-origin",
          signal: controller.signal,
        });

        if (res.status === 401) {
          await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
          if (!disposed) setTimeout(connect, 1000);
          return;
        }

        if (!res.ok || !res.body) {
          throw new Error(`SSE failed: ${res.status}`);
        }

        attempt = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done || disposed) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            try {
              const data = JSON.parse(line.slice(5).trim());
              if (data.type === "contact.updated" || data.type === "contact.notes_updated" || data.type === "contact.tags_updated") {
                const payload = data.payload as CmsSseContactUpdated;
                if (payload.contact) updateContactInList(payload.contact);
                if (payload.stats) setStats(payload.stats);
              }
            } catch {
              // Malformed SSE line — skip
            }
          }
        }
      } catch (err) {
        if (disposed) return;
        const name = (err as Error)?.name;
        if (name === "AbortError") return;
      }

      // Reconnect with exponential backoff
      if (!disposed) {
        const delay = Math.min(1000 * 2 ** attempt, 30_000);
        attempt++;
        setTimeout(connect, delay);
      }
    }

    connect();
    return () => { disposed = true; controller?.abort(); };
  }, [campaignId, updateContactInList]);

  // ── WebSocket for live chat messages ──
  useChatWs({
    campaignId,
    contactId: selectedContactId,
    onMessageEvent: useCallback(() => {
      if (selectedContactId && campaignId) fetchMessages(selectedContactId);
    }, [selectedContactId, campaignId, fetchMessages]),
  });

  // ── Loading state ──
  if (!campaignId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-48px)] text-sm text-slate-400">
        Selecciona una campana para ver los contactos CMS
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] bg-slate-50/50">
      {/* Stats bar */}
      <CmsStatsBar stats={stats} loading={loading && !stats} />

      {/* 3-pane layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Sidebar (320px) */}
        <div className="w-80 shrink-0">
          <CmsSidebar
            contacts={contacts}
            total={total}
            loading={loading}
            loadingMore={loadingMore}
            stats={stats}
            activeTab={activeTab}
            searchQuery={searchQuery}
            selectedContactId={selectedContactId}
            availableTags={availableTags}
            selectedTag={selectedTag}
            onTabChange={handleTabChange}
            onSearchChange={handleSearchChange}
            onSelectContact={handleSelectContact}
            onOpenProfile={setProfileContact}
            onLoadMore={handleLoadMore}
            onSelectTag={setSelectedTag}
            onCreateTag={handleCreateTag}
            onOpenTwilioConfig={() => setShowTwilioConfig(true)}
            error={error}
            onRetry={() => fetchContacts(activeTab, searchQuery)}
          />
        </div>

        {/* Center: Conversation */}
        <div className="flex-1 min-w-0">
          <ConversationPane
            contact={selectedContact}
            messages={messages}
            loadingMessages={loadingMessages}
            messagesError={messagesError}
            draft={draft}
            sending={sending}
            onDraftChange={setDraft}
            onSend={handleSendMessage}
            onRefreshMessages={() => selectedContactId && fetchMessages(selectedContactId)}
            onMarkHablado={handleMarkHablado}
            onMarkRespondieron={handleMarkRespondieron}
            onArchive={handleArchive}
            onRevert={handleRevert}
            onOpenWhatsApp={handleOpenWhatsApp}
            onOpenProfile={setProfileContact}
            actionLoading={actionLoading}
            contactTags={selectedContact?.cms_tags || []}
            availableTags={availableTags}
            onAssignTag={handleAssignTag}
            onRemoveTag={handleRemoveTag}
            onCreateTag={handleCreateTag}
          />
        </div>

        {/* Right: Profile panel (conditional) */}
        {profileContact && (
          <CmsContactProfile
            contact={profileContact}
            onSave={handleSaveNotes}
            onClose={() => setProfileContact(null)}
            saving={savingNotes}
          />
        )}
      </div>

      {/* Twilio config modal */}
      {showTwilioConfig && campaignId && (
        <TwilioConfigModal campaignId={campaignId} onClose={() => setShowTwilioConfig(false)} />
      )}
    </div>
  );
}
