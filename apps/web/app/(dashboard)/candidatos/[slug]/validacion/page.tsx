"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  listValidations,
  updateValidationStatus,
  claimValidation,
  computeScore,
  classifyVote,
  SCORING_TAGS,
  type ValidationItem,
  type ValidationStatus,
  type ValidationStats,
  getValidationStats,
} from "@/lib/services/validacion";

/* ========== Constants ========== */

const COLUMNS: { key: ValidationStatus; label: string; accent: string; bg: string; iconFn: () => ReactNode }[] = [
  { key: "pendiente",  label: "Pendiente",  accent: "#64748b", bg: "#f8fafc", iconFn: ClockIcon },
  { key: "contactado", label: "Contactado", accent: "#2563eb", bg: "#eff6ff", iconFn: SendIcon },
  { key: "respondido", label: "Respondido", accent: "#16a34a", bg: "#f0fdf4", iconFn: CheckCircleIcon },
  { key: "invalido",   label: "Inválido",   accent: "#dc2626", bg: "#fef2f2", iconFn: BanIcon },
];

const VOTE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  duro:   { label: "VOTO DURO",   color: "#15803d", bg: "#dcfce7" },
  blando: { label: "VOTO BLANDO", color: "#ca8a04", bg: "#fef9c3" },
  tibio:  { label: "TIBIO",       color: "#64748b", bg: "#f1f5f9" },
};

/* ========== Page ========== */

export default function ValidacionPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { campaigns } = useAuth();
  const campaign = campaigns.find((c) => c.slug === slug);
  const campaignId = campaign?.id ?? "";

  const [items, setItems] = useState<ValidationItem[]>([]);
  const [stats, setStats] = useState<ValidationStats>({ pendiente: 0, contactado: 0, respondido: 0, invalido: 0 });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scoringId, setScoringId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!campaignId) return;
    const [itemsRes, statsRes] = await Promise.all([
      listValidations(campaignId),
      getValidationStats(campaignId),
    ]);
    if (itemsRes.ok && itemsRes.data) setItems(itemsRes.data.items);
    if (statsRes.ok && statsRes.data) setStats(statsRes.data.stats);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusChange = useCallback(async (id: string, newStatus: ValidationStatus, tags?: string[]) => {
    setUpdatingId(id);
    const res = await updateValidationStatus(id, campaignId, newStatus, undefined, tags);
    if (res.ok && res.data) {
      const updated = res.data.item;
      setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...updated } : item));
      setStats((prev) => {
        const old = items.find((i) => i.id === id)?.status;
        if (!old || old === newStatus) return prev;
        return { ...prev, [old]: Math.max(0, (prev[old] ?? 0) - 1), [newStatus]: (prev[newStatus] ?? 0) + 1 };
      });
    }
    setUpdatingId(null);
    setScoringId(null);
  }, [campaignId, items]);

  const handleWhatsAppClick = useCallback(async (item: ValidationItem) => {
    if (item.status !== "pendiente") return;
    setUpdatingId(item.id);
    await claimValidation(item.id, campaignId);
    const res = await updateValidationStatus(item.id, campaignId, "contactado");
    if (res.ok) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "contactado" } : i));
      setStats((prev) => ({
        ...prev,
        pendiente: Math.max(0, prev.pendiente - 1),
        contactado: prev.contactado + 1,
      }));
    }
    setUpdatingId(null);
  }, [campaignId]);

  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? items.filter((i) => i.nombre.toLowerCase().includes(q) || i.telefono.includes(q) || i.encuestador.toLowerCase().includes(q))
      : items;
    const groups: Record<ValidationStatus, ValidationItem[]> = { pendiente: [], contactado: [], respondido: [], invalido: [] };
    for (const item of filtered) {
      const status = item.status === ("validado" as string) ? "respondido" : item.status;
      groups[status as ValidationStatus]?.push(item);
    }
    return groups;
  }, [items, search]);

  const totalItems = items.length;
  const processed = stats.contactado + stats.respondido + stats.invalido;

  if (!campaign) return <div className="flex items-center justify-center h-64 text-slate-400">Campaña no encontrada</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] bg-slate-50/50">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">{"Validación de Datos"}</h1>
          <p className="text-xs text-slate-400 mt-0.5">Contacta por WhatsApp, clasifica la respuesta</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus-within:border-slate-400 focus-within:bg-white transition-all w-64">
          <SearchIcon />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, telefono..."
            className="flex-1 border-none outline-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400" />
        </div>
        <div className="text-xs text-slate-500 font-semibold tabular-nums">{totalItems} registros</div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 px-6 py-3 bg-white border-b border-slate-100 shrink-0">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex items-center gap-2">
            <span className="opacity-70">{col.iconFn()}</span>
            <span className="text-xs font-bold" style={{ color: col.accent }}>{stats[col.key] ?? 0}</span>
            <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">{col.label}</span>
          </div>
        ))}
        {totalItems > 0 && (
          <div className="ml-auto text-xs text-slate-400 font-medium">
            {Math.round((processed / totalItems) * 100)}% procesado
          </div>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 gap-3">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-400 font-medium">Cargando datos...</span>
        </div>
      ) : (
        <div className="flex-1 flex gap-4 px-6 py-4 overflow-x-auto min-h-0">
          {COLUMNS.map((col) => (
            <div key={col.key} className="flex flex-col min-w-[280px] w-full rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Column header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: `${col.accent}20`, background: col.bg }}>
                <span style={{ color: col.accent }}>{col.iconFn()}</span>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: col.accent }}>{col.label}</span>
                <span className="ml-auto text-xs font-black rounded-full w-6 h-6 flex items-center justify-center" style={{ background: `${col.accent}15`, color: col.accent }}>
                  {grouped[col.key].length}
                </span>
              </div>
              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                {grouped[col.key].length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-xs text-slate-300">Sin registros</div>
                ) : grouped[col.key].map((item) => (
                  <ValidationCard
                    key={item.id}
                    item={item}
                    column={col.key}
                    isUpdating={updatingId === item.id}
                    isScoring={scoringId === item.id}
                    onStatusChange={handleStatusChange}
                    onWhatsAppClick={handleWhatsAppClick}
                    onOpenScoring={() => setScoringId(item.id)}
                    onCancelScoring={() => setScoringId(null)}
                    columnColor={col.accent}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========== Card Component ========== */

function ValidationCard({
  item, column, isUpdating, isScoring, onStatusChange, onWhatsAppClick, onOpenScoring, onCancelScoring, columnColor,
}: {
  item: ValidationItem;
  column: ValidationStatus;
  isUpdating: boolean;
  isScoring: boolean;
  onStatusChange: (id: string, status: ValidationStatus, tags?: string[]) => void;
  onWhatsAppClick: (item: ValidationItem) => void;
  onOpenScoring: () => void;
  onCancelScoring: () => void;
  columnColor: string;
}) {
  const phone = item.telefono.replace(/\D/g, "");
  const fmtPhone = phone.length === 9 ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : item.telefono;
  const waMessage = encodeURIComponent(`Hola, ${item.nombre || ""}`);
  const waLink = `https://wa.me/51${phone}?text=${waMessage}`;

  const isPendiente = column === "pendiente";
  const isContactado = column === "contactado";
  const isRespondido = column === "respondido";
  const isInvalido = column === "invalido";

  const voteBadge = isRespondido && item.vote_class ? VOTE_BADGES[item.vote_class] : null;

  return (
    <div className={`relative rounded-lg border border-slate-100 p-3 transition-all hover:shadow-sm ${isUpdating ? "opacity-50 pointer-events-none" : ""}`}
      style={{ borderLeftWidth: 3, borderLeftColor: columnColor }}>

      {/* X button to invalidate (Pendiente + Respondido) */}
      {(isPendiente || isRespondido) && (
        <button type="button" onClick={() => onStatusChange(item.id, "invalido")} disabled={isUpdating}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer border-none bg-transparent disabled:opacity-40"
          title="Marcar como inválido">
          <XSmallIcon />
        </button>
      )}

      {/* Name + vote badge */}
      <div className="flex items-center gap-2 pr-6">
        <span className="font-semibold text-sm text-slate-800 truncate leading-tight">{item.nombre || "—"}</span>
        {voteBadge && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 tracking-wide"
            style={{ color: voteBadge.color, background: voteBadge.bg }}>
            {voteBadge.label}
          </span>
        )}
      </div>

      {/* Score badge for respondido */}
      {isRespondido && item.score > 0 && (
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[10px] font-bold text-slate-500">Score:</span>
          <span className="text-[10px] font-black" style={{ color: columnColor }}>{item.score}</span>
        </div>
      )}

      {/* Phone + WhatsApp */}
      <div className="flex items-center gap-2 mt-1.5">
        {isPendiente ? (
          <button type="button"
            onClick={() => { window.open(waLink, "_blank", "noopener,noreferrer"); onWhatsAppClick(item); }}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 text-green-700 text-xs font-bold hover:bg-green-100 transition-colors cursor-pointer border-none disabled:opacity-40"
            title="Contactar por WhatsApp (reclama el lead)">
            <WhatsAppIcon />
            {fmtPhone}
          </button>
        ) : (
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 text-green-700 text-xs font-bold hover:bg-green-100 transition-colors no-underline">
            <WhatsAppIcon />
            {fmtPhone}
          </a>
        )}
      </div>

      {/* Tags display for respondido */}
      {isRespondido && item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {item.tags.map((tagKey) => {
            const tagDef = SCORING_TAGS.find((t) => t.key === tagKey);
            return tagDef ? (
              <span key={tagKey} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                {tagDef.label} +{tagDef.points}
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* Encuestador + date */}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
        <span className="font-medium text-slate-500">{item.encuestador?.split(" ")[0] || "—"}</span>
        <span>{"·"}</span>
        <span>{fmtDateShort(item.created_at)}</span>
      </div>

      {/* ── Actions ── */}

      {/* Contactado: "Respondió" button opens scoring */}
      {isContactado && !isScoring && (
        <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100">
          <button type="button" onClick={onOpenScoring} disabled={isUpdating}
            className="flex-1 text-[11px] font-bold py-1.5 rounded-md border cursor-pointer transition-all hover:shadow-sm disabled:opacity-40"
            style={{ color: "#16a34a", borderColor: "#16a34a30", background: "#16a34a08" }}>
            {"Respondió"}
          </button>
          <button type="button" onClick={() => onStatusChange(item.id, "invalido")} disabled={isUpdating}
            className="flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer transition-all hover:shadow-sm disabled:opacity-40"
            style={{ color: "#dc2626", borderColor: "#dc262630", background: "#dc262608" }}>
            <XSmallIcon />
          </button>
        </div>
      )}

      {/* Scoring panel (inline, when "Respondió" clicked) */}
      {isContactado && isScoring && (
        <ScoringPanel
          onConfirm={(tags) => onStatusChange(item.id, "respondido", tags)}
          onCancel={onCancelScoring}
        />
      )}

      {/* Inválido: Reabrir */}
      {isInvalido && (
        <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100">
          <button type="button" onClick={() => onStatusChange(item.id, "pendiente")} disabled={isUpdating}
            className="flex-1 text-[11px] font-bold py-1.5 rounded-md border cursor-pointer transition-all hover:shadow-sm disabled:opacity-40"
            style={{ color: "#64748b", borderColor: "#64748b30", background: "#64748b08" }}>
            Reabrir
          </button>
        </div>
      )}
    </div>
  );
}

/* ========== Scoring Panel ========== */

function ScoringPanel({ onConfirm, onCancel }: { onConfirm: (tags: string[]) => void; onCancel: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["respondio"]));

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const tags = Array.from(selected);
  const score = computeScore(tags);
  const voteClass = classifyVote(score);
  const badge = VOTE_BADGES[voteClass];

  return (
    <div className="mt-2.5 pt-2.5 border-t border-slate-100">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Clasificar respuesta</div>
      <div className="flex flex-wrap gap-1.5">
        {SCORING_TAGS.map((tag) => {
          const isOn = selected.has(tag.key);
          return (
            <button key={tag.key} type="button" onClick={() => toggle(tag.key)}
              className={`text-[10px] font-semibold px-2 py-1 rounded-full border cursor-pointer transition-all ${
                isOn
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
              }`}>
              {tag.label} <span className="opacity-60">+{tag.points}</span>
            </button>
          );
        })}
      </div>
      {/* Score preview */}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] font-bold text-slate-500">Score: {score}</span>
        {badge && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ color: badge.color, background: badge.bg }}>
            {badge.label}
          </span>
        )}
      </div>
      {/* Confirm / cancel */}
      <div className="flex items-center gap-1.5 mt-2">
        <button type="button" onClick={() => onConfirm(tags)}
          className="flex-1 text-[11px] font-bold py-1.5 rounded-md border-none cursor-pointer transition-all hover:opacity-90 text-white bg-emerald-600">
          Confirmar
        </button>
        <button type="button" onClick={onCancel}
          className="text-[11px] font-bold py-1.5 px-3 rounded-md border border-slate-200 cursor-pointer transition-all hover:bg-slate-50 text-slate-500 bg-white">
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ========== SVG Icons ========== */

function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}

function XSmallIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}

function WhatsAppIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function ClockIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}

function SendIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
}

function CheckCircleIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
}

function BanIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>;
}

/* ========== Helpers ========== */

function fmtDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    const M = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${d.getDate()} ${M[d.getMonth()]}`;
  } catch { return iso; }
}
