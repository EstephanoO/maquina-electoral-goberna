"use client";

import { useAuth } from "../../lib/auth-context";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getCampaignStats } from "../../lib/services/campaigns";
import { getCmsMetrics } from "../../lib/services/cms";
import {
  getAdminKPIs,
  getCandidateSubmissions,
  MOCK_SUBMISSIONS,
  type MockRole,
} from "../../lib/mock-data";
import type { CampaignStats } from "../../lib/types";
import type { CmsMetrics } from "../../lib/services/cms";

// ── KPI Card ────────────────────────────────────────────────────────

const TONE_BG: Record<string, string> = {
  blue: "var(--goberna-blue-100)",
  green: "#ecfdf5",
  gold: "var(--goberna-gold-100)",
  red: "#fef2f2",
};

const TONE_STROKE: Record<string, string> = {
  blue: "var(--goberna-blue-600)",
  green: "#16a34a",
  gold: "var(--goberna-gold-600)",
  red: "#dc2626",
};

function KPICard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "gold" | "red";
}) {
  return (
    <div
      style={{
        flex: "1 1 220px",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
        boxShadow: "var(--shadow-sm)",
        border: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "flex-start",
        gap: "16px",
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: TONE_BG[tone],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-secondary)",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

// ── Quick‑action button ─────────────────────────────────────────────

function ActionButton({
  label,
  onClick,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  variant?: "primary" | "gold";
}) {
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 24px",
        borderRadius: "var(--radius-md)",
        border: "none",
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        background: isPrimary ? "var(--goberna-blue-900)" : "var(--goberna-gold)",
        color: isPrimary ? "#ffffff" : "var(--color-text-on-accent)",
        transition: "background 150ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget.style.background = isPrimary
          ? "var(--goberna-blue-800)"
          : "var(--goberna-gold-500)");
      }}
      onMouseLeave={(e) => {
        (e.currentTarget.style.background = isPrimary
          ? "var(--goberna-blue-900)"
          : "var(--goberna-gold)");
      }}
    >
      {label}
    </button>
  );
}

// ── Mini table ──────────────────────────────────────────────────────

function SubmissionsTable({
  title,
  rows,
}: {
  title: string;
  rows: { hora: string; agente: string; formulario: string; zona: string }[];
}) {
  const cellStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    color: "var(--color-text-primary)",
    borderBottom: "1px solid var(--color-border)",
    fontFamily: "var(--font-montserrat), system-ui, sans-serif",
  };

  const headerStyle: React.CSSProperties = {
    ...cellStyle,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    background: "var(--goberna-blue-50)",
  };

  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        border: "1px solid var(--color-border)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 16px 12px",
          fontFamily: "var(--font-montserrat), system-ui, sans-serif",
          fontSize: 15,
          fontWeight: 700,
          color: "var(--color-text-primary)",
        }}
      >
        {title}
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr>
            <th style={headerStyle}>Hora</th>
            <th style={headerStyle}>Agente</th>
            <th style={headerStyle}>Formulario</th>
            <th style={headerStyle}>Zona</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={4}
                style={{
                  ...cellStyle,
                  textAlign: "center",
                  color: "var(--color-text-tertiary)",
                }}
              >
                Sin actividad reciente
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr
              key={`${r.hora}-${r.agente}-${r.zona}`}
              style={{
                background: i % 2 === 1 ? "var(--goberna-blue-50)" : "transparent",
              }}
            >
              <td style={cellStyle}>{r.hora}</td>
              <td style={cellStyle}>{r.agente}</td>
              <td style={cellStyle}>{r.formulario}</td>
              <td style={cellStyle}>{r.zona}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── SVG Icons ───────────────────────────────────────────────────────

function IconUsers({ stroke }: { stroke: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Candidatos</title>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconRadio({ stroke }: { stroke: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Agentes online</title>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
      <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
    </svg>
  );
}

function IconClipboard({ stroke }: { stroke: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Formularios</title>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

function IconAlert({ stroke }: { stroke: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Pendientes</title>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconMap({ stroke }: { stroke: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Cobertura</title>
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

function IconMonitor({ stroke }: { stroke: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Digital</title>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function IconBarChart({ stroke }: { stroke: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>CMS</title>
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatHour(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function sortedSubmissionsDesc(
  subs: typeof MOCK_SUBMISSIONS,
  limit = 5,
) {
  return [...subs]
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    .slice(0, limit);
}

function subsToRows(subs: typeof MOCK_SUBMISSIONS) {
  return subs.map((s) => ({
    hora: formatHour(s.submitted_at),
    agente: s.agent_name,
    formulario: s.form_name,
    zona: s.zona,
  }));
}

// ── Admin View ──────────────────────────────────────────────────────

function AdminView({ userName }: { userName: string }) {
  const router = useRouter();
  const kpis = getAdminKPIs();
  const recentSubs = sortedSubmissionsDesc(MOCK_SUBMISSIONS);

  return (
    <>
      {/* Welcome */}
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          margin: "0 0 4px 0",
          fontFamily: "var(--font-montserrat), system-ui, sans-serif",
        }}
      >
        Panel de Control GOBERNA
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--color-text-secondary)",
          margin: "0 0 24px 0",
          fontFamily: "var(--font-montserrat), system-ui, sans-serif",
        }}
      >
        Bienvenido, {userName}
      </p>

      {/* KPI row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <KPICard
          label="Total Candidatos Activos"
          value={String(kpis.totalCandidates)}
          tone="blue"
          icon={<IconUsers stroke={TONE_STROKE.blue} />}
        />
        <KPICard
          label="Agentes Online"
          value={String(kpis.totalAgentsOnline)}
          tone="green"
          icon={<IconRadio stroke={TONE_STROKE.green} />}
        />
        <KPICard
          label="Forms Recibidos Hoy"
          value={String(kpis.totalFormsToday)}
          tone="gold"
          icon={<IconClipboard stroke={TONE_STROKE.gold} />}
        />
        <KPICard
          label="Submissions Pendientes CMS"
          value={String(kpis.totalPendingSubmissions)}
          tone={kpis.totalPendingSubmissions > 0 ? "red" : "blue"}
          icon={
            <IconAlert
              stroke={
                kpis.totalPendingSubmissions > 0
                  ? TONE_STROKE.red
                  : TONE_STROKE.blue
              }
            />
          }
        />
      </div>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
        <ActionButton label="Crear Candidato" onClick={() => router.push("/candidatos")} />
        <ActionButton
          label="Ver Solicitudes Pendientes"
          onClick={() => router.push("/candidatos")}
          variant="gold"
        />
      </div>

      {/* Recent activity */}
      <SubmissionsTable title="Actividad Reciente" rows={subsToRows(recentSubs)} />
    </>
  );
}

// ── Candidato Preview Card ──────────────────────────────────────────

type DashboardSection = {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "gold" | "red";
  stats: { label: string; value: string }[];
  href: string;
  loading?: boolean;
};

function PreviewCard({
  section,
  onClick,
}: {
  section: DashboardSection;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: "1 1 280px",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-lg)",
        padding: "0",
        boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-sm)",
        border: `1px solid ${hovered ? "var(--goberna-blue-200)" : "var(--color-border)"}`,
        cursor: "pointer",
        textAlign: "left",
        transition: "box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: "20px 20px 16px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--radius-md)",
            background: TONE_BG[section.tone],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {section.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              marginBottom: 2,
            }}
          >
            {section.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-tertiary)",
              lineHeight: 1.4,
            }}
          >
            {section.description}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          gap: 24,
          flex: 1,
        }}
      >
        {section.loading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--color-text-tertiary)",
              fontSize: 13,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                border: "2px solid var(--color-border)",
                borderTopColor: "var(--goberna-blue-600)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            Cargando...
          </div>
        ) : (
          section.stats.map((stat) => (
            <div key={stat.label}>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: TONE_STROKE[section.tone],
                  lineHeight: 1.1,
                  marginBottom: 2,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--color-text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {stat.label}
              </div>
            </div>
          ))
        )}
      </div>

      {/* CTA footer */}
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: hovered ? "var(--goberna-blue-50)" : "transparent",
          transition: "background 150ms ease",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: hovered ? "var(--goberna-blue-900)" : "var(--color-text-secondary)",
            transition: "color 150ms ease",
          }}
        >
          Ver dashboard
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={hovered ? "var(--goberna-blue-900)" : "var(--color-text-tertiary)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: "stroke 150ms ease, transform 150ms ease", transform: hovered ? "translateX(3px)" : "translateX(0)" }}
        >
          <title>Ver</title>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </button>
  );
}

// ── Candidato View ──────────────────────────────────────────────────

function CandidatoView({ userName }: { userName: string }) {
  const router = useRouter();
  const { campaigns, activeCampaignId } = useAuth();

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId) ?? campaigns[0];
  const slug = activeCampaign?.slug ?? "";

  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [cmsMetrics, setCmsMetrics] = useState<CmsMetrics | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingCms, setLoadingCms] = useState(true);

  useEffect(() => {
    if (!slug) {
      setLoadingStats(false);
      return;
    }
    getCampaignStats(slug).then((res) => {
      if (res.ok && res.data) setStats(res.data);
      setLoadingStats(false);
    });
  }, [slug]);

  useEffect(() => {
    getCmsMetrics().then((res) => {
      if (res.ok && res.metrics) setCmsMetrics(res.metrics);
      setLoadingCms(false);
    });
  }, []);

  const formsToday = stats?.totals?.forms_today ?? 0;
  const formsTotal = stats?.totals?.forms_count ?? 0;
  const cmsTotal = cmsMetrics?.global_totals?.total ?? 0;
  const cmsContactRate = cmsMetrics?.global_totals?.contact_rate ?? 0;
  const cmsPending = cmsMetrics?.global_totals?.nuevos ?? 0;

  const sections: DashboardSection[] = [
    {
      key: "tierra",
      title: "Territorio",
      description: "Mapa operativo, agentes en campo y cobertura de zonas",
      icon: <IconMap stroke={TONE_STROKE.blue} />,
      tone: "blue",
      loading: loadingStats,
      stats: [
        { label: "Forms hoy", value: String(formsToday) },
        { label: "Total forms", value: String(formsTotal) },
      ],
      href: slug ? `/candidatos/${slug}/tierra` : "/",
    },
    {
      key: "analytics",
      title: "Analytics",
      description: "Métricas digitales y presencia online de tu campaña",
      icon: <IconMonitor stroke={TONE_STROKE.gold} />,
      tone: "gold",
      loading: false,
      stats: [
        { label: "Configurado", value: "GA4" },
      ],
      href: slug ? `/candidatos/${slug}/analytics` : "/",
    },
    {
      key: "cms-metrics",
      title: "Digital",
      description: "Gestión de contactos WhatsApp y operadoras",
      icon: <IconBarChart stroke={TONE_STROKE.green} />,
      tone: "green",
      loading: loadingCms,
      stats: [
        { label: "Contactos", value: String(cmsTotal) },
        { label: "Pendientes", value: String(cmsPending) },
        { label: "Tasa", value: `${(cmsContactRate * 100).toFixed(0)}%` },
      ],
      href: slug ? `/candidatos/${slug}/cms-metrics` : "/cms-metrics",
    },
  ];

  return (
    <>
      {/* Welcome */}
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          margin: "0 0 4px 0",
          fontFamily: "var(--font-montserrat), system-ui, sans-serif",
        }}
      >
        Tu Campaña
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--color-text-secondary)",
          margin: "0 0 28px 0",
          fontFamily: "var(--font-montserrat), system-ui, sans-serif",
        }}
      >
        {activeCampaign?.name
          ? `${activeCampaign.name} — Bienvenido, ${userName}`
          : `Bienvenido, ${userName}`}
      </p>

      {/* Preview cards grid */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          marginBottom: 8,
        }}
      >
        {sections.map((section) => (
          <PreviewCard
            key={section.key}
            section={section}
            onClick={() => router.push(section.href)}
          />
        ))}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── Role switcher (dev tool) ────────────────────────────────────────

const ROLE_OPTIONS: { value: MockRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "candidato", label: "Candidato" },
];

function RoleSwitcher({
  current,
  onChange,
}: {
  current: MockRole;
  onChange: (role: MockRole) => void;
}) {
  return (
    <div
      style={{
        background: "#fef3c7",
        border: "1px solid #fde68a",
        borderRadius: "var(--radius-md)",
        padding: "8px 14px",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#92400e",
          whiteSpace: "nowrap",
        }}
      >
        Vista de desarrollo — Cambiar rol:
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        {ROLE_OPTIONS.map((opt) => {
          const isActive = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius-sm)",
                border: isActive ? "none" : "1px solid var(--color-border-strong)",
                background: isActive ? "var(--goberna-blue-900)" : "var(--color-surface)",
                color: isActive ? "#ffffff" : "var(--color-text-secondary)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-montserrat), system-ui, sans-serif",
                transition: "all 120ms ease",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function DashboardHomePage() {
  const { user } = useAuth();
  const [mockRole, setMockRole] = useState<MockRole>("admin");

  const userName = user?.full_name ?? "Usuario";

  return (
    <div style={{ maxWidth: 1100 }}>
      <RoleSwitcher current={mockRole} onChange={setMockRole} />

      {mockRole === "admin" && <AdminView userName={userName} />}
      {mockRole === "candidato" && <CandidatoView userName={userName} />}
    </div>
  );
}
