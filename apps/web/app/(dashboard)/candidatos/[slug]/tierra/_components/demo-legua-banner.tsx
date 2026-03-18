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
import { LEGUA } from "./demo-legua-data";
import { WhatsAppIcon } from "./demo-legua-icons";
import { TabTerritorio, TabVentajas, TabCierre } from "./demo-legua-tabs";

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


