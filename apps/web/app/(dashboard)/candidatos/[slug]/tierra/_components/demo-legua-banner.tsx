"use client";

/**
 * DemoLeguaBanner — Overlay de presentación para la demo de Edwards Infante
 * Candidato a Alcalde de Carmen de la Legua Reynoso (Callao)
 *
 * Este componente se monta sobre el TierraMap cuando el slug corresponde a
 * una campaña con foco en Carmen de la Legua. Muestra:
 *  - Contexto del distrito (padrón, población, competidores, etc.)
 *  - KPIs de territorio alcanzable
 *  - Panel de ventajas competitivas de Goberna
 *  - CTA de conversión para cerrar la venta
 *
 * IMPORTANTE: Este componente es puramente presentacional. No hace fetch.
 * Los datos del distrito son públicos (ONPE / INEI 2024).
 */

import { useState, useEffect } from "react";
import type { MapTheme } from "./types";

/* ─── Datos reales del distrito (ONPE / INEI 2024) ─── */

const LEGUA = {
  distrito: "Carmen de la Legua Reynoso",
  provincia: "Callao",
  ubigeo: "070103",
  padron: 39_412,          // Electores hábiles ONPE 2022
  poblacion: 43_500,       // Proyección INEI 2024
  localesVotacion: 18,     // Centros de votación aprox.
  aaMm: 12,                // AA.HH. y asentamientos
  zonasUrb: 8,             // Zonas urbanas diferenciadas
  metaDatos: 8_000,        // Meta datos tierra (20% padrón — objetivo realista)
  metaVotos: 14_000,       // Meta votos (36% para ganar con 4 candidatos)
  competidores: 4,         // Candidatos en carrera típica
  brigadistas: 24,         // Equipo de campo objetivo
} as const;

/* ─── Ventajas de Goberna para presentar ─── */

const VENTAJAS = [
  {
    icon: MapIcon,
    title: "Mapa en tiempo real",
    desc: "Visualizá cada puerta tocada. Heatmaps, rutas y cobertura por zona.",
    color: "#3b82f6",
  },
  {
    icon: UsersIcon,
    title: "Coordinación de brigadistas",
    desc: "Seguí en vivo dónde está cada agente. Ranking automático de rendimiento.",
    color: "#10b981",
  },
  {
    icon: ChartIcon,
    title: "Pipeline electoral",
    desc: "Cuántos contactos, cuántos comprometidos, cuántos faltan. Sin planillas.",
    color: "#f59e0b",
  },
  {
    icon: PhoneIcon,
    title: "CRM + WhatsApp integrado",
    desc: "Seguimiento de electores clave. Mensajes automáticos desde la plataforma.",
    color: "#8b5cf6",
  },
] as const;

/* ─── Tipos ─── */

type Props = {
  mapTheme: MapTheme;
  onDismiss: () => void;
};

/* ─── Componente principal ─── */

export function DemoLeguaBanner({ mapTheme, onDismiss }: Props) {
  const [tab, setTab] = useState<"territorio" | "ventajas" | "cierre">("territorio");
  const [visible, setVisible] = useState(false);

  // Entrada suave
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  const isDark = mapTheme === "dark";

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
      aria-label="Panel de presentación demo"
    >
      {/* Backdrop semitransparente */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          background: isDark
            ? "rgba(2, 6, 23, 0.62)"
            : "rgba(15, 23, 42, 0.38)",
          opacity: visible ? 1 : 0,
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
        onClick={handleDismiss}
      />

      {/* Panel central */}
      <div
        className="relative pointer-events-auto flex flex-col rounded-3xl overflow-hidden shadow-2xl"
        style={{
          width: 680,
          maxWidth: "calc(100vw - 48px)",
          maxHeight: "calc(100vh - 96px)",
          background: isDark ? "#090D15" : "#ffffff",
          border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(226,232,240,0.8)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
          transform: visible ? "translateY(0) scale(1)" : "translateY(24px) scale(0.97)",
          opacity: visible ? 1 : 0,
          transition: "transform 0.32s cubic-bezier(0.34,1.56,0.64,1), opacity 0.28s ease-out",
        }}
      >
        {/* ── Header del candidato ── */}
        <div
          className="px-7 pt-6 pb-5 relative overflow-hidden"
          style={{
            background: isDark
              ? "linear-gradient(135deg, #090D15 0%, #1e293b 100%)"
              : "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
            borderBottom: isDark ? "1px solid rgba(148,163,184,0.12)" : "1px solid rgba(147,197,253,0.4)",
          }}
        >
          {/* Sello de demo */}
          <div
            className="absolute top-5 right-5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase"
            style={{
              background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
              color: "#ffffff",
              letterSpacing: "0.12em",
            }}
          >
            Demo exclusiva
          </div>

          {/* Avatar candidato */}
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg shrink-0"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
            >
              EI
            </div>
            <div>
              <div className={`text-lg font-black leading-tight ${isDark ? "text-slate-50" : "text-slate-900"}`}>
                Edwards Infante
              </div>
              <div className={`text-sm font-semibold mt-0.5 ${isDark ? "text-blue-400" : "text-blue-700"}`}>
                Candidato a Alcalde · Carmen de la Legua Reynoso
              </div>
              <div className={`text-[11px] mt-1 flex items-center gap-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Provincia Constitucional del Callao
                </span>
                <span>·</span>
                <span>Ubigeo {LEGUA.ubigeo}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs de contenido ── */}
        <div
          className="flex shrink-0 px-1 pt-1"
          style={{
            background: isDark ? "#090D15" : "#f8fafc",
            borderBottom: isDark ? "1px solid rgba(148,163,184,0.1)" : "1px solid rgba(226,232,240,0.8)",
          }}
        >
          {(["territorio", "ventajas", "cierre"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="relative px-5 py-3 text-[12px] font-bold tracking-wide cursor-pointer transition-colors border-none"
              style={{
                background: "transparent",
                color: tab === t
                  ? (isDark ? "#60a5fa" : "#1d4ed8")
                  : (isDark ? "#64748b" : "#94a3b8"),
              }}
            >
              {t === "territorio" && "📍 Territorio"}
              {t === "ventajas" && "🚀 Plataforma"}
              {t === "cierre" && "✅ Propuesta"}
              {tab === t && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                  style={{ background: isDark ? "#3b82f6" : "#1d4ed8" }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ── Contenido dinámico ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "territorio" && <TabTerritorio isDark={isDark} />}
          {tab === "ventajas" && <TabVentajas isDark={isDark} />}
          {tab === "cierre" && <TabCierre isDark={isDark} />}
        </div>

        {/* ── Footer CTA ── */}
        <div
          className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{
            background: isDark ? "rgba(15,23,42,0.8)" : "rgba(248,250,252,0.9)",
            borderTop: isDark ? "1px solid rgba(148,163,184,0.1)" : "1px solid rgba(226,232,240,0.8)",
          }}
        >
          <div className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            El mapa detrás de este panel ya está corriendo en vivo
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold cursor-pointer transition-all"
              style={{
                background: isDark ? "rgba(148,163,184,0.12)" : "rgba(226,232,240,0.6)",
                color: isDark ? "#94a3b8" : "#64748b",
                border: "none",
              }}
            >
              Ver el mapa
            </button>
            <a
              href="https://wa.me/51999999999?text=Hola%2C%20quiero%20conocer%20Goberna%20para%20la%20campa%C3%B1a%20de%20Carmen%20de%20la%20Legua"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2 rounded-xl text-[12px] font-bold cursor-pointer transition-all flex items-center gap-2"
              style={{
                background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                color: "#ffffff",
                textDecoration: "none",
                boxShadow: "0 4px 12px rgba(37,99,235,0.4)",
              }}
            >
              <WhatsAppIcon />
              Solicitar acceso completo
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Territorio ─── */

function TabTerritorio({ isDark }: { isDark: boolean }) {
  const stats = [
    { label: "Electores habilitados", value: LEGUA.padron.toLocaleString("es-PE"), sub: "Padrón ONPE 2022", color: "#3b82f6", icon: "🗳️" },
    { label: "Población total", value: LEGUA.poblacion.toLocaleString("es-PE"), sub: "Proyección INEI 2024", color: "#10b981", icon: "👥" },
    { label: "Locales de votación", value: String(LEGUA.localesVotacion), sub: "Centros electorales", color: "#f59e0b", icon: "🏛️" },
    { label: "Meta de votos", value: `+${LEGUA.metaVotos.toLocaleString("es-PE")}`, sub: "Para ganar con 4 candidatos", color: "#ef4444", icon: "🎯" },
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

function TabVentajas({ isDark }: { isDark: boolean }) {
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

function TabCierre({ isDark }: { isDark: boolean }) {
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

/* ─── Iconos inline (sin dependencias) ─── */

function MapIcon({ color = "#3b82f6" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function UsersIcon({ color = "#10b981" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ChartIcon({ color = "#f59e0b" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function PhoneIcon({ color = "#8b5cf6" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.6a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.55a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}
