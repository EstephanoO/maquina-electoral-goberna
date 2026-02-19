"use client";

import type { CmsContact } from "../../../../lib/services/cms";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

type ContactCardProps = {
  contact: CmsContact;
  currentUserId: string;
  onClaim: (id: string) => void;
  onHablado: (id: string) => void;
  onRelease: (id: string) => void;
  onOpenNotes: (contact: CmsContact) => void;
  isHabladoTab: boolean;
  claiming: string | null;
};

function formatPhone(phone: string): string {
  // Ensure Peru format for wa.me
  if (phone.startsWith("+")) return phone;
  if (phone.length === 9) return `+51${phone}`;
  return `+51${phone}`;
}

function buildWhatsAppUrl(phone: string, nombre: string): string {
  const formatted = formatPhone(phone).replace("+", "");
  const text = encodeURIComponent(`Hola ${nombre}`);
  return `https://wa.me/${formatted}?text=${text}`;
}

export function ContactCard({
  contact,
  currentUserId,
  onClaim,
  onHablado,
  onRelease,
  onOpenNotes,
  isHabladoTab,
  claiming,
}: ContactCardProps) {
  const isLocked = contact.is_locked;
  const isClaimedByMe = contact.cms_claimed_by === currentUserId;
  const isClaiming = claiming === contact.id;
  const nombre = contact.nombre || "Sin nombre";
  const telefono = contact.telefono || "";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid var(--color-border)",
        background: isLocked
          ? "#f8f8f8"
          : isClaimedByMe
            ? "var(--goberna-blue-50)"
            : "var(--color-surface)",
        opacity: isLocked ? 0.6 : 1,
        fontFamily: FONT,
        transition: "background .12s ease",
      }}
    >
      {/* Name + Phone */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {nombre}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            fontFamily: "monospace",
          }}
        >
          {telefono}
        </div>
        {isLocked && contact.claimed_by_email && (
          <div
            style={{
              fontSize: 11,
              color: "#d97706",
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            En uso por {contact.claimed_by_email.split("@")[0]}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {isHabladoTab ? (
          /* Hablado tab: notes button */
          <button
            type="button"
            onClick={() => onOpenNotes(contact)}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: FONT,
              color: "var(--goberna-blue-900)",
              background: "var(--goberna-blue-50)",
              border: "1px solid var(--goberna-blue-200, #bfdbfe)",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Datos
          </button>
        ) : isLocked ? (
          /* Locked by another operator */
          <div
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 600,
              color: "#d97706",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: 8,
            }}
          >
            Bloqueado
          </div>
        ) : isClaimedByMe ? (
          /* Claimed by me: show hablado + release */
          <>
            <button
              type="button"
              onClick={() => onHablado(contact.id)}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: FONT,
                color: "#fff",
                background: "#16a34a",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Hablado
            </button>
            <button
              type="button"
              onClick={() => onRelease(contact.id)}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: FONT,
                color: "var(--color-text-tertiary)",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Soltar
            </button>
          </>
        ) : (
          /* Available: WSP button to claim + open WhatsApp */
          <button
            type="button"
            disabled={isClaiming}
            onClick={() => {
              onClaim(contact.id);
              // Open WhatsApp in new tab
              if (telefono) {
                window.open(buildWhatsAppUrl(telefono, nombre), "_blank");
              }
            }}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: FONT,
              color: "#fff",
              background: isClaiming ? "#86efac" : "#25D366",
              border: "none",
              borderRadius: 8,
              cursor: isClaiming ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <title>WhatsApp</title>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            WSP
          </button>
        )}
      </div>
    </div>
  );
}
