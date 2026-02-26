/**
 * GOBERNA — Support Chat Component (Floating)
 *
 * Floating bottom-right chat for candidato+ ↔ admin messaging.
 * - Renders a chat icon with unread badge (always visible)
 * - Opens a panel above the icon when clicked
 * - WS stays connected even when panel is closed (for real-time notifications)
 * - Candidato: auto-connects to admin (single conversation)
 * - Admin: sees conversation list with candidate photos, then opens individual chat
 *
 * Performance:
 *   - memo'd sub-components to isolate rerenders
 *   - Stable callbacks via useCallback with minimal deps
 *   - WS callbacks stored in refs (no effect re-runs)
 *   - Styles hoisted as constants (no object allocation per render)
 *   - Input changes only rerender ChatInput, not the full tree
 */

"use client";

import {
  useState, useEffect, useRef, useCallback, useMemo, memo,
  type CSSProperties, type KeyboardEvent,
} from "react";
import Image from "next/image";
import { useSupportWs, type SupportWsMessage } from "../../../lib/hooks/use-support-ws";
import {
  getMessages,
  getUnreadCount,
  getAdminIds,
  listConversations,
  type SupportMessage,
  type ConversationSummary,
} from "../../../lib/services/support";
import { FONT_STACK } from "../../../lib/constants";

// ─── Types ────────────────────────────────────────────────────

type SupportChatProps = {
  userId: string;
  isAdmin: boolean;
};

// ─── Hoisted Styles (created once, never reallocated) ─────────

const FAB_SIZE = 52;

const FAB_STYLE: CSSProperties = {
  position: "fixed",
  bottom: 20,
  right: 20,
  width: FAB_SIZE,
  height: FAB_SIZE,
  borderRadius: "50%",
  background: "var(--goberna-blue-950, #0c1f38)",
  color: "#ffffff",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 4px 16px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.12)",
  zIndex: 1100,
  transition: "transform 0.15s ease, box-shadow 0.15s ease",
};

const FAB_BADGE: CSSProperties = {
  position: "absolute",
  top: -4,
  right: -4,
  background: "#ef4444",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 99,
  minWidth: 20,
  height: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 5px",
  lineHeight: 1,
  border: "2px solid #ffffff",
};

const PANEL_STYLE: CSSProperties = {
  position: "fixed",
  bottom: 20 + FAB_SIZE + 12,
  right: 20,
  width: 380,
  height: 520,
  background: "#ffffff",
  borderRadius: 12,
  boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)",
  display: "flex",
  flexDirection: "column",
  zIndex: 1100,
  fontFamily: FONT_STACK,
  overflow: "hidden",
  animation: "goberna-support-in 0.2s ease-out",
};

const HEADER_STYLE: CSSProperties = {
  padding: "14px 16px",
  background: "var(--goberna-blue-950, #0c1f38)",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexShrink: 0,
};

const MESSAGES_CONTAINER: CSSProperties = {
  flex: 1, overflowY: "auto", padding: "12px 16px", background: "#f8fafc",
};

const INPUT_BAR: CSSProperties = {
  padding: "10px 12px",
  borderTop: "1px solid #e2e8f0",
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexShrink: 0,
  background: "#ffffff",
};

const INPUT_STYLE: CSSProperties = {
  flex: 1, padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8,
  fontSize: 13, fontFamily: FONT_STACK, outline: "none", background: "#f8fafc",
  color: "#1e293b", transition: "border-color 0.15s",
};

const ICON_BTN: CSSProperties = {
  background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4, display: "flex",
};

const CLOSE_BTN: CSSProperties = {
  background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: 4,
};

const CENTERED_TEXT: CSSProperties = {
  padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13,
};

const CONV_AVATAR: CSSProperties = {
  width: 40, height: 40, borderRadius: "50%", overflow: "hidden",
  background: "var(--goberna-blue-100, #dbeafe)", color: "var(--goberna-blue-700, #1d4ed8)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 15, fontWeight: 700, flexShrink: 0, position: "relative",
};

// ─── Icons (memo'd — zero rerender cost) ──────────────────────

const ChatBubbleIcon = memo(function ChatBubbleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
});

const SendIcon = memo(function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
});

const BackIcon = memo(function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
});

const CloseIcon = memo(function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
});

// ─── Helpers ──────────────────────────────────────────────────

const timeFormatter = typeof Intl !== "undefined"
  ? new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" })
  : null;
const dateTimeFormatter = typeof Intl !== "undefined"
  ? new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
  : null;

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return timeFormatter?.format(d) ?? "";
    }
    return dateTimeFormatter?.format(d) ?? "";
  } catch {
    return "";
  }
}

// ─── MessageBubble (memo'd — only rerenders if its own msg changes) ──

type BubbleProps = { msg: SupportMessage; isMine: boolean };

const MessageBubble = memo(function MessageBubble({ msg, isMine }: BubbleProps) {
  const bubbleStyle = useMemo<CSSProperties>(() => ({
    maxWidth: "75%",
    padding: "8px 12px",
    borderRadius: 12,
    borderBottomRightRadius: isMine ? 4 : 12,
    borderBottomLeftRadius: isMine ? 12 : 4,
    background: isMine ? "var(--goberna-blue-950, #0c1f38)" : "#ffffff",
    color: isMine ? "#ffffff" : "#1e293b",
    fontSize: 13,
    lineHeight: 1.4,
    boxShadow: isMine ? "none" : "0 1px 3px rgba(0,0,0,0.08)",
    wordBreak: "break-word" as const,
  }), [isMine]);

  const timeStyle = useMemo<CSSProperties>(() => ({
    fontSize: 10,
    color: isMine ? "rgba(255,255,255,0.5)" : "#94a3b8",
    marginTop: 4,
    textAlign: "right" as const,
  }), [isMine]);

  return (
    <div style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: 8 }}>
      <div style={bubbleStyle}>
        <div>{msg.body}</div>
        <div style={timeStyle}>{formatTime(msg.created_at)}</div>
      </div>
    </div>
  );
});

// ─── ConversationRow with candidate photo (memo'd) ──────────

type ConvRowProps = {
  conv: ConversationSummary;
  onSelect: (id: string) => void;
};

const ConversationRow = memo(function ConversationRow({ conv, onSelect }: ConvRowProps) {
  const handleClick = useCallback(() => onSelect(conv.user_id), [onSelect, conv.user_id]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="support-conv-row"
      style={{
        width: "100%", padding: "12px 16px", background: "transparent", border: "none",
        borderBottom: "1px solid #f1f5f9", cursor: "pointer", textAlign: "left",
        display: "flex", alignItems: "center", gap: 10, fontFamily: FONT_STACK,
      }}
    >
      {/* Avatar — show candidate photo if available */}
      <div style={CONV_AVATAR}>
        {conv.foto_url ? (
          <Image
            src={conv.foto_url}
            alt={conv.full_name}
            width={40}
            height={40}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            unoptimized
          />
        ) : (
          conv.full_name.charAt(0).toUpperCase()
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{conv.full_name}</span>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>{formatTime(conv.last_message_at)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
            {conv.last_message}
          </span>
          {conv.unread_count > 0 && (
            <span style={{
              background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700,
              borderRadius: 99, minWidth: 18, height: 18, display: "flex",
              alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0,
            }}>
              {conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

// ─── ChatInput (isolated — typing only rerenders this component) ──

type ChatInputProps = {
  onSend: (body: string) => void;
  disabled: boolean;
};

const ChatInput = memo(function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const body = value.trim();
    if (!body || disabled) return;
    onSend(body);
    setValue("");
    inputRef.current?.focus();
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const hasText = value.trim().length > 0;

  return (
    <div style={INPUT_BAR}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escribe un mensaje..."
        style={INPUT_STYLE}
        aria-label="Mensaje de soporte"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!hasText || disabled}
        style={{
          width: 36, height: 36, borderRadius: 8,
          background: hasText && !disabled ? "var(--goberna-blue-950, #0c1f38)" : "#e2e8f0",
          color: hasText && !disabled ? "#ffffff" : "#94a3b8",
          border: "none",
          cursor: hasText && !disabled ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "all 0.15s",
        }}
        aria-label="Enviar mensaje"
      >
        <SendIcon />
      </button>
    </div>
  );
});

// ─── MessageList (memo'd) ─────────────────────────────────────

type MessageListProps = {
  messages: SupportMessage[];
  userId: string;
  loading: boolean;
};

const MessageList = memo(function MessageList({ messages, userId, loading }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (loading) {
    return (
      <div style={MESSAGES_CONTAINER}>
        <div style={{ ...CENTERED_TEXT, paddingTop: 40 }}>Cargando mensajes...</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div style={MESSAGES_CONTAINER}>
        <div style={{ ...CENTERED_TEXT, paddingTop: 40 }}>Envia un mensaje para iniciar la conversacion.</div>
      </div>
    );
  }

  return (
    <div style={MESSAGES_CONTAINER}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} isMine={msg.sender_id === userId} />
      ))}
      <div ref={endRef} />
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────

export const SupportChat = memo(function SupportChat({ userId, isAdmin }: SupportChatProps) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const chatPartnerId = isAdmin ? selectedUserId : adminId;

  // Ref for chatPartnerId so WS callback doesn't need it as a dep
  const chatPartnerRef = useRef(chatPartnerId);
  chatPartnerRef.current = chatPartnerId;

  // Ref to know if panel is open without re-running WS effect
  const openRef = useRef(open);
  openRef.current = open;

  // ── Fetch unread count on mount ──
  useEffect(() => {
    let stale = false;
    getUnreadCount().then((res) => {
      if (!stale && res.ok && res.data) setUnreadCount(res.data.count);
    });
    return () => { stale = true; };
  }, []);

  // ── Fetch admin ID once (candidato only) ──
  useEffect(() => {
    if (isAdmin) return;
    let stale = false;
    getAdminIds().then((res) => {
      if (!stale && res.ok && res.data?.adminIds.length) {
        setAdminId(res.data.adminIds[0]);
      }
    });
    return () => { stale = true; };
  }, [isAdmin]);

  // ── WS message handler — always active for notifications ──
  const handleWsMessage = useCallback((msg: SupportWsMessage) => {
    const newMsg: SupportMessage = {
      id: msg.id,
      sender_id: msg.senderId,
      receiver_id: msg.receiverId,
      body: msg.body,
      read: false,
      created_at: msg.createdAt,
    };

    // Add to messages if it's from/to current chat partner AND panel is open
    setMessages((prev) => {
      const partner = chatPartnerRef.current;
      if (!openRef.current || !partner) return prev;
      if (msg.senderId !== partner && msg.receiverId !== partner) return prev;
      if (prev.some((m) => m.id === msg.id)) return prev; // dedupe
      return [...prev, newMsg];
    });

    // Increment unread if it's for us and panel is closed or different conversation
    if (msg.receiverId === userId) {
      const partner = chatPartnerRef.current;
      const isViewingThisConv = openRef.current && partner === msg.senderId;
      if (!isViewingThisConv) {
        setUnreadCount((c) => c + 1);
      }
    }

    // Update conversation list for admin (update last_message, bump unread)
    if (isAdmin) {
      setConversations((prev) => {
        const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId;
        return prev.map((c) =>
          c.user_id === otherId
            ? {
                ...c,
                last_message: msg.body,
                last_message_at: msg.createdAt,
                unread_count: msg.receiverId === userId && !(openRef.current && chatPartnerRef.current === otherId)
                  ? c.unread_count + 1
                  : c.unread_count,
              }
            : c,
        );
      });
    }
  }, [userId, isAdmin]);

  // WS always connected (enabled: true) so we get real-time notifications
  const { connected, send, markRead: wsMarkRead } = useSupportWs({
    enabled: true,
    onMessage: handleWsMessage,
  });

  // ── Load conversations when admin opens panel ──
  useEffect(() => {
    if (!isAdmin || !open) return;
    let stale = false;
    setLoading(true);
    listConversations().then((res) => {
      if (!stale && res.ok && res.data) setConversations(res.data.conversations);
      if (!stale) setLoading(false);
    });
    return () => { stale = true; };
  }, [isAdmin, open]);

  // ── Load messages when chat partner changes ──
  useEffect(() => {
    if (!chatPartnerId || !open) return;
    let stale = false;
    setLoading(true);
    getMessages(chatPartnerId).then((res) => {
      if (stale) return;
      if (res.ok && res.data) {
        setMessages(res.data.messages);
        wsMarkRead(chatPartnerId);
        // Clear unread for this conversation
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      setLoading(false);
    });
    return () => { stale = true; };
  }, [chatPartnerId, open, wsMarkRead]);

  // ── Stable callbacks ──
  const toggleOpen = useCallback(() => {
    setOpen((o) => {
      if (o) {
        // Closing — reset selection
        setSelectedUserId(null);
        setMessages([]);
      }
      return !o;
    });
  }, []);

  const handleBack = useCallback(() => {
    setSelectedUserId(null);
    setMessages([]);
  }, []);

  const handleSelectConv = useCallback((id: string) => {
    setSelectedUserId(id);
  }, []);

  const handleSend = useCallback((body: string) => {
    const partner = chatPartnerRef.current;
    if (!partner) return;
    send(partner, body);
  }, [send]);

  // ── Derived ──
  const isInChat = isAdmin ? !!selectedUserId : !!adminId;
  const selectedConv = useMemo(
    () => conversations.find((c) => c.user_id === selectedUserId),
    [conversations, selectedUserId],
  );

  const headerTitle = isAdmin
    ? selectedUserId
      ? selectedConv?.full_name ?? "Chat"
      : "Soporte — Conversaciones"
    : "Soporte";

  return (
    <>
      {/* ── Floating Action Button (bottom-right) ── */}
      <button
        type="button"
        onClick={toggleOpen}
        style={FAB_STYLE}
        aria-label={open ? "Cerrar soporte" : "Abrir soporte"}
      >
        {open ? <CloseIcon /> : <ChatBubbleIcon />}
        {!open && unreadCount > 0 && (
          <span style={FAB_BADGE}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {/* ── Chat Panel ── */}
      {open && (
        <div style={PANEL_STYLE}>
          {/* Header */}
          <div style={HEADER_STYLE}>
            {isAdmin && selectedUserId && (
              <button type="button" onClick={handleBack} style={ICON_BTN} aria-label="Volver">
                <BackIcon />
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{headerTitle}</div>
              {isInChat && (
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                  {connected ? "Conectado" : "Reconectando..."}
                </div>
              )}
            </div>
            <button type="button" onClick={toggleOpen} style={CLOSE_BTN} aria-label="Cerrar">
              <CloseIcon />
            </button>
          </div>

          {/* Body */}
          {isAdmin && !selectedUserId ? (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                <div style={CENTERED_TEXT}>Cargando...</div>
              ) : conversations.length === 0 ? (
                <div style={CENTERED_TEXT}>Sin conversaciones</div>
              ) : (
                conversations.map((conv) => (
                  <ConversationRow key={conv.user_id} conv={conv} onSelect={handleSelectConv} />
                ))
              )}
            </div>
          ) : !isAdmin && !adminId ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", ...CENTERED_TEXT }}>
              No hay administrador disponible. Intenta mas tarde.
            </div>
          ) : (
            <>
              <MessageList messages={messages} userId={userId} loading={loading} />
              <ChatInput onSend={handleSend} disabled={!chatPartnerId} />
            </>
          )}
        </div>
      )}

      {/* ── Animation keyframes ── */}
      <style>{`
        @keyframes goberna-support-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .support-conv-row:hover {
          background: #f8fafc !important;
        }
      `}</style>
    </>
  );
});
