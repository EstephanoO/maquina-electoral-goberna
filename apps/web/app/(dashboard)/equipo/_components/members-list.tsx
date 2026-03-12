/**
 * GOBERNA — Members List
 * Team members grouped by region with leadership section and inline objectives.
 */

"use client";

import { useMemo, useState } from "react";
import { Card, EmptyState, IconUsers } from "../../../../lib/ui";
import { FONT_STACK } from "../../../../lib/constants";
import {
  type Member,
  getRoleConfig,
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
  void objectiveInputs;
  void objectivesChanged;
  void savingObjectives;
  void onObjectiveChange;
  void onSaveObjectives;

  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) set.add(m.region?.trim() || "Sin region");
    return Array.from(set).sort((a, b) => {
      if (a === "Sin region") return 1;
      if (b === "Sin region") return -1;
      return a.localeCompare(b, "es");
    });
  }, [members]);

  const roles = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) set.add(m.role);
    return Array.from(set).sort((a, b) => getRoleConfig(b).level - getRoleConfig(a).level);
  }, [members]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter((m) => {
        const region = m.region?.trim() || "Sin region";
        if (regionFilter !== "all" && region !== regionFilter) return false;
        if (roleFilter !== "all" && m.role !== roleFilter) return false;
        if (!q) return true;
        const roleLabel = getRoleConfig(m.role).label.toLowerCase();
        return (
          m.full_name.toLowerCase().includes(q)
          || m.email.toLowerCase().includes(q)
          || (m.phone || "").toLowerCase().includes(q)
          || region.toLowerCase().includes(q)
          || roleLabel.includes(q)
        );
      })
      .sort((a, b) => {
        const byLevel = getRoleConfig(b.role).level - getRoleConfig(a.role).level;
        if (byLevel !== 0) return byLevel;
        return a.full_name.localeCompare(b.full_name, "es");
      });
  }, [members, regionFilter, roleFilter, search]);

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT_STACK }}>
      <section
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "68vh",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 0.9fr 0.8fr auto",
            gap: 10,
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-surface-alt)",
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email, telefono o region"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              fontSize: 12,
              fontWeight: 600,
              outline: "none",
            }}
          />

          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              fontSize: 12,
              fontWeight: 600,
              outline: "none",
            }}
          >
            <option value="all">Todas las regiones</option>
            {regions.map((region) => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              fontSize: 12,
              fontWeight: 600,
              outline: "none",
            }}
          >
            <option value="all">Todos los roles</option>
            {roles.map((role) => (
              <option key={role} value={role}>{getRoleConfig(role).label}</option>
            ))}
          </select>

          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
            {filteredMembers.length} usuarios
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredMembers.length > 0 ? (
            filteredMembers.map(renderMember)
          ) : (
            <div style={{ padding: 20 }}>
              <EmptyState
                icon={<IconUsers size={40} color="var(--color-border-strong)" />}
                title="Sin coincidencias"
                description="Probá con otra combinación de búsqueda o filtros."
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
