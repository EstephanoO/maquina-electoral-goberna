"use client";

/**
 * GOBERNA — Monitor WA (candidato-scoped)
 *
 * War-room dashboard:
 * - Hero KPI strip (total sent, active phones, classifications, accuracy)
 * - 6 compact phone cards in a row
 * - CMS pipeline funnel bar
 * - Two-column: classification charts (Recharts) + live feed
 *
 * Auto-refreshes phones every 30s + SSE for classifications.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import {
  getExtensionMonitor,
  type ExtensionMonitorPhone,
} from "@/lib/services/cms";
import {
  getClassificationEvents,
  getClassificationStats,
  connectClassificationStream,
  type ClassificationEvent,
  type ClassificationStats,
  type ClassificationSseEvent,
} from "@/lib/services/classification";
import {
  ClassificationMetrics,
  ClassificationFeed,
  AgentQuality,
  VoterProfilesTab,
  MetricCard,
} from "./_components";
import { getMonitorTheme, setMonitorThemeMode, type MonitorThemeMode } from "./_components/theme";

// ── Constants ────────────────────────────────────────────────────────
const SLOTS = ["Vasquez 1", "Vasquez 2", "Vasquez 3", "Vasquez 4", "Vasquez 5", "Vasquez 6"];
const POLL_PHONES_MS = 30_000;
const POLL_SSE_MS = 60_000;
const POLL_FALLBACK_MS = 15_000;
const CLASS_PAGE_SIZE = 30;

const EMPTY_PHONE: ExtensionMonitorPhone = {
  own_number: "",
  alias: null,
  wa_sent: 0,
  unique_contacts: 0,
  last_event_at: null,
  operators: [],
};

// ── Types ────────────────────────────────────────────────────────────
type SseStatus = "connecting" | "connected" | "disconnected";
type TabId = "monitor" | "quality" | "voters";

// ── Helpers ──────────────────────────────────────────────────────────
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function fmtRel(iso: string | null): string {
  if (!iso) return "\u2014";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ══════════════════════════════════════════════════════════════════════
// COMPACT PHONE CARD
// ══════════════════════════════════════════════════════════════════════

function PhoneCard({ phone, slotName, maxSent }: {
  phone: ExtensionMonitorPhone; slotName: string; maxSent: number;
}) {
  const G = getMonitorTheme((globalThis as typeof globalThis & { __gobernaMonitorTheme?: MonitorThemeMode }).__gobernaMonitorTheme ?? "light");
  const active = phone.wa_sent > 0;
  const pct = maxSent > 0 ? (phone.wa_sent / maxSent) * 100 : 0;
  const topOp = [...phone.operators].sort((a, b) => b.wa_sent - a.wa_sent)[0];

  return (
    <div style={{
      padding: "18px", borderRadius: 18,
      background: G.surface,
      border: `1px solid ${active ? G.brandBlue : G.border}`,
      boxShadow: "0 12px 28px rgba(22,57,96,0.06)",
      transition: "border-color 0.3s ease, background-color 0.3s ease",
      minHeight: 220,
      height: "100%",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 900, color: active ? G.brandBlue : G.textMid,
            letterSpacing: "0.3px",
          }}>
            {slotName}
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: G.textDim }}>
          {fmtRel(phone.last_event_at)}
        </span>
      </div>

      {/* Sent count + bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: active ? G.brandBlue : G.textMid, lineHeight: 1 }}>
            {phone.wa_sent}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: G.textDim, alignSelf: "flex-end" }}>
            {phone.unique_contacts} contactos
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: G.surfaceSoft, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 999,
            background: active ? G.brandBlue : "transparent",
            transition: "width 0.6s ease",
          }} />
        </div>
      </div>

      {/* Operators list */}
      {phone.operators.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
          {phone.operators.sort((a, b) => b.wa_sent - a.wa_sent).map((op) => {
            const name = op.full_name.split(" ")[0] ?? op.email.split("@")[0];
            return (
              <div key={op.operator_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: G.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "45%" }}>
                  {name}
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: G.brandBlue }}>
                    {op.wa_sent}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: G.sky }}>
                    {op.unique_phones} ct
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "flex-start" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: G.textDim }}>{"\u2014"}</span>
        </div>
      )}

      {topOp && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${G.border}` }}>
          <span style={{ fontSize: 10, color: G.textDim }}>Top operador: </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: G.text }}>{topOp.full_name}</span>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════

export default function MonitorWaPage() {
  const { campaigns } = useAuth();
  const params = useParams();
  const slug = params.slug as string;
  const campaign = campaigns.find((c) => c.slug === slug);
  const campaignId = campaign?.id ?? null;
  const { theme, setTheme } = useTheme();

  // ── State ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>("monitor");
  const [phones, setPhones] = useState<ExtensionMonitorPhone[]>([]);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [events, setEvents] = useState<ClassificationEvent[]>([]);
  const [classStats, setClassStats] = useState<ClassificationStats | null>(null);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);
  const [classPage, setClassPage] = useState(1);
  const [classTotal, setClassTotal] = useState(0);
  const [filters, setFilters] = useState({ source: "", category: "", vote_class: "" });
  const [sseStatus, setSseStatus] = useState<SseStatus>("connecting");
  const [sseEventCount, setSseEventCount] = useState(0);
  const statsStaleRef = useRef(false);
  const themeMode = theme as MonitorThemeMode;
  const G = getMonitorTheme(themeMode);

  if (typeof globalThis !== "undefined") {
    (globalThis as typeof globalThis & { __gobernaMonitorTheme?: MonitorThemeMode }).__gobernaMonitorTheme = themeMode;
  }
  setMonitorThemeMode(themeMode);

  // ── Data loaders ───────────────────────────────────────────────
  const loadPhones = useCallback(async () => {
    if (!campaignId) return;
    setPhoneLoading(true);
    setPhoneError(null);
    try {
      const monitorRes = await getExtensionMonitor(campaignId);
      if (!monitorRes.ok) { setPhoneError(monitorRes.error ?? "Error"); return; }
      setPhones(monitorRes.phones ?? []);
    } finally {
      setPhoneLoading(false);
    }
  }, [campaignId]);

  const loadEvents = useCallback(async (pageNum = 1, append = false) => {
    if (!campaignId) return;
    setClassLoading(true);
    setClassError(null);
    const res = await getClassificationEvents(campaignId, {
      page: pageNum, limit: CLASS_PAGE_SIZE,
      source: filters.source || undefined,
      category: filters.category || undefined,
      vote_class: filters.vote_class || undefined,
    });
    setClassLoading(false);
    if (!res.ok) { setClassError(res.error ?? "Error"); return; }
    if (append) setEvents(prev => [...prev, ...(res.items ?? [])]);
    else setEvents(res.items ?? []);
    setClassTotal(res.total ?? 0);
    setClassPage(pageNum);
  }, [campaignId, filters]);

  const loadClassStats = useCallback(async () => {
    if (!campaignId) return;
    const res = await getClassificationStats(campaignId);
    if (res.ok && res.stats) { setClassStats(res.stats); statsStaleRef.current = false; }
  }, [campaignId]);

  // ── SSE ─────────────────────────────────────────────────────────
  const handleSseEvent = useCallback((ev: ClassificationSseEvent) => {
    if (ev.type === "connected") { setSseStatus("connected"); return; }
    if (ev.type === "heartbeat") return;
    if (ev.type === "classification.new") {
      setSseEventCount(c => c + 1);
      setEvents(prev => {
        if (prev.some(e => e.id === ev.event.id)) return prev;
        return [ev.event, ...prev].slice(0, CLASS_PAGE_SIZE + 20);
      });
      setClassTotal(t => t + 1);
      statsStaleRef.current = true;
    }
    if (ev.type === "classification.corrected") {
      setSseEventCount(c => c + 1);
      setEvents(prev => prev.map(e => e.id === ev.event.id ? { ...e, ...ev.event } : e));
      statsStaleRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    setSseStatus("connecting");
    return connectClassificationStream(campaignId, handleSseEvent, () => setSseStatus("disconnected"));
  }, [campaignId, handleSseEvent]);

  // ── Lifecycle ───────────────────────────────────────────────────
  useEffect(() => { loadPhones(); loadEvents(1); loadClassStats(); }, [loadPhones, loadEvents, loadClassStats]);
  useEffect(() => { const id = setInterval(loadPhones, POLL_PHONES_MS); return () => clearInterval(id); }, [loadPhones]);
  useEffect(() => {
    const ms = sseStatus === "connected" ? POLL_SSE_MS : POLL_FALLBACK_MS;
    const id = setInterval(() => {
      if (sseStatus !== "connected") loadEvents(1);
      if (statsStaleRef.current || sseStatus !== "connected") loadClassStats();
    }, ms);
    return () => clearInterval(id);
  }, [sseStatus, loadEvents, loadClassStats]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--tierra-tabbar-bg", themeMode === "dark" ? "#090D15" : "#ffffff");
    root.style.setProperty("--tierra-tabbar-border", themeMode === "dark" ? "#1d2f43" : G.border);
    root.style.setProperty("--tierra-tab-active-color", themeMode === "dark" ? "#ffffff" : G.brandBlue);
    root.style.setProperty("--tierra-tab-inactive-color", themeMode === "dark" ? "#cbd5e1" : G.textMid);
    root.style.setProperty("--tierra-tab-hover-bg", themeMode === "dark" ? "#1a2738" : "rgba(15,23,42,0.04)");

    return () => {
      root.style.removeProperty("--tierra-tabbar-bg");
      root.style.removeProperty("--tierra-tabbar-border");
      root.style.removeProperty("--tierra-tab-active-color");
      root.style.removeProperty("--tierra-tab-inactive-color");
      root.style.removeProperty("--tierra-tab-hover-bg");
    };
  }, [G, themeMode]);

  // ── Handlers ───────────────────────────────────────────────────
  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);
  const handleLoadMore = useCallback(() => loadEvents(classPage + 1, true), [loadEvents, classPage]);
  const handleEventUpdate = useCallback((updated: ClassificationEvent) => {
    setEvents(prev => prev.map(ev => ev.id === updated.id ? { ...ev, ...updated } : ev));
  }, []);

  // ── Computed ───────────────────────────────────────────────────
  const slots = SLOTS.map(slotName => {
    const match = phones.find(p => norm(p.alias ?? "") === norm(slotName));
    return { slotName, phone: match ?? { ...EMPTY_PHONE, alias: slotName } };
  });
  const activeCount = slots.filter(s => s.phone.wa_sent > 0).length;
  const totalSent = slots.reduce((sum, s) => sum + s.phone.wa_sent, 0);
  const maxPhoneSent = Math.max(...slots.map(s => s.phone.wa_sent), 1);
  const shouldUsePhoneCarousel = slots.length > 5;
  const hasMore = events.length < classTotal;
  const isLoading = phoneLoading || classLoading;
  const errorMsg = phoneError || classError;
  const lastActivity = slots
    .map((slot) => slot.phone.last_event_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  if (!campaignId) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: G.bg, color: G.textDim, fontSize: 14 }}>
        Cargando campana...
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes gobPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:0.45; transform:scale(0.8); }
        }
        [data-monitor-page] button:focus,
        [data-monitor-page] button:focus-visible,
        [data-monitor-page] select:focus,
        [data-monitor-page] select:focus-visible,
        [data-monitor-page] input:focus,
        [data-monitor-page] input:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
        * { box-sizing:border-box; }
      `}</style>

      <div style={{
        minHeight: "calc(100vh - 96px)",
        background: G.bg,
        color: G.text,
      }} data-monitor-page>
        {/* ══ Sticky Header Bar ══ */}
        <div style={{
          background: themeMode === "dark" ? "rgba(15,27,42,0.92)" : "rgba(255,255,255,0.94)", backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${G.border}`,
          padding: "14px 28px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: G.brandBlue }}>Monitor</div>
              <div style={{ fontSize: 12, color: G.textMid }}>
                Vista operativa de WhatsApp, clasificacion y calidad para {campaign?.name ?? slug}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {/* Tabs */}
              <div role="tablist" aria-label="Secciones del monitor" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {([
                  { id: "monitor" as TabId, label: "Monitor" },
                  { id: "quality" as TabId, label: "Control Agentes" },
                  { id: "voters" as TabId, label: "Perfiles de Votantes" },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: "9px 14px", borderRadius: 999, border: `1px solid ${activeTab === tab.id ? G.brandBlue : G.borderStrong}`,
                      background: activeTab === tab.id ? G.surfaceSoft : G.bg,
                      color: activeTab === tab.id ? G.brandBlue : G.textMid,
                      fontSize: 11, fontWeight: 800, cursor: "pointer",
                      transition: "background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 999,
                    border: `1px solid ${G.borderStrong}`,
                    background: G.surfaceAlt,
                    color: sseStatus === "connected" ? G.green : sseStatus === "connecting" ? G.orange : G.red,
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <span
                    role="img"
                    aria-label={sseStatus === "connected" ? "Conexion en linea" : "Estado de conexion"}
                    title={sseStatus === "connected" ? "Conexion en linea" : sseStatus === "connecting" ? "Reconectando" : "Sin conexion"}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: sseStatus === "connected" ? G.green : sseStatus === "connecting" ? G.orange : G.red,
                      display: "inline-block",
                      animation: sseStatus === "connected" ? "gobPulse 2.5s ease-in-out infinite" : "none",
                    }}
                  />
                  {sseStatus === "connected" ? "En vivo" : sseStatus === "connecting" ? "Reconectando" : "Sin conexion"}
                </div>
                <button
                  type="button"
                  onClick={() => setTheme(themeMode === "light" ? "dark" : "light")}
                  aria-label={themeMode === "light" ? "Activar modo oscuro" : "Activar modo claro"}
                  title={themeMode === "light" ? "Modo oscuro" : "Modo claro"}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    border: `1px solid ${G.borderStrong}`,
                    background: G.surfaceAlt,
                    color: G.brandBlue,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {themeMode === "light" ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2" />
                      <path d="M12 20v2" />
                      <path d="m4.93 4.93 1.41 1.41" />
                      <path d="m17.66 17.66 1.41 1.41" />
                      <path d="M2 12h2" />
                      <path d="M20 12h2" />
                      <path d="m6.34 17.66-1.41 1.41" />
                      <path d="m19.07 4.93-1.41 1.41" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ══ Error Banner ══ */}
        {errorMsg && (
          <div style={{
            margin: "12px 28px 0", background: G.redSoft,
            border: `1px solid ${G.red}`, borderRadius: 14,
            padding: "10px 16px", fontSize: 13, color: G.red,
          }}>
            {errorMsg}
          </div>
        )}

        {/* ══ Content ══ */}
        <div style={{ padding: "28px 24px 20px", maxWidth: 1440, margin: "0 auto" }}>

          {/* ── Quality Tab ── */}
          {activeTab === "quality" && (
            <AgentQuality campaignId={campaignId} />
          )}

          {/* ── Voters Tab ── */}
          {activeTab === "voters" && (
            <VoterProfilesTab campaignId={campaignId} />
          )}

          {/* ── Monitor Tab ── */}
          {activeTab === "monitor" && <div role="tabpanel" aria-label="Monitor" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* ── Row 1: Hero KPIs ── */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 220px", gap: 14, alignItems: "stretch" }}>
            <MetricCard
              value={totalSent}
              label="Mensajes Enviados"
              color={G.brandBlue}
              emphasis
              trend={slots.map((slot) => slot.phone.wa_sent)}
              trendType="line"
              graphicSize="large"
            />
            <MetricCard
              value={classTotal}
              label="Clasificaciones"
              color={G.sky}
              trend={classStats ? [classStats.last_hour, classStats.last_24h / 6, classStats.last_24h / 3, classTotal] : [0, 0, 0, 0]}
              trendType="line"
              graphicSize="large"
            />
            <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 14 }}>
              <MetricCard
                value={activeCount}
                label="Telefonos Activos"
                color={activeCount >= 4 ? G.green : activeCount >= 2 ? G.orange : G.red}
                emphasis={activeCount > 0}
                trendType="donut"
                donutValue={activeCount}
                donutTotal={slots.length}
                donutLabel={`${activeCount}/${slots.length}`}
                hideValue
                compact
              />
              <MetricCard
                value={classStats?.last_hour ?? 0}
                label="Ultima Hora"
                color={G.green}
                emphasis={(classStats?.last_hour ?? 0) > 0}
                trend={classStats ? [classStats.last_hour, classStats.last_24h / 6, classStats.last_24h] : [0, 0, 0]}
                trendType="line"
                compact
              />
            </div>
          </div>

          {/* ── Row 2: 6 Phone Cards ── */}
          <div style={shouldUsePhoneCarousel ? {
            display: "flex",
            gap: 14,
            overflowX: "auto",
            paddingBottom: 4,
            scrollSnapType: "x proximity",
          } : {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 14,
          }}>
            {slots.map(({ slotName, phone }) => (
              <div key={slotName} style={shouldUsePhoneCarousel ? { flex: "0 0 220px", scrollSnapAlign: "start" } : undefined}>
                <PhoneCard phone={phone} slotName={slotName} maxSent={maxPhoneSent} />
              </div>
            ))}
          </div>

          {/* ── Row 3: Two-column (Charts + Feed) ── */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.25fr)", gap: 18, alignItems: "start" }}>

            {/* Left: Classification Metrics (Charts) */}
            <div>
              <div style={{
                fontSize: 12, fontWeight: 900, color: G.brandBlue, letterSpacing: "0.6px",
                textTransform: "uppercase", marginBottom: 12, paddingLeft: 4, minHeight: 18,
              }}>
                Metricas de Clasificacion
              </div>
              <ClassificationMetrics stats={classStats} />
            </div>

            {/* Right: Live Feed */}
            <div>
              <div style={{
                fontSize: 12, fontWeight: 900, color: G.brandBlue, letterSpacing: "0.6px",
                textTransform: "uppercase", marginBottom: 12, paddingLeft: 4, minHeight: 18,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                Feed en Vivo
                {sseStatus === "connected" && (
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", background: G.green,
                    display: "inline-block",
                    animation: "gobPulse 2.5s ease-in-out infinite",
                  }} />
                )}
              </div>
              <ClassificationFeed
                events={events}
                campaignId={campaignId}
                loading={classLoading}
                hasMore={hasMore}
                onLoadMore={handleLoadMore}
                onEventUpdate={handleEventUpdate}
                filters={filters}
                onFilterChange={handleFilterChange}
              />
            </div>
          </div>

          </div>}
        </div>
      </div>
    </>
  );
}
