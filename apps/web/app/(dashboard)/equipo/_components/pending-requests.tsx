/**
 * GOBERNA — Pending Access Requests
 * Batch-enabled request approval/rejection cards with role assignment.
 */

"use client";

import { useState } from "react";
import { Avatar, IconPhone, IconMapPin, IconWhatsApp, IconCheck, IconX, IconClock } from "../../../../lib/ui";
import { useTheme } from "../../../../lib/theme-context";
import { type PendingRequest, formatDate, openWhatsApp } from "./role-config";
import { RoleSelector } from "./role-selector";

// ── Single Request Card ─────────────────────────────────────────────

type RequestCardProps = {
  request: PendingRequest;
  selected: boolean;
  onToggleSelect: () => void;
  resolving: boolean;
  onResolve: (status: "approved" | "rejected", role: string) => void;
  allowedRoles: string[];
};

function RequestCard({ request, selected, onToggleSelect, resolving, onResolve, allowedRoles }: RequestCardProps) {
  const [selectedRole, setSelectedRole] = useState("agente_campo");
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div style={{
      display: "flex",
      alignItems: "stretch",
      padding: 16,
      borderBottom: "1px solid var(--color-border)",
      gap: 16,
      flexWrap: "wrap",
      opacity: resolving ? 0.5 : 1,
      transition: "all 0.15s ease",
      background: selected ? "var(--goberna-blue-50)" : "transparent",
    }}>
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggleSelect}
        disabled={resolving}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
          borderRadius: 6,
          border: `2px solid ${selected ? "var(--goberna-blue-600)" : "var(--color-border-strong)"}`,
          background: selected ? "var(--goberna-blue-600)" : "transparent",
          cursor: resolving ? "not-allowed" : "pointer",
          flexShrink: 0,
          alignSelf: "center",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {selected && <IconCheck size={12} color="#fff" />}
      </button>

      {/* User info */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 280px", minWidth: 0 }}>
        <Avatar name={request.full_name ?? "?"} size={44} borderColor="var(--goberna-blue-300)" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)", marginBottom: 2 }}>
            {request.full_name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {request.phone && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                <IconPhone size={12} />
                <span>{request.phone}</span>
              </div>
            )}
            {request.region && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 9,
                fontWeight: 600,
                color: isDark ? "#8fc3f5" : "#0369A1",
                background: isDark ? "rgba(143,195,245,0.12)" : "#E0F2FE",
                border: isDark ? "1px solid rgba(143,195,245,0.24)" : "1px solid transparent",
                padding: "2px 6px",
                borderRadius: 4,
                textTransform: "uppercase",
              }}>
                <IconMapPin size={10} />
                {request.region}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
            <IconClock size={10} />
            {formatDate(request.created_at)}
          </div>
        </div>
        {request.phone && (
          <button
            type="button"
            onClick={() => openWhatsApp(request.phone!)}
            title="Enviar WhatsApp"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              background: isDark ? "var(--color-surface-active)" : "#DCFCE7",
              border: isDark ? "1px solid var(--color-border-strong)" : "1px solid #BBF7D0",
              color: isDark ? "#63e39d" : "#16a34a",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <IconWhatsApp size={16} />
          </button>
        )}
      </div>

      {/* Role + Actions (only when not batch-selected) */}
      {!selected && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 300px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)" }}>
              Asignar como:
            </div>
            <RoleSelector value={selectedRole} onChange={setSelectedRole} allowedRoles={allowedRoles} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <button
              type="button"
              disabled={resolving}
              onClick={() => onResolve("approved", selectedRole)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                background: isDark ? "var(--color-surface-active)" : "var(--color-success)",
                border: isDark ? "1px solid var(--color-border-strong)" : "1px solid transparent",
                color: isDark ? "#63e39d" : "#fff",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <IconCheck size={14} /> Aprobar
            </button>
            <button
              type="button"
              disabled={resolving}
              onClick={() => onResolve("rejected", "agente_campo")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--color-error)",
                background: isDark ? "var(--color-surface-active)" : "transparent",
                border: isDark ? "1px solid var(--color-border-strong)" : "1px solid var(--color-error)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <IconX size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Batch Action Bar ────────────────────────────────────────────────

type BatchBarProps = {
  total: number;
  selectedCount: number;
  onToggleAll: () => void;
  batchRole: string;
  onBatchRoleChange: (role: string) => void;
  onBatchApprove: () => void;
  onBatchReject: () => void;
  processing: boolean;
  allowedRoles: string[];
};

function BatchBar({
  total,
  selectedCount,
  onToggleAll,
  batchRole,
  onBatchRoleChange,
  onBatchApprove,
  onBatchReject,
  processing,
  allowedRoles,
}: BatchBarProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const allSelected = selectedCount === total && total > 0;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 16px",
      background: isDark
        ? (selectedCount > 0 ? "var(--color-surface-active)" : "var(--color-surface)")
        : (selectedCount > 0 ? "var(--goberna-blue-50)" : "var(--color-surface)"),
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-lg)",
      marginBottom: 8,
      flexWrap: "wrap",
    }}>
      <button
        type="button"
        onClick={onToggleAll}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "transparent",
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-text-secondary)",
        }}
      >
        <span style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: "2px solid var(--color-border-strong)",
          background: allSelected
            ? "var(--goberna-blue-600)"
            : selectedCount > 0
              ? "var(--goberna-blue-300)"
              : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}>
          {selectedCount > 0 && <IconCheck size={10} color="#fff" />}
        </span>
        {selectedCount === 0
          ? "Seleccionar todos"
          : allSelected
            ? "Deseleccionar todos"
            : `${selectedCount} seleccionados`}
      </button>

      {selectedCount > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Aprobar como:</span>
            <RoleSelector value={batchRole} onChange={onBatchRoleChange} allowedRoles={allowedRoles} />
          </div>
          <button
            type="button"
            onClick={onBatchApprove}
            disabled={processing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              background: isDark ? "var(--color-surface-active)" : "var(--color-success)",
              border: isDark ? "1px solid var(--color-border-strong)" : "1px solid transparent",
              color: isDark ? "#63e39d" : "#fff",
              borderRadius: 6,
              cursor: processing ? "not-allowed" : "pointer",
              opacity: processing ? 0.6 : 1,
            }}
          >
            <IconCheck size={14} />
            Aprobar {selectedCount}
          </button>
          <button
            type="button"
            onClick={onBatchReject}
            disabled={processing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
                padding: "6px 12px",
              background: isDark ? "var(--color-surface-active)" : "transparent",
              color: "var(--color-error)",
              border: isDark ? "1px solid var(--color-border-strong)" : "1px solid var(--color-error)",
              borderRadius: 6,
              cursor: processing ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 700,
              opacity: processing ? 0.6 : 1,
            }}
          >
            <IconX size={14} /> Rechazar
          </button>
        </>
      )}
    </div>
  );
}

// ── Pending Requests Section ────────────────────────────────────────

type PendingRequestsSectionProps = {
  requests: PendingRequest[];
  selectedRequests: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  batchRole: string;
  onBatchRoleChange: (role: string) => void;
  onBatchApprove: () => void;
  onBatchReject: () => void;
  batchProcessing: boolean;
  resolvingRequest: string | null;
  onResolve: (requestId: string, status: "approved" | "rejected", role: string) => void;
  allowedRoles: string[];
};

export function PendingRequestsSection({
  requests,
  selectedRequests,
  onToggleSelect,
  onToggleAll,
  batchRole,
  onBatchRoleChange,
  onBatchApprove,
  onBatchReject,
  batchProcessing,
  resolvingRequest,
  onResolve,
  allowedRoles,
}: PendingRequestsSectionProps) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        color: "var(--color-text-primary)",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <IconClock size={18} color="var(--color-warning)" />
        Solicitudes de Acceso Pendientes
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#fff",
          background: "var(--color-warning)",
          padding: "2px 8px",
          borderRadius: 10,
        }}>
          {requests.length}
        </span>
      </div>

      <BatchBar
        total={requests.length}
        selectedCount={selectedRequests.size}
        onToggleAll={onToggleAll}
        batchRole={batchRole}
        onBatchRoleChange={onBatchRoleChange}
        onBatchApprove={onBatchApprove}
        onBatchReject={onBatchReject}
        processing={batchProcessing}
        allowedRoles={allowedRoles}
      />

      <div style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}>
        {requests.map((req) => (
          <RequestCard
            key={req.id}
            request={req}
            selected={selectedRequests.has(req.id)}
            onToggleSelect={() => onToggleSelect(req.id)}
            resolving={resolvingRequest === req.id || batchProcessing}
            onResolve={(status, role) => onResolve(req.id, status, role)}
            allowedRoles={allowedRoles}
          />
        ))}
      </div>
    </div>
  );
}
