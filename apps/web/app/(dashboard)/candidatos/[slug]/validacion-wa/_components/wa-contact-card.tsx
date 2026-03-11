/**
 * GOBERNA — WA Contact Card (iOS style)
 * Individual contact in the validation queue — compact, rounded, blur aesthetic.
 */

"use client";

import type { ValidationItem } from "@/lib/services/validacion";

// ── Status pills ─────────────────────────────────────────────────────

const STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  pendiente:  { bg: "rgba(255,149,0,.12)", fg: "#ff9500", label: "Pendiente" },
  contactado: { bg: "rgba(0,122,255,.12)", fg: "#007aff", label: "Contactado" },
  respondido: { bg: "rgba(52,199,89,.12)", fg: "#34c759", label: "Respondido" },
  invalido:   { bg: "rgba(255,59,48,.12)", fg: "#ff3b30", label: "Imposible" },
};

const VOTE: Record<string, { bg: string; fg: string }> = {
  duro:     { bg: "#34c759", fg: "#fff" },
  blando:   { bg: "#007aff", fg: "#fff" },
  flotante: { bg: "#af52de", fg: "#fff" },
  tibio:    { bg: "#ff9500", fg: "#fff" },
};

type Props = {
  item: ValidationItem;
  isActive: boolean;
  onSelect: (item: ValidationItem) => void;
  onClaim: (item: ValidationItem) => void;
  userId: string | null;
};

export function WaContactCard({ item, isActive, onSelect, onClaim, userId }: Props) {
  const sc = STATUS[item.status] ?? STATUS.pendiente;
  const vc = item.vote_class ? VOTE[item.vote_class] : null;
  const isMine = item.claimed_by === userId;
  const isTaken = !!item.claimed_by && !isMine;
  const phone = item.telefono.replace(/\D/g, "");

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        margin: "0 0 1px",
        padding: "10px 14px",
        background: isActive ? "rgba(0,122,255,.06)" : "transparent",
        border: "none",
        borderBottom: "0.5px solid rgba(60,60,67,.12)",
        cursor: "pointer",
        opacity: isTaken ? 0.45 : 1,
        transition: "background .12s ease",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
      }}
    >
      {/* Row 1: Name + status pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1c1c1e", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.2px" }}>
          {item.nombre || "Sin nombre"}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: sc.bg, color: sc.fg, textTransform: "uppercase", letterSpacing: "0.3px", flexShrink: 0 }}>
          {sc.label}
        </span>
      </div>

      {/* Row 2: Phone + vote */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: "#8e8e93", fontFeatureSettings: '"tnum"', letterSpacing: "0.2px" }}>
          {item.telefono}
        </span>
        {vc && (
          <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: vc.bg, color: vc.fg, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            {item.vote_class}
          </span>
        )}
      </div>

      {/* Row 3: Brigadista */}
      <div style={{ fontSize: 11, color: "#aeaeb2", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.encuestador}{item.zona ? ` · ${item.zona}` : ""}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <a
          href={`https://wa.me/51${phone}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 20,
            background: "#25D366", color: "#fff",
            fontSize: 11, fontWeight: 600, textDecoration: "none",
            letterSpacing: "-0.1px",
          }}
        >
          <WaIcon /> Abrir
        </a>
        {!isMine && !isTaken && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClaim(item); }}
            style={{
              padding: "4px 10px", borderRadius: 20,
              background: "rgba(0,122,255,.1)", color: "#007aff",
              fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
            }}
          >
            Tomar
          </button>
        )}
        {isMine && <span style={{ fontSize: 10, color: "#007aff", fontWeight: 600 }}>Mio</span>}
        {isTaken && <span style={{ fontSize: 10, color: "#aeaeb2" }}>{item.claimed_by_name ?? "Tomado"}</span>}
      </div>
    </button>
  );
}

function WaIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
