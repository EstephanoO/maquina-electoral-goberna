"use client";

import type { CmsContact, CmsTwilioMessage } from "@/lib/services/cms";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

type Props = {
  contact: CmsContact;
  selected: boolean;
  lastMessage?: CmsTwilioMessage;
  onSelect: (contactId: string) => void;
  onOpenProfile: (contact: CmsContact) => void;
};

type StatusBadge = {
  label: string;
  color: string;
  background: string;
};

const STATUS_BADGE: Record<CmsContact["cms_status"], StatusBadge> = {
  nuevo: {
    label: "Nuevo",
    color: "#0f766e",
    background: "#ccfbf1",
  },
  hablado: {
    label: "Hablado",
    color: "#1d4ed8",
    background: "#dbeafe",
  },
  respondieron: {
    label: "Contesto",
    color: "#6d28d9",
    background: "#ede9fe",
  },
  archivado: {
    label: "Archivado",
    color: "#475569",
    background: "#e2e8f0",
  },
};

function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return "SN";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function getRelevantTimestamp(contact: CmsContact, lastMessage?: CmsTwilioMessage): string {
  if (lastMessage?.created_at) return lastMessage.created_at;
  if (contact.cms_respondieron_at) return contact.cms_respondieron_at;
  if (contact.cms_hablado_at) return contact.cms_hablado_at;
  return contact.created_at;
}

function formatTimestamp(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const sameDate =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (sameDate) {
      return date.toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    return date.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

function buildPreview(contact: CmsContact, lastMessage?: CmsTwilioMessage): string {
  if (lastMessage?.body?.trim()) {
    const prefix = lastMessage.direction === "outbound" ? "Tu: " : "";
    return `${prefix}${lastMessage.body.trim()}`;
  }

  const comment = contact.cms_operator_notes?.comentarios?.trim();
  if (comment) return comment;

  if (contact.candidato_preferido) {
    return `Prefiere: ${contact.candidato_preferido}`;
  }

  if (contact.zona || contact.distrito) {
    return `Zona: ${contact.zona || contact.distrito}`;
  }

  if (contact.encuestador) {
    return `Captado por ${contact.encuestador}`;
  }

  return "Sin notas registradas";
}

export function ChatContactListItem({
  contact,
  selected,
  lastMessage,
  onSelect,
  onOpenProfile,
}: Props) {
  const displayName = contact.nombre?.trim() || "Sin nombre";
  const preview = buildPreview(contact, lastMessage);
  const badge = STATUS_BADGE[contact.cms_status] ?? STATUS_BADGE.nuevo;
  const timestamp = formatTimestamp(getRelevantTimestamp(contact, lastMessage));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderBottom: "1px solid #eef2f7",
        background: selected ? "#edf3ff" : "#ffffff",
        transition: "background 160ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => onOpenProfile(contact)}
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "1px solid #d7e0ec",
          background: "#e9eef5",
          color: "#334155",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: FONT,
          cursor: "pointer",
          flexShrink: 0,
        }}
        title="Ver o editar contacto"
        aria-label={`Ver o editar ${displayName}`}
      >
        {getInitials(displayName)}
      </button>

      <button
        type="button"
        onClick={() => onSelect(contact.id)}
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          padding: 0,
          margin: 0,
          textAlign: "left",
          background: "transparent",
          cursor: "pointer",
          fontFamily: FONT,
          color: "inherit",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "#0f172a",
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#64748b",
              flexShrink: 0,
            }}
          >
            {timestamp}
          </span>
        </div>

        <div
          style={{
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: "#475569",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={preview}
          >
            {preview}
          </span>

          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.02em",
              padding: "2px 8px",
              borderRadius: 999,
              color: badge.color,
              background: badge.background,
              flexShrink: 0,
            }}
          >
            {badge.label}
          </span>
        </div>
      </button>
    </div>
  );
}
