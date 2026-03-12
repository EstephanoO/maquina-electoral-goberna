"use client";

import { useEffect, useRef, useState } from "react";
import type { ClassificationEvent } from "@/lib/services/classification";
import { correctClassification } from "@/lib/services/classification";
import { MONITOR_THEME as G } from "./theme";

const VOTE_CLASS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  duro: { label: "DURO", color: G.green, bg: G.greenSoft },
  blando: { label: "BLANDO", color: G.orange, bg: G.orangeSoft },
  flotante: { label: "FLOTANTE", color: G.purple, bg: G.purpleSoft },
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  respondido: { label: "Respondido", color: G.sky },
  invalido: { label: "Invalido", color: G.red },
};

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  auto: { label: "AUTO", color: G.sky },
  manual: { label: "MANUAL", color: G.brandGold },
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
      <div style={{ width: 50, height: 6, borderRadius: 999, background: G.surfaceSoft, overflow: "hidden" }}>
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
    padding: "8px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700,
    background: G.bg, color: G.text, border: `1px solid ${G.borderStrong}`,
    cursor: "pointer", outline: "none",
  };
  const btnStyle = (bg: string, color: string): React.CSSProperties => ({
    padding: "8px 12px", borderRadius: 10, fontSize: 11, fontWeight: 800,
    background: bg, color, border: bg === "transparent" ? `1px solid ${G.borderStrong}` : "none", cursor: saving ? "not-allowed" : "pointer",
    opacity: saving ? 0.6 : 1,
  });

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "12px", marginTop: 8, flexWrap: "wrap",
      background: G.surfaceSoft, borderRadius: 14,
      border: `1px solid ${G.border}`,
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
      <button type="button" onClick={handleSave} disabled={saving} style={btnStyle(G.brandBlue, G.bg)}>
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
        padding: "16px 18px",
        background: G.surface,
        border: `1px solid ${isCorrected ? G.orange : G.border}`,
        borderRadius: 16,
        boxShadow: "0 10px 28px rgba(22,57,96,0.06)",
        display: "flex", flexDirection: "column", gap: 6,
        transition: "border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease",
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
          color: G.textMid, background: G.surfaceSoft,
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
            color: G.orange, background: G.orangeSoft,
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
               color: G.brandBlue, background: G.bg,
               border: `1px solid ${G.borderStrong}`, cursor: "pointer",
             }}
          >
            Corregir
          </button>
        )}
      </div>

      {/* Message preview */}
      {event.message_text && (
        <div style={{
          fontSize: 11, color: G.textMid, lineHeight: 1.5,
          padding: "10px 12px", borderRadius: 10,
          background: G.surfaceAlt,
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
    padding: "14px 16px", borderBottom: `1px solid ${G.border}`, marginBottom: 14,
    background: G.surfaceAlt, borderRadius: 16,
  };
  const selectStyle: React.CSSProperties = {
    padding: "8px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700,
    background: G.bg, color: G.text, border: `1px solid ${G.borderStrong}`,
    cursor: "pointer", outline: "none",
  };
  const requestingMoreRef = useRef(false);

  useEffect(() => {
    if (!loading) {
      requestingMoreRef.current = false;
    }
  }, [loading]);

  function handleFeedScroll(event: React.UIEvent<HTMLDivElement>) {
    if (!hasMore || loading || requestingMoreRef.current) return;

    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;

    if (remaining > 120) return;

    requestingMoreRef.current = true;
    onLoadMore();
  }

  return (
    <div style={{ background: G.surface, border: `1px solid ${G.borderStrong}`, borderRadius: 24, padding: 16, boxShadow: "none" }}>
      {/* Filters bar */}
      <div style={filterBarStyle}>
        <span style={{ fontSize: 11, fontWeight: 800, color: G.brandBlue, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Filtros:
        </span>
        <select aria-label="Filtrar por origen" value={filters.source} onChange={e => onFilterChange("source", e.target.value)} style={selectStyle}>
          <option value="">Todos los origenes</option>
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </select>
        <select aria-label="Filtrar por categoria" value={filters.category} onChange={e => onFilterChange("category", e.target.value)} style={selectStyle}>
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
        <select aria-label="Filtrar por clase de voto" value={filters.vote_class} onChange={e => onFilterChange("vote_class", e.target.value)} style={selectStyle}>
          <option value="">Todas las clases</option>
          <option value="duro">Duro</option>
          <option value="blando">Blando</option>
          <option value="flotante">Flotante</option>
        </select>
      </div>

      {/* Events list */}
      <div onScroll={handleFeedScroll} style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "64.8vh", overflowY: "auto", paddingRight: 4 }}>
        {events.length === 0 && !loading && (
          <div style={{ padding: 40, textAlign: "center", color: G.textDim, fontSize: 13, background: G.surfaceAlt, borderRadius: 16 }}>
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
        {loading && events.length > 0 ? (
          <div style={{ padding: "10px 0 4px", textAlign: "center", color: G.textDim, fontSize: 12 }}>
            Cargando mas eventos...
          </div>
        ) : null}
      </div>

      {loading && events.length === 0 && (
         <div style={{ padding: 40, textAlign: "center", color: G.textDim, background: G.surfaceAlt, borderRadius: 16 }}>
           Cargando eventos...
         </div>
      )}
    </div>
  );
}
