"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { CampaignStats } from "@/lib/types";

/* ========== Types ========== */

type Props = {
  stats: CampaignStats;
  agentCount: number;
  formCount: number;
  connectedCount: number;
};

/* ========== Component ========== */

export function TierraHeader({ stats, agentCount, formCount, connectedCount }: Props) {
  const router = useRouter();
  const { campaign, metas, totals } = stats;
  const pc = campaign.color_primario;
  const sc = campaign.color_secundario;

  const datosProgress = metas.datos > 0 ? Math.min((totals.forms_count / metas.datos) * 100, 100) : 0;
  const votosProgress = metas.votos > 0 ? Math.min((totals.forms_count / metas.votos) * 100, 100) : 0;

  return (
    <header style={S.root}>
      {/* Left: back + candidate identity */}
      <div style={S.left}>
        <button type="button" onClick={() => router.back()} style={S.backBtn} aria-label="Volver" title="Volver">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Volver</title><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div style={{ ...S.avatar, borderColor: sc || pc }}>
          {campaign.foto_url ? (
            <Image src={campaign.foto_url} alt="" width={32} height={32} style={S.avatarImg} unoptimized />
          ) : (
            <span style={{ ...S.avatarInitials, backgroundColor: pc }}>
              {campaign.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </span>
          )}
        </div>

        <div style={S.identity}>
          <div style={S.name}>{campaign.name}</div>
          <div style={S.meta}>
            {campaign.cargo && <span>{campaign.cargo}</span>}
            {campaign.numero && <span style={S.numero}>N.° {campaign.numero}</span>}
            {campaign.partido && <span style={S.partido}>{campaign.partido}</span>}
          </div>
        </div>
      </div>

      {/* Center: live counters */}
      <div style={S.center}>
        <div style={S.stat}>
          <span style={S.statVal}>{formCount.toLocaleString()}</span>
          <span style={S.statLabel}>Puntos</span>
        </div>
        <div style={S.divider} />
        <div style={S.stat}>
          <span style={S.statVal}>{agentCount}</span>
          <span style={S.statLabel}>Agentes</span>
        </div>
        <div style={S.divider} />
        <div style={S.stat}>
          <span style={{ ...S.statVal, color: connectedCount > 0 ? "#0d9488" : "#94a3b8" }}>{connectedCount}</span>
          <span style={S.statLabel}>En linea</span>
        </div>
        <div style={S.divider} />
        <div style={S.stat}>
          <span style={{ ...S.statVal, color: pc }}>+{totals.forms_today}</span>
          <span style={S.statLabel}>Hoy</span>
        </div>
      </div>

      {/* Right: metas */}
      <div style={S.right}>
        {/* Meta datos */}
        <div style={S.metaCard}>
          <div style={S.metaTop}>
            <span style={S.metaLabel}>Meta datos</span>
            <span style={{ ...S.metaPct, color: pc }}>{datosProgress.toFixed(0)}%</span>
          </div>
          <div style={S.bar}>
            <div style={{ ...S.barFill, width: `${datosProgress}%`, backgroundColor: pc }} />
          </div>
          <div style={S.metaBottom}>
            <span style={{ fontWeight: 700, color: "#1e293b" }}>{totals.forms_count.toLocaleString()}</span>
            <span style={{ color: "#94a3b8" }}> / {metas.datos > 0 ? metas.datos.toLocaleString() : "—"}</span>
          </div>
        </div>

        {/* Meta votos */}
        <div style={S.metaCard}>
          <div style={S.metaTop}>
            <span style={S.metaLabel}>Meta votos</span>
            <span style={{ ...S.metaPct, color: sc || pc }}>{metas.votos > 0 ? `${votosProgress.toFixed(0)}%` : "—"}</span>
          </div>
          <div style={S.bar}>
            <div style={{ ...S.barFill, width: `${votosProgress}%`, backgroundColor: sc || pc }} />
          </div>
          <div style={S.metaBottom}>
            <span style={{ fontWeight: 700, color: "#1e293b" }}>—</span>
            <span style={{ color: "#94a3b8" }}> / {metas.votos > 0 ? metas.votos.toLocaleString() : "—"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ========== Styles ========== */

const S: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    padding: "0 16px",
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
    gap: 16,
    zIndex: 20,
  },

  /* Left */
  left: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    overflow: "hidden",
    border: "2px solid",
    flexShrink: 0,
  },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" as const },
  avatarInitials: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 11,
    fontWeight: 800,
  },
  identity: { minWidth: 0 },
  name: { fontSize: 14, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  meta: { display: "flex", gap: 8, fontSize: 11, color: "#64748b" },
  numero: { fontWeight: 600 },
  partido: { fontStyle: "italic" },

  /* Center */
  center: { display: "flex", alignItems: "center", gap: 12 },
  stat: { display: "flex", flexDirection: "column" as const, alignItems: "center" },
  statVal: { fontSize: 16, fontWeight: 800, color: "#1e293b", lineHeight: 1.1 },
  statLabel: { fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const, color: "#94a3b8", letterSpacing: "0.04em" },
  divider: { width: 1, height: 28, backgroundColor: "#e2e8f0" },

  /* Right */
  right: { display: "flex", gap: 12, flexShrink: 0 },
  metaCard: { minWidth: 140, padding: "4px 0" },
  metaTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  metaLabel: { fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, color: "#64748b", letterSpacing: "0.04em" },
  metaPct: { fontSize: 12, fontWeight: 800 },
  bar: { height: 4, backgroundColor: "#e2e8f0", borderRadius: 2, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 2, transition: "width 0.4s ease" },
  metaBottom: { marginTop: 2, fontSize: 11 },
};
