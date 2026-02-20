/**
 * GOBERNA — Members List
 * Team members grouped by region with leadership section and inline objectives.
 */

"use client";

import { Card, EmptyState, IconUsers, IconMap, IconMapPin, IconTarget, IconBriefcase, IconCheck } from "../../../../lib/ui";
import { FONT_STACK } from "../../../../lib/constants";
import {
  type Member,
  getRoleConfig,
  LEADERSHIP_ROLES,
} from "./role-config";
import { MemberRow } from "./member-row";

type MembersListProps = {
  members: Member[];
  userId: string | undefined;
  userRole: string;
  canManage: boolean;
  updatingRole: string | null;
  onRoleChange: (userId: string, role: string) => void;
  onRemove: (userId: string, name: string) => void;
  onResetPassword: (userId: string, name: string) => void;
  allowedRoles: string[];
  // Objectives
  objectiveInputs: Record<string, string>;
  objectivesChanged: boolean;
  savingObjectives: boolean;
  onObjectiveChange: (region: string, value: string) => void;
  onSaveObjectives: () => void;
};

export function MembersList({
  members,
  userId,
  userRole,
  canManage,
  updatingRole,
  onRoleChange,
  onRemove,
  onResetPassword,
  allowedRoles,
  objectiveInputs,
  objectivesChanged,
  savingObjectives,
  onObjectiveChange,
  onSaveObjectives,
}: MembersListProps) {
  if (members.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<IconUsers size={48} color="var(--color-border-strong)" />}
          title="No hay miembros en esta campaña"
          description="Aprueba solicitudes de acceso para agregar miembros."
        />
      </Card>
    );
  }

  // Split leadership vs field
  const leadership = members
    .filter((m) => LEADERSHIP_ROLES.has(m.role))
    .sort((a, b) => getRoleConfig(b.role).level - getRoleConfig(a.role).level);

  const field = members.filter((m) => !LEADERSHIP_ROLES.has(m.role));

  // Group field by region
  const grouped: Record<string, Member[]> = {};
  for (const m of field) {
    const key = m.region ?? "__sin_region__";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => getRoleConfig(b.role).level - getRoleConfig(a.role).level);
  }

  const regionKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "__sin_region__") return 1;
    if (b === "__sin_region__") return -1;
    return a.localeCompare(b, "es");
  });

  const renderMember = (member: Member) => (
    <MemberRow
      key={member.user_id}
      member={member}
      isSelf={member.user_id === userId}
      canManage={canManage}
      viewerRole={userRole}
      updatingRole={updatingRole === member.user_id}
      onRoleChange={(role) => onRoleChange(member.user_id, role)}
      onRemove={() => onRemove(member.user_id, member.full_name)}
      onResetPassword={() => onResetPassword(member.user_id, member.full_name)}
      allowedRoles={allowedRoles}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT_STACK }}>
      {/* Leadership block */}
      {leadership.length > 0 && (
        <section style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            background: "linear-gradient(135deg, #fef9e7, #fdf2d0)",
            borderBottom: "1px solid var(--color-border)",
          }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <IconBriefcase size={14} color="#fff" />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--goberna-blue-900)", flex: 1 }}>
              Conducción de Campaña
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#92400e",
              background: "#fef3c7",
              border: "1px solid #fde68a",
              padding: "2px 10px",
              borderRadius: 10,
            }}>
              {leadership.length}
            </span>
          </div>
          {leadership.map(renderMember)}
        </section>
      )}

      {/* Field members grouped by region */}
      {regionKeys.map((regionKey) => {
        const regionLabel = regionKey === "__sin_region__" ? "Sin Región Asignada" : regionKey;
        const regionMembers = grouped[regionKey];
        const inputValue = objectiveInputs[regionKey] ?? "";
        const targetForms = parseInt(inputValue, 10) || 0;
        const isNoRegion = regionKey === "__sin_region__";

        return (
          <section
            key={regionKey}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {/* Region header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              background: isNoRegion ? "var(--color-surface)" : "var(--goberna-blue-50)",
              borderBottom: "1px solid var(--color-border)",
            }}>
              {/* Icon */}
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: isNoRegion ? "var(--color-border)" : "var(--goberna-blue-600)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                {isNoRegion
                  ? <IconMapPin size={14} color="#fff" />
                  : <IconMap size={14} color="#fff" />}
              </div>

              {/* Label + count */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  {regionLabel}
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: isNoRegion ? "var(--color-text-tertiary)" : "var(--goberna-blue-700)",
                    background: isNoRegion ? "var(--color-border)" : "var(--goberna-blue-100)",
                    padding: "2px 10px",
                    borderRadius: 10,
                  }}>
                    {regionMembers.length}
                  </span>
                </div>
              </div>

              {/* Inline objective (compact) */}
              {canManage && !isNoRegion && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  padding: "4px 10px",
                  background: "var(--color-surface)",
                  borderRadius: 8,
                  border: "1px solid var(--color-border)",
                }}>
                  <IconTarget size={13} color="var(--color-text-tertiary)" />
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={inputValue}
                    onChange={(e) => onObjectiveChange(regionKey, e.target.value)}
                    style={{
                      width: 52,
                      padding: "2px 4px",
                      fontSize: 12,
                      fontWeight: 700,
                      textAlign: "center",
                      border: "none",
                      borderRadius: 4,
                      background: "transparent",
                      color: "var(--color-text-primary)",
                      outline: "none",
                    }}
                  />
                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                    meta
                  </span>
                  {objectivesChanged && (
                    <button
                      type="button"
                      onClick={onSaveObjectives}
                      disabled={savingObjectives}
                      style={{
                        padding: "2px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#fff",
                        background: "var(--goberna-blue-600)",
                        border: "none",
                        borderRadius: 5,
                        cursor: savingObjectives ? "not-allowed" : "pointer",
                        opacity: savingObjectives ? 0.6 : 1,
                      }}
                    >
                      {savingObjectives ? "..." : "Guardar"}
                    </button>
                  )}
                  {!objectivesChanged && targetForms > 0 && (
                    <IconCheck size={12} color="var(--color-success)" />
                  )}
                </div>
              )}
            </div>

            {/* Member rows */}
            {regionMembers.map(renderMember)}
          </section>
        );
      })}
    </div>
  );
}
