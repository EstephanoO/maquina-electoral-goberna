"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useCampaignStats, useRecentForms } from "@/lib/hooks/use-tierra-queries";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

// Simple campaign shape exposed by auth-context (id/name/slug/role only).
type AuthCampaign = { id: string; name: string; slug: string; role: string };

export default function InicioPage() {
  const { user, campaigns, activeCampaignId, setActiveCampaign } = useAuth();
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);
  const slug = activeCampaign?.slug ?? "";

  const statsQ = useCampaignStats(slug);
  const formsQ = useRecentForms(activeCampaign?.id);

  if (!activeCampaign) {
    return (
      <NoCampaignState
        userName={user?.full_name}
        campaigns={campaigns}
        onPick={setActiveCampaign}
        isAdmin={user?.role === "admin"}
      />
    );
  }

  const stats = statsQ.data;
  const forms = formsQ.data ?? [];
  const totals = stats?.totals;
  const topAgents = stats?.top_agents ?? [];

  return (
    <div style={{ fontFamily: FONT, maxWidth: 1100, margin: "0 auto", padding: "8px 0 32px" }}>
      <Header campaignName={activeCampaign.name} userName={user?.full_name} />

      <KpiStrip
        cards={[
          { label: "Contactos hoy", value: totals?.forms_today ?? null, accent: "var(--goberna-blue-600)", sub: totals ? `${totals.forms_count.toLocaleString("es-PE")} totales` : "—" },
          { label: "Esta semana", value: totals?.forms_week ?? null, accent: "#2563eb", sub: "registros" },
          { label: "Hablados", value: totals?.forms_hablado ?? null, accent: "#16a34a", sub: totals && totals.forms_count > 0 ? `${Math.round((totals.forms_hablado / totals.forms_count) * 100)}% del total` : "—" },
          { label: "Brigadistas activos", value: topAgents.length, accent: "var(--goberna-gold)", sub: topAgents[0]?.name ? `Top: ${topAgents[0].name.split(" ")[0]}` : "—" },
        ]}
      />

      <QuickActions slug={slug} formsCount={totals?.forms_count ?? 0} />

      <ActivityFeed forms={forms.slice(0, 8)} loading={formsQ.isLoading} />
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────

function Header({ campaignName, userName }: { campaignName: string; userName: string | undefined }) {
  const firstName = userName?.split(" ")[0] ?? "";
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--color-text-primary)", margin: 0, letterSpacing: "-0.01em" }}>
        Hola{firstName ? `, ${firstName}` : ""} 👋
      </h1>
      <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: "6px 0 0" }}>
        Campaña activa: <strong style={{ color: "var(--goberna-gold)" }}>{campaignName}</strong>
      </p>
    </div>
  );
}

// ── KPI strip ───────────────────────────────────────────────────────

type KpiCard = { label: string; value: number | null; accent: string; sub: string };

function KpiStrip({ cards }: { cards: KpiCard[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: "16px 20px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: c.accent, opacity: 0.7 }} />
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
            {c.label}
          </p>
          <p style={{ fontSize: 28, fontWeight: 800, color: c.accent, margin: "6px 0 4px", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {c.value === null ? "—" : c.value.toLocaleString("es-PE")}
          </p>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0 }}>{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── Quick actions ───────────────────────────────────────────────────

function QuickActions({ slug, formsCount }: { slug: string; formsCount: number }) {
  const actions = [
    {
      title: "Ver mapa de territorio",
      desc: "Brigadistas en vivo, geocercas y pipeline geográfico.",
      href: `/candidatos/${slug}/tierra`,
      cta: "Abrir tierra",
    },
    {
      title: "Validar contactos",
      desc: formsCount > 0 ? `${formsCount.toLocaleString("es-PE")} contactos en tu base.` : "Tu base está vacía. Compartí el QR.",
      href: `/candidatos/${slug}/digital/validacion`,
      cta: "Ir a validación",
    },
    {
      title: "Configurar WhatsApp",
      desc: "Número del QR, mensaje, canal de difusión.",
      href: `/candidatos/${slug}/digital/whatsapp`,
      cta: "Configurar WA",
    },
  ];

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 1.5, margin: "0 0 12px" }}>
        ¿Qué hago hoy?
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            prefetch
            style={{
              display: "block",
              padding: 16,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              textDecoration: "none",
              color: "inherit",
              transition: "border-color 0.15s ease, transform 0.15s ease",
            }}
            className="quick-action-card"
          >
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
              {a.title}
            </p>
            <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "0 0 10px", lineHeight: 1.4 }}>
              {a.desc}
            </p>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--goberna-blue-600)" }}>
              {a.cta} →
            </span>
          </Link>
        ))}
      </div>
      <style>{`
        .quick-action-card:hover {
          border-color: var(--goberna-gold) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}

// ── Activity feed ───────────────────────────────────────────────────

type FeedItem = { id: string; nombre: string; created_at: string; encuestador: string; distrito: string };

function ActivityFeed({ forms, loading }: { forms: FeedItem[]; loading: boolean }) {
  return (
    <div>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 1.5, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
        Actividad reciente
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
      </h2>

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden" }}>
        {loading && forms.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
            Cargando…
          </div>
        ) : forms.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
            Sin actividad reciente. Cuando un brigadista registre alguien, aparece acá.
          </div>
        ) : (
          forms.map((f, idx) => (
            <div
              key={f.id}
              style={{
                padding: "12px 16px",
                borderBottom: idx < forms.length - 1 ? "1px solid var(--color-border)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 13,
              }}
            >
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", minWidth: 60, fontVariantNumeric: "tabular-nums" }}>
                {timeAgo(f.created_at)}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <strong style={{ color: "var(--color-text-primary)" }}>{f.nombre || "Anónimo"}</strong>
                {f.distrito && <span style={{ color: "var(--color-text-tertiary)" }}> · {f.distrito}</span>}
              </span>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.encuestador && `por ${f.encuestador.split(" ")[0]}`}
              </span>
            </div>
          ))
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// ── No campaign state ───────────────────────────────────────────────

function NoCampaignState({
  userName,
  campaigns,
  onPick,
  isAdmin,
}: {
  userName: string | undefined;
  campaigns: AuthCampaign[];
  onPick: (id: string) => void;
  isAdmin: boolean;
}) {
  const firstName = userName?.split(" ")[0] ?? "";
  return (
    <div style={{ fontFamily: FONT, maxWidth: 720, margin: "40px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--color-text-primary)", margin: 0 }}>
        Hola{firstName ? `, ${firstName}` : ""} 👋
      </h1>
      <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", margin: "8px 0 24px" }}>
        {campaigns.length === 0
          ? "Todavía no tenés campañas asignadas. Contactá a tu administrador."
          : "Seleccioná una campaña para arrancar."}
      </p>

      {campaigns.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              style={{
                padding: 16,
                textAlign: "left",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                cursor: "pointer",
                transition: "border-color 0.15s ease",
                fontFamily: FONT,
              }}
              className="quick-action-card"
            >
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 2px" }}>
                {c.name}
              </p>
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0 }}>
                {c.role}
              </p>
            </button>
          ))}
        </div>
      )}

      {isAdmin && campaigns.length === 0 && (
        <Link
          href="/candidatos"
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "10px 20px",
            background: "var(--goberna-gold)",
            color: "var(--goberna-blue-950)",
            borderRadius: 8,
            fontWeight: 700,
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          Crear primera campaña
        </Link>
      )}

      <style>{`
        .quick-action-card:hover {
          border-color: var(--goberna-gold) !important;
        }
      `}</style>
    </div>
  );
}
