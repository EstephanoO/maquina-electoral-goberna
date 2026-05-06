import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { QK } from "../lib/query-client";

export function useResolveAttention() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (id: number) => api.post(`/leads/${id}/resolve-attention`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: QK.attention() });
      qc.invalidateQueries({ queryKey: QK.lead(id) });
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
  });
  return {
    resolve: (id: number) => m.mutateAsync(id),
    resolving: m.isPending,
  };
}
