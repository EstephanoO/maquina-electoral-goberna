/**
 * GOBERNA — useEquipo Hook
 * State management and handlers for the equipo page.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../../../../lib/services/api";
import {
  type Member,
  type PendingRequest,
  type ZoneObjective,
  type Campaign,
  type ConsultorCampaignAssignment,
  ROLES,
  DEPARTAMENTOS,
  getRoleConfig,
} from "./role-config";

export function useEquipo(activeCampaignId: string | null | undefined, userRoleRaw: string) {
  // Core state
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [resolvingRequest, setResolvingRequest] = useState<string | null>(null);

  // Batch selection
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [batchRole, setBatchRole] = useState("agente_campo");
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Objectives
  const [objectiveInputs, setObjectiveInputs] = useState<Record<string, string>>({});
  const [savingObjectives, setSavingObjectives] = useState(false);
  const [objectivesChanged, setObjectivesChanged] = useState(false);

  // Consultor modal
  const [showConsultorModal, setShowConsultorModal] = useState(false);
  const [consultorToAssign, setConsultorToAssign] = useState<{ userId: string; name: string } | null>(null);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [consultorCampaigns, setConsultorCampaigns] = useState<Set<string>>(new Set());
  const [savingConsultorCampaigns, setSavingConsultorCampaigns] = useState(false);

  // Derived permissions
  const userRole = userRoleRaw;
  const canManage = getRoleConfig(userRole).canManage.length > 0;
  const allowedRoles = useMemo(() => {
    const cfg = getRoleConfig(userRole);
    // Include self role + everything this role can manage
    return [cfg.key, ...cfg.canManage];
  }, [userRole]);

  const statsByRole = useMemo(() => {
    const byRole: Record<string, number> = {};
    for (const m of members) {
      byRole[m.role] = (byRole[m.role] ?? 0) + 1;
    }
    return byRole;
  }, [members]);

  // ── Data Fetching ──────────────────────────────────────────────────

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

  // ── Handlers ───────────────────────────────────────────────────────

  const openConsultorModal = useCallback(async (userId: string, name: string) => {
    setConsultorToAssign({ userId, name });
    try {
      const [cRes, aRes] = await Promise.all([
        api.get<{ campaigns: Campaign[] }>("/api/campaigns"),
        api.get<{ campaigns: ConsultorCampaignAssignment[] }>(`/api/consultors/${userId}/campaigns`),
      ]);
      if (cRes.ok && cRes.data) setAllCampaigns(cRes.data.campaigns);
      setConsultorCampaigns(aRes.ok && aRes.data ? new Set(aRes.data.campaigns.map((c) => c.campaign_id)) : new Set());
    } catch { setAllCampaigns([]); setConsultorCampaigns(new Set()); }
    setShowConsultorModal(true);
  }, []);

  const handleRoleChange = useCallback(async (userId: string, newRole: string) => {
    if (!activeCampaignId) return;
    if (newRole === "consultor") {
      const m = members.find((x) => x.user_id === userId);
      if (m) openConsultorModal(userId, m.full_name);
      return;
    }
    setUpdatingRole(userId);
    const res = await api.put(`/api/campaigns/${activeCampaignId}/members/${userId}/role`, { role: newRole }, { campaignId: activeCampaignId });
    if (res.ok) setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)));
    else alert(res.error?.message ?? "Error cambiando rol");
    setUpdatingRole(null);
  }, [activeCampaignId, members, openConsultorModal]);

  const handleResolve = useCallback(async (requestId: string, status: "approved" | "rejected", role: string) => {
    setResolvingRequest(requestId);
    const res = await api.put(`/api/access-requests/${requestId}`, { status, role });
    if (res.ok) {
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      setSelectedRequests((prev) => { const n = new Set(prev); n.delete(requestId); return n; });
      if (status === "approved") fetchData();
    }     else alert(res.error?.message ?? "Error resolviendo la solicitud");
    setResolvingRequest(null);
  }, [fetchData]);

  const handleBatchApprove = useCallback(async () => {
    if (selectedRequests.size === 0) return;
    if (!confirm(`¿Aprobar ${selectedRequests.size} solicitud${selectedRequests.size > 1 ? "es" : ""} como ${ROLES[batchRole]?.shortLabel ?? batchRole}?`)) return;
    setBatchProcessing(true);
    const results = await Promise.allSettled(Array.from(selectedRequests).map(async (id) => {
      const res = await api.put(`/api/access-requests/${id}`, { status: "approved", role: batchRole });
      if (!res.ok) throw new Error(); return id;
    }));
    const ids = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value);
    setPendingRequests((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelectedRequests(new Set());
    if (ids.length > 0) fetchData();
    setBatchProcessing(false);
  }, [selectedRequests, batchRole, fetchData]);

  const handleBatchReject = useCallback(async () => {
    if (selectedRequests.size === 0) return;
    if (!confirm(`¿Rechazar ${selectedRequests.size} solicitud${selectedRequests.size > 1 ? "es" : ""}?`)) return;
    setBatchProcessing(true);
    const results = await Promise.allSettled(Array.from(selectedRequests).map(async (id) => {
      const res = await api.put(`/api/access-requests/${id}`, { status: "rejected" });
      if (!res.ok) throw new Error(); return id;
    }));
    const ids = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value);
    setPendingRequests((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelectedRequests(new Set());
    setBatchProcessing(false);
  }, [selectedRequests]);

  const handleRemove = useCallback(async (userId: string, name: string) => {
    if (!confirm(`Remover a ${name} de la campaña?`)) return;
    const res = await api.delete(`/api/campaigns/${activeCampaignId}/members/${userId}`);
    if (res.ok) setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  }, [activeCampaignId]);

  const handleResetPassword = useCallback(async (userId: string, name: string) => {
    if (!confirm(`¿Reiniciar la contraseña de ${name}? El usuario deberá crear una nueva contraseña la próxima vez que inicie sesión.`)) return;
    const res = await api.post(`/api/users/${userId}/require-password-reset`, {});
    if (res.ok) alert(`Contraseña reiniciada para ${name}. El usuario deberá crear una nueva contraseña.`);
    else alert(res.error?.message ?? "Error reiniciando contraseña");
  }, []);

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

  const toggleRequestSelect = useCallback((id: string) => {
    setSelectedRequests((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedRequests((s) => s.size === pendingRequests.length ? new Set() : new Set(pendingRequests.map((r) => r.id)));
  }, [pendingRequests]);

  const toggleConsultorCampaign = useCallback((id: string) => {
    setConsultorCampaigns((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const saveConsultorAssignments = useCallback(async () => {
    if (!consultorToAssign) return;
    setSavingConsultorCampaigns(true);
    const res = await api.put(`/api/consultors/${consultorToAssign.userId}/campaigns`, { campaign_ids: Array.from(consultorCampaigns) });
    if (res.ok) { setShowConsultorModal(false); setConsultorToAssign(null); fetchData(); }
    else alert(res.error?.message ?? "Error guardando campañas");
    setSavingConsultorCampaigns(false);
  }, [consultorToAssign, consultorCampaigns, fetchData]);

  const closeConsultorModal = useCallback(() => {
    setShowConsultorModal(false);
    setConsultorToAssign(null);
  }, []);

  return {
    // State
    members, pendingRequests, loading, updatingRole, resolvingRequest,
    selectedRequests, batchRole, batchProcessing,
    objectiveInputs, savingObjectives, objectivesChanged,
    showConsultorModal, consultorToAssign, allCampaigns, consultorCampaigns, savingConsultorCampaigns,
    // Derived
    userRole, canManage, allowedRoles, statsByRole,
    // Handlers
    handleRoleChange, handleResolve, handleBatchApprove, handleBatchReject,
    handleRemove, handleResetPassword, handleSaveObjectives, handleObjectiveChange,
    toggleRequestSelect, toggleSelectAll, setBatchRole,
    toggleConsultorCampaign, saveConsultorAssignments, closeConsultorModal,
  };
}
