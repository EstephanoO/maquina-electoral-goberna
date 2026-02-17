/**
 * GOBERNA — AccessRequestCard Component
 * Display a single access request with resolve panel.
 */

"use client";

import { useState } from "react";
import { Avatar, StatusBadge, Button, Alert } from "../../../../lib/ui";
import { FONT_STACK } from "../../../../lib/constants";
import { formatDateTime } from "../../../../lib/utils";
import { resolveAccessRequest } from "../../../../lib/services";
import type { AccessRequest } from "../../../../lib/types";

type AccessRequestCardProps = {
  request: AccessRequest;
  onResolved: () => void;
};

export function AccessRequestCard({ request, onResolved }: AccessRequestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [permTierra, setPermTierra] = useState(true);
  const [permDigital, setPermDigital] = useState(true);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const handleResolve = async (status: "approved" | "rejected") => {
    setActing(true);
    setError("");

    const res = await resolveAccessRequest(request.id, {
      status,
      note: note.trim() || undefined,
      perm_tierra: permTierra,
      perm_digital: permDigital,
    });

    setActing(false);

    if (!res.ok) {
      setError(res.error?.message ?? "Error resolviendo solicitud.");
      return;
    }

    onResolved();
  };

  const displayName = request.user_full_name ?? request.user_email ?? "Usuario";

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "16px 20px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={displayName} size={36} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {displayName}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {request.user_email} &middot; {request.campaign_name}
              {request.campaign_numero ? ` #${request.campaign_numero}` : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge status={request.status} />
          {request.status === "pending" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Cancelar" : "Resolver"}
            </Button>
          )}
        </div>
      </div>

      {/* Time */}
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 8 }}>
        Solicitado: {formatDateTime(request.requested_at)}
      </div>

      {/* Resolve Panel */}
      {expanded && (
        <div
          style={{
            background: "var(--goberna-blue-50)",
            borderRadius: "var(--radius-md)",
            padding: "16px 20px",
            marginTop: 12,
            animation: "goberna-fade-in .3s ease-out",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              marginBottom: 12,
            }}
          >
            Resolver solicitud de {displayName}
          </div>

          {/* Permission toggles */}
          <div style={{ display: "flex", gap: 20, marginBottom: 12 }}>
            <PermissionToggle
              label="Tierra (campo)"
              checked={permTierra}
              onChange={setPermTierra}
            />
            <PermissionToggle
              label="Digital (web/redes)"
              checked={permDigital}
              onChange={setPermDigital}
            />
          </div>

          {/* Note */}
          <textarea
            placeholder="Nota opcional..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: "inherit",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-surface)",
              resize: "vertical",
              minHeight: 48,
              outline: "none",
              marginBottom: 12,
              boxSizing: "border-box",
            }}
          />

          {error && <Alert variant="error" message={error} onDismiss={() => setError("")} />}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: error ? 12 : 0 }}>
            <Button
              variant="primary"
              size="md"
              loading={acting}
              onClick={() => handleResolve("approved")}
              style={{ background: "var(--color-success)" }}
            >
              Aprobar
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={acting}
              onClick={() => handleResolve("rejected")}
            >
              Rechazar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Permission Toggle ──────────────────────────────────────────────

function PermissionToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        color: "var(--color-text-secondary)",
        fontFamily: FONT_STACK,
        background: "none",
        border: "none",
        padding: 0,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: checked ? "none" : "2px solid var(--color-border-strong)",
          background: checked ? "var(--goberna-blue-600)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all .15s ease",
          flexShrink: 0,
        }}
      >
        {checked && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>Checked</title>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}
