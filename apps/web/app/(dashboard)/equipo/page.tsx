/**
 * GOBERNA — Equipo Page
 * Orchestrator for team management: members, roles, access requests, objectives.
 */

"use client";

import { useState, type CSSProperties } from "react";
import { useAuth } from "../../../lib/auth-context";
import { useTheme } from "../../../lib/theme-context";
import { getCampaignAccessCode } from "../../../lib/services/access-codes";
import { Spinner, PageHeader, SkeletonList, Button } from "../../../lib/ui";
import { useInjectStyles } from "../../../lib/hooks";
import { FONT_STACK } from "../../../lib/constants";

import {
  StatGrid,
  CampaignGoals,
  PendingRequestsSection,
  MembersList,
  ConsultorModal,
  ResetPasswordModal,
  InvitationsPanel,
  useEquipo,
} from "./_components";

// ── Page Component ─────────────────────────────────────────────────

export default function EquipoPage() {
  const { user, activeCampaignId } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  useInjectStyles();
  const [showInvitationsModal, setShowInvitationsModal] = useState(false);
  const [copyingAccessCode, setCopyingAccessCode] = useState(false);
  const [accessCodeCopied, setAccessCodeCopied] = useState(false);

  const equipoPageStyle = (isDark
    ? {
      fontFamily: FONT_STACK,
      backgroundColor: "#09121d",
      "--color-surface": "#101a2a",
      "--color-surface-alt": "#142033",
      "--color-surface-hover": "#132033",
      "--color-surface-active": "#1a2a40",
      "--color-border": "#24384f",
      "--color-border-strong": "#314963",
      "--color-text-primary": "#f7fbff",
      "--color-text-secondary": "#c7d7e8",
      "--color-text-tertiary": "#95adc8",
      "--color-success-bg": "rgba(99,227,157,0.08)",
      "--color-warning-bg": "rgba(255,171,102,0.08)",
      "--color-error-bg": "rgba(255,143,136,0.08)",
      "--goberna-blue-50": "rgba(122,169,216,0.08)",
      "--goberna-blue-100": "rgba(122,169,216,0.14)",
      "--goberna-blue-200": "#3b5573",
      "--goberna-blue-300": "#4f6f90",
      "--goberna-blue-400": "#6b8db4",
      "--goberna-blue-500": "#7aa9d8",
      "--goberna-blue-600": "#8fb2da",
      "--goberna-blue-700": "#8fb2da",
      "--goberna-blue-800": "#dbe8f6",
      "--goberna-blue-900": "#f7fbff",
    }
    : { fontFamily: FONT_STACK }) as CSSProperties;

  const eq = useEquipo(activeCampaignId, user?.role ?? "agente_campo");

  const handleCopyAccessCode = async () => {
    if (!activeCampaignId) return;
    setCopyingAccessCode(true);
    try {
      const res = await getCampaignAccessCode(activeCampaignId);
      if (!res.ok || !res.data?.access_code) return;
      await navigator.clipboard.writeText(res.data.access_code);
      setAccessCodeCopied(true);
      setTimeout(() => setAccessCodeCopied(false), 1800);
    } catch {
      // silent: keep UI clean in header actions
    } finally {
      setCopyingAccessCode(false);
    }
  };

  // ── Early returns ──────────────────────────────────────────────────

  if (!activeCampaignId) {
    return (
      <div style={{ fontFamily: FONT_STACK, padding: "40px 0", textAlign: "center", color: "var(--color-text-tertiary)" }}>
        Selecciona una campaña para ver su equipo.
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="equipo-page" style={equipoPageStyle}>
      <PageHeader
        title="Equipo de Campaña"
        description={
          eq.canManage
            ? "Gestiona tu equipo y asigna roles según la jerarquía de mando."
            : "Miembros de la campaña."
        }
        breadcrumbs={[{ label: "Dashboard", href: "/home" }, { label: "Equipo" }]}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {eq.canManage && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowInvitationsModal(true)}
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Registro de Agentes
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyAccessCode}
                  disabled={copyingAccessCode}
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {accessCodeCopied ? "Codigo copiado" : copyingAccessCode ? "Copiando..." : "Copiar codigo"}
                </Button>
              </>
            )}
          </div>
        }
      />

      {eq.loading ? (
        <div style={{ padding: "24px 0" }}>
          <SkeletonList items={6} />
        </div>
      ) : (
        <>
          <StatGrid
            total={eq.members.length}
            statsByRole={eq.statsByRole}
            pendingCount={eq.pendingRequests.length}
          />

          <CampaignGoals agentesCampoCount={eq.statsByRole.agente_campo ?? 0} />

          {eq.canManage && eq.pendingRequests.length > 0 && (
            <PendingRequestsSection
              requests={eq.pendingRequests}
              selectedRequests={eq.selectedRequests}
              onToggleSelect={eq.toggleRequestSelect}
              onToggleAll={eq.toggleSelectAll}
              batchRole={eq.batchRole}
              onBatchRoleChange={eq.setBatchRole}
              onBatchApprove={eq.handleBatchApprove}
              onBatchReject={eq.handleBatchReject}
              batchProcessing={eq.batchProcessing}
              resolvingRequest={eq.resolvingRequest}
              onResolve={eq.handleResolve}
              allowedRoles={eq.allowedRoles}
            />
          )}

          <div style={{ marginTop: 16 }}>
            <MembersList
              members={eq.members}
              userId={user?.id}
              userRole={eq.userRole}
              canManage={eq.canManage}
              updatingRole={eq.updatingRole}
              onRoleChange={eq.handleRoleChange}
              onRemove={eq.handleRemove}
              onResetPassword={eq.handleResetPassword}
              allowedRoles={eq.allowedRoles}
              objectiveInputs={eq.objectiveInputs}
              objectivesChanged={eq.objectivesChanged}
              savingObjectives={eq.savingObjectives}
              onObjectiveChange={eq.handleObjectiveChange}
              onSaveObjectives={eq.handleSaveObjectives}
            />
          </div>
        </>
      )}

      {eq.showConsultorModal && eq.consultorToAssign && (
        <ConsultorModal
          name={eq.consultorToAssign.name}
          campaigns={eq.allCampaigns}
          selectedCampaigns={eq.consultorCampaigns}
          onToggleCampaign={eq.toggleConsultorCampaign}
          onSave={eq.saveConsultorAssignments}
          onClose={eq.closeConsultorModal}
          saving={eq.savingConsultorCampaigns}
        />
      )}

      {eq.showResetPasswordModal && eq.resetPasswordTarget && (
        <ResetPasswordModal
          name={eq.resetPasswordTarget.name}
          onSave={eq.handleSaveNewPassword}
          onClose={eq.closeResetPasswordModal}
          saving={eq.savingPassword}
        />
      )}

      {eq.canManage && showInvitationsModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 70,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(980px, 100%)",
              maxHeight: "86vh",
              overflowY: "auto",
              borderRadius: 14,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              boxShadow: "var(--shadow-sm)",
              padding: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 6px 10px" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Registro de Agentes
              </h3>
              <button
                type="button"
                onClick={() => setShowInvitationsModal(false)}
                aria-label="Cerrar"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-alt)",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                x
              </button>
            </div>

            <InvitationsPanel campaignId={activeCampaignId} />
          </div>
        </div>
      )}
    </div>
  );
}
