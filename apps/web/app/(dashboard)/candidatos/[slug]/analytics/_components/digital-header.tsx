"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { GA4Overview } from "./types";

type CampaignInfo = {
  id: string;
  name: string;
  slug: string;
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
  color_primario: string;
  color_secundario: string;
};

type Props = {
  campaign: CampaignInfo;
  overview: GA4Overview;
  primaryColor: string;
  secondaryColor?: string;
  hasGsc?: boolean;
};

export function DigitalHeader({ campaign, overview, primaryColor, hasGsc = false }: Props) {
  const router = useRouter();

  return (
    <header style={styles.root}>
      {/* Left: Back + Identity */}
      <div style={styles.left}>
        <button type="button" onClick={() => router.back()} style={styles.backBtn} aria-label="Volver">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><title>Volver</title><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div style={{ ...styles.avatar, borderColor: primaryColor }}>
          {campaign.foto_url ? (
            <Image src={campaign.foto_url} alt="" width={40} height={40} style={styles.avatarImg} unoptimized />
          ) : (
            <span style={{ ...styles.avatarInitials, backgroundColor: primaryColor }}>
              {campaign.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </span>
          )}
        </div>

        <div style={styles.identity}>
          <div style={styles.nameRow}>
            <span style={styles.name}>{campaign.name}</span>
            <span style={{ ...styles.badge, backgroundColor: `${primaryColor}15`, color: primaryColor }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Digital
            </span>
          </div>
          <div style={styles.meta}>
            {campaign.cargo && <span>{campaign.cargo}</span>}
            {campaign.partido && <span style={styles.partido}>• {campaign.partido}</span>}
          </div>
        </div>
      </div>

      {/* Right: Date range + GA4 badge */}
      <div style={styles.right}>
        <div style={styles.dateRange}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>{formatDateRange(overview.dateRange.start, overview.dateRange.end)}</span>
        </div>
        <div style={styles.ga4Badge}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22.4 6.8c-.4-.7-1.1-1.1-1.8-1.1h-3.4c-.7 0-1.4.4-1.8 1.1l-1.7 3c-.4.7-.4 1.5 0 2.2l1.7 3c.4.7 1.1 1.1 1.8 1.1h3.4c.7 0 1.4-.4 1.8-1.1l1.7-3c.4-.7.4-1.5 0-2.2l-1.7-3z" fill="#F9AB00"/>
            <path d="M12 4.5c-.7 0-1.4.4-1.8 1.1l-1.7 3c-.4.7-.4 1.5 0 2.2l1.7 3c.4.7 1.1 1.1 1.8 1.1h3.4c.7 0 1.4-.4 1.8-1.1l1.7-3c.4-.7.4-1.5 0-2.2l-1.7-3c-.4-.7-1.1-1.1-1.8-1.1H12z" fill="#E37400"/>
            <circle cx="6" cy="18" r="4" fill="#F9AB00"/>
          </svg>
          <span>Google Analytics</span>
        </div>
        {hasGsc && (
          <div style={styles.gscBadge}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4285f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Search Console</span>
          </div>
        )}
      </div>
    </header>
  );
}

function formatDateRange(start: string, end: string): string {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const s = new Date(+start.slice(0, 4), +start.slice(4, 6) - 1, +start.slice(6, 8));
  const e = new Date(+end.slice(0, 4), +end.slice(4, 6) - 1, +end.slice(6, 8));
  return `${s.getDate()} ${months[s.getMonth()]} – ${e.getDate()} ${months[e.getMonth()]} ${e.getFullYear()}`;
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 64,
    padding: "0 24px",
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s ease",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    overflow: "hidden",
    border: "2px solid",
    flexShrink: 0,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  avatarInitials: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
  },
  identity: {},
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  name: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0f172a",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
  },
  meta: {
    display: "flex",
    gap: 6,
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },
  partido: {
    color: "#94a3b8",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  dateRange: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#64748b",
    padding: "8px 12px",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
  },
  ga4Badge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 600,
    color: "#1e293b",
    padding: "8px 12px",
    backgroundColor: "#fff7ed",
    borderRadius: 8,
    border: "1px solid #fed7aa",
  },
  gscBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 600,
    color: "#1e3a5f",
    padding: "8px 12px",
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    border: "1px solid #bfdbfe",
  },
};
