import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { QK } from "../lib/query-client";
import type { AttentionItem } from "../types/attention";

export function useAttentionQueue(pollMs = 15_000) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: QK.attention(),
    queryFn: async () => {
      const d = await api.get<{ items: AttentionItem[] }>("/attention").catch(() => ({ items: [] as AttentionItem[] }));
      return d.items;
    },
    refetchInterval: pollMs,
  });

  const resolve = useMutation({
    mutationFn: (id: number) => api.post(`/leads/${id}/resolve-attention`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.attention() });
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
  });

  return {
    items: q.data ?? [],
    loading: q.isLoading,
    reload: () => q.refetch(),
    resolve: (id: number) => resolve.mutateAsync(id),
  };
}
