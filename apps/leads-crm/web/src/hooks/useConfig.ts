import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { PipelineStage, BotInstance, BankAccount } from "../types/config";

export function usePipelineStages() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ stages: PipelineStage[] }>("/config/pipeline");
      setStages(d.stages);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const saveAll = useCallback(async (next: PipelineStage[]) => {
    const d = await api.put<{ stages: PipelineStage[] }>("/config/pipeline", { stages: next });
    setStages(d.stages);
  }, []);

  return { stages, loading, reload, saveAll };
}

export function useBotInstances() {
  const [instances, setInstances] = useState<BotInstance[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ instances: BotInstance[] }>("/config/instances");
      setInstances(d.instances);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const update = useCallback((id: number, patch: Partial<BotInstance>) =>
    api.put<BotInstance>(`/config/instances/${id}`, patch).then(reload), [reload]);

  const create = useCallback((draft: Partial<BotInstance>) =>
    api.post<BotInstance>("/config/instances", draft).then(reload), [reload]);

  const copyFrom = useCallback((id: number, fromId: number) =>
    api.post<BotInstance>(`/config/instances/${id}/copy-from/${fromId}`).then(reload), [reload]);

  return { instances, loading, reload, update, create, copyFrom };
}

export function useBankAccounts() {
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ banks: BankAccount[] }>("/config/banks");
      setBanks(d.banks);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const create = useCallback((b: Partial<BankAccount>) =>
    api.post<BankAccount>("/config/banks", b).then(reload), [reload]);

  const update = useCallback((id: number, b: Partial<BankAccount>) =>
    api.put<BankAccount>(`/config/banks/${id}`, b).then(reload), [reload]);

  const remove = useCallback((id: number) =>
    api.del(`/config/banks/${id}`).then(reload), [reload]);

  return { banks, loading, reload, create, update, remove };
}
