import { useChatList } from "../../hooks/useChatList";
import { ChatTabs } from "./ChatTabs";
import { ChatRow } from "./ChatRow";

type Props = {
  selectedId: number | null;
  onSelect: (leadId: number) => void;
};

export function ChatListPanel({ selectedId, onSelect }: Props) {
  const { tab, setTab, search, setSearch, chats, counts, loading } = useChatList();

  const tabCounts = {
    all:       Number(counts.total ?? 0),
    dm:        Number(counts.dm ?? 0),
    group:     Number(counts.group_ ?? 0),
    attention: Number(counts.attention ?? 0),
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <ChatTabs current={tab} counts={tabCounts} onChange={setTab} />

      <div className="px-3 py-2 border-b border-slate-100">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nombre, teléfono o grupo…"
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-xs text-slate-400 italic text-center py-6">Cargando…</div>
        ) : chats.length === 0 ? (
          <div className="text-xs text-slate-400 italic text-center py-6">
            {tab === "attention" ? "✨ Sin atención pendiente" : "Sin conversaciones"}
          </div>
        ) : (
          chats.map(c => (
            <ChatRow
              key={c.lead_id}
              chat={c}
              selected={c.lead_id === selectedId}
              onClick={() => onSelect(c.lead_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
