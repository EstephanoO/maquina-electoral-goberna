/**
 * GOBERNA — Support Chat Component
 *
 * Floating support chat for candidato+ and admin users.
 * - Candidato/Consultor: single chat with admin
 * - Admin: conversation list + individual chats
 *
 * Positioned at the bottom of the sidebar, opens a floating panel.
 */

"use client";

import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
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
  collapsed: boolean;
};

// ─── Icons ────────────────────────────────────────────────────

function SupportIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Soporte</title>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Enviar</title>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Volver</title>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) +
      " " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ─── Main Component ───────────────────────────────────────────

export function SupportChat({ userId, isAdmin, collapsed }: SupportChatProps) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Admin: conversation list state
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Candidato: target admin ID
  const [adminId, setAdminId] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatPartnerId = isAdmin ? selectedUserId : adminId;

  // ── Fetch unread count on mount ──
  useEffect(() => {
    let mounted = true;
    getUnreadCount().then((res) => {
      if (mounted && res.ok && res.data) setUnreadCount(res.data.count);
    });
    return () => { mounted = false; };
  }, []);

  // ── Fetch admin ID (for candidato) ──
  useEffect(() => {
    if (isAdmin) return;
    let mounted = true;
    getAdminIds().then((res) => {
      if (mounted && res.ok && res.data && res.data.adminIds.length > 0) {
        setAdminId(res.data.adminIds[0]);
      }
    });
    return () => { mounted = false; };
  }, [isAdmin]);

  // ── WebSocket ──
  const handleWsMessage = useCallback((msg: SupportWsMessage) => {
    const newMsg: SupportMessage = {
      id: msg.id,
      sender_id: msg.senderId,
      receiver_id: msg.receiverId,
      body: msg.body,
      read: false,
      created_at: msg.createdAt,
    };

    // If chat is open and it's from/to current partner, add to messages
    setMessages((prev) => {
      const partner = chatPartnerId;
      if (partner && (msg.senderId === partner || msg.receiverId === partner)) {
        // Dedupe by id
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, newMsg];
      }
      return prev;
    });

    // Update unread if message is for us and chat is not open with that sender
    if (msg.receiverId === userId) {
      setUnreadCount((c) => c + 1);
      // Refresh conversations for admin
      if (isAdmin) {
        listConversations().then((res) => {
          if (res.ok && res.data) setConversations(res.data.conversations);
        });
      }
    }
  }, [userId, isAdmin, chatPartnerId]);

  const { connected, send, markRead: wsMarkRead } = useSupportWs({
    enabled: true,
    onMessage: handleWsMessage,
  });

  // ── Load conversations (admin) ──
  useEffect(() => {
    if (!isAdmin || !open) return;
    setLoading(true);
    listConversations().then((res) => {
      if (res.ok && res.data) setConversations(res.data.conversations);
      setLoading(false);
    });
  }, [isAdmin, open]);

  // ── Load messages when chat partner changes ──
  useEffect(() => {
    if (!chatPartnerId) return;
    setLoading(true);
    getMessages(chatPartnerId).then((res) => {
      if (res.ok && res.data) {
        setMessages(res.data.messages);
        // Mark as read
        wsMarkRead(chatPartnerId);
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      setLoading(false);
    });
  }, [chatPartnerId, wsMarkRead]);

  // ── Auto-scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message ──
  const handleSend = useCallback(() => {
    const body = input.trim();
    if (!body || !chatPartnerId) return;
    send(chatPartnerId, body);
    setInput("");
  }, [input, chatPartnerId, send]);

  // ── Toggle panel ──
  const toggleOpen = useCallback(() => {
    setOpen((o) => {
      if (!o && !isAdmin && adminId) {
        // Opening as candidato — go directly to chat
      }
      if (o) {
        // Closing — reset admin selection
        if (isAdmin) setSelectedUserId(null);
        setMessages([]);
      }
      return !o;
    });
  }, [isAdmin, adminId]);

  // ── Styles ──
  const showLabel = !collapsed;

  const buttonStyle: CSSProperties = {
    width: "100%",
    padding: showLabel ? "11px 20px" : "11px 0",
    justifyContent: showLabel ? "flex-start" : "center",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: open ? "rgba(255,255,255,0.12)" : "transparent",
    border: "none",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    borderLeft: open ? "3px solid var(--goberna-gold)" : "3px solid transparent",
    color: open ? "var(--goberna-gold)" : "rgba(255,255,255,0.5)",
    fontWeight: open ? 600 : 400,
    fontSize: 13,
    fontFamily: FONT_STACK,
    cursor: "pointer",
    transition: "all 0.15s ease",
    textDecoration: "none",
    position: "relative",
  };

  const panelStyle: CSSProperties = {
    position: "fixed",
    bottom: 16,
    left: collapsed ? 76 : 250,
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
    animation: "goberna-fade-in 0.2s ease-out",
  };

  const headerStyle: CSSProperties = {
    padding: "14px 16px",
    background: "var(--goberna-blue-950, #0c1f38)",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  };

  const isInChat = isAdmin ? !!selectedUserId : !!adminId;
  const selectedConv = conversations.find((c) => c.user_id === selectedUserId);

  return (
    <>
      {/* ── Sidebar Button ── */}
      <button
        type="button"
        onClick={toggleOpen}
        style={buttonStyle}
        title={showLabel ? undefined : "Soporte"}
        aria-label="Soporte"
      >
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 20, justifyContent: "center", position: "relative" }}>
          <SupportIcon />
          {unreadCount > 0 && (
            <span style={{
              position: "absolute",
              top: -6,
              right: -8,
              background: "#ef4444",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 99,
              minWidth: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              lineHeight: 1,
            }}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </span>
        {showLabel && <span>Soporte</span>}
      </button>

      {/* ── Chat Panel ── */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={headerStyle}>
            {isAdmin && selectedUserId && (
              <button
                type="button"
                onClick={() => { setSelectedUserId(null); setMessages([]); }}
                style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4, display: "flex" }}
                aria-label="Volver"
              >
                <BackIcon />
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {isAdmin
                  ? selectedUserId
                    ? selectedConv?.full_name ?? "Chat"
                    : "Soporte — Conversaciones"
                  : "Soporte"
                }
              </div>
              {isInChat && (
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                  {connected ? "Conectado" : "Reconectando..."}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleOpen}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: 4 }}
              aria-label="Cerrar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <title>Cerrar</title>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body */}
          {isAdmin && !selectedUserId ? (
            // ── Admin: Conversation List ──
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  Cargando...
                </div>
              ) : conversations.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  Sin conversaciones
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.user_id}
                    type="button"
                    onClick={() => setSelectedUserId(conv.user_id)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid #f1f5f9",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontFamily: FONT_STACK,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "var(--goberna-blue-100, #dbeafe)",
                      color: "var(--goberna-blue-700, #1d4ed8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {conv.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                          {conv.full_name}
                        </span>
                        <span style={{ fontSize: 10, color: "#94a3b8" }}>
                          {formatTime(conv.last_message_at)}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                        <span style={{
                          fontSize: 12,
                          color: "#64748b",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 220,
                        }}>
                          {conv.last_message}
                        </span>
                        {conv.unread_count > 0 && (
                          <span style={{
                            background: "#ef4444",
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 700,
                            borderRadius: 99,
                            minWidth: 18,
                            height: 18,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "0 5px",
                            flexShrink: 0,
                          }}>
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : !isAdmin && !adminId ? (
            // ── No admin available ──
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              No hay administrador disponible. Intenta mas tarde.
            </div>
          ) : (
            // ── Chat Messages ──
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", background: "#f8fafc" }}>
                {loading ? (
                  <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, paddingTop: 40 }}>
                    Cargando mensajes...
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, paddingTop: 40 }}>
                    Envia un mensaje para iniciar la conversacion.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_id === userId;
                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: "flex",
                          justifyContent: isMine ? "flex-end" : "flex-start",
                          marginBottom: 8,
                        }}
                      >
                        <div style={{
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
                          wordBreak: "break-word",
                        }}>
                          <div>{msg.body}</div>
                          <div style={{
                            fontSize: 10,
                            color: isMine ? "rgba(255,255,255,0.5)" : "#94a3b8",
                            marginTop: 4,
                            textAlign: "right",
                          }}>
                            {formatTime(msg.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={{
                padding: "10px 12px",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexShrink: 0,
                background: "#ffffff",
              }}>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Escribe un mensaje..."
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    fontSize: 13,
                    fontFamily: FONT_STACK,
                    outline: "none",
                    background: "#f8fafc",
                    color: "#1e293b",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || !chatPartnerId}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: input.trim() ? "var(--goberna-blue-950, #0c1f38)" : "#e2e8f0",
                    color: input.trim() ? "#ffffff" : "#94a3b8",
                    border: "none",
                    cursor: input.trim() ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.15s",
                  }}
                  aria-label="Enviar mensaje"
                >
                  <SendIcon />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
