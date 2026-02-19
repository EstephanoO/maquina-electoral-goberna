"use client";

import type { DrillLevel, DrillState } from "./types";

// Re-export types for backward compat (barrel and tierra-map import from here historically)
export type { DrillLevel, DrillState };
export { INITIAL_DRILL } from "./types";

/* ========== Component ========== */

type Props = {
  state: DrillState;
  onNavigate: (level: DrillLevel) => void;
  primaryColor: string;
};

export function ZoneBreadcrumb({ state, onNavigate, primaryColor }: Props) {
  if (state.level === 0) return null;

  const crumbs: { label: string; level: DrillLevel }[] = [{ label: "Peru", level: 0 }];

  if (state.depName) crumbs.push({ label: state.depName, level: 1 });
  if (state.provName) crumbs.push({ label: state.provName, level: 2 });
  if (state.distName) crumbs.push({ label: state.distName, level: 3 });
  if (state.sectorName) crumbs.push({ label: state.sectorName, level: 4 });

  return (
    <div style={S.root}>
      {/* Back button */}
      <button
        type="button"
        onClick={() => onNavigate((state.level - 1) as DrillLevel)}
        style={S.backBtn}
        title="Volver al nivel anterior"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      
      <span style={S.divider} />
      
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.level} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span style={S.sep}>&rsaquo;</span>}
            {isLast ? (
              <span style={{ ...S.crumb, color: primaryColor, fontWeight: 700, cursor: "default" }}>{crumb.label}</span>
            ) : (
              <button type="button" onClick={() => onNavigate(crumb.level)} style={{ ...S.crumb, ...S.clickable }}>
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}
      
      {/* Hint */}
      <span style={S.hint}>Click en zona para explorar</span>
    </div>
  );
}

/* ========== Styles ========== */

const S: Record<string, React.CSSProperties> = {
  root: {
    backgroundColor: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(8px)",
    borderRadius: 8,
    padding: "6px 12px",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    border: "1px solid #e2e8f0",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    fontSize: 12,
    fontWeight: 500,
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    borderRadius: 4,
    border: "none",
    background: "#f1f5f9",
    color: "#475569",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: "#e2e8f0",
    marginLeft: 4,
    marginRight: 4,
  },
  crumb: {
    color: "#475569",
    fontWeight: 500,
    fontSize: 12,
    lineHeight: 1,
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
  },
  clickable: {
    cursor: "pointer",
    textDecoration: "none",
  },
  sep: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: 400,
    margin: "0 2px",
  },
  hint: {
    fontSize: 10,
    color: "#94a3b8",
    marginLeft: 12,
    fontWeight: 400,
    fontStyle: "italic",
  },
};
