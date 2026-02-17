"use client";

/* ========== Types ========== */

export type DrillLevel = 0 | 1 | 2 | 3 | 4;

export type DrillState = {
  level: DrillLevel;
  /** Selected departamento code (CODDEP, 2 chars) */
  depCode: string | null;
  depName: string | null;
  /** Selected provincia code (CODDEP+CODPROV, 4 chars) */
  provCode: string | null;
  provName: string | null;
  /** Selected distrito code (UBIGEO, 6 chars) */
  distCode: string | null;
  distName: string | null;
  /** Selected sector number */
  sector: number | null;
  sectorName: string | null;
};

export const INITIAL_DRILL: DrillState = {
  level: 0,
  depCode: null, depName: null,
  provCode: null, provName: null,
  distCode: null, distName: null,
  sector: null, sectorName: null,
};

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
    gap: 2,
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    fontSize: 12,
    fontWeight: 500,
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
};
