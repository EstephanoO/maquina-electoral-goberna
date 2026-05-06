import { MessageSquare, ImageIcon, FileText, Mic, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRecentMessages } from "../../hooks/useBotActivityExtras";
import { Avatar } from "../ui";

const TYPE_ICON: Record<string, any> = {
  image: ImageIcon, video: Video, document: FileText, audio: Mic,
};

export function RecentMessagesFeed() {
  const navigate = useNavigate();
  const { data } = useRecentMessages();
  const items = data ?? [];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-500" />
          Últimos mensajes recibidos
        </h2>
        <span className="text-[10px] text-slate-400 italic">live · refresh 15s</span>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400 py-3">Sin mensajes recientes</div>
      ) : (
        <ul className="space-y-1 max-h-96 overflow-y-auto">
          {items.map(m => {
            const Icon = m.type !== "text" && TYPE_ICON[m.type] ? TYPE_ICON[m.type] : null;
            const time = new Date(m.created_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
            return (
              <li key={m.id}
                  onClick={() => navigate(`/leads/${m.lead_id}`)}
                  className="flex items-start gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer transition">
                <Avatar name={m.lead_name || ""} size="xs" ring={m.buyer_tier === "vip" ? "vip" : null} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-800 truncate">{m.lead_name || "?"}</span>
                    {m.country && <span className="text-[10px] text-slate-400">{m.country}</span>}
                    {m.needs_human_attention && <span className="badge bg-amber-100 text-amber-800 text-[9px]">⚠</span>}
                    <span className="text-[9px] text-slate-400 ml-auto font-mono">{time}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 truncate flex items-center gap-1">
                    {Icon && <Icon className="w-3 h-3 shrink-0 text-slate-400" />}
                    {m.body || <span className="italic text-slate-400">[{m.type}]</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
