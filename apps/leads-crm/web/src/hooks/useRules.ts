import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Rule, RuleDraft } from "../types/training";

export function useRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Rule[]>("/ai/rules");
      setRules(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const toggle = useCallback((r: Rule) =>
    api.patch(`/ai/rules/${r.id}`, { enabled: !r.enabled }).then(reload), [reload]);

  const remove = useCallback((id: number) =>
    api.del(`/ai/rules/${id}`).then(reload), [reload]);

  const create = useCallback((draft: RuleDraft) =>
    api.post<Rule>("/ai/rules", draft).then(reload), [reload]);

  const update = useCallback((id: number, draft: RuleDraft) =>
    api.patch<Rule>(`/ai/rules/${id}`, draft).then(reload), [reload]);

  return { rules, loading, reload, toggle, remove, create, update };
}
