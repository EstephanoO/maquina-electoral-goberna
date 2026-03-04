"use client";

/**
 * CMS Contact Profile — Right slide-in panel showing full contact details,
 * signal classification, editable notes, and action history.
 *
 * Redesigned from the old contact-notes-panel.tsx with Tailwind styling.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import type { CmsContact, CmsOperatorNotes, CmsSignalFlags, CmsVoteTier } from "@/lib/services/cms";

type CmsContactProfileProps = {
  contact: CmsContact;
  onSave: (id: string, notes: CmsOperatorNotes) => void;
  onClose: () => void;
  saving: boolean;
};

const SIGNAL_ITEMS: { key: keyof CmsSignalFlags; label: string; emoji: string; points: number }[] = [
  { key: "responde", label: "Responde mensajes", emoji: "\u2705", points: 20 },
  { key: "hace_pregunta", label: "Hace preguntas", emoji: "\u2753", points: 20 },
  { key: "pide_informacion", label: "Pide informacion", emoji: "\u{1F4CB}", points: 20 },
  { key: "comparte_ubicacion", label: "Comparte ubicacion", emoji: "\u{1F4CD}", points: 20 },
  { key: "deja_en_visto", label: "Deja en visto", emoji: "\u{1F440}", points: -15 },
  { key: "bloquea", label: "Bloquea/ignora", emoji: "\u{1F6AB}", points: -30 },
];

const MAX_SCORE = 80;

const VOTE_TIERS: Record<CmsVoteTier, { label: string; color: string; bg: string }> = {
  contacto_basura: { label: "Contacto basura", color: "text-red-700", bg: "bg-red-50" },
  voto_blando: { label: "Voto blando", color: "text-amber-700", bg: "bg-amber-50" },
  voto_duro: { label: "Voto duro", color: "text-emerald-700", bg: "bg-emerald-50" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  nuevo: { label: "Nuevo", color: "text-sky-600" },
  hablado: { label: "Hablado", color: "text-amber-600" },
  respondieron: { label: "Contesto", color: "text-emerald-600" },
  archivado: { label: "Archivado", color: "text-slate-500" },
};

function normalizeFlags(flags?: CmsSignalFlags): Required<CmsSignalFlags> {
  return {
    responde: flags?.responde ?? false,
    hace_pregunta: flags?.hace_pregunta ?? false,
    pide_informacion: flags?.pide_informacion ?? false,
    comparte_ubicacion: flags?.comparte_ubicacion ?? false,
    deja_en_visto: flags?.deja_en_visto ?? false,
    bloquea: flags?.bloquea ?? false,
  };
}

function computeScore(flags: Required<CmsSignalFlags>): number {
  let score = 0;
  for (const item of SIGNAL_ITEMS) {
    if (flags[item.key]) score += item.points;
  }
  return Math.max(0, Math.min(MAX_SCORE, score));
}

function getVoteTier(score: number): CmsVoteTier {
  const third = MAX_SCORE / 3;
  if (score < third) return "contacto_basura";
  if (score < third * 2) return "voto_blando";
  return "voto_duro";
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  try {
    return new Date(dateStr).toLocaleString("es-PE", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch {
    return dateStr;
  }
}

export function CmsContactProfile({ contact, onSave, onClose, saving }: CmsContactProfileProps) {
  const notes = contact.cms_operator_notes || {};
  const [flags, setFlags] = useState<Required<CmsSignalFlags>>(() => normalizeFlags(notes.signal_flags));
  const [localVotacion, setLocalVotacion] = useState(notes.local_votacion || "");
  const [domicilio, setDomicilio] = useState(notes.domicilio || "");
  const [comentarios, setComentarios] = useState(notes.comentarios || "");

  // Re-sync when contact changes
  useEffect(() => {
    const n = contact.cms_operator_notes || {};
    setFlags(normalizeFlags(n.signal_flags));
    setLocalVotacion(n.local_votacion || "");
    setDomicilio(n.domicilio || "");
    setComentarios(n.comentarios || "");
  }, [contact]);

  const score = useMemo(() => computeScore(flags), [flags]);
  const tier = useMemo(() => getVoteTier(score), [score]);
  const tierInfo = VOTE_TIERS[tier];
  const statusInfo = STATUS_LABELS[contact.cms_status] || STATUS_LABELS.nuevo;
  const isArchived = contact.cms_status === "archivado";
  const progressPct = Math.round((score / MAX_SCORE) * 100);

  const toggleFlag = useCallback((key: keyof CmsSignalFlags) => {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSave = useCallback(() => {
    onSave(contact.id, {
      local_votacion: localVotacion.trim() || undefined,
      domicilio: domicilio.trim() || undefined,
      comentarios: comentarios.trim() || undefined,
      signal_flags: flags,
      signal_score: score,
      vote_tier: tier,
    });
  }, [contact.id, onSave, localVotacion, domicilio, comentarios, flags, score, tier]);

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200/80 w-[380px] shrink-0">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 truncate">{contact.nombre || "Sin nombre"}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[11px] font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
            {contact.telefono && (
              <span className="text-[11px] text-slate-400">{contact.telefono}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <title>Cerrar</title>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Context card */}
        <div className="rounded-xl bg-slate-50 p-3 space-y-2">
          <SectionTitle>Informacion de campo</SectionTitle>
          <InfoRow label="Encuestador" value={contact.encuestador} />
          <InfoRow label="Zona" value={contact.zona} />
          <InfoRow label="Distrito" value={contact.distrito} />
          <InfoRow label="Candidato preferido" value={contact.candidato_preferido} />
          <InfoRow label="Operadora" value={contact.claimed_by_email?.split("@")[0]} />
          <InfoRow label="Registrado" value={formatDateTime(contact.created_at)} />
          {contact.cms_hablado_at && <InfoRow label="Hablado" value={formatDateTime(contact.cms_hablado_at)} />}
          {contact.cms_respondieron_at && <InfoRow label="Contesto" value={formatDateTime(contact.cms_respondieron_at)} />}
        </div>

        {/* Signal classification */}
        <div className="rounded-xl bg-slate-50 p-3 space-y-3">
          <SectionTitle>Clasificacion de contacto</SectionTitle>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">Puntaje: {score}/{MAX_SCORE}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tierInfo.bg} ${tierInfo.color}`}>
                {tierInfo.label}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct < 33 ? "#ef4444" : progressPct < 66 ? "#f59e0b" : "#22c55e",
                }}
              />
            </div>
          </div>

          {/* Signal flags */}
          <div className="space-y-1">
            {SIGNAL_ITEMS.map((item) => (
              <label
                key={item.key}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  flags[item.key] ? "bg-white shadow-sm" : "hover:bg-white/60"
                } ${isArchived ? "pointer-events-none opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={flags[item.key]}
                  onChange={() => toggleFlag(item.key)}
                  disabled={isArchived}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-[var(--goberna-blue-600)] focus:ring-[var(--goberna-blue-500)]"
                />
                <span className="text-[12px] flex-1">{item.emoji} {item.label}</span>
                <span className={`text-[10px] tabular-nums font-medium ${item.points > 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {item.points > 0 ? "+" : ""}{item.points}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Editable notes */}
        <div className="rounded-xl bg-slate-50 p-3 space-y-2.5">
          <SectionTitle>Notas de operadora</SectionTitle>

          <FieldInput
            label="Local de votacion"
            value={localVotacion}
            onChange={setLocalVotacion}
            disabled={isArchived}
            placeholder="Donde vota el contacto"
          />
          <FieldInput
            label="Domicilio"
            value={domicilio}
            onChange={setDomicilio}
            disabled={isArchived}
            placeholder="Direccion del contacto"
          />
          <div>
            <label htmlFor="cms-profile-comentarios" className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Comentarios
            </label>
            <textarea
              id="cms-profile-comentarios"
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              disabled={isArchived}
              placeholder="Observaciones generales..."
              rows={3}
              className="w-full text-[12px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white outline-none focus:border-[var(--goberna-blue-400)] resize-none placeholder:text-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      {!isArchived && (
        <div className="shrink-0 px-4 py-2.5 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-[var(--goberna-blue-700)] hover:bg-[var(--goberna-blue-800)] disabled:opacity-40 transition-colors"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Micro-components ── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{children}</h4>;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[11px] text-slate-400 shrink-0">{label}</span>
      <span className="text-[11px] text-slate-700 font-medium text-right truncate">{value || "\u2014"}</span>
    </div>
  );
}

function FieldInput({ label, value, onChange, disabled, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; disabled: boolean; placeholder: string;
}) {
  const id = `cms-profile-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full text-[12px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white outline-none focus:border-[var(--goberna-blue-400)] placeholder:text-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
      />
    </div>
  );
}
