"use client";

/**
 * WhatsApp Inbox — vista de conversaciones del bot Baileys.
 *
 * Layout: lista de conversaciones a la izquierda + thread con bubbles ricas
 * a la derecha + header con voter_profile data (tags, classification, engagement).
 *
 * Datos vienen de /api/cms/conversations + /api/cms/conversations/:id/messages
 * (el CMS clásico va sobre form_submissions; este es paralelo, sobre conversations
 * + wa_messages — todo lo que entra por wa-events del bot).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";

import { useAuth } from "@/lib/auth-context";
import {
  listWaConversations,
  getWaConversationMessages,
  markWaConversationRead,
  type WaConversationSummary,
  type WaMessage,
} from "@/lib/services/wa-inbox";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

// ── Helpers de presentación ──────────────────────────────────────────

function relativeTime(ts: string | number): string {
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function fmtTime(tsMs: number): string {
  return new Date(tsMs).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

const PIPELINE_LABELS: Record<string, { label: string; color: string }> = {
  nuevo:           { label: "Nuevo",          color: "#94a3b8" },
  pendiente_envio: { label: "Pendiente envío", color: "#f59e0b" },
  comparte:        { label: "Comparte",       color: "#3b82f6" },
  no_comparte:     { label: "No comparte",    color: "#94a3b8" },
  responde:        { label: "Responde",       color: "#10b981" },
  no_responde:     { label: "No responde",    color: "#94a3b8" },
  contactado:      { label: "Contactado",     color: "#8b5cf6" },
  fidelizado:      { label: "Fidelizado",     color: "#22c55e" },
  invalido:        { label: "Inválido",       color: "#ef4444" },
};

const TAG_NS_COLORS: Record<string, string> = {
  "país":      "#3b82f6",
  "sector":    "#10b981",
  "intent":    "#8b5cf6",
  "rol":       "#0ea5e9",
  "consulta":  "#f59e0b",
  "pide":      "#ef4444",
  "profesion": "#14b8a6",
  "tipo":      "#a855f7",
  "estado":    "#94a3b8",
  "info":      "#6366f1",
  "ai":        "#64748b", // soft tags de IA
};

function tagNamespace(tag: string): string {
  const ix = tag.indexOf(":");
  return ix > 0 ? tag.slice(0, ix) : "";
}
function tagColor(tag: string): string {
  if (tag.startsWith("ai:")) {
    // Para tags de IA, usamos el sub-namespace después de "ai:"
    const inner = tag.slice(3);
    const ns = tagNamespace(inner);
    if (ns) return TAG_NS_COLORS[ns] ?? TAG_NS_COLORS.ai!;
    return TAG_NS_COLORS.ai!;
  }
  const ns = tagNamespace(tag);
  return TAG_NS_COLORS[ns] ?? "#64748b";
}

function previewLine(c: WaConversationSummary): string {
  if (!c.last_message) return "—";
  const t = c.last_message.message_type;
  const arrow = c.last_message.direction === "out" ? "↗ " : "";
  if (t === "image") return `${arrow}📷 Imagen${c.last_message.text ? `: ${c.last_message.text}` : ""}`;
  if (t === "audio") return `${arrow}🎤 Audio`;
  if (t === "video") return `${arrow}🎬 Video${c.last_message.text ? `: ${c.last_message.text}` : ""}`;
  if (t === "document") return `${arrow}📄 Documento`;
  if (t === "sticker") return `${arrow}😀 Sticker`;
  if (t === "reaction") return `${arrow}${c.last_message.text || "👍"} (reacción)`;
  return `${arrow}${c.last_message.text}`;
}

// ── Page ─────────────────────────────────────────────────────────────

export default function WaInboxPage() {
  const { campaigns: authCampaigns } = useAuth();
  const params = useParams();
  const slug = params.slug as string;
  const authCampaign = authCampaigns.find((c) => c.slug === slug);
  const campaignId = authCampaign?.id ?? null;

  const [conversations, setConversations] = useState<WaConversationSummary[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [selectedMeta, setSelectedMeta] = useState<WaConversationSummary | null>(null);

  // Filtros
  const [search, setSearch] = useState("");
  const [engagementFilter, setEngagementFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");

  const threadRef = useRef<HTMLDivElement>(null);

  // Cargar conversaciones cuando cambia campaña o filtros
  const loadConversations = useCallback(async () => {
    if (!campaignId) return;
    setLoadingConvs(true);
    try {
      const res = await listWaConversations({
        engagement: engagementFilter || undefined,
        tag: tagFilter || undefined,
        search: search || undefined,
        limit: 100,
      });
      if (res.ok && res.data) setConversations(res.data.conversations);
    } finally {
      setLoadingConvs(false);
    }
  }, [campaignId, engagementFilter, tagFilter, search]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // Poll cada 15s para refrescar la lista
  useEffect(() => {
    const t = setInterval(() => { void loadConversations(); }, 15000);
    return () => clearInterval(t);
  }, [loadConversations]);

  // Cargar mensajes al seleccionar
  const loadMessages = useCallback(async (id: string) => {
    setLoadingMsgs(true);
    try {
      const res = await getWaConversationMessages(id, { limit: 200 });
      if (res.ok && res.data) {
        setMessages(res.data.messages);
        setSelectedMeta(res.data.conversation);
      }
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) { setMessages([]); setSelectedMeta(null); return; }
    void loadMessages(selectedId);
    void markWaConversationRead(selectedId).catch(() => {});
  }, [selectedId, loadMessages]);

  // Auto-scroll al final cuando llegan nuevos mensajes
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages.length]);

  // Tags únicas en la lista actual (para construir filtros rápidos)
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      for (const t of c.voter_profile?.tags ?? []) set.add(t);
    }
    return Array.from(set).sort();
  }, [conversations]);

  if (!campaignId) {
    return (
      <div style={{ padding: 32, fontFamily: FONT, color: "var(--color-text-tertiary)" }}>
        Campaña no encontrada para &ldquo;{slug}&rdquo;
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "320px 1fr",
      height: "calc(100vh - 64px)",
      fontFamily: FONT,
      background: "var(--color-bg)",
      overflow: "hidden",
    }}>
      {/* ── Sidebar: lista de conversaciones ── */}
      <aside style={{
        borderRight: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Filtros */}
        <div style={{ padding: 12, borderBottom: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, mensaje, grupo…"
            style={{
              padding: "8px 10px", borderRadius: 6,
              border: "1.5px solid var(--color-border)",
              background: "var(--color-surface-hover)",
              color: "var(--color-text-primary)",
              fontSize: 13, fontFamily: FONT, outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <FilterPill label="Todos" active={!engagementFilter} onClick={() => setEngagementFilter("")} />
            <FilterPill label="Comparte" color="#3b82f6" active={engagementFilter === "comparte"} onClick={() => setEngagementFilter("comparte")} />
            <FilterPill label="Responde" color="#10b981" active={engagementFilter === "responde"} onClick={() => setEngagementFilter("responde")} />
            <FilterPill label="Fidelizado" color="#22c55e" active={engagementFilter === "fidelizado"} onClick={() => setEngagementFilter("fidelizado")} />
            <FilterPill label="Pendiente" color="#f59e0b" active={engagementFilter === "pendiente_envio"} onClick={() => setEngagementFilter("pendiente_envio")} />
          </div>
          {availableTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              style={{
                padding: "6px 8px", borderRadius: 6,
                border: "1.5px solid var(--color-border)",
                background: "var(--color-surface-hover)",
                color: "var(--color-text-primary)",
                fontSize: 12, fontFamily: FONT, outline: "none",
              }}
            >
              <option value="">Todos los tags</option>
              {availableTags.slice(0, 30).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingConvs && conversations.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 12 }}>
              Cargando…
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 12 }}>
              Sin conversaciones todavía. Cuando llegue un WSP al número de la campaña aparece acá.
            </div>
          ) : (
            conversations.map((c) => {
              const isSelected = c.id === selectedId;
              const display = c.is_group
                ? c.group_subject ?? "(grupo sin nombre)"
                : (c.voter_profile?.canonical_name || c.contact_name || c.phone || c.jid.slice(0, 20));
              const status = c.voter_profile?.pipeline_status ?? "nuevo";
              const statusInfo = PIPELINE_LABELS[status] ?? { label: status, color: "#94a3b8" };
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 14px",
                    background: isSelected ? "var(--color-surface-hover)" : "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--color-border)",
                    cursor: "pointer",
                    fontFamily: FONT,
                    color: "var(--color-text-primary)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    {c.is_group && <span style={{ fontSize: 11 }}>👥</span>}
                    <div style={{ fontSize: 13, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {display}
                    </div>
                    <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
                      {c.last_message ? relativeTime(c.last_message.ts_ms) : relativeTime(c.updated_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                    {previewLine(c)}
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
                      padding: "2px 6px", borderRadius: 4,
                      background: statusInfo.color + "20",
                      color: statusInfo.color,
                      textTransform: "uppercase",
                    }}>{statusInfo.label}</span>
                    {c.voter_profile?.tags.slice(0, 2).map((t) => (
                      <span key={t} style={{
                        fontSize: 9, padding: "2px 5px", borderRadius: 4,
                        background: tagColor(t) + "18",
                        color: tagColor(t),
                      }}>{t}</span>
                    ))}
                    {c.voter_profile && c.voter_profile.tags.length > 2 && (
                      <span style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>
                        +{c.voter_profile.tags.length - 2}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Thread ── */}
      <main style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selectedId ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
            Selecciona una conversación.
          </div>
        ) : (
          <>
            {selectedMeta && <ConversationHeader meta={selectedMeta} />}
            <div ref={threadRef} style={{ flex: 1, overflowY: "auto", padding: 20, background: "var(--color-bg)" }}>
              {loadingMsgs && messages.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 12, padding: 40 }}>
                  Cargando mensajes…
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {messages.map((m) => <MessageBubble key={m.id} message={m} isGroup={selectedMeta?.is_group ?? false} />)}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function FilterPill({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px", borderRadius: 999, fontSize: 11,
        border: `1px solid ${active ? (color ?? "#163960") : "var(--color-border)"}`,
        background: active ? (color ?? "#163960") + "18" : "transparent",
        color: active ? (color ?? "#163960") : "var(--color-text-secondary)",
        fontFamily: FONT, fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function ConversationHeader({ meta }: { meta: WaConversationSummary }) {
  const display = meta.is_group
    ? meta.group_subject ?? "(grupo sin nombre)"
    : (meta.voter_profile?.canonical_name || meta.contact_name || meta.phone || meta.jid.slice(0, 25));
  const status = meta.voter_profile?.pipeline_status ?? "nuevo";
  const statusInfo = PIPELINE_LABELS[status] ?? { label: status, color: "#94a3b8" };
  const ai = meta.voter_profile?.ai_classification;
  const conf = typeof ai?.confidence === "number" ? Math.round(ai.confidence * 100) : null;

  return (
    <header style={{
      padding: "14px 20px", borderBottom: "1px solid var(--color-border)",
      background: "var(--color-surface)",
      fontFamily: FONT,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        {meta.is_group && <span style={{ fontSize: 16 }}>👥</span>}
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>{display}</div>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          padding: "2px 8px", borderRadius: 4,
          background: statusInfo.color + "20", color: statusInfo.color,
          textTransform: "uppercase",
        }}>{statusInfo.label}</span>
        {meta.voter_profile && meta.voter_profile.engagement_score > 0 && (
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            engagement: {meta.voter_profile.engagement_score}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>
        {meta.phone ?? meta.jid} · línea +{meta.own_number} {meta.message_count} msg ({meta.inbound_count} in)
      </div>
      {(meta.voter_profile?.tags?.length ?? 0) > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {meta.voter_profile!.tags.map((t) => (
            <span key={t} style={{
              fontSize: 10, padding: "3px 7px", borderRadius: 4,
              background: tagColor(t) + "18",
              color: tagColor(t),
              fontWeight: 500,
            }}>{t}</span>
          ))}
        </div>
      )}
      {ai && (ai.category || ai.vote_class || ai.reason) && (
        <div style={{
          fontSize: 11, padding: "6px 10px", borderRadius: 6,
          background: "var(--color-surface-hover)",
          color: "var(--color-text-secondary)",
          border: "1px dashed var(--color-border)",
        }}>
          <strong style={{ color: "var(--color-text-primary)" }}>IA</strong>
          {ai.category && ` · ${ai.category}`}
          {ai.vote_class && ` · ${ai.vote_class}`}
          {conf != null && ` · ${conf}%`}
          {ai.reason && <span style={{ display: "block", marginTop: 2, fontStyle: "italic" }}>“{ai.reason}”</span>}
        </div>
      )}
    </header>
  );
}

function MessageBubble({ message: m, isGroup }: { message: WaMessage; isGroup: boolean }) {
  const isOut = m.direction === "out";
  const align = isOut ? "flex-end" : "flex-start";
  const bg = isOut ? "#dcf8c6" : "#ffffff";
  const fg = "#1e293b";

  // Reaction se renderiza inline como una nota floating
  if (m.message_type === "reaction") {
    return (
      <div style={{ alignSelf: align, fontSize: 11, color: "var(--color-text-tertiary)", padding: "2px 8px" }}>
        {isOut ? "Reaccionaste " : "Reaccionó "} <span style={{ fontSize: 16 }}>{m.text}</span>
      </div>
    );
  }

  return (
    <div style={{ alignSelf: align, maxWidth: "75%" }}>
      {isGroup && !isOut && m.sender_name && (
        <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, marginBottom: 2, paddingLeft: 10 }}>
          {m.sender_name}
        </div>
      )}
      <div style={{
        background: bg, color: fg,
        padding: 10, borderRadius: 10,
        boxShadow: "0 1px 1px rgba(0,0,0,0.05)",
        fontFamily: FONT, fontSize: 14,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        <MessageContent message={m} />
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4, textAlign: "right" }}>
          {fmtTime(m.ts_ms)}
          {m.operator_name && isOut && ` · ${m.operator_name}`}
        </div>
      </div>
    </div>
  );
}

function MessageContent({ message: m }: { message: WaMessage }) {
  if (m.message_type === "image" && m.media_url) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <Image
          src={m.media_url}
          alt={m.media_caption ?? "imagen"}
          width={320} height={240}
          style={{ width: "auto", maxWidth: "100%", height: "auto", borderRadius: 6, display: "block" }}
          unoptimized
        />
        {(m.media_caption || m.text) && <div style={{ marginTop: 6, fontSize: 13 }}>{m.media_caption || m.text}</div>}
      </>
    );
  }
  if (m.message_type === "audio" && m.media_url) {
    return (
      <div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={m.media_url} style={{ display: "block", width: "100%", maxWidth: 280 }} />
        {m.media_duration_sec ? <div style={{ fontSize: 11, color: "#64748b" }}>{m.media_duration_sec}s</div> : null}
      </div>
    );
  }
  if (m.message_type === "video" && m.media_url) {
    return (
      <div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video controls src={m.media_url} style={{ display: "block", maxWidth: "100%", borderRadius: 6 }} />
        {(m.media_caption || m.text) && <div style={{ marginTop: 6, fontSize: 13 }}>{m.media_caption || m.text}</div>}
      </div>
    );
  }
  if (m.message_type === "document" && m.media_url) {
    return (
      <a href={m.media_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, color: "#163960", fontWeight: 600, textDecoration: "none" }}>
        <span style={{ fontSize: 24 }}>📄</span>
        <span>{m.media_caption || "Documento"}{m.media_size_bytes ? ` · ${Math.round(m.media_size_bytes / 1024)} KB` : ""}</span>
      </a>
    );
  }
  if (m.message_type === "sticker" && m.media_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <Image src={m.media_url} alt="sticker" width={140} height={140} unoptimized style={{ width: "auto", maxWidth: 140, height: "auto" }} />
    );
  }
  // text + fallback
  return <>{m.text || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(mensaje vacío)</span>}</>;
}
