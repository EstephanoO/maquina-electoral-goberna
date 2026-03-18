/**
 * GOBERNA — useEquipoData Hook
 * Core data fetching: members, pending requests, and zone objectives.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { api } from "../../../../lib/services/api";
import {
  type Member,
  type PendingRequest,
  type ZoneObjective,
  DEPARTAMENTOS,
  getRoleConfig,
} from "./role-config";

export function useEquipoData(
  activeCampaignId: string | null | undefined,
  userRole: string,
) {
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [objectiveInputs, setObjectiveInputs] = useState<Record<string, string>>({});
  const [savingObjectives, setSavingObjectives] = useState(false);
  const [objectivesChanged, setObjectivesChanged] = useState(false);

  const canManage = getRoleConfig(userRole).canManage.length > 0;

  const allowedRoles = useMemo(() => {
    const cfg = getRoleConfig(userRole);
    return [cfg.key, ...cfg.canManage];
  }, [userRole]);

  const statsByRole = useMemo(() => {
    const byRole: Record<string, number> = {};
    for (const m of members) byRole[m.role] = (byRole[m.role] ?? 0) + 1;
    return byRole;
  }, [members]);

  const fetchData = useCallback(async () => {
    if (!activeCampaignId) return;
    setLoading(true);
    try {
      const [membersRes, pendingRes] = await Promise.all([
        api.get<{ members: Member[] }>(`/api/campaigns/${activeCampaignId}/members`, { campaignId: activeCampaignId }),
        canManage
          ? api.get<{ pending_requests: PendingRequest[] }>("/api/access-requests/pending", { campaignId: activeCampaignId })
          : Promise.resolve(null),
      ]);
      if (membersRes.ok && membersRes.data) setMembers(membersRes.data.members);
      if (pendingRes && pendingRes.ok && pendingRes.data) {
        setPendingRequests(pendingRes.data.pending_requests.filter((r) => r.campaign_id === activeCampaignId));
      }
    } catch { /* silently fail */ } finally { setLoading(false); }
  }, [activeCampaignId, canManage]);

  const fetchObjectives = useCallback(async () => {
    if (!activeCampaignId || !canManage) return;
    try {
      const res = await api.get<{ zones: ZoneObjective[] }>("/api/objectives/zones", { campaignId: activeCampaignId });
      if (res.ok && res.data) {
        const inputs: Record<string, string> = {};
        for (const obj of res.data.zones) inputs[obj.region] = String(obj.target_forms);
        setObjectiveInputs(inputs);
        setObjectivesChanged(false);
      }
    } catch { /* objectives are optional */ }
  }, [activeCampaignId, canManage]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchObjectives(); }, [fetchObjectives]);

  const handleSaveObjectives = useCallback(async () => {
    if (!activeCampaignId) return;
    setSavingObjectives(true);
    const objectives = DEPARTAMENTOS.filter((r) => objectiveInputs[r] && parseInt(objectiveInputs[r], 10) > 0)
      .map((r) => ({ region: r, target_forms: parseInt(objectiveInputs[r], 10) }));
    const res = await api.post("/api/objectives/zones/bulk", { objectives }, { campaignId: activeCampaignId });
    if (res.ok) { fetchObjectives(); setObjectivesChanged(false); }
    else alert(res.error?.message ?? "Error guardando objetivos");
    setSavingObjectives(false);
  }, [activeCampaignId, objectiveInputs, fetchObjectives]);

  const handleObjectiveChange = useCallback((region: string, value: string) => {
    setObjectiveInputs((prev) => ({ ...prev, [region]: value }));
    setObjectivesChanged(true);
  }, []);

  return {
    members, setMembers, pendingRequests, setPendingRequests, loading,
    canManage, allowedRoles, statsByRole,
    objectiveInputs, savingObjectives, objectivesChanged,
    handleSaveObjectives, handleObjectiveChange,
    fetchData,
  };
}
