import { useEffect, useState } from "react";
import { api } from "../api";

export type LeadEnrichment = {
  id: number;
  escuela_client_id: number | null;
  dni: string | null;
  ocupacion: string | null;
  fecha_nacimiento: string | null;
  last_course: string | null;
  enrollments_count: number;
  certificates_count: number;
  buyer_tier: string | null;
  total_usd_spent: number | string;
  n_purchases: number;
  first_purchase_at: string | null;
  last_purchase_year: number | null;
  is_group: boolean;
  group_subject: string | null;
  last_chat_kind: string;
  needs_human_attention: boolean;
  attention_reason: string | null;
  attention_at: string | null;
};

export function useLeadEnrichment(leadId: number | null) {
  const [data, setData] = useState<LeadEnrichment | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!leadId) { setData(null); return; }
    setLoading(true);
    api.get<LeadEnrichment>(`/leads/${leadId}/enrichment`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [leadId]);

  return { data, loading };
}
