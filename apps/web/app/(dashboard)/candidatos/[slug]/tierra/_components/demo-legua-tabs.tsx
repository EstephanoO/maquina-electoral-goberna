/**
 * demo-legua-tabs.tsx — Tab content panels for DemoLeguaBanner.
 *
 * Extracted from demo-legua-banner.tsx to keep the main component focused
 * on layout and navigation. Each tab is a self-contained presentational
 * component receiving only the isDark theme flag.
 */

import { LEGUA } from "./demo-legua-data";
import { MapIcon, UsersIcon, ChartIcon, PhoneIcon } from "./demo-legua-icons";

/* ─── Tab: Territorio ─── */

export function TabTerritorio({ isDark }: { isDark: boolean }) {
  const stats = [
    { label: "Electores habilitados", value: LEGUA.padron.toLocaleString("es-PE"), sub: "Padrón ONPE 2022", color: "#3b82f6", icon: "\u{1f5f3}\ufe0f" },
    { label: "Población total", value: LEGUA.poblacion.toLocaleString("es-PE"), sub: "Proyección INEI 2024", color: "#10b981", icon: "\u{1f465}" },
    { label: "Locales de votación", value: String(LEGUA.localesVotacion), sub: "Centros electorales", color: "#f59e0b", icon: "\u{1f3db}\ufe0f" },
    { label: "Meta de votos", value: `+${LEGUA.metaVotos.toLocaleString("es-PE")}`, sub: "Para ganar con 4 candidatos", color: "#ef4444", icon: "\u{1f3af}" },
  ] as const;

  const zonas = [
    { nombre: "Urb. Carmen de la Legua", tipo: "Zona urbana consolidada", electores: "~8.200", prioridad: "alta" },
    { nombre: "PP.JJ. Pachacútec", tipo: "Pueblo joven", electores: "~4.100", prioridad: "alta" },
    { nombre: "AA.HH. El Ayllu", tipo: "Asentamiento", electores: "~2.800", prioridad: "media" },
    { nombre: "Urb. Los Médanos", tipo: "Zona residencial", electores: "~3.600", prioridad: "media" },
    { nombre: "AA.HH. Angamos", tipo: "Asentamiento", electores: "~2.300", prioridad: "alta" },
    { nombre: "Zona Industrial", tipo: "Baja densidad electoral", electores: "~800", prioridad: "baja" },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-1 px-4 py-3.5 rounded-2xl"
            style={{
              background: isDark ? "rgba(30,41,59,0.6)" : "rgba(241,245,249,0.8)",
              border: isDark ? "1px solid rgba(148,163,184,0.12)" : "1px solid rgba(226,232,240,0.8)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{s.icon}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {s.label}
              </span>
            </div>
            <div className="text-2xl font-black tabular-nums" style={{ color: s.color }}>{s.value}</div>
            <div className={`text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Meta barra */}
      <div
        className="px-4 py-3.5 rounded-2xl"
        style={{
          background: isDark ? "rgba(30,41,59,0.6)" : "rgba(241,245,249,0.8)",
          border: isDark ? "1px solid rgba(148,163,184,0.12)" : "1px solid rgba(226,232,240,0.8)",
        }}
      >
        <div className="flex justify-between items-center mb-2">
          <span className={`text-[11px] font-bold ${isDark ? "text-slate-300" : "text-slate-600"}`}>
            Meta datos de campo — {LEGUA.metaDatos.toLocaleString("es-PE")} contactos
          </span>
          <span className="text-[11px] font-black text-blue-500">
            {((LEGUA.metaDatos / LEGUA.padron) * 100).toFixed(0)}% del padrón
          </span>
        </div>
        <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? "bg-[#090D15]" : "bg-slate-200"}`}>
          <div
            className="h-full rounded-full"
            style={{
              width: "20%",
              background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
            }}
          />
        </div>
        <div className={`mt-2 text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
          Con {LEGUA.brigadistas} brigadistas activos en 45 días ≈ {Math.round(LEGUA.metaDatos / LEGUA.brigadistas / 45)} contactos/brigadista/día
        </div>
      </div>

      {/* Zonas del distrito */}
      <div>
        <div className={`text-[11px] font-bold uppercase tracking-wider mb-2.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Zonas del distrito
        </div>
        <div className="flex flex-col gap-1.5">
          {zonas.map((z) => (
            <div
              key={z.nombre}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
              style={{
                background: isDark ? "rgba(30,41,59,0.5)" : "rgba(248,250,252,0.8)",
                border: isDark ? "1px solid rgba(148,163,184,0.08)" : "1px solid rgba(226,232,240,0.6)",
              }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: z.prioridad === "alta" ? "#ef4444" : z.prioridad === "media" ? "#f59e0b" : "#64748b",
                }}
              />
              <div className="flex-1 min-w-0">
                <div className={`text-[12px] font-semibold truncate ${isDark ? "text-slate-200" : "text-slate-700"}`}>{z.nombre}</div>
                <div className={`text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>{z.tipo}</div>
              </div>
              <div
                className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums"
                style={{
                  background: isDark ? "rgba(148,163,184,0.1)" : "rgba(226,232,240,0.5)",
                  color: isDark ? "#94a3b8" : "#64748b",
                }}
              >
                {z.electores}
              </div>
              <div
                className="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full"
                style={{
                  background: z.prioridad === "alta" ? "rgba(239,68,68,0.15)" : z.prioridad === "media" ? "rgba(245,158,11,0.15)" : "rgba(100,116,139,0.15)",
                  color: z.prioridad === "alta" ? "#ef4444" : z.prioridad === "media" ? "#f59e0b" : "#64748b",
                }}
              >
                {z.prioridad}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Ventajas de plataforma ─── */

const VENTAJAS = [
  { icon: MapIcon, title: "Mapa en tiempo real", desc: "Visualizá cada puerta tocada. Heatmaps, rutas y cobertura por zona.", color: "#3b82f6" },
  { icon: UsersIcon, title: "Coordinación de brigadistas", desc: "Seguí en vivo dónde está cada agente. Ranking automático de rendimiento.", color: "#10b981" },
  { icon: ChartIcon, title: "Pipeline electoral", desc: "Cuántos contactos, cuántos comprometidos, cuántos faltan. Sin planillas.", color: "#f59e0b" },
  { icon: PhoneIcon, title: "CRM + WhatsApp integrado", desc: "Seguimiento de electores clave. Mensajes automáticos desde la plataforma.", color: "#8b5cf6" },
] as const;

export function TabVentajas({ isDark }: { isDark: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <p className={`text-[13px] leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
        Goberna convierte tu equipo de campo en una operación inteligente.
        Cada brigadista con el celular se convierte en un sensor del territorio.
      </p>

      <div className="grid grid-cols-1 gap-3">
        {VENTAJAS.map((v) => {
          const Icon = v.icon;
          return (
            <div
              key={v.title}
              className="flex gap-4 items-start px-4 py-4 rounded-2xl"
              style={{
                background: isDark ? "rgba(30,41,59,0.6)" : "rgba(241,245,249,0.8)",
                border: isDark ? "1px solid rgba(148,163,184,0.12)" : "1px solid rgba(226,232,240,0.8)",
              }}
            >
              <div
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: `${v.color}22`, border: `1px solid ${v.color}44` }}
              >
                <Icon color={v.color} />
              </div>
              <div>
                <div className={`text-[13px] font-bold mb-0.5 ${isDark ? "text-slate-100" : "text-slate-800"}`}>{v.title}</div>
                <div className={`text-[12px] leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>{v.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparativa */}
      <div
        className="px-4 py-4 rounded-2xl"
        style={{
          background: isDark ? "rgba(30,41,59,0.6)" : "rgba(241,245,249,0.8)",
          border: isDark ? "1px solid rgba(148,163,184,0.12)" : "1px solid rgba(226,232,240,0.8)",
        }}
      >
        <div className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Goberna vs. método tradicional
        </div>
        <div className="flex flex-col gap-2">
          {[
            { aspecto: "Registro de contactos", sin: "Planilla Excel manual", con: "App offline, sync automático" },
            { aspecto: "Ubicación de brigadistas", sin: "Teléfono o WhatsApp", con: "Mapa en vivo, historial GPS" },
            { aspecto: "Rendición de cuentas", sin: "Reunión semanal", con: "Dashboard en tiempo real" },
            { aspecto: "Datos de campo", sin: "Semana de delay", con: "Disponible en 30 segundos" },
          ].map((r) => (
            <div key={r.aspecto} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-[11px]">
              <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-600"}`}>{r.aspecto}</span>
              <span className={`px-2 py-0.5 rounded-lg text-center ${isDark ? "bg-[#090D15] text-slate-400" : "bg-slate-200 text-slate-500"}`}>{r.sin}</span>
              <span className="px-2 py-0.5 rounded-lg text-center bg-blue-500/15 text-blue-500 font-bold">{r.con}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Propuesta / Cierre ─── */

export function TabCierre({ isDark }: { isDark: boolean }) {
  const fases = [
    {
      fase: "Fase 1 — Onboarding (Semana 1)",
      items: [
        "Campaña configurada para Carmen de la Legua",
        "App instalada en celulares del equipo",
        "Formulario de contacto personalizado",
        "Capacitación de brigadistas (2 horas)",
      ],
      color: "#3b82f6",
    },
    {
      fase: "Fase 2 — Operación territorial (Semanas 2–6)",
      items: [
        "Brigadistas capturando datos con la app",
        "Coordinación en tiempo real desde el dashboard",
        "Seguimiento de metas por zona y agente",
        "CRM activado para electores clave",
      ],
      color: "#10b981",
    },
    {
      fase: "Fase 3 — Cierre de campaña (Semana 7–8)",
      items: [
        "Análisis de cobertura y zonas débiles",
        "Activación de contactos comprometidos (WhatsApp)",
        "Reporte final para el equipo de campaña",
        "Mapa de calor para GOTV (Get Out The Vote)",
      ],
      color: "#f59e0b",
    },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      {/* Headline */}
      <div
        className="px-5 py-4 rounded-2xl text-center"
        style={{
          background: isDark
            ? "linear-gradient(135deg, rgba(29,78,216,0.25), rgba(139,92,246,0.15))"
            : "linear-gradient(135deg, rgba(219,234,254,0.8), rgba(237,233,254,0.5))",
          border: isDark ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(147,197,253,0.5)",
        }}
      >
        <div className={`text-[22px] font-black mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
          {LEGUA.padron.toLocaleString("es-PE")} electores.
        </div>
        <div className={`text-[13px] font-semibold ${isDark ? "text-blue-300" : "text-blue-700"}`}>
          ¿Cuántos ya sabe dónde viven y qué necesitan?
        </div>
        <div className={`text-[11px] mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Con Goberna, su equipo de campo convierte ese padrón en datos accionables.
        </div>
      </div>

      {/* Plan de trabajo */}
      <div className="flex flex-col gap-3">
        <div className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Plan de trabajo para Carmen de la Legua
        </div>
        {fases.map((f) => (
          <div
            key={f.fase}
            className="px-4 py-3.5 rounded-2xl"
            style={{
              background: isDark ? "rgba(30,41,59,0.6)" : "rgba(241,245,249,0.8)",
              border: isDark ? `1px solid ${f.color}30` : `1px solid ${f.color}25`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: f.color }} />
              <div className="text-[11px] font-bold" style={{ color: f.color }}>{f.fase}</div>
            </div>
            <ul className="flex flex-col gap-1">
              {f.items.map((item) => (
                <li key={item} className={`text-[11px] pl-4 relative ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  <span className="absolute left-0 top-0" style={{ color: f.color }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Urgencia */}
      <div
        className="px-4 py-3.5 rounded-2xl flex items-start gap-3"
        style={{
          background: isDark ? "rgba(239,68,68,0.1)" : "rgba(254,226,226,0.6)",
          border: isDark ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(252,165,165,0.5)",
        }}
      >
        <span className="text-lg shrink-0">⚠️</span>
        <div>
          <div className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-red-300" : "text-red-700"}`}>
            El tiempo es el único recurso no recuperable
          </div>
          <div className={`text-[11px] ${isDark ? "text-red-400/80" : "text-red-600/80"}`}>
            Cada día sin datos es territorio que sus competidores pueden estar cubriendo.
            Carmen de la Legua tiene {LEGUA.padron.toLocaleString("es-PE")} electores.
            ¿Cuántos puede cubrir su equipo sin herramientas? ¿Cuántos con Goberna?
          </div>
        </div>
      </div>
    </div>
  );
}
