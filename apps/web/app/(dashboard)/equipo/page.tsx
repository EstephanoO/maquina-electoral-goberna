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
  phone: string | null;
  region: string | null;
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
  phone: string | null;
  region: string | null;
  created_at: string;
};

type ZoneObjective = {
  id: string;
  campaign_id: string;
  region: string;
  target_forms: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type Campaign = {
  id: string;
  name: string;
  slug: string;
  cargo?: string;
  partido?: string;
  foto_url?: string;
};

type ConsultorCampaignAssignment = {
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  assigned_at: string;
};

// Peruvian departments for objectives
const DEPARTAMENTOS = [
  "Amazonas", "Ancash", "Apurimac", "Arequipa", "Ayacucho",
  "Cajamarca", "Callao", "Cusco", "Huancavelica", "Huanuco",
  "Ica", "Junin", "La Libertad", "Lambayeque", "Lima",
  "Loreto", "Madre de Dios", "Moquegua", "Pasco", "Piura",
  "Puno", "San Martin", "Tacna", "Tumbes", "Ucayali",
];

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
    canManage: ["consultor", "supervisor", "director_regional", "capitan_brigada", "agent"],
  },
  consultor: {
    key: "consultor",
    label: "Consultor Estrategico",
    shortLabel: "Consultor",
    level: 90,
    icon: "📊",
    color: "#4f46e5",
    bgColor: "linear-gradient(135deg, #818cf8, #6366f1)",
    borderColor: "#6366f1",
    description: "Asesora multiples campanas asignadas",
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
  candidato: "supervisor",
  brigadista_zonal: "capitan_brigada",
  agente_campo: "agent",
  // consultor maps to itself now
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

function IconWhatsApp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function IconPhone() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function IconMapPin() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function IconKey() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  );
}

/** Open WhatsApp chat with phone number */
function openWhatsApp(phone: string) {
  // Clean phone number (remove spaces, dashes)
  const cleanPhone = phone.replace(/\D/g, "");
  // Peru country code
  const fullPhone = cleanPhone.startsWith("51") ? cleanPhone : `51${cleanPhone}`;
  window.open(`https://wa.me/${fullPhone}`, "_blank");
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

// ── Pending Request Card (Selectable for batch operations) ──────────

function PendingRequestCardSelectable({ 
  request, 
  selected,
  onToggleSelect,
  resolving, 
  onResolve,
  allowedRoles,
}: { 
  request: PendingRequest;
  selected: boolean;
  onToggleSelect: () => void;
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
        {selected && "✓"}
      </button>

      {/* User Info */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 280px", minWidth: 0 }}>
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
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)", marginBottom: 2 }}>
            {request.full_name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {request.phone && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                <IconPhone />
                <span>{request.phone}</span>
              </div>
            )}
            {request.region && (
              <div style={{ 
                display: "inline-flex", 
                alignItems: "center", 
                gap: 3, 
                fontSize: 9, 
                fontWeight: 600,
                color: "#0369A1",
                background: "#E0F2FE", 
                padding: "2px 6px", 
                borderRadius: 4,
                textTransform: "uppercase",
              }}>
                <IconMapPin />
                {request.region}
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-quaternary)", marginTop: 2 }}>
            {formatDate(request.created_at)}
          </div>
        </div>
        {/* WhatsApp button */}
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
              background: "#DCFCE7",
              border: "1px solid #BBF7D0",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <IconWhatsApp />
          </button>
        )}
      </div>
      
      {/* Role Selection (only show if not selected for batch) */}
      {!selected && (
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
      )}
      
      {/* Actions (only show if not selected for batch) */}
      {!selected && (
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
      )}
    </div>
  );
}

// ── Pending Request Card (Legacy - for backwards compat) ────────────

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
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 280px", minWidth: 0 }}>
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
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)", marginBottom: 2 }}>
            {request.full_name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {request.phone && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                <IconPhone />
                <span>{request.phone}</span>
              </div>
            )}
            {request.region && (
              <div style={{ 
                display: "inline-flex", 
                alignItems: "center", 
                gap: 3, 
                fontSize: 9, 
                fontWeight: 600,
                color: "#0369A1",
                background: "#E0F2FE", 
                padding: "2px 6px", 
                borderRadius: 4,
                textTransform: "uppercase",
              }}>
                <IconMapPin />
                {request.region}
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-quaternary)", marginTop: 2 }}>
            {formatDate(request.created_at)}
          </div>
        </div>
        {/* WhatsApp button */}
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
              background: "#DCFCE7",
              border: "1px solid #BBF7D0",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <IconWhatsApp />
          </button>
        )}
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
  onResetPassword,
  allowedRoles,
}: { 
  member: Member;
  isSelf: boolean;
  canManage: boolean;
  updatingRole: boolean;
  onRoleChange: (role: string) => void;
  onRemove: () => void;
  onResetPassword: () => void;
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
      {/* Avatar + Name + Contact */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 280px", minWidth: 0 }}>
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
        <div style={{ minWidth: 0, flex: 1 }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            {member.phone && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                <IconPhone />
                <span>{member.phone}</span>
              </div>
            )}
            {member.region && (
              <div style={{ 
                display: "inline-flex", 
                alignItems: "center", 
                gap: 3, 
                fontSize: 9, 
                fontWeight: 600,
                color: "#0369A1",
                background: "#E0F2FE", 
                padding: "2px 6px", 
                borderRadius: 4,
                textTransform: "uppercase",
              }}>
                <IconMapPin />
                {member.region}
              </div>
            )}
          </div>
        </div>
        {/* WhatsApp button */}
        {member.phone && (
          <button
            type="button"
            onClick={() => openWhatsApp(member.phone!)}
            title="Enviar WhatsApp"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#DCFCE7",
              border: "1px solid #BBF7D0",
              cursor: "pointer",
              flexShrink: 0,
              transition: "transform 0.1s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            <IconWhatsApp />
          </button>
        )}
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
        <div style={{ flex: "0 0 auto", display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onResetPassword}
            title="Reiniciar contrasena"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--goberna-blue-600)",
              background: "var(--goberna-blue-50)",
              border: "1px solid var(--goberna-blue-200)",
              borderRadius: 6,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => { 
              e.currentTarget.style.background = "var(--goberna-blue-100)"; 
            }}
            onMouseLeave={(e) => { 
              e.currentTarget.style.background = "var(--goberna-blue-50)"; 
            }}
          >
            <IconKey />
            Reiniciar
          </button>
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
  
  // Batch selection state
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [batchRole, setBatchRole] = useState("agent");
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Objectives state
  const [showObjectives, setShowObjectives] = useState(false);
  const [zoneObjectives, setZoneObjectives] = useState<ZoneObjective[]>([]);
  const [objectiveInputs, setObjectiveInputs] = useState<Record<string, string>>({});
  const [savingObjectives, setSavingObjectives] = useState(false);
  const [objectivesChanged, setObjectivesChanged] = useState(false);

  // Consultor campaign assignment state (admin only)
  const [showConsultorModal, setShowConsultorModal] = useState(false);
  const [consultorToAssign, setConsultorToAssign] = useState<{ userId: string; name: string } | null>(null);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [consultorCampaigns, setConsultorCampaigns] = useState<Set<string>>(new Set());
  const [savingConsultorCampaigns, setSavingConsultorCampaigns] = useState(false);

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

  // ── Fetch objectives ──
  const fetchObjectives = useCallback(async () => {
    if (!activeCampaignId || !canManage) return;
    
    try {
      const res = await api.get<{ zones: ZoneObjective[] }>("/api/objectives/zones", {
        campaignId: activeCampaignId,
      });
      
      if (res.ok && res.data) {
        setZoneObjectives(res.data.zones);
        // Initialize inputs from existing objectives
        const inputs: Record<string, string> = {};
        for (const obj of res.data.zones) {
          inputs[obj.region] = String(obj.target_forms);
        }
        setObjectiveInputs(inputs);
        setObjectivesChanged(false);
      }
    } catch {
      // Silently fail - objectives are optional
    }
  }, [activeCampaignId, canManage]);

  useEffect(() => {
    if (showObjectives) {
      fetchObjectives();
    }
  }, [showObjectives, fetchObjectives]);

  // ── Save objectives ──
  const handleSaveObjectives = async () => {
    if (!activeCampaignId) return;
    setSavingObjectives(true);

    // Build objectives array from inputs
    const objectives = DEPARTAMENTOS
      .filter((region) => {
        const val = objectiveInputs[region];
        return val && parseInt(val, 10) > 0;
      })
      .map((region) => ({
        region,
        target_forms: parseInt(objectiveInputs[region], 10),
      }));

    const res = await api.post("/api/objectives/zones/bulk", 
      { objectives },
      { campaignId: activeCampaignId }
    );

    if (res.ok) {
      fetchObjectives();
      setObjectivesChanged(false);
    } else {
      alert(res.error?.message ?? "Error guardando objetivos");
    }

    setSavingObjectives(false);
  };

  // ── Handle objective input change ──
  const handleObjectiveInputChange = (region: string, value: string) => {
    setObjectiveInputs((prev) => ({ ...prev, [region]: value }));
    setObjectivesChanged(true);
  };

  // ── Open consultor campaign assignment modal ──
  const openConsultorModal = async (userId: string, userName: string) => {
    setConsultorToAssign({ userId, name: userName });
    setSavingConsultorCampaigns(false);

    // Fetch all campaigns and user's current assignments in parallel
    try {
      const [campaignsRes, assignmentsRes] = await Promise.all([
        api.get<{ campaigns: Campaign[] }>("/api/campaigns"),
        api.get<{ campaigns: ConsultorCampaignAssignment[] }>(`/api/consultors/${userId}/campaigns`),
      ]);

      if (campaignsRes.ok && campaignsRes.data) {
        setAllCampaigns(campaignsRes.data.campaigns);
      }

      if (assignmentsRes.ok && assignmentsRes.data) {
        setConsultorCampaigns(new Set(assignmentsRes.data.campaigns.map((c) => c.campaign_id)));
      } else {
        setConsultorCampaigns(new Set());
      }
    } catch {
      setAllCampaigns([]);
      setConsultorCampaigns(new Set());
    }

    setShowConsultorModal(true);
  };

  // ── Toggle campaign selection for consultor ──
  const toggleConsultorCampaign = (campaignId: string) => {
    setConsultorCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else {
        next.add(campaignId);
      }
      return next;
    });
  };

  // ── Save consultor campaign assignments ──
  const saveConsultorCampaigns = async () => {
    if (!consultorToAssign) return;
    setSavingConsultorCampaigns(true);

    const res = await api.put(`/api/consultors/${consultorToAssign.userId}/campaigns`, {
      campaign_ids: Array.from(consultorCampaigns),
    });

    if (res.ok) {
      setShowConsultorModal(false);
      setConsultorToAssign(null);
      fetchData();
    } else {
      alert(res.error?.message ?? "Error guardando campanas del consultor");
    }

    setSavingConsultorCampaigns(false);
  };

  // ── Change role ──
  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!activeCampaignId) return;

    // If changing to consultor, open the campaign selection modal
    if (newRole === "consultor") {
      const member = members.find((m) => m.user_id === userId);
      if (member) {
        openConsultorModal(userId, member.full_name);
      }
      return;
    }

    setUpdatingRole(userId);

    // Map display role to backend role
    const backendRole = newRole === "supervisor" ? "candidato" 
                      : newRole === "capitan_brigada" ? "brigadista_zonal"
                      : newRole === "director_regional" ? "brigadista_zonal"
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
    const backendRole = role === "supervisor" ? "candidato" 
                      : role === "capitan_brigada" ? "brigadista_zonal"
                      : role === "director_regional" ? "brigadista_zonal"
                      : role === "consultor" ? "consultor"
                      : "agente_campo";

    const res = await api.put(`/api/access-requests/${requestId}`, {
      status,
      role: backendRole,
    });

    if (res.ok) {
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      setSelectedRequests((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
      if (status === "approved") {
        fetchData();
      }
    } else {
      alert(res.error?.message ?? "Error resolviendo solicitud");
    }

    setResolvingRequest(null);
  };

  // ── Toggle request selection ──
  const toggleRequestSelection = (requestId: string) => {
    setSelectedRequests((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  };

  // ── Select/deselect all ──
  const toggleSelectAll = () => {
    if (selectedRequests.size === pendingRequests.length) {
      setSelectedRequests(new Set());
    } else {
      setSelectedRequests(new Set(pendingRequests.map((r) => r.id)));
    }
  };

  // ── Batch approve ──
  const handleBatchApprove = async () => {
    if (selectedRequests.size === 0) return;
    
    const confirmMsg = `¿Aprobar ${selectedRequests.size} solicitud${selectedRequests.size > 1 ? "es" : ""} como ${ROLES[batchRole]?.shortLabel ?? batchRole}?`;
    if (!confirm(confirmMsg)) return;

    setBatchProcessing(true);
    
    // Map display role to backend role
    const backendRole = batchRole === "supervisor" ? "candidato" 
                      : batchRole === "capitan_brigada" ? "brigadista_zonal"
                      : batchRole === "director_regional" ? "brigadista_zonal"
                      : batchRole === "consultor" ? "consultor"
                      : "agente_campo";

    let successCount = 0;
    let failCount = 0;

    // Process in parallel with Promise.allSettled
    const results = await Promise.allSettled(
      Array.from(selectedRequests).map(async (requestId) => {
        const res = await api.put(`/api/access-requests/${requestId}`, {
          status: "approved",
          role: backendRole,
        });
        if (!res.ok) throw new Error(res.error?.message ?? "Error");
        return requestId;
      })
    );

    const approvedIds: string[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        successCount++;
        approvedIds.push(result.value);
      } else {
        failCount++;
      }
    }

    // Update state
    setPendingRequests((prev) => prev.filter((r) => !approvedIds.includes(r.id)));
    setSelectedRequests(new Set());
    
    // Refresh members list
    if (successCount > 0) {
      fetchData();
    }

    setBatchProcessing(false);

    // Show result
    if (failCount > 0) {
      alert(`Aprobados: ${successCount}, Fallidos: ${failCount}`);
    }
  };

  // ── Batch reject ──
  const handleBatchReject = async () => {
    if (selectedRequests.size === 0) return;
    
    const confirmMsg = `¿Rechazar ${selectedRequests.size} solicitud${selectedRequests.size > 1 ? "es" : ""}?`;
    if (!confirm(confirmMsg)) return;

    setBatchProcessing(true);

    const results = await Promise.allSettled(
      Array.from(selectedRequests).map(async (requestId) => {
        const res = await api.put(`/api/access-requests/${requestId}`, {
          status: "rejected",
        });
        if (!res.ok) throw new Error(res.error?.message ?? "Error");
        return requestId;
      })
    );

    const rejectedIds: string[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        rejectedIds.push(result.value);
      }
    }

    setPendingRequests((prev) => prev.filter((r) => !rejectedIds.includes(r.id)));
    setSelectedRequests(new Set());
    setBatchProcessing(false);
  };

  // ── Remove member ──
  const handleRemove = async (userId: string, name: string) => {
    if (!confirm(`Remover a ${name} de la campana?`)) return;
    
    const res = await api.delete(`/api/campaigns/${activeCampaignId}/members/${userId}`);
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    }
  };

  // ── Reset password ──
  const handleResetPassword = async (userId: string, name: string) => {
    if (!confirm(`¿Reiniciar la contraseña de ${name}? El usuario debera crear una nueva contraseña la proxima vez que inicie sesion.`)) return;
    
    const res = await api.post(`/api/users/${userId}/require-password-reset`, {});
    if (res.ok) {
      alert(`Contraseña reiniciada para ${name}. El usuario debera crear una nueva contraseña.`);
    } else {
      alert(res.error?.message ?? "Error reiniciando contraseña");
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
          
          {/* Batch Actions Bar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            background: selectedRequests.size > 0 ? "var(--goberna-blue-50)" : "var(--color-surface-secondary)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            marginBottom: 8,
            flexWrap: "wrap",
          }}>
            {/* Select all checkbox */}
            <button
              type="button"
              onClick={toggleSelectAll}
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
                background: selectedRequests.size === pendingRequests.length && pendingRequests.length > 0 
                  ? "var(--goberna-blue-600)" 
                  : selectedRequests.size > 0 
                    ? "var(--goberna-blue-300)" 
                    : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 10,
              }}>
                {selectedRequests.size > 0 && "✓"}
              </span>
              {selectedRequests.size === 0 
                ? "Seleccionar todos" 
                : selectedRequests.size === pendingRequests.length 
                  ? "Deseleccionar todos"
                  : `${selectedRequests.size} seleccionados`}
            </button>

            {selectedRequests.size > 0 && (
              <>
                {/* Batch role selector */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Aprobar como:</span>
                  <RoleSelector 
                    value={batchRole} 
                    onChange={setBatchRole}
                    allowedRoles={allowedRoles}
                  />
                </div>

                {/* Batch approve button */}
                <button
                  type="button"
                  onClick={handleBatchApprove}
                  disabled={batchProcessing}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    background: "var(--color-success)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: batchProcessing ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    opacity: batchProcessing ? 0.6 : 1,
                  }}
                >
                  {batchProcessing ? "Procesando..." : `✓ Aprobar ${selectedRequests.size}`}
                </button>

                {/* Batch reject button */}
                <button
                  type="button"
                  onClick={handleBatchReject}
                  disabled={batchProcessing}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    background: "transparent",
                    color: "var(--color-error)",
                    border: "1px solid var(--color-error)",
                    borderRadius: 8,
                    cursor: batchProcessing ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    opacity: batchProcessing ? 0.6 : 1,
                  }}
                >
                  ✕ Rechazar
                </button>
              </>
            )}
          </div>

          <div style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}>
            {pendingRequests.map((req) => (
              <PendingRequestCardSelectable
                key={req.id}
                request={req}
                selected={selectedRequests.has(req.id)}
                onToggleSelect={() => toggleRequestSelection(req.id)}
                resolving={resolvingRequest === req.id || batchProcessing}
                onResolve={(status, role) => handleResolve(req.id, status, role)}
                allowedRoles={allowedRoles}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Zone Objectives ─────────────────────────────────────── */}
      {canManage && (
        <div style={{ marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => setShowObjectives(!showObjectives)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "14px 18px",
              background: showObjectives ? "var(--goberna-blue-50)" : "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 18 }}>🎯</span>
            Metas por Region (Departamento)
            <span style={{
              marginLeft: "auto",
              fontSize: 12,
              color: "var(--color-text-tertiary)",
              transform: showObjectives ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}>
              ▼
            </span>
          </button>

          {showObjectives && (
            <div style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderTop: "none",
              borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
              padding: 20,
            }}>
              <div style={{ 
                fontSize: 12, 
                color: "var(--color-text-tertiary)", 
                marginBottom: 16,
                lineHeight: 1.5,
              }}>
                Define cuantos formularios debe recopilar cada region. Los brigadistas zonales heredan 
                el objetivo completo de su region. Los agentes de campo dividen el objetivo entre todos 
                los agentes activos en esa region.
              </div>

              {/* Objectives Grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12,
                marginBottom: 20,
              }}>
                {DEPARTAMENTOS.map((region) => {
                  const currentObjective = zoneObjectives.find((o) => o.region === region);
                  const inputValue = objectiveInputs[region] ?? "";
                  const hasValue = inputValue && parseInt(inputValue, 10) > 0;
                  
                  // Count members in this region
                  const membersInRegion = members.filter((m) => m.region === region).length;
                  
                  return (
                    <div 
                      key={region}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        background: hasValue ? "var(--goberna-blue-50)" : "var(--color-surface-secondary)",
                        border: `1px solid ${hasValue ? "var(--goberna-blue-200)" : "var(--color-border)"}`,
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontSize: 12, 
                          fontWeight: 600, 
                          color: "var(--color-text-primary)",
                          marginBottom: 2,
                        }}>
                          {region}
                        </div>
                        {membersInRegion > 0 && (
                          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
                            {membersInRegion} miembro{membersInRegion !== 1 ? "s" : ""}
                          </div>
                        )}
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={inputValue}
                        onChange={(e) => handleObjectiveInputChange(region, e.target.value)}
                        style={{
                          width: 70,
                          padding: "6px 10px",
                          fontSize: 13,
                          fontWeight: 600,
                          textAlign: "center",
                          border: "1px solid var(--color-border)",
                          borderRadius: 6,
                          background: "var(--color-surface)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Summary + Save */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                background: "var(--color-surface-secondary)",
                borderRadius: 8,
                flexWrap: "wrap",
                gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 2 }}>
                    Total de metas configuradas
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--goberna-blue-600)" }}>
                    {Object.values(objectiveInputs).reduce((sum, val) => sum + (parseInt(val, 10) || 0), 0).toLocaleString()}
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", marginLeft: 6 }}>
                      formularios
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveObjectives}
                  disabled={savingObjectives || !objectivesChanged}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    background: objectivesChanged ? "var(--goberna-blue-600)" : "var(--color-border)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: savingObjectives || !objectivesChanged ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    opacity: savingObjectives ? 0.6 : 1,
                  }}
                >
                  {savingObjectives ? "Guardando..." : objectivesChanged ? "💾 Guardar Metas" : "✓ Guardado"}
                </button>
              </div>
            </div>
          )}
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
                  onResetPassword={() => handleResetPassword(member.user_id, member.full_name)}
                  allowedRoles={allowedRoles}
                />
              ))
          )}
        </div>
      )}

      {/* ── Consultor Campaign Assignment Modal ────────────────── */}
      {showConsultorModal && consultorToAssign && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Cerrar modal"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.5)",
              zIndex: 100,
              animation: "goberna-fade-in 0.15s ease-out",
              border: "none",
              cursor: "default",
            }}
            onClick={() => setShowConsultorModal(false)}
          />
          
          {/* Modal */}
          <div style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: 500,
            maxHeight: "80vh",
            background: "var(--color-surface)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            zIndex: 101,
            overflow: "hidden",
            animation: "goberna-fade-in 0.2s ease-out",
            display: "flex",
            flexDirection: "column",
          }}>
            {/* Header */}
            <div style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>
                  📊 Asignar Campanas a Consultor
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                  {consultorToAssign.name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConsultorModal(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: "none",
                  background: "var(--color-surface-secondary)",
                  cursor: "pointer",
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* Campaign List */}
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 24px",
            }}>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 16 }}>
                Selecciona las campanas que este consultor podra gestionar. El consultor tendra acceso 
                completo a los datos y miembros de las campanas seleccionadas.
              </div>

              {allCampaigns.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-tertiary)" }}>
                  Cargando campanas...
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {allCampaigns.map((campaign) => {
                    const isSelected = consultorCampaigns.has(campaign.id);
                    return (
                      <button
                        key={campaign.id}
                        type="button"
                        onClick={() => toggleConsultorCampaign(campaign.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 16px",
                          background: isSelected ? "var(--goberna-blue-50)" : "var(--color-surface-secondary)",
                          border: `2px solid ${isSelected ? "var(--goberna-blue-400)" : "transparent"}`,
                          borderRadius: 10,
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {/* Checkbox */}
                        <div style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          border: `2px solid ${isSelected ? "var(--goberna-blue-600)" : "var(--color-border-strong)"}`,
                          background: isSelected ? "var(--goberna-blue-600)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          {isSelected && "✓"}
                        </div>

                        {/* Campaign Photo */}
                        {campaign.foto_url ? (
                          <img
                            src={campaign.foto_url}
                            alt={campaign.name}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 8,
                              objectFit: "cover",
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            background: "var(--goberna-blue-100)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 18,
                            flexShrink: 0,
                          }}>
                            👔
                          </div>
                        )}

                        {/* Campaign Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ 
                            fontSize: 14, 
                            fontWeight: 700, 
                            color: "var(--color-text-primary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}>
                            {campaign.name}
                          </div>
                          {(campaign.cargo || campaign.partido) && (
                            <div style={{ 
                              fontSize: 11, 
                              color: "var(--color-text-tertiary)",
                              marginTop: 2,
                            }}>
                              {[campaign.cargo, campaign.partido].filter(Boolean).join(" • ")}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: "16px 24px",
              borderTop: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                {consultorCampaigns.size} campana{consultorCampaigns.size !== 1 ? "s" : ""} seleccionada{consultorCampaigns.size !== 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowConsultorModal(false)}
                  style={{
                    padding: "10px 20px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    background: "transparent",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveConsultorCampaigns}
                  disabled={savingConsultorCampaigns || consultorCampaigns.size === 0}
                  style={{
                    padding: "10px 24px",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#fff",
                    background: consultorCampaigns.size === 0 ? "var(--color-border)" : "var(--goberna-blue-600)",
                    border: "none",
                    borderRadius: 8,
                    cursor: savingConsultorCampaigns || consultorCampaigns.size === 0 ? "not-allowed" : "pointer",
                    opacity: savingConsultorCampaigns ? 0.6 : 1,
                  }}
                >
                  {savingConsultorCampaigns ? "Guardando..." : "Guardar Asignaciones"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
