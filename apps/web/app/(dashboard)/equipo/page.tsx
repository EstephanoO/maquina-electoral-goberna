"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/services/api";

/* ═══════════════════════════════════════════════════════════════════════
   GOBERNA — Equipo: Jerarquia Organizacional de Campo
   
   Estructura de Mando:
   - Estratega/Admin: Control de multiples candidatos
   - Candidato: Control total de su campana
   - Director Regional: Coordina 5-10 Capitanes de Brigada en su zona
   - Capitan de Brigada: Lidera 5-10 Agentes de Campo
   - Agente de Campo: Operador de base, sube formularios
   ═══════════════════════════════════════════════════════════════════════ */

// ── Types ───────────────────────────────────────────────────────────

type Member = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  user_status: string;
};

type PendingRequest = {
  id: string;
  user_id: string;
  campaign_id: string;
  status: string;
  full_name: string;
  email: string;
  created_at: string;
};

// ── Role Hierarchy System ───────────────────────────────────────────

type RoleConfig = {
  key: string;
  label: string;
  shortLabel: string;
  level: number;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  canManage: string[]; // roles this role can assign/manage
  capacity?: string;   // how many subordinates
};

const ROLES: Record<string, RoleConfig> = {
  admin: {
    key: "admin",
    label: "Estratega / Admin",
    shortLabel: "Admin",
    level: 100,
    icon: "🎯",
    color: "#1e3a5f",
    bgColor: "linear-gradient(135deg, #ffd700, #ffb700)",
    borderColor: "#d4a500",
    description: "Control total del sistema y multiples campanas",
    canManage: ["supervisor", "director_regional", "capitan_brigada", "agent"],
  },
  supervisor: {
    key: "supervisor",
    label: "Candidato",
    shortLabel: "Candidato",
    level: 80,
    icon: "👔",
    color: "#1e40af",
    bgColor: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
    borderColor: "#1d4ed8",
    description: "Control total de su campana electoral",
    canManage: ["director_regional", "capitan_brigada", "agent"],
  },
  director_regional: {
    key: "director_regional",
    label: "Director Regional de Campo",
    shortLabel: "Director Regional",
    level: 60,
    icon: "🗺️",
    color: "#047857",
    bgColor: "linear-gradient(135deg, #10b981, #059669)",
    borderColor: "#059669",
    description: "Coordina Capitanes de Brigada en su region",
    canManage: ["capitan_brigada", "agent"],
    capacity: "5-10 Capitanes",
  },
  capitan_brigada: {
    key: "capitan_brigada",
    label: "Capitan de Brigada",
    shortLabel: "Capitan",
    level: 40,
    icon: "🎖️",
    color: "#7c3aed",
    bgColor: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
    borderColor: "#7c3aed",
    description: "Lidera brigada de Agentes de Campo",
    canManage: ["agent"],
    capacity: "5-10 Agentes",
  },
  agent: {
    key: "agent",
    label: "Agente de Campo",
    shortLabel: "Agente",
    level: 20,
    icon: "🚶",
    color: "#475569",
    bgColor: "linear-gradient(135deg, #64748b, #475569)",
    borderColor: "#475569",
    description: "Operador territorial, sube formularios",
    canManage: [],
  },
};

// Map backend roles to display roles (for compatibility)
const ROLE_ALIASES: Record<string, string> = {
  jefe_campana: "supervisor",
  brigadista_zonal: "capitan_brigada",
  agente_campo: "agent",
  consultor: "admin",
};

function normalizeRole(role: string): string {
  return ROLE_ALIASES[role] ?? role;
}

function getRoleConfig(role: string): RoleConfig {
  const normalized = normalizeRole(role);
  return ROLES[normalized] ?? ROLES.agent;
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const INJECTED_STYLES = `
@keyframes goberna-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes goberna-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("goberna-equipo-styles")) return;
  const el = document.createElement("style");
  el.id = "goberna-equipo-styles";
  el.textContent = INJECTED_STYLES;
  document.head.appendChild(el);
}

// ── Icons ───────────────────────────────────────────────────────────

function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-blue-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Hierarchy Visualization ─────────────────────────────────────────

function HierarchyDiagram() {
  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-lg)",
      padding: "20px 24px",
      marginBottom: 24,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>📊</span>
        Estructura de Mando
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.values(ROLES).sort((a, b) => b.level - a.level).map((role, idx) => (
          <div key={role.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ 
              width: 32, 
              height: 32, 
              borderRadius: 8, 
              background: role.bgColor,
              border: `2px solid ${role.borderColor}`,
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
            }}>
              {role.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: role.color }}>
                {role.label}
              </div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", lineHeight: 1.3 }}>
                {role.description}
                {role.capacity && <span style={{ marginLeft: 4, fontWeight: 600 }}>• {role.capacity}</span>}
              </div>
            </div>
            {idx < Object.values(ROLES).length - 1 && (
              <div style={{ fontSize: 10, color: "var(--color-text-quaternary)", fontWeight: 600 }}>
                ↓
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Role Badge ──────────────────────────────────────────────────────

function RoleBadge({ role, size = "md" }: { role: string; size?: "sm" | "md" | "lg" }) {
  const config = getRoleConfig(role);
  const sizeStyles = {
    sm: { padding: "2px 8px", fontSize: 10 },
    md: { padding: "4px 12px", fontSize: 11 },
    lg: { padding: "6px 16px", fontSize: 12 },
  };
  
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      ...sizeStyles[size],
      fontWeight: 700,
      borderRadius: 6,
      background: config.bgColor,
      color: "#fff",
      textTransform: "uppercase",
      letterSpacing: "0.03em",
      whiteSpace: "nowrap",
      border: `1px solid ${config.borderColor}`,
      boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
    }}>
      <span style={{ fontSize: size === "sm" ? 10 : 12 }}>{config.icon}</span>
      {config.shortLabel}
    </span>
  );
}

// ── Role Selector (Custom Select) ───────────────────────────────────

function RoleSelector({ 
  value, 
  onChange, 
  disabled,
  allowedRoles,
}: { 
  value: string; 
  onChange: (role: string) => void; 
  disabled?: boolean;
  allowedRoles: string[];
}) {
  const [open, setOpen] = useState(false);
  const config = getRoleConfig(value);
  
  // Filter roles to only show allowed ones
  const availableRoles = Object.values(ROLES).filter(r => allowedRoles.includes(r.key));
  
  if (disabled || availableRoles.length <= 1) {
    return <RoleBadge role={value} />;
  }
  
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          transition: "all 0.15s ease",
        }}
      >
        <span style={{ fontSize: 14 }}>{config.icon}</span>
        {config.shortLabel}
        <IconChevronDown />
      </button>
      
      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Cerrar menu"
            style={{ position: "fixed", inset: 0, zIndex: 40, background: "transparent", border: "none", cursor: "default" }} 
            onClick={() => setOpen(false)} 
          />
          {/* Dropdown */}
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            minWidth: 280,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            overflow: "hidden",
            animation: "goberna-fade-in 0.15s ease-out",
          }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--color-border)", fontSize: 10, fontWeight: 700, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Seleccionar Rol
            </div>
            {availableRoles.sort((a, b) => b.level - a.level).map((role) => (
              <button
                key={role.key}
                type="button"
                onClick={() => { onChange(role.key); setOpen(false); }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "12px 14px",
                  background: value === role.key ? "var(--goberna-blue-50)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.1s ease",
                }}
              >
                <div style={{ 
                  width: 36, 
                  height: 36, 
                  borderRadius: 8, 
                  background: role.bgColor,
                  border: `2px solid ${role.borderColor}`,
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  fontSize: 18,
                  flexShrink: 0,
                }}>
                  {role.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: role.color, marginBottom: 2 }}>
                    {role.label}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.3 }}>
                    {role.description}
                    {role.capacity && <span style={{ display: "block", fontWeight: 600, marginTop: 2 }}>{role.capacity}</span>}
                  </div>
                </div>
                {value === role.key && (
                  <div style={{ color: "var(--goberna-blue-600)", flexShrink: 0 }}>
                    <IconCheck />
                  </div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────

function StatCard({ label, value, role }: { label: string; value: number; role?: string }) {
  const config = role ? getRoleConfig(role) : null;
  
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        animation: "goberna-fade-in .35s ease-out",
      }}
    >
      {config ? (
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: config.bgColor,
          border: `2px solid ${config.borderColor}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          flexShrink: 0,
        }}>
          {config.icon}
        </div>
      ) : (
        <div style={{
          width: 40,
          height: 40,
          borderRadius: "var(--radius-md)",
          background: "var(--goberna-blue-50)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <IconUsers />
        </div>
      )}
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: config?.color ?? "var(--color-text-primary)", lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Pending Request Card ────────────────────────────────────────────

function PendingRequestCard({ 
  request, 
  resolving, 
  onResolve,
  allowedRoles,
}: { 
  request: PendingRequest;
  resolving: boolean;
  onResolve: (status: "approved" | "rejected", role: string) => void;
  allowedRoles: string[];
}) {
  const [selectedRole, setSelectedRole] = useState("agent");
  
  return (
    <div style={{
      display: "flex",
      alignItems: "stretch",
      padding: 16,
      borderBottom: "1px solid var(--color-border)",
      gap: 16,
      flexWrap: "wrap",
      opacity: resolving ? 0.5 : 1,
      transition: "opacity 0.2s ease",
    }}>
      {/* User Info */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 200px", minWidth: 0 }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "var(--goberna-blue-100)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--goberna-blue-600)",
          flexShrink: 0,
        }}>
          {request.full_name?.charAt(0)?.toUpperCase() ?? "?"}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)", marginBottom: 2 }}>
            {request.full_name}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {request.email}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-quaternary)", marginTop: 2 }}>
            {formatDate(request.created_at)}
          </div>
        </div>
      </div>
      
      {/* Role Selection */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 300px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)" }}>
          Asignar como:
        </div>
        <RoleSelector 
          value={selectedRole} 
          onChange={setSelectedRole}
          allowedRoles={allowedRoles}
        />
      </div>
      
      {/* Actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <button
          type="button"
          disabled={resolving}
          onClick={() => onResolve("approved", selectedRole)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            background: "var(--color-success)",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            transition: "transform 0.1s ease",
          }}
        >
          <IconCheck /> Aprobar
        </button>
        <button
          type="button"
          disabled={resolving}
          onClick={() => onResolve("rejected", "agent")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-error)",
            background: "transparent",
            border: "1px solid var(--color-error)",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          <IconX />
        </button>
      </div>
    </div>
  );
}

// ── Member Row ──────────────────────────────────────────────────────

function MemberRow({ 
  member, 
  isSelf, 
  canManage,
  updatingRole,
  onRoleChange,
  onRemove,
  allowedRoles,
}: { 
  member: Member;
  isSelf: boolean;
  canManage: boolean;
  updatingRole: boolean;
  onRoleChange: (role: string) => void;
  onRemove: () => void;
  allowedRoles: string[];
}) {
  const config = getRoleConfig(member.role);
  const isProtected = member.role === "admin" || isSelf;
  
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "14px 16px",
      borderBottom: "1px solid var(--color-border)",
      gap: 16,
      flexWrap: "wrap",
      background: isSelf ? "var(--goberna-blue-50)" : "transparent",
      opacity: updatingRole ? 0.5 : 1,
      transition: "all 0.15s ease",
    }}>
      {/* Avatar + Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 200px", minWidth: 0 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: config.bgColor,
          border: `2px solid ${config.borderColor}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
        }}>
          {member.full_name.charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
            {member.full_name}
            {isSelf && (
              <span style={{ 
                fontSize: 9, 
                fontWeight: 700, 
                color: "var(--goberna-blue-600)", 
                background: "var(--goberna-blue-100)", 
                padding: "2px 6px", 
                borderRadius: 4,
              }}>
                TU
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {member.email}
          </div>
        </div>
      </div>
      
      {/* Role */}
      <div style={{ flex: "0 0 auto" }}>
        {canManage && !isProtected ? (
          <RoleSelector 
            value={normalizeRole(member.role)}
            onChange={onRoleChange}
            disabled={updatingRole}
            allowedRoles={allowedRoles}
          />
        ) : (
          <RoleBadge role={member.role} />
        )}
      </div>
      
      {/* Status */}
      <div style={{ flex: "0 0 auto" }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          color: member.user_status === "active" ? "var(--color-success)" : "var(--color-text-tertiary)",
        }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: member.user_status === "active" ? "var(--color-success)" : "var(--color-border-strong)",
            animation: member.user_status === "active" ? "goberna-pulse 2s infinite" : "none",
          }} />
          {member.user_status === "active" ? "Activo" : member.user_status === "pending" ? "Pendiente" : "Inactivo"}
        </span>
      </div>
      
      {/* Actions */}
      {canManage && !isProtected && (
        <div style={{ flex: "0 0 auto" }}>
          <button
            type="button"
            onClick={onRemove}
            style={{
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-error)",
              background: "transparent",
              border: "1px solid var(--color-error)",
              borderRadius: 6,
              cursor: "pointer",
              opacity: 0.7,
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
          >
            Remover
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function EquipoPage() {
  const { user, activeCampaignId } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [resolvingRequest, setResolvingRequest] = useState<string | null>(null);
  const [showHierarchy, setShowHierarchy] = useState(false);

  const fontStack = "var(--font-montserrat), system-ui, sans-serif";
  
  // Determine user permissions
  const userRole = normalizeRole(user?.role ?? "agent");
  const userConfig = getRoleConfig(userRole);
  const canManage = userConfig.canManage.length > 0;
  const allowedRoles = ["agent", ...userConfig.canManage];

  // ── Fetch members ──
  const fetchData = useCallback(async () => {
    if (!activeCampaignId) return;
    setLoading(true);
    setError(null);

    try {
      const [membersRes, pendingRes] = await Promise.all([
        api.get<{ members: Member[] }>(`/api/campaigns/${activeCampaignId}/members`, {
          campaignId: activeCampaignId,
        }),
        canManage
          ? api.get<{ pending_requests: PendingRequest[] }>("/api/access-requests/pending", {
              campaignId: activeCampaignId,
            })
          : Promise.resolve(null),
      ]);

      if (membersRes.ok && membersRes.data) {
        setMembers(membersRes.data.members);
      } else {
        setError(membersRes.error?.message ?? "Error cargando miembros");
      }

      if (pendingRes && pendingRes.ok && pendingRes.data) {
        const filtered = pendingRes.data.pending_requests.filter(
          (r) => r.campaign_id === activeCampaignId,
        );
        setPendingRequests(filtered);
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }, [activeCampaignId, canManage]);

  useEffect(() => {
    injectStyles();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Change role ──
  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!activeCampaignId) return;
    setUpdatingRole(userId);

    // Map display role to backend role
    const backendRole = newRole === "supervisor" ? "jefe_campana" 
                      : newRole === "capitan_brigada" ? "brigadista_zonal"
                      : newRole === "director_regional" ? "consultor" // Temporary mapping
                      : "agente_campo";

    const res = await api.put(
      `/api/campaigns/${activeCampaignId}/members/${userId}/role`,
      { role: backendRole },
      { campaignId: activeCampaignId },
    );

    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? { ...m, role: backendRole } : m)),
      );
    } else {
      alert(res.error?.message ?? "Error cambiando rol");
    }

    setUpdatingRole(null);
  };

  // ── Resolve access request ──
  const handleResolve = async (requestId: string, status: "approved" | "rejected", role: string) => {
    setResolvingRequest(requestId);

    // Map display role to backend role
    const backendRole = role === "supervisor" ? "jefe_campana" 
                      : role === "capitan_brigada" ? "brigadista_zonal"
                      : role === "director_regional" ? "consultor"
                      : "agente_campo";

    const res = await api.put(`/api/access-requests/${requestId}`, {
      status,
      role: backendRole,
    });

    if (res.ok) {
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (status === "approved") {
        fetchData();
      }
    } else {
      alert(res.error?.message ?? "Error resolviendo solicitud");
    }

    setResolvingRequest(null);
  };

  // ── Remove member ──
  const handleRemove = async (userId: string, name: string) => {
    if (!confirm(`Remover a ${name} de la campana?`)) return;
    
    const res = await api.delete(`/api/campaigns/${activeCampaignId}/members/${userId}`);
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    }
  };

  // ── Stats by role ──
  const stats = useMemo(() => {
    const byRole: Record<string, number> = {};
    for (const m of members) {
      const normalized = normalizeRole(m.role);
      byRole[normalized] = (byRole[normalized] ?? 0) + 1;
    }
    return byRole;
  }, [members]);

  if (!activeCampaignId) {
    return (
      <div style={{ fontFamily: fontStack, padding: "40px 0", textAlign: "center", color: "var(--color-text-tertiary)" }}>
        Selecciona una campana para ver su equipo.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: fontStack, animation: "goberna-fade-in .4s ease-out" }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--color-text-primary)", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>👥</span>
              Equipo de Campana
            </h1>
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
              {canManage 
                ? "Gestiona tu equipo y asigna roles segun la jerarquia de mando." 
                : "Miembros de la campana."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowHierarchy(!showHierarchy)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--goberna-blue-700)",
              background: "var(--goberna-blue-50)",
              border: "1px solid var(--goberna-blue-200)",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            📊 {showHierarchy ? "Ocultar" : "Ver"} Jerarquia
          </button>
        </div>
      </div>

      {/* ── Hierarchy Diagram ───────────────────────────────────── */}
      {showHierarchy && <HierarchyDiagram />}

      {/* ── Stats ───────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        <StatCard label="Total Miembros" value={members.length} />
        {Object.entries(stats).sort(([,a], [,b]) => b - a).slice(0, 4).map(([role, count]) => (
          <StatCard key={role} label={ROLES[role]?.shortLabel ?? role} value={count} role={role} />
        ))}
        {pendingRequests.length > 0 && (
          <StatCard label="Solicitudes" value={pendingRequests.length} />
        )}
      </div>

      {/* ── Pending Requests ────────────────────────────────────── */}
      {canManage && pendingRequests.length > 0 && (
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
            <span style={{ fontSize: 18 }}>⏳</span>
            Solicitudes de Acceso Pendientes
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              background: "var(--color-warning)",
              padding: "2px 8px",
              borderRadius: 10,
            }}>
              {pendingRequests.length}
            </span>
          </div>
          <div style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}>
            {pendingRequests.map((req) => (
              <PendingRequestCard
                key={req.id}
                request={req}
                resolving={resolvingRequest === req.id}
                onResolve={(status, role) => handleResolve(req.id, status, role)}
                allowedRoles={allowedRoles}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Members List ────────────────────────────────────────── */}
      <div style={{ 
        fontSize: 14, 
        fontWeight: 700, 
        color: "var(--color-text-primary)", 
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>🎖️</span>
        Miembros del Equipo
      </div>

      {loading ? (
        <div style={{ 
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "60px 0", 
          textAlign: "center", 
          color: "var(--color-text-tertiary)",
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          Cargando equipo...
        </div>
      ) : error ? (
        <div style={{ 
          background: "var(--color-surface)",
          border: "1px solid var(--color-error)",
          borderRadius: "var(--radius-lg)",
          padding: "40px 0", 
          textAlign: "center", 
          color: "var(--color-error)" 
        }}>
          {error}
        </div>
      ) : (
        <div style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}>
          {members.length === 0 ? (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No hay miembros en esta campana</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Aprueba solicitudes de acceso para agregar miembros.</div>
            </div>
          ) : (
            members
              .sort((a, b) => {
                const levelA = getRoleConfig(a.role).level;
                const levelB = getRoleConfig(b.role).level;
                return levelB - levelA;
              })
              .map((member) => (
                <MemberRow
                  key={member.user_id}
                  member={member}
                  isSelf={member.user_id === user?.id}
                  canManage={canManage}
                  updatingRole={updatingRole === member.user_id}
                  onRoleChange={(role) => handleRoleChange(member.user_id, role)}
                  onRemove={() => handleRemove(member.user_id, member.full_name)}
                  allowedRoles={allowedRoles}
                />
              ))
          )}
        </div>
      )}
    </div>
  );
}
