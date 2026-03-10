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
} from "./_components";

// ── Palette ──────────────────────────────────────────────────────────
const G = {
  gold: "#FFC800",
  goldDim: "#CC9F00",
  goldFaint: "rgba(255,200,0,0.10)",
  goldBorder: "rgba(255,200,0,0.25)",
  bg: "#060e18",
  surface: "#0c1a28",
  surfaceUp: "#0f2035",
  border: "rgba(255,255,255,0.06)",
  text: "#e9eef3",
  textMid: "#7a95aa",
  textDim: "#334d63",
  green: "#22c55e",
  red: "#ef5350",
  blue: "#3b82f6",
  orange: "#f59e0b",
  purple: "#a855f7",
  cyan: "#06b6d4",
} as const;

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
type CmsStats = { pendiente: number; contactado: number; respondido: number; invalido: number; total: number };
type SseStatus = "connecting" | "connected" | "disconnected";

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
// HERO KPI CARD
// ══════════════════════════════════════════════════════════════════════

function HeroCard({ value, label, sub, color, glow }: {
  value: string | number; label: string; sub?: string; color: string; glow?: boolean;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 130, padding: "18px 20px",
      background: `linear-gradient(135deg, ${G.surface} 0%, ${G.surfaceUp} 100%)`,
      border: `1px solid ${glow ? `${color}40` : G.border}`,
      borderRadius: 14, position: "relative", overflow: "hidden",
    }}>
      {glow && (
        <div style={{
          position: "absolute", top: -20, right: -20, width: 80, height: 80,
          background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
          borderRadius: "50%",
        }} />
      )}
      <div style={{ fontSize: 28, fontWeight: 900, color, letterSpacing: "-1px", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{
        fontSize: 10, fontWeight: 800, color: G.textMid, textTransform: "uppercase",
        letterSpacing: "0.8px", marginTop: 6,
      }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 10, color: G.textDim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// COMPACT PHONE CARD
// ══════════════════════════════════════════════════════════════════════

function PhoneCard({ phone, slotName, maxSent }: {
  phone: ExtensionMonitorPhone; slotName: string; maxSent: number;
}) {
  const active = phone.wa_sent > 0;
  const pct = maxSent > 0 ? (phone.wa_sent / maxSent) * 100 : 0;
  const topOp = [...phone.operators].sort((a, b) => b.wa_sent - a.wa_sent)[0];

  return (
    <div style={{
      padding: "14px 16px", borderRadius: 12,
      background: active
        ? `linear-gradient(135deg, ${G.surface} 0%, rgba(255,200,0,0.04) 100%)`
        : G.surface,
      border: `1px solid ${active ? "rgba(255,200,0,0.18)" : G.border}`,
      transition: "all 0.3s",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {active && (
            <div style={{
              width: 6, height: 6, borderRadius: "50%", background: G.gold,
              boxShadow: `0 0 8px ${G.gold}`, animation: "gobPulse 2.5s ease-in-out infinite",
            }} />
          )}
          <span style={{
            fontSize: 11, fontWeight: 900, color: active ? G.gold : G.textDim,
            letterSpacing: "0.3px",
          }}>
            {slotName}
          </span>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.8px",
          color: active ? G.green : G.textDim,
        }}>
          {active ? "ACTIVO" : "ESPERA"}
        </span>
      </div>

      {/* Sent count + bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: active ? G.gold : G.textDim, lineHeight: 1 }}>
            {phone.wa_sent}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: G.textDim, alignSelf: "flex-end" }}>
            {phone.unique_contacts} contactos
          </span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 2,
            background: active ? `linear-gradient(90deg, ${G.gold}, #FFE066)` : "transparent",
            transition: "width 0.6s ease",
          }} />
        </div>
      </div>

      {/* Operators list */}
      {phone.operators.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {phone.operators.sort((a, b) => b.wa_sent - a.wa_sent).map((op) => {
            const name = op.full_name.split(" ")[0] ?? op.email.split("@")[0];
            return (
              <div key={op.operator_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: G.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "45%" }}>
                  {name}
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: G.gold }}>
                    {op.wa_sent}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: G.cyan }}>
                    {op.unique_phones} ct
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <span style={{ fontSize: 10, fontWeight: 600, color: G.textDim }}>{"\u2014"}</span>
      )}

      {/* Last activity */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,200,0,0.50)" }}>
          {fmtRel(phone.last_event_at)}
        </span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CMS PIPELINE FUNNEL
// ══════════════════════════════════════════════════════════════════════

function PipelineFunnel({ stats }: { stats: CmsStats | null }) {
  if (!stats) return null;

  const steps = [
    { label: "Pendiente", value: stats.pendiente, color: G.textMid, gradient: "linear-gradient(90deg, #7a95aa, #5a7a90)" },
    { label: "Contactado", value: stats.contactado, color: G.blue, gradient: "linear-gradient(90deg, #3b82f6, #60a5fa)" },
    { label: "Respondido", value: stats.respondido, color: G.cyan, gradient: "linear-gradient(90deg, #06b6d4, #22d3ee)" },
    { label: "Invalido", value: stats.invalido, color: G.red, gradient: "linear-gradient(90deg, #ef5350, #f87171)" },
  ];
  const maxVal = steps.reduce((m, s) => Math.max(m, s.value), 1);

  return (
    <div style={{
      background: G.surface, border: `1px solid ${G.border}`, borderRadius: 12,
      padding: "14px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: G.gold, letterSpacing: "0.6px", textTransform: "uppercase" }}>
          Pipeline CMS
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: G.textMid }}>
          {stats.total.toLocaleString()} contactos
        </span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {steps.map(step => {
          const pct = (step.value / maxVal) * 100;
          return (
            <div key={step.label} style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: G.textDim, textTransform: "uppercase" }}>
                  {step.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 900, color: step.color }}>
                  {step.value.toLocaleString()}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${pct}%`, borderRadius: 4,
                  background: step.gradient, opacity: 0.9,
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>
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

  // ── State ───────────────────────────────────────────────────────
  const [phones, setPhones] = useState<ExtensionMonitorPhone[]>([]);
  const [cmsStats, setCmsStats] = useState<CmsStats | null>(null);
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

  // ── Data loaders ───────────────────────────────────────────────
  const loadPhones = useCallback(async () => {
    if (!campaignId) return;
    setPhoneLoading(true);
    setPhoneError(null);
    try {
      const [monitorRes, statsRes] = await Promise.all([
        getExtensionMonitor(campaignId),
        fetch("/api/cms/stats", { credentials: "same-origin", headers: { "x-campaign-id": campaignId } })
          .then(r => r.json()).catch(() => null),
      ]);
      if (!monitorRes.ok) { setPhoneError(monitorRes.error ?? "Error"); return; }
      setPhones(monitorRes.phones ?? []);
      if (statsRes?.ok) {
        setCmsStats({
          pendiente: statsRes.by_status?.pendiente ?? statsRes.by_status?.nuevo ?? 0,
          contactado: statsRes.by_status?.contactado ?? statsRes.by_status?.hablado ?? 0,
          respondido: statsRes.by_status?.respondido ?? statsRes.by_status?.respondieron ?? 0,
          invalido: statsRes.by_status?.invalido ?? statsRes.by_status?.archivado ?? 0,
          total: statsRes.total ?? 0,
        });
      }
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
  const hasMore = events.length < classTotal;
  const isLoading = phoneLoading || classLoading;
  const errorMsg = phoneError || classError;

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
          50%     { opacity:0.4; transform:scale(0.7); }
        }
        * { box-sizing:border-box; }
      `}</style>

      <div style={{
        minHeight: "calc(100vh - 96px)",
        background: `radial-gradient(ellipse 90% 40% at 50% -5%, rgba(22,57,96,0.28) 0%, transparent 65%), ${G.bg}`,
        color: G.text,
      }}>
        {/* ══ Sticky Header Bar ══ */}
        <div style={{
          background: "rgba(9,22,38,0.94)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,200,0,0.14)",
          padding: "0 28px", position: "sticky", top: 48, zIndex: 40,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 48 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: sseStatus === "connected" ? G.green : sseStatus === "connecting" ? G.gold : G.red,
                boxShadow: `0 0 6px ${sseStatus === "connected" ? G.green : sseStatus === "connecting" ? G.gold : G.red}`,
                animation: sseStatus === "connected" ? "gobPulse 2.5s ease-in-out infinite" : "none",
              }} />
              <span style={{
                fontSize: 12, fontWeight: 800,
                color: sseStatus === "connected" ? G.green : sseStatus === "connecting" ? G.gold : G.red,
              }}>
                {sseStatus === "connected" ? "EN VIVO" : sseStatus === "connecting" ? "CONECTANDO..." : "OFFLINE"}
              </span>
              {sseEventCount > 0 && sseStatus === "connected" && (
                <span style={{ fontSize: 10, color: G.textDim, marginLeft: 4 }}>
                  {sseEventCount} eventos RT
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => { loadPhones(); loadEvents(1); loadClassStats(); }}
              disabled={isLoading}
              style={{
                padding: "6px 16px", borderRadius: 8,
                border: `1px solid ${isLoading ? "rgba(255,200,0,0.12)" : G.goldBorder}`,
                background: isLoading ? "transparent" : G.goldFaint,
                color: isLoading ? G.textDim : G.gold,
                fontSize: 12, fontWeight: 800, cursor: isLoading ? "default" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {isLoading ? "\u00B7\u00B7\u00B7" : "\u21BB Actualizar"}
            </button>
          </div>
        </div>

        {/* ══ Error Banner ══ */}
        {errorMsg && (
          <div style={{
            margin: "12px 28px 0", background: "rgba(239,83,80,0.07)",
            border: "1px solid rgba(239,83,80,0.22)", borderRadius: 10,
            padding: "10px 16px", fontSize: 13, color: G.red,
          }}>
            {errorMsg}
          </div>
        )}

        {/* ══ Content ══ */}
        <div style={{ padding: "20px 24px 16px", maxWidth: 1400, margin: "0 auto" }}>

          {/* ── Row 1: Hero KPIs ── */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <HeroCard value={totalSent} label="Mensajes Enviados" color={G.gold} glow />
            <HeroCard
              value={`${activeCount}/6`}
              label="Telefonos Activos"
              color={activeCount >= 4 ? G.green : activeCount >= 2 ? G.orange : G.red}
              glow={activeCount > 0}
            />
            <HeroCard value={classTotal} label="Clasificaciones" color={G.cyan} />
            <HeroCard
              value={`${classStats?.accuracy_rate ?? 0}%`}
              label="Precision IA"
              sub={`${classStats?.corrections_count ?? 0} correcciones`}
              color={(classStats?.accuracy_rate ?? 0) >= 90 ? G.green : (classStats?.accuracy_rate ?? 0) >= 70 ? G.orange : G.red}
            />
            <HeroCard
              value={classStats?.last_hour ?? 0}
              label="Ultima Hora"
              color={G.green}
              glow={(classStats?.last_hour ?? 0) > 0}
            />
          </div>

          {/* ── Row 2: 6 Phone Cards ── */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10,
            marginBottom: 16,
          }}>
            {slots.map(({ slotName, phone }) => (
              <PhoneCard key={slotName} phone={phone} slotName={slotName} maxSent={maxPhoneSent} />
            ))}
          </div>

          {/* ── Row 3: Pipeline Funnel ── */}
          <div style={{ marginBottom: 16 }}>
            <PipelineFunnel stats={cmsStats} />
          </div>

          {/* ── Row 4: Two-column (Charts + Feed) ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

            {/* Left: Classification Metrics (Charts) */}
            <div>
              <div style={{
                fontSize: 12, fontWeight: 900, color: G.gold, letterSpacing: "0.6px",
                textTransform: "uppercase", marginBottom: 12, paddingLeft: 4,
              }}>
                Metricas de Clasificacion
              </div>
              <ClassificationMetrics stats={classStats} />
            </div>

            {/* Right: Live Feed */}
            <div>
              <div style={{
                fontSize: 12, fontWeight: 900, color: G.gold, letterSpacing: "0.6px",
                textTransform: "uppercase", marginBottom: 12, paddingLeft: 4,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                Feed en Vivo
                {sseStatus === "connected" && (
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", background: G.green,
                    boxShadow: `0 0 6px ${G.green}`, display: "inline-block",
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
        </div>
      </div>
    </>
  );
}
