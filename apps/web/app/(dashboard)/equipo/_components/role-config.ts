/**
 * GOBERNA — Role Configuration
 * Centralized role hierarchy, types, and display config for the equipo module.
 */

import type { ReactNode } from "react";

// ── Types ───────────────────────────────────────────────────────────

export type Member = {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  region: string | null;
  role: string;
  user_status: string;
};

export type PendingRequest = {
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

export type ZoneObjective = {
  id: string;
  campaign_id: string;
  region: string;
  target_forms: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type Campaign = {
  id: string;
  name: string;
  slug: string;
  cargo?: string;
  partido?: string;
  foto_url?: string;
};

export type ConsultorCampaignAssignment = {
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  assigned_at: string;
};

// ── Role Config ─────────────────────────────────────────────────────

export type RoleConfig = {
  key: string;
  label: string;
  shortLabel: string;
  level: number;
  icon: (props: { size?: number; color?: string }) => ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  canManage: string[];
  capacity?: string;
};

// Icon imports are injected at usage site to avoid circular deps.
// The ROLES record is built with a factory function.

import {
  IconCrown,
  IconBarChart,
  IconBriefcase,
  IconAward,
  IconCompass,
  IconMonitor,
} from "../../../../lib/ui";

export const ROLES: Record<string, RoleConfig> = {
  admin: {
    key: "admin",
    label: "Estratega / Admin",
    shortLabel: "Admin",
    level: 100,
    icon: IconCrown,
    color: "#1e3a5f",
    bgColor: "linear-gradient(135deg, #ffd700, #ffb700)",
    borderColor: "#d4a500",
    description: "Control total del sistema y múltiples campañas",
    canManage: ["consultor", "candidato", "brigadista_zonal", "agente_campo", "agente_digital"],
  },
  consultor: {
    key: "consultor",
    label: "Consultor Estratégico",
    shortLabel: "Consultor",
    level: 75,
    icon: IconBarChart,
    color: "#4f46e5",
    bgColor: "linear-gradient(135deg, #818cf8, #6366f1)",
    borderColor: "#6366f1",
    description: "Asesora múltiples campañas asignadas",
    canManage: ["candidato", "brigadista_zonal", "agente_campo", "agente_digital"],
  },
  candidato: {
    key: "candidato",
    label: "Candidato",
    shortLabel: "Candidato",
    level: 80,
    icon: IconBriefcase,
    color: "#1e40af",
    bgColor: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
    borderColor: "#1d4ed8",
    description: "Control total de su campaña electoral",
    canManage: ["brigadista_zonal", "agente_campo", "agente_digital"],
  },
  brigadista_zonal: {
    key: "brigadista_zonal",
    label: "Brigadista / Director de Campo",
    shortLabel: "Brigadista",
    level: 40,
    icon: IconAward,
    color: "#047857",
    bgColor: "linear-gradient(135deg, #10b981, #059669)",
    borderColor: "#059669",
    description: "Coordina y lidera agentes en su zona",
    canManage: ["agente_campo", "agente_digital"],
    capacity: "5-10 Agentes",
  },
  agente_campo: {
    key: "agente_campo",
    label: "Agente de Campo",
    shortLabel: "Campo",
    level: 20,
    icon: IconCompass,
    color: "#c2410c",
    bgColor: "linear-gradient(135deg, #fb923c, #ea580c)",
    borderColor: "#ea580c",
    description: "Operador territorial — acceso a la app móvil",
    canManage: [],
  },
  agente_digital: {
    key: "agente_digital",
    label: "Agente Digital",
    shortLabel: "Digital",
    level: 20,
    icon: IconMonitor,
    color: "#7c3aed",
    bgColor: "linear-gradient(135deg, #a78bfa, #7c3aed)",
    borderColor: "#7c3aed",
    description: "Operador digital — acceso a la app y al CMS",
    canManage: [],
  },
};

// ── Role Helpers ────────────────────────────────────────────────────

export function getRoleConfig(role: string): RoleConfig {
  return ROLES[role] ?? ROLES.agente_campo;
}

// ── Peruvian Departments ────────────────────────────────────────────

export const DEPARTAMENTOS = [
  "Amazonas", "Áncash", "Apurímac", "Arequipa", "Ayacucho",
  "Cajamarca", "Callao", "Cusco", "Huancavelica", "Huánuco",
  "Ica", "Junín", "La Libertad", "Lambayeque", "Lima",
  "Loreto", "Madre de Dios", "Moquegua", "Pasco", "Piura",
  "Puno", "San Martín", "Tacna", "Tumbes", "Ucayali",
];

// ── Helpers ─────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function openWhatsApp(phone: string) {
  const clean = phone.replace(/\D/g, "");
  const full = clean.startsWith("51") ? clean : `51${clean}`;
  window.open(`https://wa.me/${full}`, "_blank");
}

/** Leadership roles — no se agrupan por región */
export const LEADERSHIP_ROLES = new Set(["admin", "consultor", "candidato"]);
