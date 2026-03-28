"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/services";
import { useTheme } from "@/lib/theme-context";

/* ========== Types ========== */

type Props = {
  primaryColor: string;
  /** Total form submissions all-time */
  totalDatos: number;
  /** Forms in the currently selected period */
  periodDatos: number;
  /** Number of agentes de campo registered */
  agentesCampoCount: number;
  /** Campaign-configured meta de datos */
  metaDatos: number;
  /** Currently selected period key */
  period: "today" | "week" | "month" | "all";
  /** When set, hero card shows this agent's name instead of "Pipeline Global" */
  selectedAgentName?: string;
  /** Per-brigadista goal for the current period (used when agent drill-down active) */
  periodGoalPerBrig?: number;
  /** Total contacts marked as hablado + respondieron (all-time, deduped by phone) */
  contactados?: number;
};

/* ========== Helpers ========== */

function calcDaysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T23:59:59");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)), 0);
}

function fmt(n: number): string {
  return n.toLocaleString("es-PE");
}

/* ========== Component ========== */

export function PipelineFunnel({ primaryColor, totalDatos, periodDatos, agentesCampoCount, metaDatos: campaignMeta, period, selectedAgentName, periodGoalPerBrig: periodGoalOverride, contactados = 0 }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  // ── Editable goal inputs ──
  const [metaDatos, setMetaDatos] = useState(campaignMeta > 0 ? campaignMeta : 200000);
  const [brigadistasGoal, setBrigadistasGoal] = useState(agentesCampoCount > 0 ? agentesCampoCount : 40);
  const [fechaLimite, setFechaLimite] = useState("2026-04-10");
  const [showConfig, setShowConfig] = useState(false);

  // ── Derived calculations ──
  const dias = useMemo(() => calcDaysUntil(fechaLimite), [fechaLimite]);
  const metaDiaria = useMemo(() => dias > 0 ? Math.ceil(metaDatos / dias) : 0, [metaDatos, dias]);
  // ── Period-adaptive goal (agent drill-down uses per-brig goal) ──
  const isAgentMode = !!selectedAgentName;
  const periodGoal = useMemo(() => {
    if (isAgentMode && periodGoalOverride != null) {
      const labels: Record<string, string> = { today: "Meta del dia", week: "Meta semanal", month: "Meta mensual", all: "Meta total" };
      return { label: labels[period] ?? "Meta", target: periodGoalOverride, current: periodDatos };
    }
    if (period === "today") return { label: "Meta de hoy", target: metaDiaria, current: periodDatos };
    if (period === "week") return { label: "Meta semanal", target: metaDiaria * 7, current: periodDatos };
    if (period === "month") return { label: "Meta mensual", target: metaDiaria * 30, current: periodDatos };
    return { label: "Meta total", target: metaDatos, current: totalDatos };
  }, [period, metaDiaria, metaDatos, periodDatos, totalDatos, isAgentMode, periodGoalOverride]);

  const periodPct = periodGoal.target > 0 ? Math.min((periodGoal.current / periodGoal.target) * 100, 100) : 0;
  const periodRemaining = Math.max(periodGoal.target - periodGoal.current, 0);

  // ── Urgency ──
  const urgencyColor = dias <= 7 ? "#ef4444" : dias <= 14 ? "#facc15" : "#10b981";

  return (
    <div className="px-4 py-3">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-400"}`}>
            {isAgentMode ? selectedAgentName : "Pipeline Global"}
          </h3>
          {!isAgentMode && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "border border-[#223347] bg-transparent text-slate-200" : "bg-slate-100 text-slate-600"}`}>
              {brigadistasGoal} brigadistas
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${isDark ? "border border-[#343b47] bg-transparent text-slate-200 hover:bg-transparent" : "border border-slate-200 bg-white text-slate-400 hover:bg-slate-50"}`}
        >
          {showConfig ? "Ocultar" : "Configurar"}
        </button>
      </div>

      {/* ═══ Config (collapsible) ═══ */}
      {showConfig && (
        <div className={`flex gap-3 mb-3 p-2.5 rounded-xl ${isDark ? "bg-[#090D15] border border-[#1d2f43]" : "bg-slate-50 border border-slate-200/80"}`}>
          <ConfigInput label="Meta de Datos" value={metaDatos} onChange={setMetaDatos} step={1000} min={0} />
          <ConfigInput
            label="Brigadistas"
            value={brigadistasGoal}
            onChange={setBrigadistasGoal}
            min={1}
            hint={agentesCampoCount > 0 && brigadistasGoal !== agentesCampoCount ? `Usar actual (${agentesCampoCount})` : undefined}
            onHintClick={agentesCampoCount > 0 && brigadistasGoal !== agentesCampoCount ? () => setBrigadistasGoal(agentesCampoCount) : undefined}
          />
          <div className="flex-1 min-w-0">
            <label htmlFor="pipeline-fecha-limite" className={`text-[9px] font-semibold uppercase tracking-wide mb-1 block ${isDark ? "text-slate-400" : "text-slate-400"}`}>Fecha Limite</label>
            <input
              id="pipeline-fecha-limite"
              type="date"
              value={fechaLimite}
              onChange={(e) => setFechaLimite(e.target.value)}
              className={`w-full px-2.5 py-1.5 text-[13px] font-bold rounded-lg outline-none transition-colors tabular-nums ${isDark ? "text-slate-100 bg-[#090D15] border border-[#343b47] focus:border-blue-400" : "text-slate-700 bg-white border border-slate-200 focus:border-blue-300"}`}
            />
            <span className={`text-[9px] font-semibold mt-0.5 block ${dias <= 7 ? "text-red-500" : "text-slate-400"}`}>{dias} dias</span>
          </div>
        </div>
      )}

      {/* ═══ Hero Card (light) ═══ */}
      <div
        className={`relative overflow-hidden rounded-2xl mb-3 ${isDark ? "border border-[#1d2f43]" : "border border-slate-200/80"}`}
        style={{ background: isDark ? "#090D15" : `linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, ${primaryColor}08 100%)`, boxShadow: isDark ? "none" : "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="relative flex items-center gap-5 px-5 py-4">
          <div className="flex-1 min-w-0">
            <span className={`text-[10px] font-bold uppercase tracking-widest mb-1 block ${isDark ? "text-slate-400" : "text-slate-400"}`}>{periodGoal.label}</span>
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className={`text-[32px] font-black tabular-nums leading-none ${isDark ? "text-slate-50" : "text-slate-900"}`}>{fmt(periodGoal.current)}</span>
              <span className="text-[20px] font-black tabular-nums leading-none" style={{ color: periodPct >= 100 ? "#63d58a" : (isDark ? "#facc15" : primaryColor) }}>{periodPct.toFixed(0)}%</span>
              <span className={`text-[16px] font-bold ${isDark ? "text-slate-400" : "text-slate-300"}`}>/ {fmt(periodGoal.target)}</span>
            </div>
            <div className={`h-2 rounded-full overflow-hidden mb-1.5 ${isDark ? "bg-transparent" : "bg-slate-200/80"}`} style={isDark ? { backgroundColor: "rgba(250, 204, 21, 0.18)" } : undefined}>
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${periodPct}%`,
                  background: periodPct >= 100 ? "linear-gradient(90deg, #facc15, #eab308)" : "linear-gradient(90deg, #facc15, #eab308)",
                }}
              />
            </div>
            {/* ── Contactados bar ── */}
            {totalDatos > 0 && (
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`flex h-1.5 rounded-full overflow-hidden flex-1 ${isDark ? "bg-slate-800" : "bg-slate-200/60"}`}>
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.min((contactados / totalDatos) * 100, 100)}%`, backgroundColor: "#10b981" }}
                  />
                </div>
                <span className={`text-[10px] font-bold tabular-nums shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                  {fmt(contactados)} contactados
                </span>
              </div>
            )}
            <div className="flex items-center gap-4">
              <span className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-400"}`}>
                {periodRemaining > 0 ? <>Faltan <strong className={isDark ? "text-slate-100" : "text-slate-700"}>{fmt(periodRemaining)}</strong></> : <strong className="text-emerald-500">Meta alcanzada</strong>}
                </span>
              <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: urgencyColor }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: urgencyColor }} />
                {dias}d restantes
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ QR Channel Tracker (hidden button + modal) ═══ */}
      <QrScanCounter isDark={isDark} primaryColor={primaryColor} slug="wa-channel" />

    </div>
  );
}

/* ========== Sub-components ========== */

function QrScanCounter({ isDark, primaryColor, slug }: { isDark: boolean; primaryColor: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["qr-tracker", slug],
    queryFn: async () => {
      const res = await api.get<{ tracker: { scan_count: number; created_at: string }; recent_scans: Array<{ scanned_at: string; country: string | null; region: string | null; city: string | null }> }>(`/api/qr-trackers/${slug}/stats`);
      if (!res.ok || !res.data) throw new Error("Failed to fetch QR stats");
      return res.data;
    },
    refetchInterval: open ? 3_000 : 30_000,
    staleTime: open ? 2_000 : 25_000,
  });

  const scanCount = data?.tracker?.scan_count ?? 0;
  const todayScans = useMemo(() => {
    if (!data?.recent_scans) return 0;
    const todayStr = new Date().toISOString().slice(0, 10);
    return data.recent_scans.filter((s) => s.scanned_at.slice(0, 10) === todayStr).length;
  }, [data?.recent_scans]);

  const locationGroups = useMemo(() => {
    if (!data?.recent_scans) return [];
    const counts = new Map<string, number>();
    for (const s of data.recent_scans) {
      const parts = [s.city, s.region, s.country].filter(Boolean);
      if (parts.length === 0) continue;
      const key = parts.join(", ");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count);
  }, [data?.recent_scans]);

  const qrUrl = `https://api.goberna.us/r/${slug}`;

  return (
    <>
      {/* Discrete trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-2 rounded-lg px-3 py-1.5 cursor-pointer transition-colors ${isDark ? "bg-transparent border border-[#1d2f43] hover:bg-[#0a1628] text-slate-500" : "bg-slate-50 border border-slate-100 hover:bg-white text-slate-400"}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 opacity-50">
          <rect x="2" y="2" width="6" height="6" /><rect x="16" y="2" width="6" height="6" /><rect x="2" y="16" width="6" height="6" />
          <rect x="10" y="2" width="4" height="4" /><rect x="10" y="10" width="4" height="4" /><rect x="16" y="10" width="4" height="4" /><rect x="10" y="18" width="4" height="4" /><rect x="18" y="18" width="4" height="4" />
        </svg>
        <span className="text-[10px] font-semibold">QR</span>
        {scanCount > 0 && <span className="text-[11px] font-black tabular-nums">{scanCount.toLocaleString("es-PE")}</span>}
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          role="dialog"
          aria-modal="true"
          aria-label="QR Canal WhatsApp"
        >
          <div className={`relative w-[340px] max-w-[90vw] rounded-2xl shadow-2xl overflow-hidden ${isDark ? "bg-[#0f172a] border border-[#1d2f43]" : "bg-white border border-slate-200"}`}>
            {/* Close */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer border-none z-10 transition-colors ${isDark ? "bg-[#1e293b] text-slate-300 hover:bg-[#334155]" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              aria-label="Cerrar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#25D366" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div>
                <h3 className={`text-sm font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>Canal WhatsApp</h3>
                <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-400"}`}>Escanea para unirte</p>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex justify-center px-5 py-4">
              <div className={`p-3 rounded-2xl ${isDark ? "bg-white" : "bg-slate-50 border border-slate-100"}`}>
                {/* QR rendered via external service */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}&color=000000&bgcolor=FFFFFF&margin=0`}
                  alt="QR Code Canal WhatsApp"
                  width={200}
                  height={200}
                  className="block"
                />
              </div>
            </div>

            {/* Stats */}
            <div className={`flex items-center justify-center gap-6 px-5 py-4 ${isDark ? "border-t border-[#1d2f43]" : "border-t border-slate-100"}`}>
              <div className="flex flex-col items-center">
                <span className={`text-[28px] font-black tabular-nums leading-tight ${isDark ? "text-slate-50" : "text-slate-900"}`}>
                  {scanCount.toLocaleString("es-PE")}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-400"}`}>
                  total escaneos
                </span>
              </div>
              <div className={`w-px h-10 ${isDark ? "bg-[#1d2f43]" : "bg-slate-200"}`} />
              <div className="flex flex-col items-center">
                <span className="text-[28px] font-black tabular-nums leading-tight" style={{ color: primaryColor }}>
                  {todayScans}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-400"}`}>
                  hoy
                </span>
              </div>
            </div>

            {/* Locations */}
            {locationGroups.length > 0 && (
              <div className={`px-5 py-3 ${isDark ? "border-t border-[#1d2f43]" : "border-t border-slate-100"}`}>
                <span className={`text-[9px] font-bold uppercase tracking-widest block mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  Ubicaciones recientes
                </span>
                <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto">
                  {locationGroups.map((g) => (
                    <div key={g.location} className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] truncate ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                        {g.location}
                      </span>
                      <span className={`text-[11px] font-bold tabular-nums shrink-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        {g.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ConfigInput({ label, value, onChange, step, min, hint, onHintClick }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number;
  hint?: string; onHintClick?: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const id = `pipeline-cfg-${label.replace(/\s/g, "-").toLowerCase()}`;
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className={`text-[9px] font-semibold uppercase tracking-wide mb-1 block ${isDark ? "text-slate-400" : "text-slate-400"}`}>{label}</label>
      <input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min ?? 0, parseInt(e.target.value, 10) || 0))}
        step={step}
        min={min}
        className={`w-full px-2.5 py-1.5 text-[13px] font-bold rounded-lg outline-none transition-colors tabular-nums ${isDark ? "text-slate-100 bg-[#090D15] border border-[#343b47] focus:border-blue-400" : "text-slate-700 bg-white border border-slate-200 focus:border-blue-300"}`}
      />
      {hint && (
        <button type="button" onClick={onHintClick} className={`text-[9px] font-semibold mt-0.5 block bg-transparent border-none cursor-pointer p-0 underline ${isDark ? "text-blue-300" : "text-blue-500"}`}>
          {hint}
        </button>
      )}
    </div>
  );
}
