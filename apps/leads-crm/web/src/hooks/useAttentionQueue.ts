import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { AttentionItem } from "../types/attention";

export function useAttentionQueue(pollMs = 15_000) {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const d = await api.get<{ items: AttentionItem[] }>("/attention");
      setItems(d.items);
    } catch {
      // Endpoint optional — fail silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs]);

  const resolve = useCallback(async (id: number) => {
    await api.post(`/leads/${id}/resolve-attention`);
    await reload();
  }, [reload]);

  return { items, loading, reload, resolve };
}
