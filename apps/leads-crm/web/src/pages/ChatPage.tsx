import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { cn, STAGE_CONFIG, TIER_CONFIG } from "../lib/utils";
import {
  Search, Send, Phone, MapPin, Users, MessageSquare, User,
  Wifi, WifiOff, RefreshCw, Tag, ArrowLeft, Edit3, Check,
  Clock, DollarSign, Zap, X,
} from "lucide-react";

/* ===== TYPES ===== */
type Chat = {
  lead_id: number; name: string; phone: string; country: string;
  stage: string; buyer_tier: string; total_usd_spent: number;
  n_purchases: number; assigned_to: string; interests: string[];
  tags: string[]; course: string;
  last_message: string; last_message_kind: string; last_message_at: string;
  unread_count: number;
};
type Msg = { id: number; kind: string; body: string; by: string; time: string; meta: any };
type Purchase = { id: number; product: string; amount_usd: number; method: string | null; date: string };
type Activity = { id: number; kind: string; body: string; by: string; meta: any; time: string };
type BotInstance = { id: string; label: string; phone: string; status: string; hasQR: boolean; stats: any };

const POLL = 6000;
const HEADER_LOGO = "/goberna-logo.png";

const QUICK_REPLIES = [
  "Gracias por tu propuesta o queja.",
  "Tu solicitud ha sido registrada.",
  "Pasaremos a revisar tu caso.",
  "Te notificaremos cuando tengamos novedades.",
  "¿Hay algo más en lo que pueda ayudarte?",
];

/* ===== MAIN COMPONENT ===== */
export default function ChatPage() {
  // Bot instances
  const [bots, setBots] = useState<BotInstance[]>([]);
  const [activeLine, setActiveLine] = useState<string>("");
  const [qrData, setQrData] = useState<Record<string, string | null>>({});

  // Chat state
  const [chats, setChats] = useState<Chat[]>([]);
  const [search, setSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<"all" | "unread" | "noname">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showCrm, setShowCrm] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [aiAutoMode, setAiAutoMode] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const selected = chats.find((c) => c.lead_id === selectedId) || null;
  const activeBot = bots.find((b) => b.id === activeLine);
  const isLineReady = activeBot?.status === "ready";

  // Phone digits for filtering chats by line
  const linePhone = activeBot?.phone?.replace(/\D/g, "") || "";

  // ===== FETCH BOTS =====
  useEffect(() => {
    api.getBotStatus().then((b) => {
      setBots(b);
      // Auto-select Edwards if available, otherwise first ready line, or first line
      if (!activeLine) {
        const edwards = b.find((x: any) => x.id === "edwards");
        const ready = b.find((x: any) => x.status === "ready");
        setActiveLine(edwards?.id || ready?.id || b[0]?.id || "");
      }
    });
    const t = setInterval(() => api.getBotStatus().then(setBots), 10000);
    return () => clearInterval(t);
  }, []);

  // ===== FETCH CHATS (filtered by line) =====
  const fetchChats = useCallback(async () => {
    if (!linePhone) return;
    try {
      // Filter by the active bot's phone (e.g. "+51986394450"). El backend
      // matchea contra leads.assigned_to, que el bot guarda con el formato
      // exacto del config (con "+"). Sin esto, /chats devolvía TODOS los
      // chats sin filtrar y las dos líneas mostraban los mismos mensajes.
      const data = await api.listChats({
        q: search || undefined,
        assigned_to: activeBot?.phone || undefined,
        limit: 100,
      });
      setChats(data);
    } catch {}
  }, [search, linePhone, activeBot?.phone]);

  useEffect(() => {
    setLoadingChats(true);
    setSelectedId(null);
    setMessages([]);
    setDetail(null);
    const t = setTimeout(() => fetchChats().finally(() => setLoadingChats(false)), 200);
    return () => clearTimeout(t);
  }, [fetchChats]);

  // ===== POLLING =====
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchChats();
      if (selectedId) fetchMsgs(selectedId, true);
    }, POLL);
    return () => clearInterval(pollRef.current);
  }, [fetchChats, selectedId]);

  // ===== MESSAGES =====
  const fetchMsgs = useCallback(async (id: number, silent = false) => {
    if (!silent) setLoadingMsgs(true);
    try {
      const d = await api.getChatMessages(id, { limit: 100 });
      setMessages((p) => (silent && p.length && d.length && p[p.length - 1]?.id === d[d.length - 1]?.id) ? p : d);
    } catch {}
    if (!silent) setLoadingMsgs(false);
  }, []);

  const fetchDetail = useCallback(async (id: number) => {
    try { setDetail(await api.getChatDetail(id)); } catch {}
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchMsgs(selectedId);
      fetchDetail(selectedId);
      setDraft("");
      setShowQuickReplies(false);
      // Mark-as-read: bajan badge inmediatamente en el state local, y persiste
      // en server (leads.last_read_at = now()) para que el próximo /chats
      // refresh devuelva unread_count = 0. Optimistic UI — si falla el POST,
      // el siguiente poll restaurará el contador real.
      setChats((prev) => prev.map((c) => c.lead_id === selectedId ? { ...c, unread_count: 0 } : c));
      api.markChatRead(selectedId).catch(() => {});
    }
  }, [selectedId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ===== SEND =====
  async function send(text?: string) {
    const msg = (text || draft).trim();
    if (!msg || !selectedId || sending) return;
    const targetId = selectedId;
    setDraft(""); setSending(true); setShowQuickReplies(false);
    const opt: Msg = { id: Date.now(), kind: "message_out", body: msg, by: "me", time: new Date().toISOString(), meta: null };
    setMessages((p) => [...p, opt]);
    try {
      await api.sendChatMessage(targetId, msg, activeLine);
      setTimeout(() => fetchMsgs(targetId, true), 1000);
    } catch {
      setMessages((p) => p.map((m) => m.id === opt.id ? { ...m, meta: { error: true } } : m));
    }
    setSending(false);
    inputRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // ===== QR =====
  useEffect(() => {
    if (!activeBot || activeBot.status !== "waiting_qr") return;
    api.getBotQR(activeLine).then((d) => setQrData((p) => ({ ...p, [activeLine]: d.qr })));
    const t = setInterval(() => {
      api.getBotQR(activeLine).then((d) => setQrData((p) => ({ ...p, [activeLine]: d.qr })));
      api.getBotStatus().then(setBots);
    }, 4000);
    return () => clearInterval(t);
  }, [activeLine, activeBot?.status]);

  // Filter chats
  const filtered = chats.filter((c) => {
    if (chatFilter === "unread") return c.unread_count > 0;
    if (chatFilter === "noname") return !c.name || c.name === "Sin nombre" || /^\+?\d/.test(c.name);
    return true;
  });

  const unreadTotal = chats.filter((c) => c.unread_count > 0).length;
  const showList = !selectedId;

  return (
    <div className="flex h-full overflow-hidden bg-[#F5F5F5]">
      {/* ===== LEFT PANEL ===== */}
      <div className={cn("w-full md:w-[340px] bg-white md:border-r border-slate-200 flex flex-col shrink-0", !showList && "hidden md:flex")}>

        {/* Goberna CRM Header */}
        <div className="bg-gradient-to-r from-[#1a3a6b] to-[#2a4f8a] px-4 py-4 text-white border-b border-[#1a3a6b]/20 shrink-0">
          <div className="flex items-center gap-3">
            <img src={HEADER_LOGO} alt="Goberna"
              className="w-12 h-12 rounded-full object-cover border-2 border-white/30 bg-white"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <div>
              <div className="text-sm font-bold">CRM Goberna</div>
              <div className="text-xs text-white/70">Centro de operaciones</div>
            </div>
          </div>
        </div>

        {/* Line tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 overflow-x-auto shrink-0">
          {bots.map((bot) => {
            const isActive = bot.id === activeLine;
            const unread = 0;
            return (
              <button key={bot.id} onClick={() => setActiveLine(bot.id)}
                className={cn("flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold border-b-2 transition-all shrink-0",
                  isActive ? "border-[#2a4f8a] text-[#1a3a6b] bg-white" : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/50"
                )}>
                <div className={cn("w-1.5 h-1.5 rounded-full",
                  bot.status === "ready" ? "bg-emerald-500" : bot.status === "waiting_qr" ? "bg-amber-400 animate-pulse" : "bg-red-400")} />
                {bot.label.replace("Perú ", "P").replace(" (Test)", "★")}
              </button>
            );
          })}
        </div>

        {/* QR screen if not connected */}
        {activeBot && activeBot.status !== "ready" ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            {activeBot.status === "waiting_qr" && qrData[activeLine] ? (
              <>
                <div className="text-sm font-bold text-[#1a3a6b] mb-1">{activeBot.label}</div>
                <div className="text-xs text-slate-400 mb-4">{activeBot.phone}</div>
                <div className="bg-white rounded-2xl p-4 border border-[#2a4f8a]/20 shadow-sm">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData[activeLine]!)}`}
                    alt="QR" className="rounded-lg" width={200} height={200} />
                </div>
                <p className="text-[11px] text-slate-400 mt-3 max-w-[220px]">
                  Abre WhatsApp en el celular → Dispositivos vinculados → Vincular dispositivo
                </p>
              </>
            ) : activeBot.status === "initializing" || activeBot.status === "connecting" ? (
              <>
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                  <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                </div>
                <div className="text-sm font-semibold text-slate-700">Conectando {activeBot.label}...</div>
              </>
            ) : (
              <>
                <WifiOff className="w-8 h-8 text-red-300 mb-3" />
                <div className="text-sm font-semibold text-slate-700 mb-1">Desconectado</div>
                <div className="text-xs text-slate-400 mb-4">{activeBot.label} · {activeBot.phone}</div>
                <button onClick={() => api.restartBot(activeLine)}
                  className="px-4 py-2 rounded-xl bg-[#1a3a6b] text-white text-xs font-semibold hover:bg-[#2a4f8a]">
                  Reconectar
                </button>
              </>
            )}
            {activeBot.status === "ready" || (
              <button onClick={() => api.logoutBot(activeLine).then(() => setTimeout(() => api.getBotStatus().then(setBots), 3000))}
                className="mt-4 text-[10px] text-red-400 hover:text-red-600">
                Cerrar sesión
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Search + filters */}
            <div className="p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 text-[13px] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2a4f8a]/20 border border-slate-100"
                  placeholder="Buscar vecino..." />
              </div>
              <div className="flex gap-1">
                {([
                  { k: "all" as const, l: "Todos", c: chats.length },
                  { k: "unread" as const, l: "Nuevos", c: unreadTotal },
                  { k: "noname" as const, l: "Sin nombre", c: chats.filter((c) => !c.name || c.name === "Sin nombre" || /^\+?\d/.test(c.name)).length },
                ] as const).map((f) => (
                  <button key={f.k} onClick={() => setChatFilter(f.k)}
                    className={cn("px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all",
                      chatFilter === f.k ? "bg-[#1a3a6b] text-white border-[#1a3a6b]" : "bg-white text-slate-400 border-slate-200")}>
                    {f.l}{f.c > 0 ? ` ${f.c}` : ""}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto">
              {loadingChats ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[68px] animate-pulse bg-slate-50/50 border-b border-slate-50" />)
              : filtered.length === 0 ? <div className="text-center py-16 text-slate-400 text-sm">Sin propuestas en esta línea</div>
              : filtered.map((c) => (
                <ChatItem key={c.lead_id} chat={c} active={c.lead_id === selectedId}
                  onClick={() => { setSelectedId(c.lead_id); setShowCrm(false); }} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ===== CENTER: THREAD ===== */}
      <div className={cn("flex-1 flex flex-col min-w-0", showList && "hidden md:flex")}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center bg-[#ECE5DD]">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Selecciona un vecino</p>
              {isLineReady && <p className="text-[10px] text-slate-300 mt-1">Comunicación vía {activeBot?.label}</p>}
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="h-[52px] bg-gradient-to-r from-[#1a3a6b] to-[#2a4f8a] flex items-center px-3 gap-2.5 shrink-0">
              <button onClick={() => { setSelectedId(null); setShowCrm(false); }} className="md:hidden p-1 text-white/60">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <Avatar name={selected.name} tier={selected.buyer_tier} purchases={selected.n_purchases} size="sm" />
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowCrm(!showCrm)}>
                <div className="text-[13px] font-semibold text-white truncate">{selected.name || selected.phone}</div>
                <div className="text-[10px] text-white/40 truncate">
                  {selected.country} {selected.n_purchases > 0 ? `· ${selected.n_purchases} registro(s)` : ""}
                  {" · "}{activeBot?.label}
                </div>
              </div>
              <button onClick={() => setShowCrm(!showCrm)}
                className={cn("p-1.5 rounded-lg", showCrm ? "bg-white/20 text-white" : "text-white/40")}>
                <User className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto bg-[#ECE5DD] px-3 py-2"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d5cec4' fill-opacity='.08'%3E%3Cpath d='M20 20h-2v2h2zM10 10H8v2h2zm20 0h-2v2h2z'/%3E%3C/g%3E%3C/svg%3E\")" }}>
              {loadingMsgs ? <div className="text-center py-8 text-slate-400 text-xs">Cargando...</div>
              : messages.length === 0 ? <div className="text-center py-16 text-slate-400 text-xs">Sin mensajes</div>
              : <div className="max-w-2xl mx-auto space-y-0.5">
                  {messages.map((msg, i) => {
                    const prev = messages[i - 1];
                    const showDate = !prev || new Date(msg.time).toDateString() !== new Date(prev.time).toDateString();
                    return (<div key={msg.id}>
                      {showDate && <div className="text-center my-3"><span className="text-[10px] bg-white/90 text-slate-500 px-3 py-1 rounded-lg shadow-sm font-medium">{new Date(msg.time).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" })}</span></div>}
                      <Bubble msg={msg} />
                    </div>);
                  })}
                  <div ref={endRef} />
                </div>}
            </div>

            {/* Quick replies */}
            {showQuickReplies && (
              <div className="bg-white border-t border-slate-200 px-3 py-2 flex gap-1.5 overflow-x-auto shrink-0">
                {QUICK_REPLIES.map((qr, i) => (
                  <button key={i} onClick={() => send(qr)}
                    className="shrink-0 px-3 py-1.5 rounded-full bg-slate-100 text-[11px] text-slate-600 hover:bg-blue-50 hover:text-[#1a3a6b] border border-slate-200 transition-all whitespace-nowrap">
                    {qr.slice(0, 40)}{qr.length > 40 ? "..." : ""}
                  </button>
                ))}
              </div>
            )}

            {/* Compose */}
            <div className="bg-[#F0F0F0] px-3 py-2 shrink-0 safe-bottom">
              {!isLineReady ? (
                <div className="text-center text-[10px] text-red-400 py-1">{activeBot?.label || "Bot"} desconectado</div>
              ) : (
                <div className="flex items-end gap-2 max-w-2xl mx-auto">
                  <button onClick={() => setShowQuickReplies(!showQuickReplies)}
                    className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all",
                      showQuickReplies ? "bg-[#2a4f8a] text-white" : "bg-white text-slate-400 hover:text-[#2a4f8a] border border-slate-200")}>
                    <Zap className="w-4 h-4" />
                  </button>
                  <textarea ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey}
                    className="flex-1 resize-none rounded-3xl bg-white px-4 py-2.5 text-[13px] border-0 focus:outline-none focus:ring-1 focus:ring-[#2a4f8a]/30 max-h-28 shadow-sm"
                    placeholder={`Mensaje vía ${activeBot?.label}...`} rows={1} />
                  <button onClick={() => send()} disabled={!draft.trim() || sending}
                    className="w-9 h-9 rounded-full bg-[#1a3a6b] text-white flex items-center justify-center disabled:opacity-30 shrink-0 shadow active:scale-95 transition-transform">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ===== CRM PANEL ===== */}
      {selected && showCrm && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setShowCrm(false)} />
          <div className={cn("bg-white flex flex-col overflow-hidden z-50",
            "fixed md:relative inset-y-0 right-0 w-[88%] md:w-[340px] md:border-l border-slate-200 shadow-2xl md:shadow-none")}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
              <button onClick={() => setShowCrm(false)} className="text-[13px] text-[#1a3a6b] font-semibold flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Perfil
              </button>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">{activeBot?.label}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CrmPanel chat={selected} detail={detail} onNameSaved={() => { fetchChats(); fetchDetail(selectedId!); }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ===== SUB-COMPONENTS ===== */

function Avatar({ name, tier, purchases, size = "md" }: { name: string; tier: string; purchases: number; size?: "sm" | "md" | "lg" }) {
  const bad = !name || name === "Sin nombre" || /^\+?\d/.test(name);
  const s = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-20 h-20 text-2xl" : "w-11 h-11 text-sm";
  return (
    <div className={cn(s, "rounded-full flex items-center justify-center text-white font-bold shrink-0",
      bad ? "bg-gradient-to-br from-orange-400 to-red-400" :
      tier === "vip" ? "bg-gradient-to-br from-[#2a4f8a] to-[#1a3a6b]" :
      purchases > 0 ? "bg-gradient-to-br from-emerald-500 to-green-600" :
      "bg-gradient-to-br from-[#3B5998] to-[#1a3a6b]"
    )}>
      {bad ? "!" : (name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

function ChatItem({ chat: c, active, onClick }: { chat: Chat; active: boolean; onClick: () => void }) {
  const unread = c.unread_count > 0;
  const bad = !c.name || c.name === "Sin nombre" || /^\+?\d/.test(c.name);
  return (
    <div onClick={onClick} className={cn("flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-slate-100/60 active:bg-slate-50",
      active ? "bg-blue-50" : "hover:bg-slate-50/50")}>
      <Avatar name={c.name} tier={c.buyer_tier} purchases={c.n_purchases} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={cn("text-[13px] truncate", unread ? "font-bold text-slate-900" : "font-medium text-slate-700", bad && "italic text-orange-600")}>
            {bad ? c.phone : c.name}
          </span>
          <span className={cn("text-[10px] shrink-0 ml-2", unread ? "text-[#2a4f8a] font-bold" : "text-slate-400")}>
            {c.last_message_at ? ago(c.last_message_at) : ""}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className={cn("text-[11px] truncate max-w-[200px]", unread ? "text-slate-600" : "text-slate-400")}>
            {c.last_message_kind === "message_out" ? "✓ " : ""}{(c.last_message || "").slice(0, 50)}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {c.n_purchases > 0 && <span className="text-[9px] font-bold text-blue-600">{c.n_purchases}</span>}
            {unread && <span className="min-w-[18px] h-[18px] rounded-full bg-[#2a4f8a] text-white text-[9px] font-bold flex items-center justify-center px-1">{c.unread_count > 9 ? "9+" : c.unread_count}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const out = msg.kind === "message_out";
  const err = msg.meta?.error;
  const time = new Date(msg.time).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  // El bot empuja meta = { message_type, media_url?, media_mime?, media_caption? }
  // cuando el inbound es imagen/audio/video/doc/sticker. Si no hay meta o
  // message_type === "text", renderiza solo body como antes.
  const messageType = (msg.meta?.message_type as string | undefined) ?? "text";
  const mediaUrl = msg.meta?.media_url as string | undefined;
  const mediaMime = msg.meta?.media_mime as string | undefined;
  const mediaCaption = msg.meta?.media_caption as string | undefined;
  const mediaSize = msg.meta?.media_size_bytes as number | undefined;
  const mediaDuration = msg.meta?.media_duration_sec as number | undefined;

  return (
    <div className={cn("flex mb-0.5", out ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%] sm:max-w-[65%] rounded-xl px-3 py-1.5 shadow-sm text-[13px] leading-snug",
        out ? "bg-[#D9FDD3] rounded-tr-sm" : "bg-white rounded-tl-sm", err && "bg-red-50 border border-red-200")}>
        <RichBody
          messageType={messageType}
          body={msg.body}
          mediaUrl={mediaUrl}
          mediaMime={mediaMime}
          mediaCaption={mediaCaption}
          mediaSize={mediaSize}
          mediaDuration={mediaDuration}
        />
        <div className={cn("text-[9px] mt-0.5 text-right", out ? "text-emerald-700/40" : "text-slate-400")}>
          {time}{out && !err && " ✓"}{err && <span className="text-red-500 ml-1">No enviado</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * RichBody — renderiza el contenido del mensaje según message_type.
 * Soporta: text (default), image, audio, video, document, sticker, reaction.
 * Si no hay media_url pero el type es no-text, renderiza un placeholder
 * "(imagen sin descargar)" + el caption / texto.
 */
function RichBody({
  messageType, body, mediaUrl, mediaMime, mediaCaption, mediaSize, mediaDuration,
}: {
  messageType: string;
  body: string;
  mediaUrl?: string;
  mediaMime?: string;
  mediaCaption?: string;
  mediaSize?: number;
  mediaDuration?: number;
}) {
  // Caption preferido → media_caption || body, fallback al type label.
  const caption = (mediaCaption || body || "").trim();

  if (messageType === "image" && mediaUrl) {
    return (
      <>
        <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="block -mx-3 -mt-1.5 mb-1.5">
          <img src={mediaUrl} alt={caption || "imagen"} className="max-w-full rounded-md object-contain" loading="lazy" />
        </a>
        {caption && <p className="whitespace-pre-wrap break-words text-slate-800">{caption}</p>}
      </>
    );
  }

  if (messageType === "audio" && mediaUrl) {
    return (
      <div className="my-1">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={mediaUrl} className="block w-full max-w-[260px]" />
        <div className="text-[10px] text-slate-500 mt-0.5">
          🎤 Audio{mediaDuration ? ` · ${mediaDuration}s` : ""}
        </div>
      </div>
    );
  }

  if (messageType === "video" && mediaUrl) {
    return (
      <>
        <video controls src={mediaUrl} className="block max-w-full rounded-md -mx-3 -mt-1.5 mb-1.5" preload="metadata" />
        {caption && <p className="whitespace-pre-wrap break-words text-slate-800">{caption}</p>}
      </>
    );
  }

  if (messageType === "document" && mediaUrl) {
    const sizeKb = mediaSize ? Math.round(mediaSize / 1024) : null;
    const ext = mediaMime ? mediaMime.split("/")[1]?.toUpperCase() : null;
    return (
      <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 my-1 hover:bg-black/5 rounded p-1 -m-1">
        <span className="text-2xl">📄</span>
        <span className="flex flex-col">
          <span className="text-slate-800 font-medium truncate">{caption || "Documento"}</span>
          <span className="text-[10px] text-slate-500">
            {ext}{sizeKb ? ` · ${sizeKb} KB` : ""}
          </span>
        </span>
      </a>
    );
  }

  if (messageType === "sticker" && mediaUrl) {
    return <img src={mediaUrl} alt="sticker" className="w-32 h-32 -mx-3 -mt-1.5 mb-1.5 object-contain" loading="lazy" />;
  }

  // Fallback: media sin URL (no se descargó) o tipo desconocido — muestra
  // un label + el body/caption si existen.
  if (messageType !== "text") {
    const labels: Record<string, string> = {
      image: "📷 Imagen", audio: "🎤 Audio", video: "🎬 Video",
      document: "📄 Documento", sticker: "😀 Sticker",
      location: "📍 Ubicación", contact: "👤 Contacto",
      reaction: "👍 Reacción", system: "ℹ️ Sistema",
    };
    return (
      <>
        <p className="text-[11px] text-slate-500">{labels[messageType] || messageType}</p>
        {caption && <p className="whitespace-pre-wrap break-words text-slate-800">{caption}</p>}
      </>
    );
  }

  // Texto puro (default).
  return <p className="whitespace-pre-wrap break-words text-slate-800">{body}</p>;
}

function CrmPanel({ chat: c, detail, onNameSaved }: { chat: Chat; detail: any; onNameSaved: () => void }) {
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState(c.name || "");
  const [saving, setSaving] = useState(false);
  const bad = !c.name || c.name === "Sin nombre" || /^\+?\d/.test(c.name);
  const stage = STAGE_CONFIG[c.stage as keyof typeof STAGE_CONFIG];
  const tier = c.buyer_tier ? TIER_CONFIG[c.buyer_tier as keyof typeof TIER_CONFIG] : null;
  const purchases: Purchase[] = detail?.purchases || [];
  const activity: Activity[] = detail?.activity || [];

  async function saveName() {
    if (!nameVal.trim()) return;
    setSaving(true);
    try { await api.updateLead(c.lead_id, { name: nameVal.trim() }); onNameSaved(); setEditName(false); } catch {}
    setSaving(false);
  }

  return (
    <div className="p-5 space-y-5">
      <div className="text-center">
        <Avatar name={c.name} tier={c.buyer_tier} purchases={c.n_purchases} size="lg" />
        {editName ? (
          <div className="flex items-center gap-2 mt-3 px-4">
            <input value={nameVal} onChange={(e) => setNameVal(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="flex-1 text-center text-sm font-bold border-b-2 border-[#2a4f8a] bg-transparent outline-none py-1" />
            <button onClick={saveName} disabled={saving} className="p-1.5 rounded-lg bg-[#2a4f8a] text-white"><Check className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <h3 className={cn("text-base font-bold", bad ? "text-orange-500 italic" : "text-slate-900")}>{bad ? "Sin nombre" : c.name}</h3>
            <button onClick={() => { setEditName(true); setNameVal(c.name || ""); }} className="p-1 rounded text-slate-400 hover:text-[#2a4f8a]"><Edit3 className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {bad && !editName && (
          <button onClick={() => setEditName(true)} className="mt-2 w-full py-2 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 text-xs font-semibold hover:bg-orange-100 animate-pulse">
            ✏️ Agregar nombre
          </button>
        )}
        <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 mt-2"><Phone className="w-3 h-3" />{c.phone}</div>
        {c.country && <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 mt-0.5"><MapPin className="w-3 h-3" />{c.country}</div>}
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap">
        {stage && <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-lg", stage.color)}>{stage.label}</span>}
        {tier && <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-lg border", tier.color)}>{tier.label}</span>}
      </div>

      {purchases.length > 0 && (
        <div>
          <Sec icon={<Users className="w-3.5 h-3.5" />} title={`Registros (${purchases.length})`} />
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3 mb-2">
            <div className="text-center text-xs text-blue-700 font-semibold">{purchases.length} evento(s) registrado(s)</div>
          </div>
          {purchases.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 mb-1">
              <div>
                <div className="text-[12px] font-semibold text-slate-800">{p.product}</div>
                <div className="text-[10px] text-slate-400">{new Date(p.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {c.n_purchases === 0 && <div className="text-center py-3 rounded-xl bg-slate-50 border border-slate-100"><Users className="w-5 h-5 text-slate-300 mx-auto mb-1" /><div className="text-[11px] text-slate-400">Sin registros</div></div>}

      {activity.length > 0 && (
        <div>
          <Sec icon={<Clock className="w-3.5 h-3.5" />} title="Actividad" />
          {activity.filter((a) => !(a.meta as any)?.auto).slice(0, 8).map((a) => (
            <div key={a.id} className="flex gap-2.5 py-1.5 group">
              <div className="flex flex-col items-center">
                <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px]",
                  a.kind === "message_in" ? "bg-blue-100" : a.kind === "message_out" ? "bg-emerald-100" : a.kind === "purchase" ? "bg-indigo-100" : "bg-slate-100"
                )}>
                  {a.kind === "message_in" ? "📥" : a.kind === "message_out" ? "📤" : a.kind === "purchase" ? "📋" : "•"}
                </div>
                <div className="w-px flex-1 bg-slate-200 group-last:bg-transparent" />
              </div>
              <div className="flex-1 min-w-0 pb-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-600">{descKind(a)}</span>
                  <span className="text-[9px] text-slate-400">{shortDate(a.time)}</span>
                </div>
                {a.body && <p className="text-[10px] text-slate-400 truncate">{a.body.slice(0, 60)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {c.interests.length > 0 && (
        <div>
          <Sec icon={<Tag className="w-3.5 h-3.5" />} title="Intereses" />
          <div className="flex flex-wrap gap-1.5">{c.interests.map((i) => <span key={i} className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-blue-50 text-[#1a3a6b] border border-blue-200">{i}</span>)}</div>
        </div>
      )}
      {c.course && <div><Sec icon={<Users className="w-3.5 h-3.5" />} title="Referencia" /><span className="text-[13px] text-slate-700">{c.course}</span></div>}
    </div>
  );
}

function Sec({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{icon}{title}</div>;
}

function descKind(a: Activity): string {
  if (a.kind === "message_in") return "Recibido";
  if (a.kind === "message_out") return "Enviado";
  if (a.kind === "purchase") return `Registro`;
  if (a.kind === "stage_change") return `${(a.meta as any)?.from} → ${(a.meta as any)?.to}`;
  if (a.kind === "note") return "Nota";
  return a.kind;
}

function shortDate(iso: string) {
  const d = new Date(iso); const n = new Date();
  if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "ahora"; if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}
