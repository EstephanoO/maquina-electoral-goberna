/**
 * GOBERNA — useEquipo Hook
 * Slim orchestrator composing sub-hooks for the equipo page.
 */

import { useState, useCallback } from "react";
import { api } from "../../../../lib/services/api";
import { ROLES } from "./role-config";
import { useEquipoData } from "./use-equipo-data";
import { useEquipoModals } from "./use-equipo-modals";

export function useEquipo(activeCampaignId: string | null | undefined, userRoleRaw: string) {
  const data = useEquipoData(activeCampaignId, userRoleRaw);
  const modals = useEquipoModals(data.fetchData);

  // Batch selection
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [batchRole, setBatchRole] = useState("agente_campo");
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [resolvingRequest, setResolvingRequest] = useState<string | null>(null);

  // ── Handlers ───────────────────────────────────────────────────────

  const handleRoleChange = useCallback(async (userId: string, newRole: string) => {
    if (!activeCampaignId) return;
    if (newRole === "consultor") {
      const m = data.members.find((x) => x.user_id === userId);
      if (m) modals.openConsultorModal(userId, m.full_name);
      return;
    }
    setUpdatingRole(userId);
    const res = await api.put(`/api/campaigns/${activeCampaignId}/members/${userId}/role`, { role: newRole }, { campaignId: activeCampaignId });
    if (res.ok) data.setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)));
    else alert(res.error?.message ?? "Error cambiando rol");
    setUpdatingRole(null);
  }, [activeCampaignId, data.members, modals.openConsultorModal, data.setMembers]);

  const handleResolve = useCallback(async (requestId: string, status: "approved" | "rejected", role: string) => {
    setResolvingRequest(requestId);
    const res = await api.put(`/api/access-requests/${requestId}`, { status, role });
    if (res.ok) {
      data.setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      setSelectedRequests((prev) => { const n = new Set(prev); n.delete(requestId); return n; });
      if (status === "approved") data.fetchData();
    } else alert(res.error?.message ?? "Error resolviendo la solicitud");
    setResolvingRequest(null);
  }, [data.fetchData, data.setPendingRequests]);

  const handleBatchApprove = useCallback(async () => {
    if (selectedRequests.size === 0) return;
    if (!confirm(`Aprobar ${selectedRequests.size} solicitud${selectedRequests.size > 1 ? "es" : ""} como ${ROLES[batchRole]?.shortLabel ?? batchRole}?`)) return;
    setBatchProcessing(true);
    const results = await Promise.allSettled(Array.from(selectedRequests).map(async (id) => {
      const res = await api.put(`/api/access-requests/${id}`, { status: "approved", role: batchRole });
      if (!res.ok) throw new Error(); return id;
    }));
    const ids = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value);
    data.setPendingRequests((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelectedRequests(new Set());
    if (ids.length > 0) data.fetchData();
    setBatchProcessing(false);
  }, [selectedRequests, batchRole, data.fetchData, data.setPendingRequests]);

  const handleBatchReject = useCallback(async () => {
    if (selectedRequests.size === 0) return;
    if (!confirm(`Rechazar ${selectedRequests.size} solicitud${selectedRequests.size > 1 ? "es" : ""}?`)) return;
    setBatchProcessing(true);
    const results = await Promise.allSettled(Array.from(selectedRequests).map(async (id) => {
      const res = await api.put(`/api/access-requests/${id}`, { status: "rejected" });
      if (!res.ok) throw new Error(); return id;
    }));
    const ids = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value);
    data.setPendingRequests((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelectedRequests(new Set());
    setBatchProcessing(false);
  }, [selectedRequests, data.setPendingRequests]);

  const handleRemove = useCallback(async (userId: string, name: string) => {
    if (!confirm(`Remover a ${name} de la campana?`)) return;
    const res = await api.delete(`/api/campaigns/${activeCampaignId}/members/${userId}`);
    if (res.ok) data.setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  }, [activeCampaignId, data.setMembers]);

  const toggleRequestSelect = useCallback((id: string) => {
    setSelectedRequests((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedRequests((s) => s.size === data.pendingRequests.length ? new Set() : new Set(data.pendingRequests.map((r) => r.id)));
  }, [data.pendingRequests]);

  return {
    // Data
    members: data.members, pendingRequests: data.pendingRequests, loading: data.loading,
    canManage: data.canManage, allowedRoles: data.allowedRoles, statsByRole: data.statsByRole,
    objectiveInputs: data.objectiveInputs, savingObjectives: data.savingObjectives,
    objectivesChanged: data.objectivesChanged,
    handleSaveObjectives: data.handleSaveObjectives, handleObjectiveChange: data.handleObjectiveChange,
    // Batch
    selectedRequests, batchRole, batchProcessing, updatingRole, resolvingRequest,
    handleRoleChange, handleResolve, handleBatchApprove, handleBatchReject,
    handleRemove, toggleRequestSelect, toggleSelectAll, setBatchRole,
    // Modals
    showResetPasswordModal: modals.showResetPasswordModal,
    resetPasswordTarget: modals.resetPasswordTarget,
    savingPassword: modals.savingPassword,
    handleResetPassword: modals.handleResetPassword,
    handleSaveNewPassword: modals.handleSaveNewPassword,
    closeResetPasswordModal: modals.closeResetPasswordModal,
    showConsultorModal: modals.showConsultorModal,
    consultorToAssign: modals.consultorToAssign,
    allCampaigns: modals.allCampaigns,
    consultorCampaigns: modals.consultorCampaigns,
    savingConsultorCampaigns: modals.savingConsultorCampaigns,
    toggleConsultorCampaign: modals.toggleConsultorCampaign,
    saveConsultorAssignments: modals.saveConsultorAssignments,
    closeConsultorModal: modals.closeConsultorModal,
    // Role
    userRole: userRoleRaw,
  };
}
