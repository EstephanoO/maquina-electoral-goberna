import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "nunca";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.floor(d / 30)}m`;
  return `${Math.floor(d / 365)}a`;
}

// Mantener para compatibilidad
export const TIER_CONFIG = {
  vip: { label: "VIP", color: "bg-amber-100 text-amber-800 border-amber-300" },
  repeat: { label: "Repeat", color: "bg-blue-50 text-blue-700 border-blue-200" },
  single: { label: "Comprador", color: "bg-green-50 text-green-700 border-green-200" },
  prospect: { label: "Prospect", color: "bg-slate-50 text-slate-600 border-slate-200" },
} as const;

// Tipos de solicitud de residentes
export const REQUEST_TYPE_CONFIG = {
  queja: { label: "🔴 Queja", color: "bg-red-100 text-red-800" },
  propuesta: { label: "💡 Propuesta", color: "bg-blue-100 text-blue-800" },
  mejora: { label: "✨ Mejora", color: "bg-purple-100 text-purple-800" },
  reclamo: { label: "⚠️ Reclamo", color: "bg-orange-100 text-orange-800" },
  consulta: { label: "❓ Consulta", color: "bg-slate-100 text-slate-800" },
} as const;

// Semáforo por prioridad
export const PRIORITY_CONFIG = {
  high: { label: "🔴 Urgente", color: "bg-red-100 text-red-800 border-red-300" },
  medium: { label: "🟡 Normal", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  low: { label: "🟢 Baja", color: "bg-green-100 text-green-800 border-green-300" },
} as const;

// Estados del flujo de gestión
export const STAGE_CONFIG = {
  // Flujo de gestión de propuestas (nuevos)
  recibido: { label: "📥 Recibido", color: "bg-blue-100 text-blue-800", group: "intake" },
  en_revision: { label: "🔄 En Revisión", color: "bg-amber-100 text-amber-800", group: "process" },
  completado: { label: "✅ Completado", color: "bg-green-100 text-green-800", group: "complete" },
  rechazado: { label: "❌ Rechazado", color: "bg-red-100 text-red-800", group: "out" },
  
  // Mantener compatibilidad con datos antiguos
  new: { label: "Nuevo", color: "bg-indigo-100 text-indigo-800", group: "sale" },
  contacted: { label: "Contactado", color: "bg-blue-100 text-blue-800", group: "sale" },
  interested: { label: "Interesado", color: "bg-amber-100 text-amber-800", group: "sale" },
  sold: { label: "Vendido", color: "bg-green-100 text-green-800", group: "sale" },
  delivered: { label: "Entregado", color: "bg-teal-100 text-teal-800", group: "post" },
  follow_up: { label: "Seguimiento", color: "bg-cyan-100 text-cyan-800", group: "post" },
  recontact: { label: "Recontacto", color: "bg-violet-100 text-violet-800", group: "post" },
  resold: { label: "Re-vendido", color: "bg-emerald-100 text-emerald-800", group: "post" },
  lost: { label: "Perdido", color: "bg-red-100 text-red-800", group: "out" },
} as const;
