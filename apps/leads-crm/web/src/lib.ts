import type { Lead, Template } from "./types";

// Replace {{var}} placeholders with values from the lead.
export function renderTemplate(body: string, lead: Lead): string {
  const firstName = (lead.name || "").split(" ")[0] || "";
  const vars: Record<string, string> = {
    nombre: firstName,
    nombre_completo: lead.name || "",
    telefono: lead.phone || "",
    curso: lead.course || "",
    nivel: lead.level || "",
    asignado: lead.assigned_to || "",
  };
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

// Build a wa.me URL that opens WhatsApp Web with the chat ready and message pre-filled.
export function waMeUrl(lead: Lead, message: string): string | null {
  if (!lead.phone) return null;
  const digits = lead.phone.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s.replace(" ", "T") + (s.endsWith("Z") || s.includes("+") ? "" : "Z"));
    return d.toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

export function templateVarsAvailable(): { key: string; desc: string }[] {
  return [
    { key: "nombre", desc: "Primer nombre" },
    { key: "nombre_completo", desc: "Nombre completo" },
    { key: "telefono", desc: "Teléfono" },
    { key: "curso", desc: "Curso de interés" },
    { key: "nivel", desc: "Nivel de fidelidad" },
    { key: "asignado", desc: "Vendedora asignada" },
  ];
}

export function previewTemplate(body: string): string {
  const sample: Lead = {
    id: 0, name: "María González", phone: "+51999888777",
    course: "Oratoria", interests: ["Oratoria"],
    level: "2", last_purchase_year: 2024,
    stage: "new", priority: "medium", notes: null, tags: [],
    next_follow_up_at: null, source: "whatsapp",
    assigned_to: "Carolina", captured_by_phone: null,
    country: "Perú", email: null,
    total_usd_spent: 0, n_purchases: 0, first_purchase_at: null, buyer_tier: null,
    created_at: "", updated_at: "",
  };
  return renderTemplate(body, sample);
}

export function templatesContaining(templates: Template[]): Template[] {
  return templates;
}

export function humanizeDays(days: number | null | undefined): string {
  if (days == null) return "nunca";
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  if (days < 30) return `hace ${Math.round(days / 7)} sem`;
  if (days < 365) return `hace ${Math.round(days / 30)} meses`;
  return `hace ${Math.round(days / 365)} años`;
}

export function contactToneFromDays(days: number | null | undefined): "ok" | "neutral" | "warn" {
  if (days == null) return "warn";
  if (days >= 14) return "warn";
  if (days >= 7) return "neutral";
  return "ok";
}
