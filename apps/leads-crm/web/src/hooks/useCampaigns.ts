import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Campaign, CampaignProgress, SegmentPreset, SegmentPreview } from "../types/campaign";

const QK = {
  list:    () => ["campaigns"] as const,
  one:     (id: number) => ["campaigns", id] as const,
  presets: () => ["segment-presets"] as const,
  preview: (filter: any) => ["campaigns", "preview", JSON.stringify(filter)] as const,
};

export function useSegmentPresets() {
  return useQuery({
    queryKey: QK.presets(),
    queryFn: () => api.get<{ presets: SegmentPreset[] }>("/segment-presets").then(d => d.presets),
    staleTime: 60_000,
  });
}

export function useCampaigns() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: QK.list(),
    queryFn: () => api.get<{ campaigns: CampaignProgress[] }>("/campaigns").then(d => d.campaigns),
    refetchInterval: 5_000,  // Live update mientras una campaña está running
  });

  const create = useMutation({
    mutationFn: (draft: Partial<Campaign>) => api.post<Campaign>("/campaigns", draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.list() }),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Campaign> }) =>
      api.put<Campaign>(`/campaigns/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.list() }),
  });
  const materialize = useMutation({
    mutationFn: (id: number) => api.post<{ total_recipients: number }>(`/campaigns/${id}/materialize`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.list() }),
  });
  const launch = useMutation({
    mutationFn: (id: number) => api.post<Campaign>(`/campaigns/${id}/launch`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.list() }),
  });
  const pause = useMutation({
    mutationFn: (id: number) => api.post(`/campaigns/${id}/pause`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.list() }),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => api.post(`/campaigns/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.list() }),
  });

  return { list, create, update, materialize, launch, pause, cancel };
}

export function usePreviewSegment(filter: any | null) {
  return useQuery({
    queryKey: QK.preview(filter),
    queryFn: () => api.post<SegmentPreview>("/campaigns/preview", { filter }),
    enabled: filter != null,
  });
}
