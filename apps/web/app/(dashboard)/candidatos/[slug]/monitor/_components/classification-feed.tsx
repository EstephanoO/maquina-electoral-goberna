"use client";

import { useState } from "react";
import type { ClassificationEvent } from "@/lib/services/classification";
import { correctClassification } from "@/lib/services/classification";

// ── Palette ────────────────────────────────────────────────────────
const G = {
  gold: "#FFC800",
  goldDim: "#CC9F00",
  goldFaint: "rgba(255,200,0,0.08)",
  goldBorder: "rgba(255,200,0,0.22)",
  surface: "#0c1a28",
  surfaceUp: "#0f2035",
  border: "rgba(255,255,255,0.06)",
  text: "#e9eef3",
  textMid: "#7a95aa",
  textDim: "#334d63",
  green: "#22c55e",
  red: "#ef5350",
  blue: "#3b82f6",
  orange: "#f59e0b",
  purple: "#a855f7",
  cyan: "#06b6d4",
} as const;

const VOTE_CLASS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  duro: { label: "DURO", color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  blando: { label: "BLANDO", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  flotante: { label: "FLOTANTE", color: "#a855f7", bg: "rgba(168,85,247,0.15)" },
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  respondido: { label: "Respondido", color: G.blue },
  invalido: { label: "Invalido", color: G.red },
};

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  auto: { label: "AUTO", color: G.cyan },
  manual: { label: "MANUAL", color: G.gold },
  correction: { label: "CORRECCION", color: G.orange },
};

const CATEGORY_LABELS: Record<string, string> = {
  pide_dinero: "Pide Dinero",
  pide_trabajo: "Pide Trabajo",
  publicidad_pagada: "Publicidad Pagada",
  sector_salud: "Sector Salud",
  pide_merch: "Pide Material",
  coordinador: "Coordinador",
  apoyo_genuino: "Apoyo Genuino",
  apoyo_probable: "Apoyo Probable",
  apoyo_condicional: "Condicional",
  indeciso: "Indeciso",
  sector_salud_indeciso: "Salud Indeciso",
  manual_override: "Manual",
};

// ── Helpers ────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function maskPhone(phone: string | null): string {
  if (!phone) return "---";
  if (phone.length > 6) return phone.slice(0, 3) + "***" + phone.slice(-3);
  return phone;
}

// ── Confidence bar ─────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? G.green : pct >= 70 ? G.orange : G.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 50, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: color, transition: "width 0.3s ease" }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 28 }}>{pct}%</span>
    </div>
  );
}

// ── Correction Inline Editor ───────────────────────────────────────
function CorrectionEditor({
  event,
  campaignId,
  onCorrected,
  onCancel,
}: {
  event: ClassificationEvent;
  campaignId: string;
  onCorrected: (updated: ClassificationEvent) => void;
  onCancel: () => void;
}) {
  const [voteClass, setVoteClass] = useState(event.corrected_vote_class || event.vote_class);
  const [status, setStatus] = useState(event.corrected_status || event.status);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await correctClassification(campaignId, event.id, voteClass, status);
    setSaving(false);
    if (res.ok && res.event) {
      onCorrected(res.event);
    }
  };

  const selectStyle: React.CSSProperties = {
    padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
    background: G.surfaceUp, color: G.text, border: `1px solid ${G.goldBorder}`,
    cursor: "pointer", outline: "none",
  };
  const btnStyle = (bg: string, color: string): React.CSSProperties => ({
    padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 800,
    background: bg, color, border: "none", cursor: saving ? "not-allowed" : "pointer",
    opacity: saving ? 0.6 : 1,
  });

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px", marginTop: 6,
      background: "rgba(255,200,0,0.05)", borderRadius: 8,
      border: `1px solid ${G.goldBorder}`,
    }}>
      <select value={voteClass} onChange={e => setVoteClass(e.target.value)} style={selectStyle}>
        <option value="duro">Duro</option>
        <option value="blando">Blando</option>
        <option value="flotante">Flotante</option>
        <option value="">Sin clase</option>
      </select>
      <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
        <option value="respondido">Respondido</option>
        <option value="invalido">Invalido</option>
      </select>
      <button type="button" onClick={handleSave} disabled={saving} style={btnStyle(G.gold, "#0e2640")}>
        {saving ? "..." : "Guardar"}
      </button>
      <button type="button" onClick={onCancel} style={btnStyle("transparent", G.textMid)}>
        Cancelar
      </button>
    </div>
  );
}

// ── Single Event Row ───────────────────────────────────────────────
function EventRow({
  event,
  campaignId,
  onUpdate,
}: {
  event: ClassificationEvent;
  campaignId: string;
  onUpdate: (updated: ClassificationEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isCorrected = !!event.corrected_vote_class || !!event.corrected_status;
  const effectiveVote = event.corrected_vote_class ?? event.vote_class;
  const effectiveStatus = event.corrected_status ?? event.status;
  const voteBadge = VOTE_CLASS_BADGE[effectiveVote];
  const statusBadge = STATUS_BADGE[effectiveStatus];
  const sourceBadge = SOURCE_BADGE[event.source] || SOURCE_BADGE.auto;

  return (
    <div style={{
      padding: "12px 16px",
      background: isCorrected ? "rgba(255,200,0,0.03)" : G.surface,
      border: `1px solid ${isCorrected ? G.goldBorder : G.border}`,
      borderRadius: 10,
      display: "flex", flexDirection: "column", gap: 6,
      transition: "all 0.2s",
    }}>
      {/* Top row: source + name/phone + time */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Source badge */}
        <span style={{
          padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 900,
          color: sourceBadge.color, background: `${sourceBadge.color}18`,
          letterSpacing: "0.5px",
        }}>
          {sourceBadge.label}
        </span>

        {/* Contact info */}
        <span style={{ fontSize: 13, fontWeight: 700, color: G.text }}>
          {event.nombre || event.contact_name || maskPhone(event.phone)}
        </span>

        {/* Confidence */}
        {event.source === "auto" && <ConfidenceBar value={event.confidence} />}

        <div style={{ flex: 1 }} />

        {/* Time */}
        <span style={{ fontSize: 10, color: G.textDim, fontVariantNumeric: "tabular-nums" }}>
          {timeAgo(event.created_at)}
        </span>
      </div>

      {/* Classification badges */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {/* Category */}
        <span style={{
          padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
          color: G.textMid, background: "rgba(255,255,255,0.05)",
        }}>
          {CATEGORY_LABELS[event.category] || event.category || "---"}
        </span>

        {/* Vote class badge */}
        {voteBadge && (
          <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 900,
            color: voteBadge.color, background: voteBadge.bg,
          }}>
            {voteBadge.label}
          </span>
        )}

        {/* Status badge */}
        {statusBadge && (
          <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            color: statusBadge.color, background: `${statusBadge.color}15`,
          }}>
            {statusBadge.label}
          </span>
        )}

        {/* Corrected indicator */}
        {isCorrected && (
          <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 900,
            color: G.orange, background: "rgba(245,158,11,0.12)",
          }}>
            CORREGIDO por {event.corrected_by_name || "---"}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Correct button */}
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              padding: "3px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700,
              color: G.goldDim, background: "transparent",
              border: `1px solid ${G.goldBorder}`, cursor: "pointer",
            }}
          >
            Corregir
          </button>
        )}
      </div>

      {/* Message preview */}
      {event.message_text && (
        <div style={{
          fontSize: 11, color: G.textMid, lineHeight: 1.4,
          padding: "6px 10px", borderRadius: 6,
          background: "rgba(255,255,255,0.02)",
          maxHeight: 60, overflow: "hidden",
          fontStyle: "italic",
        }}>
          &ldquo;{event.message_text.slice(0, 200)}{event.message_text.length > 200 ? "..." : ""}&rdquo;
        </div>
      )}

      {/* Reason */}
      {event.reason && (
        <div style={{ fontSize: 10, color: G.textDim }}>
          Razon: {event.reason}
        </div>
      )}

      {/* Inline correction editor */}
      {editing && (
        <CorrectionEditor
          event={event}
          campaignId={campaignId}
          onCorrected={(updated) => {
            setEditing(false);
            onUpdate(updated);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ── Main Feed Component ────────────────────────────────────────────
export function ClassificationFeed({
  events,
  campaignId,
  loading,
  hasMore,
  onLoadMore,
  onEventUpdate,
  filters,
  onFilterChange,
}: {
  events: ClassificationEvent[];
  campaignId: string;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onEventUpdate: (updated: ClassificationEvent) => void;
  filters: { source: string; category: string; vote_class: string };
  onFilterChange: (key: string, value: string) => void;
}) {
  const filterBarStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
    padding: "10px 0", borderBottom: `1px solid ${G.border}`, marginBottom: 12,
  };
  const selectStyle: React.CSSProperties = {
    padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
    background: G.surfaceUp, color: G.text, border: `1px solid ${G.border}`,
    cursor: "pointer", outline: "none",
  };

  return (
    <div>
      {/* Filters bar */}
      <div style={filterBarStyle}>
        <span style={{ fontSize: 11, fontWeight: 800, color: G.goldDim, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Filtros:
        </span>
        <select value={filters.source} onChange={e => onFilterChange("source", e.target.value)} style={selectStyle}>
          <option value="">Todos los origenes</option>
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </select>
        <select value={filters.category} onChange={e => onFilterChange("category", e.target.value)} style={selectStyle}>
          <option value="">Todas las categorias</option>
          <option value="pide_dinero">Pide Dinero</option>
          <option value="pide_trabajo">Pide Trabajo</option>
          <option value="publicidad_pagada">Publicidad Pagada</option>
          <option value="sector_salud">Sector Salud</option>
          <option value="pide_merch">Pide Material</option>
          <option value="coordinador">Coordinador</option>
          <option value="apoyo_genuino">Apoyo Genuino</option>
          <option value="apoyo_condicional">Condicional</option>
          <option value="indeciso">Indeciso</option>
        </select>
        <select value={filters.vote_class} onChange={e => onFilterChange("vote_class", e.target.value)} style={selectStyle}>
          <option value="">Todas las clases</option>
          <option value="duro">Duro</option>
          <option value="blando">Blando</option>
          <option value="flotante">Flotante</option>
        </select>
      </div>

      {/* Events list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {events.length === 0 && !loading && (
          <div style={{ padding: 40, textAlign: "center", color: G.textDim, fontSize: 13 }}>
            No hay eventos de clasificacion aun. Los eventos apareceran cuando la extension WA clasifique mensajes.
          </div>
        )}
        {events.map((ev) => (
          <EventRow
            key={ev.id}
            event={ev}
            campaignId={campaignId}
            onUpdate={onEventUpdate}
          />
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            style={{
              padding: "8px 24px", borderRadius: 8,
              fontSize: 12, fontWeight: 800,
              color: loading ? G.textDim : G.gold,
              background: loading ? "transparent" : G.goldFaint,
              border: `1px solid ${G.goldBorder}`,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Cargando..." : "Cargar mas"}
          </button>
        </div>
      )}

      {loading && events.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: G.textDim }}>
          Cargando eventos...
        </div>
      )}
    </div>
  );
}
