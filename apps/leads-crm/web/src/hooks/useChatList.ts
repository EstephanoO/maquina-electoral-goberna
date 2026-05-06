import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { ChatTab } from "../components/chat/ChatTabs";

export type ChatRow = {
  lead_id: number;
  name: string;
  phone: string;
  country: string | null;
  stage: string;
  tags: string[];
  is_group: boolean;
  group_subject: string | null;
  last_chat_kind: string;
  needs_human_attention: boolean;
  attention_at: string | null;
  buyer_tier: string | null;
  total_usd_spent: number | string;
  escuela_client_id: number | null;
  last_course: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number | string;
};

export type ChatCounts = { all?: number; dm?: number; group_?: number; attention?: number; total?: number };

export function useChatList(initialTab: ChatTab = "all", pollMs = 12_000) {
  const [tab, setTab] = useState<ChatTab>(initialTab);
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [counts, setCounts] = useState<ChatCounts>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ tab, limit: "200" });
      if (search) qs.set("q", search);
      const d = await api.get<{ chats: ChatRow[]; counts: ChatCounts }>(`/chats/v2?${qs}`);
      setChats(d.chats);
      setCounts(d.counts);
    } catch {
      // endpoint may be missing in old backends — graceful degrade
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    setLoading(true); void reload();
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs]);

  return { tab, setTab, search, setSearch, chats, counts, loading, reload };
}
