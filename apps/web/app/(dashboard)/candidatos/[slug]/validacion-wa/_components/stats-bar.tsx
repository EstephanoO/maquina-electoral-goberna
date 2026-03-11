/**
 * GOBERNA — Stats Bar (iOS style)
 * Frosted glass stats strip — compact, tinted pills.
 */

"use client";

import type { ValidationStats } from "@/lib/services/validacion";
import type { ClassificationStats } from "@/lib/services/classification";

const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";

type Props = {
  vStats: ValidationStats | null;
  cStats: ClassificationStats | null;
};

const ITEMS: { key: keyof ValidationStats; label: string; color: string }[] = [
  { key: "pendiente",  label: "Pend",  color: "#ff9500" },
  { key: "contactado", label: "Cont",  color: "#007aff" },
  { key: "respondido", label: "Resp",  color: "#34c759" },
  { key: "invalido",   label: "Imp",   color: "#ff3b30" },
];

export function StatsBar({ vStats, cStats }: Props) {
  if (!vStats) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "6px 14px",
      borderBottom: "0.5px solid rgba(60,60,67,.12)",
      background: "rgba(249,249,249,.94)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      flexWrap: "wrap",
      flexShrink: 0,
      fontFamily: SF,
    }}>
      {ITEMS.map((it) => (
        <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: it.color }} />
          <span style={{ fontSize: 11, color: "#8e8e93", letterSpacing: "-0.1px" }}>{it.label}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#1c1c1e", fontFeatureSettings: '"tnum"' }}>{vStats[it.key] ?? 0}</span>
        </div>
      ))}
      {cStats && (
        <>
          <div style={{ width: 0.5, height: 14, background: "rgba(60,60,67,.12)" }} />
          <span style={{ fontSize: 11, color: "#8e8e93" }}>
            <span style={{ fontWeight: 700, color: "#1c1c1e" }}>{(cStats.accuracy_rate * 100).toFixed(0)}%</span> prec
          </span>
          <span style={{ fontSize: 11, color: "#8e8e93" }}>
            <span style={{ fontWeight: 700, color: "#1c1c1e" }}>{cStats.last_hour}</span>/h
          </span>
        </>
      )}
    </div>
  );
}
