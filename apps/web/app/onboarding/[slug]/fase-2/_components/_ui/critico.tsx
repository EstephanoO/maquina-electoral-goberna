"use client";
import { ReactNode } from "react";

type SelloTipo = "critico" | "atencion" | "riesgo" | "ok" | "meta";

export function CriticoSello({ tipo = "critico", label }: { tipo?: SelloTipo; label?: string }) {
  const map: Record<SelloTipo, { bg: string; text: string }> = {
    critico:  { bg: "bg-red-600",     text: label ?? "CRÍTICO" },
    atencion: { bg: "bg-amber-600",   text: label ?? "ATENCIÓN" },
    riesgo:   { bg: "bg-orange-700",  text: label ?? "RIESGO" },
    ok:       { bg: "bg-emerald-600", text: label ?? "OK" },
    meta:     { bg: "bg-blue-700",    text: label ?? "META" },
  };
  const { bg, text } = map[tipo];
  return (
    <span className={`inline-block ${bg} text-white text-[11px] font-black px-3 py-1 rounded tracking-[0.12em] rotate-[-8deg] select-none uppercase whitespace-nowrap`}>
      RIESGO: {text}
    </span>
  );
}

export function SlideLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400/60 mb-2">
      {children}
    </p>
  );
}

export function StatCard({
  label, value, sub, accent = false
}: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "bg-amber-400/10 border-amber-400/30" : "bg-[#0a1e4a] border-white/10"}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold mb-1">{label}</p>
      <p className={`text-2xl font-black ${accent ? "text-amber-400" : "text-white"}`}>{value}</p>
      {sub && <p className="text-[11px] text-white/40 mt-0.5">{sub}</p>}
    </div>
  );
}
