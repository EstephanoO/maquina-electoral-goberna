"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  listValidations,
  updateValidationStatus,
  type ValidationItem,
  type ValidationStatus,
  type ValidationStats,
  getValidationStats,
} from "@/lib/services/validacion";

/* ========== Constants ========== */

const COLUMNS: { key: ValidationStatus; label: string; color: string; bg: string; icon: string }[] = [
  { key: "pendiente", label: "Pendiente", color: "#64748b", bg: "#f8fafc", icon: "\u23f3" },
  { key: "contactado", label: "Contactado", color: "#2563eb", bg: "#eff6ff", icon: "\u{1f4e9}" },
  { key: "validado", label: "Validado", color: "#16a34a", bg: "#f0fdf4", icon: "\u2705" },
  { key: "invalido", label: "Inv\u00e1lido", color: "#dc2626", bg: "#fef2f2", icon: "\u274c" },
];

/* ========== Page ========== */

export default function ValidacionPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { campaigns } = useAuth();
  const campaign = campaigns.find((c) => c.slug === slug);
  const campaignId = campaign?.id ?? "";

  const [items, setItems] = useState<ValidationItem[]>([]);
  const [stats, setStats] = useState<ValidationStats>({ pendiente: 0, contactado: 0, validado: 0, invalido: 0 });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Fetch data
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

  // Update status
  const handleStatusChange = useCallback(async (id: string, newStatus: ValidationStatus) => {
    setUpdatingId(id);
    const res = await updateValidationStatus(id, campaignId, newStatus);
    if (res.ok && res.data) {
      setItems((prev) => prev.map((item) => item.id === id ? { ...item, status: newStatus } : item));
      setStats((prev) => {
        const old = items.find((i) => i.id === id)?.status;
        if (!old || old === newStatus) return prev;
        return { ...prev, [old]: Math.max(0, prev[old] - 1), [newStatus]: prev[newStatus] + 1 };
      });
    }
    setUpdatingId(null);
  }, [campaignId, items]);

  // Group items by status
  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? items.filter((i) => i.nombre.toLowerCase().includes(q) || i.telefono.includes(q) || i.encuestador.toLowerCase().includes(q))
      : items;
    const groups: Record<ValidationStatus, ValidationItem[]> = { pendiente: [], contactado: [], validado: [], invalido: [] };
    for (const item of filtered) groups[item.status]?.push(item);
    return groups;
  }, [items, search]);

  if (!campaign) return <div className="flex items-center justify-center h-64 text-slate-400">Campa\u00f1a no encontrada</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] bg-slate-50/50">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Validaci\u00f3n de Datos</h1>
          <p className="text-xs text-slate-400 mt-0.5">Verifica los n\u00fameros de tel\u00e9fono v\u00eda WhatsApp</p>
        </div>
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus-within:border-slate-400 focus-within:bg-white transition-all w-64">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, telefono..."
            className="flex-1 border-none outline-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400" />
        </div>
        {/* Total */}
        <div className="text-xs text-slate-500 font-semibold tabular-nums">{items.length} registros</div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 px-6 py-3 bg-white border-b border-slate-100 shrink-0">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex items-center gap-2">
            <span className="text-sm">{col.icon}</span>
            <span className="text-xs font-bold" style={{ color: col.color }}>{stats[col.key]}</span>
            <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">{col.label}</span>
          </div>
        ))}
        {items.length > 0 && (
          <div className="ml-auto text-xs text-slate-400 font-medium">
            {Math.round(((stats.validado + stats.invalido) / items.length) * 100)}% procesado
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
        /* Pipeline columns */
        <div className="flex-1 flex gap-4 px-6 py-4 overflow-x-auto min-h-0">
          {COLUMNS.map((col) => (
            <div key={col.key} className="flex flex-col min-w-[280px] w-full rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Column header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: `${col.color}20`, background: col.bg }}>
                <span className="text-sm">{col.icon}</span>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: col.color }}>{col.label}</span>
                <span className="ml-auto text-xs font-black rounded-full w-6 h-6 flex items-center justify-center" style={{ background: `${col.color}15`, color: col.color }}>
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
                    isUpdating={updatingId === item.id}
                    onStatusChange={handleStatusChange}
                    columnColor={col.color}
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
  item, isUpdating, onStatusChange, columnColor,
}: {
  item: ValidationItem;
  isUpdating: boolean;
  onStatusChange: (id: string, status: ValidationStatus) => void;
  columnColor: string;
}) {
  const phone = item.telefono.replace(/\D/g, "");
  // Format: 987 654 321
  const fmtPhone = phone.length === 9 ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : item.telefono;
  // WhatsApp link — Peru country code +51
  const waLink = `https://wa.me/51${phone}`;

  const nextStatus: Record<ValidationStatus, { label: string; status: ValidationStatus; color: string }[]> = {
    pendiente: [
      { label: "Contactado", status: "contactado", color: "#2563eb" },
    ],
    contactado: [
      { label: "Validado", status: "validado", color: "#16a34a" },
      { label: "Inv\u00e1lido", status: "invalido", color: "#dc2626" },
    ],
    validado: [],
    invalido: [
      { label: "Reabrir", status: "pendiente", color: "#64748b" },
    ],
  };

  const actions = nextStatus[item.status] ?? [];

  return (
    <div className={`rounded-lg border border-slate-100 p-3 transition-all hover:shadow-sm ${isUpdating ? "opacity-50 pointer-events-none" : ""}`}
      style={{ borderLeftWidth: 3, borderLeftColor: columnColor }}>
      {/* Name */}
      <div className="font-semibold text-sm text-slate-800 truncate leading-tight">{item.nombre || "\u2014"}</div>

      {/* Phone + WhatsApp */}
      <div className="flex items-center gap-2 mt-1.5">
        <a href={waLink} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 text-green-700 text-xs font-bold hover:bg-green-100 transition-colors no-underline"
          title="Abrir WhatsApp">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          {fmtPhone}
        </a>
      </div>

      {/* Encuestador + date */}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
        <span className="font-medium text-slate-500">{item.encuestador?.split(" ")[0] || "\u2014"}</span>
        <span>\u00b7</span>
        <span>{fmtDateShort(item.created_at)}</span>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100">
          {actions.map((a) => (
            <button key={a.status} type="button"
              onClick={() => onStatusChange(item.id, a.status)}
              disabled={isUpdating}
              className="flex-1 text-[11px] font-bold py-1.5 rounded-md border cursor-pointer transition-all hover:shadow-sm disabled:opacity-40"
              style={{ color: a.color, borderColor: `${a.color}30`, background: `${a.color}08` }}>
              {isUpdating ? "\u2022\u2022\u2022" : a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========== Helpers ========== */

function fmtDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    const M = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${d.getDate()} ${M[d.getMonth()]}`;
  } catch { return iso; }
}
