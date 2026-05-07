import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

export type ExtractionCandidate = {
  id: number;
  kind: string;                         // 'price' | 'bank_account' | 'yape' | 'image_url' | 'product_name' | 'phone_other' | 'whatsapp_link'
  value_raw: string;
  value_normalized: string;
  value_meta: Record<string, unknown> | null;
  occurrences: number;
  confidence: number;
  source_message_ids: number[];
  sample_texts: string[];
  suggested_target: { type?: string; instance_id?: number; product_sku?: string; template_id?: number } | null;
  status: "pending" | "approved" | "rejected" | "superseded" | "applied";
  approved_value: string | null;
  approved_target: Record<string, unknown> | null;
  applied_at: string | null;
  applied_by: string | null;
  rejected_reason: string | null;
  bot_instance_id: number | null;
  first_seen_at: string;
  last_seen_at: string;
};

type Filters = {
  kind?: string;
  status?: ExtractionCandidate["status"] | "";
  bot_instance_id?: number;
};

export function useExtractionCandidates(initial: Filters = { status: "pending" }) {
  const [filters, setFilters] = useState<Filters>(initial);
  const [items, setItems] = useState<ExtractionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filters.kind) qs.set("kind", filters.kind);
      if (filters.status) qs.set("status", filters.status);
      if (filters.bot_instance_id) qs.set("bot_instance_id", String(filters.bot_instance_id));
      const data = await api.get<{ candidates: ExtractionCandidate[] }>(
        `/admin/extraction/candidates${qs.toString() ? `?${qs}` : ""}`
      );
      setItems(data.candidates);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void reload(); }, [reload]);

  const approve = useCallback(
    (id: number, body: { approved_value?: string; target?: ExtractionCandidate["suggested_target"] } = {}) =>
      api.post(`/admin/extraction/approve/${id}`, body).then(reload),
    [reload]
  );

  const reject = useCallback(
    (id: number, reason?: string) =>
      api.post(`/admin/extraction/reject/${id}`, reason ? { reason } : {}).then(reload),
    [reload]
  );

  // Re-corre el extractor sobre los outbounds recientes. El backend hace
  // upsert por (kind, value_normalized, instance) — re-running es idempotente
  // y solo bumpea occurrences si vió valores nuevos.
  const runExtractor = useCallback(async () => {
    setRunning(true);
    try {
      await api.post("/admin/extraction/run", {});
      await reload();
    } finally {
      setRunning(false);
    }
  }, [reload]);

  return { items, loading, running, filters, setFilters, reload, approve, reject, runExtractor };
}
