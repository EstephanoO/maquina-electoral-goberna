"use client";

import type { CmsContact } from "../../../../lib/services/cms";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

type ContactTableRowProps = {
  contact: CmsContact;
  currentUserId: string;
  onHablado: (id: string) => void;
  onRespondieron: (id: string) => void;
  onArchive: (id: string) => void;
  onRevert: (id: string) => void;
  onOpenNotes: (contact: CmsContact) => void;
  actionLoading: string | null;
  reverting: string | null;
  isSelected?: boolean;
};

function formatPhone(phone: string): string {
  if (phone.startsWith("+")) return phone;
  if (phone.length === 9) return `+51${phone}`;
  return `+51${phone}`;
}

function buildWhatsAppUrl(phone: string, nombre: string): string {
  const formatted = formatPhone(phone).replace("+", "");
  const text = encodeURIComponent(`Hola ${nombre}`);
  return `https://wa.me/${formatted}?text=${text}`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "--:--";
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "--:--";
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--/--";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
  } catch {
    return "--/--";
  }
}

/** Build origin context string */
function getOrigenInfo(c: CmsContact): { label: string; icon: "field" | "phone" } {
  const zona = c.zona || c.distrito || "";
  if (c.encuestador) {
    const parts = [`Campo: ${c.encuestador}`];
    if (zona) parts.push(zona);
    return { label: parts.join(" · "), icon: "field" };
  }
  if (zona) {
    return { label: `Contacto · ${zona}`, icon: "phone" };
  }
  return { label: "Contacto de celular", icon: "phone" };
}

/** Pick the relevant timestamp for the row */
function getRelevantTimestamp(c: CmsContact): { dateStr: string; label: string } {
  if (c.cms_status === "respondieron" && c.cms_respondieron_at) {
    return { dateStr: c.cms_respondieron_at, label: "Contestó" };
  }
  if (c.cms_status === "hablado" && c.cms_hablado_at) {
    return { dateStr: c.cms_hablado_at, label: "Hablado" };
  }
  return { dateStr: c.created_at, label: "Agregado" };
}

/* Status badge colors */
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  nuevo: { label: "NUEVO", bg: "#dbeafe", color: "#1d4ed8" },
  hablado: { label: "HABLADO", bg: "#d1fae5", color: "#065f46" },
  respondieron: { label: "CONTESTÓ", bg: "#ede9fe", color: "#5b21b6" },
  archivado: { label: "ARCHIVADO", bg: "#f3f4f6", color: "#6b7280" },
};

const CELL: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: FONT,
  verticalAlign: "middle",
  borderBottom: "1px solid var(--color-border)",
};

const BTN_BASE: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 700,
  fontFamily: FONT,
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const TAG: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  padding: "1px 6px",
  fontSize: 9,
  fontWeight: 600,
  borderRadius: 4,
  whiteSpace: "nowrap",
  maxWidth: 120,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

/** Minimal operator attribution label */
function getOperatorLabel(email?: string): string {
  if (!email) return "";
  // Take the part before @ and capitalize first letter
  const name = email.split("@")[0] ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function ContactTableRow({
  contact,
  currentUserId,
  onHablado,
  onRespondieron,
  onArchive,
  onRevert,
  onOpenNotes,
  actionLoading,
  reverting,
  isSelected,
}: ContactTableRowProps) {
  const isActionLoading = actionLoading === contact.id;
  const isReverting = reverting === contact.id;
  const nombre = contact.nombre || "Sin nombre";
  const telefono = contact.telefono || "";
  const status = contact.cms_status;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.nuevo;
  const isMyContact = contact.cms_claimed_by === currentUserId;

  const origen = getOrigenInfo(contact);
  const ts = getRelevantTimestamp(contact);

  // Operator attribution
  const operatorName = getOperatorLabel(contact.claimed_by_email);

  // Operator notes tags
  const notes = contact.cms_operator_notes;
  const noteTags: Array<{ label: string; value: string; color: string; bg: string }> = [];
  if (notes?.local_votacion) noteTags.push({ label: "Local", value: notes.local_votacion, color: "#7c3aed", bg: "#ede9fe" });
  if (notes?.domicilio) noteTags.push({ label: "Dom.", value: notes.domicilio, color: "#0369a1", bg: "#e0f2fe" });
  if (notes?.comentarios) noteTags.push({ label: "Nota", value: notes.comentarios, color: "#92400e", bg: "#fef3c7" });

  return (
    <tr
      style={{
        background: isSelected
          ? "var(--goberna-blue-50)"
          : "var(--color-surface)",
        transition: "background .15s ease",
        borderLeft: isSelected ? "3px solid var(--goberna-blue-600, #2563eb)" : "3px solid transparent",
      }}
    >
      {/* FECHA / HORA + ORIGEN */}
      <td style={{ ...CELL, width: 170, minWidth: 150 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {origen.icon === "field" ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" style={{ flexShrink: 0 }}>
              <title>Campo</title>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" style={{ flexShrink: 0 }}>
              <title>Contacto</title>
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {formatTime(ts.dateStr)} <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 400 }}>{formatDate(ts.dateStr)}</span>
            </div>
            <div
              style={{
                fontSize: 10,
                color: ts.label === "Hablado" ? "#065f46" : ts.label === "Contestó" ? "#5b21b6" : "var(--color-text-tertiary)",
                fontWeight: ts.label !== "Agregado" ? 600 : 400,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 140,
              }}
              title={origen.label}
            >
              {ts.label} · {origen.label}
            </div>
          </div>
        </div>
      </td>

      {/* CIUDADANO + candidato preferido + tags */}
      <td style={{ ...CELL, maxWidth: 240 }}>
        <div style={{ fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {nombre}
        </div>
        {contact.candidato_preferido && (
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 1 }}>
            Prefiere: {contact.candidato_preferido}
          </div>
        )}
        {/* Operator note tags */}
        {noteTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
            {noteTags.map((t) => (
              <span
                key={t.label}
                style={{ ...TAG, color: t.color, background: t.bg }}
                title={`${t.label}: ${t.value}`}
              >
                {t.label}: {t.value}
              </span>
            ))}
          </div>
        )}
      </td>

      {/* TELÉFONO (WhatsApp) */}
      <td style={{ ...CELL, width: 140 }}>
        {telefono ? (
          <a
            href={buildWhatsAppUrl(telefono, nombre)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: "#25D366",
              fontWeight: 600,
              fontFamily: "monospace",
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#25D366">
              <title>WhatsApp</title>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            {telefono}
          </a>
        ) : (
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>---</span>
        )}
      </td>

      {/* ESTADO + OPERADOR */}
      <td style={{ ...CELL, width: 140 }}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 8px",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.04em",
            borderRadius: 4,
            background: cfg.bg,
            color: cfg.color,
          }}
        >
          {cfg.label}
        </span>
        {/* Operator attribution — minimalist tag showing who acted */}
        {operatorName && status !== "nuevo" && (
          <div
            style={{
              fontSize: 10,
              color: "var(--color-text-tertiary)",
              marginTop: 3,
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
            title={contact.claimed_by_email ?? ""}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.6 }}>
              <title>Operador</title>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span style={{ fontWeight: isMyContact ? 700 : 500, color: isMyContact ? "var(--goberna-blue-900)" : "var(--color-text-tertiary)" }}>
              {isMyContact ? "Yo" : operatorName}
            </span>
          </div>
        )}
      </td>

      {/* ACCIONES */}
      <td style={{ ...CELL, width: 260, textAlign: "right" }}>
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "nowrap" }}>
          {status === "nuevo" ? (
            <>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onHablado(contact.id)}
                style={{ ...BTN_BASE, background: isActionLoading ? "#86efac" : "#16a34a", color: "#fff", opacity: isActionLoading ? 0.7 : 1 }}
              >
                {isActionLoading ? "..." : "Hablado"}
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onArchive(contact.id)}
                style={{ ...BTN_BASE, background: "#f3f4f6", color: "#6b7280", opacity: isActionLoading ? 0.7 : 1 }}
              >
                Archivar
              </button>
            </>
          ) : status === "hablado" ? (
            <>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onRespondieron(contact.id)}
                style={{
                  ...BTN_BASE,
                  background: isActionLoading ? "#c4b5fd" : "#ede9fe",
                  color: "#5b21b6",
                  opacity: isActionLoading ? 0.7 : 1,
                }}
              >
                {isActionLoading ? "..." : "Contestó"}
              </button>
              <button
                type="button"
                disabled={isReverting}
                onClick={() => onRevert(contact.id)}
                style={{
                  ...BTN_BASE,
                  background: isReverting ? "#fef3c7" : "#fffbeb",
                  color: "#92400e",
                  border: "1px solid #fde68a",
                  opacity: isReverting ? 0.7 : 1,
                }}
                title="Deshacer: vuelve a Nuevo"
              >
                {isReverting ? "..." : "Deshacer"}
              </button>
              <button
                type="button"
                onClick={() => onOpenNotes(contact)}
                style={{ ...BTN_BASE, background: "var(--goberna-blue-50)", color: "var(--goberna-blue-900)", border: "1px solid var(--goberna-blue-200, #bfdbfe)" }}
              >
                Editar
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onArchive(contact.id)}
                style={{ ...BTN_BASE, background: "#f3f4f6", color: "#6b7280", opacity: isActionLoading ? 0.7 : 1 }}
              >
                Archivar
              </button>
            </>
          ) : status === "respondieron" ? (
            <>
              <button
                type="button"
                disabled={isReverting}
                onClick={() => onRevert(contact.id)}
                style={{
                  ...BTN_BASE,
                  background: isReverting ? "#fef3c7" : "#fffbeb",
                  color: "#92400e",
                  border: "1px solid #fde68a",
                  opacity: isReverting ? 0.7 : 1,
                }}
                title="Deshacer: vuelve a Hablado"
              >
                {isReverting ? "..." : "Deshacer"}
              </button>
              <button
                type="button"
                onClick={() => onOpenNotes(contact)}
                style={{ ...BTN_BASE, background: "var(--goberna-blue-50)", color: "var(--goberna-blue-900)", border: "1px solid var(--goberna-blue-200, #bfdbfe)" }}
              >
                Editar
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onArchive(contact.id)}
                style={{ ...BTN_BASE, background: "#f3f4f6", color: "#6b7280", opacity: isActionLoading ? 0.7 : 1 }}
              >
                Archivar
              </button>
            </>
          ) : status === "archivado" ? (
            <>
              <button
                type="button"
                disabled={isReverting}
                onClick={() => onRevert(contact.id)}
                style={{
                  ...BTN_BASE,
                  background: isReverting ? "#fef3c7" : "#fffbeb",
                  color: "#92400e",
                  border: "1px solid #fde68a",
                  opacity: isReverting ? 0.7 : 1,
                }}
                title="Restaurar a Nuevo"
              >
                {isReverting ? "..." : "Restaurar"}
              </button>
              <button
                type="button"
                onClick={() => onOpenNotes(contact)}
                style={{ ...BTN_BASE, background: "var(--goberna-blue-50)", color: "var(--goberna-blue-900)", border: "1px solid var(--goberna-blue-200, #bfdbfe)" }}
              >
                Ver
              </button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
