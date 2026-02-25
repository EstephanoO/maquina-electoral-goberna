/**
 * GOBERNA — Equipo Page
 * Orchestrator for team management: members, roles, access requests, objectives.
 */

"use client";

import { useState } from "react";
import { useAuth } from "../../../lib/auth-context";
import { Spinner } from "../../../lib/ui";
import { useInjectStyles } from "../../../lib/hooks";
import { FONT_STACK } from "../../../lib/constants";

import {
  HierarchyDiagram,
  StatGrid,
  CampaignGoals,
  PendingRequestsSection,
  MembersList,
  ConsultorModal,
  useEquipo,
} from "./_components";

// ── Page Component ─────────────────────────────────────────────────

export default function EquipoPage() {
  const { user, activeCampaignId } = useAuth();
  useInjectStyles();
  const [showHierarchy, setShowHierarchy] = useState(false);

  const eq = useEquipo(activeCampaignId, user?.role ?? "agente_campo");

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
    <div style={{ fontFamily: FONT_STACK, animation: "goberna-fade-in .4s ease-out" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--color-text-primary)", margin: "0 0 4px", letterSpacing: "0.02em" }}>
            EQUIPO DE CAMPAÑA
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
            {eq.canManage
              ? "Gestiona tu equipo y asigna roles según la jerarquía de mando."
              : "Miembros de la campaña."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHierarchy((v) => !v)}
          style={{
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--goberna-blue-700)",
            background: "var(--goberna-blue-50)",
            border: "1px solid var(--goberna-blue-200)",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          {showHierarchy ? "Ocultar Jerarquía" : "Ver Jerarquía"}
        </button>
      </div>

      {showHierarchy && (
        <div style={{ marginBottom: 24 }}>
          <HierarchyDiagram />
        </div>
      )}

      {eq.loading ? (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <Spinner size={28} />
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
    </div>
  );
}
