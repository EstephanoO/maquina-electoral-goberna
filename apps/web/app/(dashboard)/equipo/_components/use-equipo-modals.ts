/**
 * GOBERNA — useEquipoModals Hook
 * Modal state for reset-password and consultor-campaign-assignment dialogs.
 */

import { useState, useCallback } from "react";
import { api } from "../../../../lib/services/api";
import type { Campaign, ConsultorCampaignAssignment } from "./role-config";

export function useEquipoModals(fetchData: () => Promise<void>) {
  // Reset password modal
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<{ userId: string; name: string } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // Consultor modal
  const [showConsultorModal, setShowConsultorModal] = useState(false);
  const [consultorToAssign, setConsultorToAssign] = useState<{ userId: string; name: string } | null>(null);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [consultorCampaigns, setConsultorCampaigns] = useState<Set<string>>(new Set());
  const [savingConsultorCampaigns, setSavingConsultorCampaigns] = useState(false);

  // ── Reset Password ─────────────────────────────────────────────────

  const handleResetPassword = useCallback((userId: string, name: string) => {
    setResetPasswordTarget({ userId, name });
    setShowResetPasswordModal(true);
  }, []);

  const handleSaveNewPassword = useCallback(async (newPassword: string) => {
    if (!resetPasswordTarget) return;
    setSavingPassword(true);
    const res = await api.post(`/api/users/${resetPasswordTarget.userId}/set-password`, { password: newPassword });
    if (res.ok) {
      setShowResetPasswordModal(false);
      setResetPasswordTarget(null);
    } else {
      throw new Error(res.error?.message ?? "Error cambiando la contrasena");
    }
    setSavingPassword(false);
  }, [resetPasswordTarget]);

  const closeResetPasswordModal = useCallback(() => {
    setShowResetPasswordModal(false);
    setResetPasswordTarget(null);
  }, []);

  // ── Consultor Assignment ───────────────────────────────────────────

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

  const toggleConsultorCampaign = useCallback((id: string) => {
    setConsultorCampaigns((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const saveConsultorAssignments = useCallback(async () => {
    if (!consultorToAssign) return;
    setSavingConsultorCampaigns(true);
    const res = await api.put(`/api/consultors/${consultorToAssign.userId}/campaigns`, { campaign_ids: Array.from(consultorCampaigns) });
    if (res.ok) { setShowConsultorModal(false); setConsultorToAssign(null); fetchData(); }
    else alert(res.error?.message ?? "Error guardando campanas");
    setSavingConsultorCampaigns(false);
  }, [consultorToAssign, consultorCampaigns, fetchData]);

  const closeConsultorModal = useCallback(() => {
    setShowConsultorModal(false);
    setConsultorToAssign(null);
  }, []);

  return {
    // Reset password
    showResetPasswordModal, resetPasswordTarget, savingPassword,
    handleResetPassword, handleSaveNewPassword, closeResetPasswordModal,
    // Consultor
    showConsultorModal, consultorToAssign, allCampaigns, consultorCampaigns, savingConsultorCampaigns,
    openConsultorModal, toggleConsultorCampaign, saveConsultorAssignments, closeConsultorModal,
  };
}
