import { Users, AlertCircle, Crown } from "lucide-react";
import type { ChatRow as ChatRowData } from "../../hooks/useChatList";
import { formatMoney } from "../../lib/utils";

type Props = {
  chat: ChatRowData;
  selected: boolean;
  onClick: () => void;
};

export function ChatRow({ chat, selected, onClick }: Props) {
  const placeholder = !chat.name || /^\+?\d+$/.test(chat.name);
  const displayName = chat.is_group
    ? (chat.group_subject || "Grupo sin nombre")
    : (placeholder ? chat.phone : chat.name);
  const subtitle = chat.is_group ? chat.phone : (chat.country || "");
  const unread = Number(chat.unread_count || 0);
  const isVip = chat.buyer_tier === "vip";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-slate-100 transition flex items-start gap-2.5 ${
        selected ? "bg-blue-50 border-blue-200" : "hover:bg-slate-50"
      }`}
    >
      <div className="shrink-0 mt-0.5">
        {chat.is_group ? (
          <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center">
            <Users size={16} />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold">
            {(displayName[0] || "?").toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isVip && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" />}
          <span className={`text-sm font-medium truncate ${placeholder && !chat.is_group ? "text-slate-400 italic" : "text-slate-800"}`}>
            {displayName}
          </span>
          {chat.needs_human_attention && (
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          )}
        </div>
        <div className="text-[11px] text-slate-500 truncate flex items-center gap-1">
          {subtitle && <span>{subtitle}</span>}
          {chat.escuela_client_id && <span className="text-amber-600">· cliente histórico</span>}
        </div>
        {chat.last_message && (
          <div className="text-xs text-slate-600 mt-0.5 line-clamp-1">
            {chat.last_message}
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        {Number(chat.total_usd_spent) > 0 && (
          <div className="text-[10px] text-emerald-700 font-mono">
            {formatMoney(Number(chat.total_usd_spent))}
          </div>
        )}
        {unread > 0 && (
          <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </div>
    </button>
  );
}
