import { Users, AlertCircle, Crown, Phone, Globe } from "lucide-react";
import type { ChatRow as ChatRowData } from "../../hooks/useChatList";
import { formatMoney, STAGE_CONFIG } from "../../lib/utils";

type Props = {
  chat: ChatRowData;
  selected: boolean;
  onClick: () => void;
};

const TIER_DOT: Record<string, string> = {
  vip: "bg-amber-400",
  repeat: "bg-emerald-400",
  single: "bg-blue-400",
  prospect: "bg-slate-300",
};

export function ChatRowEnhanced({ chat, selected, onClick }: Props) {
  const placeholder = !chat.name || /^\+?\d+$/.test(chat.name);
  const displayName = chat.is_group
    ? (chat.group_subject || "Grupo sin nombre")
    : (placeholder ? chat.phone : chat.name);
  const unread = Number(chat.unread_count || 0);
  const isVip = chat.buyer_tier === "vip";
  const stageCfg = STAGE_CONFIG[chat.stage as keyof typeof STAGE_CONFIG];
  const lastMsgAt = chat.last_message_at ? formatRelative(chat.last_message_at) : "";
  const tagsToShow = (chat.tags || []).filter(t => t).slice(0, 3);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-slate-100 transition flex items-start gap-2.5 ${
        selected
          ? "bg-blue-50 border-blue-200"
          : chat.needs_human_attention
            ? "bg-amber-50/30 hover:bg-amber-50"
            : "hover:bg-slate-50"
      }`}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-0.5 relative">
        {chat.is_group ? (
          <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center">
            <Users size={18} />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-slate-700 flex items-center justify-center text-sm font-bold">
            {(displayName[0] || "?").toUpperCase()}
          </div>
        )}
        {chat.buyer_tier && chat.buyer_tier !== "prospect" && (
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${TIER_DOT[chat.buyer_tier] || "bg-slate-300"}`} />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {isVip && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" />}
          <span className={`text-sm font-semibold truncate ${placeholder && !chat.is_group ? "text-slate-400 italic" : "text-slate-800"}`}>
            {displayName}
          </span>
          {chat.needs_human_attention && (
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          )}
        </div>

        {/* Country + last_course one line */}
        <div className="text-[11px] text-slate-500 flex items-center gap-2 truncate mb-0.5">
          {chat.country && (
            <span className="flex items-center gap-0.5">
              <Globe size={10} /> {chat.country}
            </span>
          )}
          {chat.last_course && (
            <span className="truncate text-purple-700">📚 {chat.last_course}</span>
          )}
          {chat.escuela_client_id && !chat.last_course && (
            <span className="text-amber-600">cliente histórico</span>
          )}
        </div>

        {/* Last message preview */}
        {chat.last_message && (
          <div className="text-xs text-slate-600 line-clamp-1 mb-1">
            {chat.last_message}
          </div>
        )}

        {/* Tags row */}
        {tagsToShow.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tagsToShow.map((t, i) => (
              <span key={i} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">
                {t.replace(/^interés:/, "").replace(/^producto:/, "").replace(/^intent:/, "").slice(0, 22)}
              </span>
            ))}
            {(chat.tags?.length ?? 0) > 3 && (
              <span className="text-[10px] text-slate-400 self-center">+{(chat.tags!.length - 3)}</span>
            )}
          </div>
        )}
      </div>

      {/* Right column: time / unread / money */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {lastMsgAt && (
          <span className={`text-[10px] ${unread > 0 ? "text-blue-600 font-semibold" : "text-slate-400"}`}>
            {lastMsgAt}
          </span>
        )}
        {Number(chat.total_usd_spent) > 0 && (
          <span className="text-[10px] text-emerald-700 font-mono font-semibold">
            {formatMoney(Number(chat.total_usd_spent))}
          </span>
        )}
        {unread > 0 && (
          <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] px-1.5 flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
        {stageCfg && !unread && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${stageCfg.color}`}>
            {stageCfg.label.replace(/^[^\w\s]+\s/, "")}
          </span>
        )}
      </div>
    </button>
  );
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}
