"use client";

/**
 * GOBERNA — Monitor WA (candidato-scoped)
 *
 * War-room dashboard combining:
 * - 6 phone cards (Vasquez 1-6) in a 3+3 grid
 * - CMS funnel stats bar (pipeline progress)
 * - Live classification feed with inline correction UI
 * - Classification accuracy metrics + category breakdown
 *
 * Integrated in the candidato tab bar — no own header/footer.
 * Auto-refreshes phones every 30s + SSE for classifications.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Iphone } from "@/components/magicui/iphone";
import {
  getExtensionMonitor,
  type ExtensionMonitorPhone,
  type ExtensionMonitorOperator,
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
  gold:       "#FFC800",
  goldDim:    "#CC9F00",
  goldFaint:  "rgba(255,200,0,0.10)",
  goldBorder: "rgba(255,200,0,0.25)",
  navyDark:   "#0e2640",
  bg:         "#060e18",
  surface:    "#0c1a28",
  surfaceUp:  "#0f2035",
  border:     "rgba(255,255,255,0.06)",
  text:       "#e9eef3",
  textMid:    "#7a95aa",
  textDim:    "#334d63",
  green:      "#22c55e",
  red:        "#ef5350",
  blue:       "#3b82f6",
  orange:     "#f59e0b",
  purple:     "#a855f7",
  cyan:       "#06b6d4",
} as const;

// ── Constants ────────────────────────────────────────────────────────
const SLOTS = ["Vasquez 1", "Vasquez 2", "Vasquez 3", "Vasquez 4", "Vasquez 5", "Vasquez 6"];
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif";
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
type Tab = "feed" | "metrics";

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
// PHONE COMPONENTS
// ══════════════════════════════════════════════════════════════════════

function OperatorRow({ op, maxSent }: { op: ExtensionMonitorOperator; maxSent: number }) {
  const pct = maxSent > 0 ? (op.wa_sent / maxSent) * 100 : 0;
  const name = op.full_name.split(" ")[0] ?? op.email.split("@")[0];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: "rgba(255,200,0,0.12)", border: "1.5px solid rgba(255,200,0,0.30)", color: G.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900 }}>
        {(op.full_name[0] ?? "?").toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: G.text, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: "linear-gradient(90deg,#FFC800,#FFE066)", transition: "width 0.6s ease" }} />
        </div>
      </div>
      <span style={{ flexShrink: 0, minWidth: 20, textAlign: "right", fontSize: 14, fontWeight: 900, color: G.gold }}>{op.wa_sent}</span>
    </div>
  );
}

function PhoneScreen({ phone, slotName }: { phone: ExtensionMonitorPhone; slotName: string }) {
  const active = phone.wa_sent > 0;
  const activeOps = [...phone.operators].filter(o => o.wa_sent > 0).sort((a, b) => b.wa_sent - a.wa_sent);
  const maxOp = activeOps[0]?.wa_sent ?? 0;

  return (
    <div style={{ width: "100%", height: "100%", background: active ? "linear-gradient(175deg,#0f1d2f 0%,#091422 60%,#050c15 100%)" : "linear-gradient(175deg,#0a1420 0%,#060d18 60%,#030810 100%)", display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden" }}>
      <div style={{ height: "7%", flexShrink: 0, display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: "0 10% 5px" }}>
        {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: G.gold, boxShadow: `0 0 8px ${G.gold}`, animation: "gobPulse 2.5s ease-in-out infinite" }} />}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "5% 9% 4%", gap: "4%", overflow: "hidden" }}>
        <div style={{ fontSize: "clamp(12px,4.5%,17px)", fontWeight: 900, color: active ? G.gold : G.textDim, letterSpacing: "-0.2px", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{slotName}</div>
        {active ? (
          <>
            <div style={{ display: "flex", gap: "4%" }}>
              {[{ v: phone.wa_sent, l: "Enviados" }, { v: phone.unique_contacts, l: "Contactos" }].map(({ v, l }) => (
                <div key={l} style={{ flex: 1, padding: "10% 0", background: "rgba(255,200,0,0.07)", borderRadius: "12%", border: "1px solid rgba(255,200,0,0.18)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: "clamp(18px,7.5%,30px)", fontWeight: 900, lineHeight: 1, color: G.gold, letterSpacing: "-1px" }}>{v}</span>
                  <span style={{ fontSize: "clamp(8px,2.8%,11px)", fontWeight: 700, color: G.goldDim, marginTop: "12%", letterSpacing: "0.4px" }}>{l}</span>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: "linear-gradient(90deg,transparent,rgba(255,200,0,0.18),transparent)" }} />
            <div style={{ flex: 1, overflow: "hidden" }}>
              {activeOps.slice(0, 6).map(op => <OperatorRow key={op.operator_id} op={op} maxSent={maxOp} />)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "3%", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: "clamp(8px,2.8%,11px)", color: G.textDim }}>Ultimo</span>
              <span style={{ fontSize: "clamp(8px,2.8%,11px)", fontWeight: 700, color: "rgba(255,200,0,0.55)" }}>{fmtRel(phone.last_event_at)}</span>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8%" }}>
            <div style={{ fontSize: "clamp(9px,3.2%,12px)", color: G.textDim, textAlign: "center" }}>En espera</div>
          </div>
        )}
      </div>
      <div style={{ height: "4%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "30%", height: 3, borderRadius: 2, background: active ? "rgba(255,200,0,0.18)" : "rgba(255,255,255,0.06)" }} />
      </div>
    </div>
  );
}

function PhoneCard({ phone, slotName }: { phone: ExtensionMonitorPhone; slotName: string }) {
  const active = phone.wa_sent > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ width: "100%", filter: active ? "drop-shadow(0 0 22px rgba(255,200,0,0.28)) drop-shadow(0 12px 40px rgba(0,0,0,0.8))" : "drop-shadow(0 6px 24px rgba(0,0,0,0.65))", transition: "filter 0.5s ease" }}>
        <Iphone frameColor="#000000" screenColor={active ? "#0f1d2f" : "#0a1420"}>
          <PhoneScreen phone={phone} slotName={slotName} />
        </Iphone>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", color: active ? G.gold : G.textDim }}>{slotName}</div>
        {phone.own_number && (
          <div style={{ marginTop: 3, fontSize: 10, fontWeight: 600, color: G.textMid, fontVariantNumeric: "tabular-nums", letterSpacing: "0.3px" }}>{phone.own_number}</div>
        )}
        <div style={{ marginTop: 3, fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", color: active ? G.green : G.textDim }}>{active ? "ACTIVO" : "EN ESPERA"}</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CMS FUNNEL BAR (compact horizontal)
// ══════════════════════════════════════════════════════════════════════

function FunnelBar({ stats }: { stats: CmsStats | null }) {
  if (!stats) return null;
  const steps = [
    { label: "Pendiente", value: stats.pendiente, color: G.textMid },
    { label: "Contactado", value: stats.contactado, color: G.blue },
    { label: "Respondido", value: stats.respondido, color: G.cyan },
    { label: "Invalido", value: stats.invalido, color: G.red },
  ];
  const maxVal = steps.reduce((m, s) => Math.max(m, s.value), 1);

  return (
    <div style={{ background: G.surface, border: `1px solid ${G.border}`, borderRadius: 10, padding: "10px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: G.gold, letterSpacing: "0.6px", textTransform: "uppercase" }}>Pipeline CMS</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: G.textMid }}>{stats.total.toLocaleString()} contactos</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {steps.map(step => {
          const pct = (step.value / maxVal) * 100;
          return (
            <div key={step.label} style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: G.textDim }}>{step.label}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: step.color }}>{step.value.toLocaleString()}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: step.color, opacity: 0.8, transition: "width 0.5s" }} />
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

  const campaign   = campaigns.find((c) => c.slug === slug);
  const campaignId = campaign?.id ?? null;

  // ── Phone/CMS state ──────────────────────────────────────────────
  const [phones, setPhones]     = useState<ExtensionMonitorPhone[]>([]);
  const [cmsStats, setCmsStats] = useState<CmsStats | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError]     = useState<string | null>(null);
  const [lastPhoneAt, setLastPhoneAt]   = useState<Date | null>(null);

  // ── Classification state ─────────────────────────────────────────
  const [events, setEvents]           = useState<ClassificationEvent[]>([]);
  const [classStats, setClassStats]   = useState<ClassificationStats | null>(null);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError]   = useState<string | null>(null);
  const [classPage, setClassPage]     = useState(1);
  const [classTotal, setClassTotal]   = useState(0);
  const [activeTab, setActiveTab]     = useState<Tab>("feed");
  const [filters, setFilters]         = useState({ source: "", category: "", vote_class: "" });
  const [sseStatus, setSseStatus]     = useState<SseStatus>("connecting");
  const [sseEventCount, setSseEventCount] = useState(0);
  const [lastClassAt, setLastClassAt] = useState<Date | null>(null);
  const statsStaleRef = useRef(false);

  // ── Load phones + CMS stats ──────────────────────────────────────
  const loadPhones = useCallback(async () => {
    if (!campaignId) return;
    setPhoneLoading(true);
    setPhoneError(null);
    try {
      const [monitorRes, statsRes] = await Promise.all([
        getExtensionMonitor(campaignId),
        fetch("/api/cms/stats", { credentials: "same-origin", headers: { "x-campaign-id": campaignId } }).then(r => r.json()).catch(() => null),
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
      setLastPhoneAt(new Date());
    } finally {
      setPhoneLoading(false);
    }
  }, [campaignId]);

  // ── Load classification events ───────────────────────────────────
  const loadEvents = useCallback(async (pageNum = 1, append = false) => {
    if (!campaignId) return;
    setClassLoading(true);
    setClassError(null);
    const res = await getClassificationEvents(campaignId, {
      page: pageNum,
      limit: CLASS_PAGE_SIZE,
      source: filters.source || undefined,
      category: filters.category || undefined,
      vote_class: filters.vote_class || undefined,
    });
    setClassLoading(false);
    if (!res.ok) { setClassError(res.error ?? "Error cargando eventos"); return; }
    if (append) {
      setEvents(prev => [...prev, ...(res.items ?? [])]);
    } else {
      setEvents(res.items ?? []);
    }
    setClassTotal(res.total ?? 0);
    setClassPage(pageNum);
    setLastClassAt(new Date());
  }, [campaignId, filters]);

  // ── Load classification stats ────────────────────────────────────
  const loadClassStats = useCallback(async () => {
    if (!campaignId) return;
    const res = await getClassificationStats(campaignId);
    if (res.ok && res.stats) {
      setClassStats(res.stats);
      statsStaleRef.current = false;
    }
  }, [campaignId]);

  // ── SSE handler ──────────────────────────────────────────────────
  const handleSseEvent = useCallback((ev: ClassificationSseEvent) => {
    if (ev.type === "connected") { setSseStatus("connected"); return; }
    if (ev.type === "heartbeat") return;

    if (ev.type === "classification.new") {
      setSseEventCount(c => c + 1);
      setLastClassAt(new Date());
      setEvents(prev => {
        if (prev.some(e => e.id === ev.event.id)) return prev;
        return [ev.event, ...prev].slice(0, CLASS_PAGE_SIZE + 20);
      });
      setClassTotal(t => t + 1);
      statsStaleRef.current = true;
    }

    if (ev.type === "classification.corrected") {
      setSseEventCount(c => c + 1);
      setLastClassAt(new Date());
      setEvents(prev => prev.map(e => e.id === ev.event.id ? { ...e, ...ev.event } : e));
      statsStaleRef.current = true;
    }
  }, []);

  // ── SSE connection ───────────────────────────────────────────────
  useEffect(() => {
    if (!campaignId) return;
    setSseStatus("connecting");
    const cleanup = connectClassificationStream(
      campaignId,
      handleSseEvent,
      () => setSseStatus("disconnected"),
    );
    return cleanup;
  }, [campaignId, handleSseEvent]);

  // ── Initial load ─────────────────────────────────────────────────
  useEffect(() => { loadPhones(); loadEvents(1); loadClassStats(); }, [loadPhones, loadEvents, loadClassStats]);

  // ── Phone/CMS auto-refresh ───────────────────────────────────────
  useEffect(() => { const id = setInterval(loadPhones, POLL_PHONES_MS); return () => clearInterval(id); }, [loadPhones]);

  // ── Classification auto-refresh (slower when SSE connected) ──────
  useEffect(() => {
    const interval = sseStatus === "connected" ? POLL_SSE_MS : POLL_FALLBACK_MS;
    const id = setInterval(() => {
      if (sseStatus !== "connected") loadEvents(1);
      if (statsStaleRef.current || sseStatus !== "connected") loadClassStats();
    }, interval);
    return () => clearInterval(id);
  }, [sseStatus, loadEvents, loadClassStats]);

  // ── Handlers ─────────────────────────────────────────────────────
  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleLoadMore = useCallback(() => { loadEvents(classPage + 1, true); }, [loadEvents, classPage]);

  const handleEventUpdate = useCallback((updated: ClassificationEvent) => {
    setEvents(prev => prev.map(ev => ev.id === updated.id ? { ...ev, ...updated } : ev));
  }, []);

  const hasMore = events.length < classTotal;

  // ── Phone slot computation ───────────────────────────────────────
  const slots = SLOTS.map(slotName => {
    const match = phones.find(p => norm(p.alias ?? "") === norm(slotName));
    return { slotName, phone: match ?? { ...EMPTY_PHONE, alias: slotName } };
  });
  const activeCount = slots.filter(s => s.phone.wa_sent > 0).length;
  const totalSent   = slots.reduce((sum, s) => sum + s.phone.wa_sent, 0);

  const lastAt = lastPhoneAt && lastClassAt
    ? (lastClassAt > lastPhoneAt ? lastClassAt : lastPhoneAt)
    : lastPhoneAt ?? lastClassAt;

  // ── No campaign yet ──
  if (!campaignId) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: G.bg, color: G.textDim, fontFamily: FONT, fontSize: 14 }}>
        Cargando campana...
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes gobPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.4; transform:scale(0.7); }
        }
        * { box-sizing:border-box; }
      `}</style>

      <div style={{
        minHeight: "calc(100vh - 96px)",
        background: `radial-gradient(ellipse 90% 40% at 50% -5%, rgba(22,57,96,0.28) 0%, transparent 65%), ${G.bg}`,
        color: G.text, fontFamily: FONT,
      }}>

        {/* ── Sub-header ── */}
        <div style={{
          background: "rgba(9,22,38,0.94)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,200,0,0.14)", padding: "0 28px",
          position: "sticky", top: 48, zIndex: 40,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, gap: 16 }}>
            {/* Left: stats */}
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: G.gold, letterSpacing: "-0.5px", lineHeight: 1 }}>{totalSent}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: G.goldDim, textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 2 }}>Enviados</div>
              </div>
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.07)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: G.text, letterSpacing: "-0.5px", lineHeight: 1 }}>{activeCount}<span style={{ fontSize: 13, color: G.textMid, fontWeight: 600 }}>/6</span></div>
                <div style={{ fontSize: 10, fontWeight: 700, color: G.textMid, textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 2 }}>Activos</div>
              </div>
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.07)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: G.gold, letterSpacing: "-0.5px", lineHeight: 1 }}>{classTotal}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: G.goldDim, textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 2 }}>Clasificaciones</div>
              </div>
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.07)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: sseStatus === "connected" ? G.green : sseStatus === "connecting" ? G.gold : G.red,
                  boxShadow: `0 0 6px ${sseStatus === "connected" ? G.green : sseStatus === "connecting" ? G.gold : G.red}`,
                  animation: sseStatus === "connected" ? "gobPulse 2.5s ease-in-out infinite" : "none",
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: sseStatus === "connected" ? G.green : sseStatus === "connecting" ? G.gold : G.red }}>
                  {sseStatus === "connected" ? "EN VIVO" : sseStatus === "connecting" ? "CONECTANDO" : "OFFLINE"}
                </span>
                {sseEventCount > 0 && sseStatus === "connected" && (
                  <span style={{ fontSize: 9, color: G.textMid }}>({sseEventCount} RT)</span>
                )}
              </div>
            </div>

            {/* Right: tabs + refresh */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {(["feed", "metrics"] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "5px 14px", borderRadius: 7,
                    border: `1px solid ${activeTab === tab ? G.goldBorder : G.border}`,
                    background: activeTab === tab ? G.goldFaint : "transparent",
                    color: activeTab === tab ? G.gold : G.textMid,
                    fontSize: 11, fontWeight: 800, cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {tab === "feed" ? "Feed" : "Metricas"}
                </button>
              ))}
              {lastAt && (
                <span style={{ fontSize: 11, color: G.textDim, fontVariantNumeric: "tabular-nums" }}>
                  {lastAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              <button
                type="button"
                onClick={() => { loadPhones(); loadEvents(1); loadClassStats(); }}
                disabled={phoneLoading || classLoading}
                style={{
                  padding: "6px 14px", borderRadius: 7,
                  border: `1px solid ${(phoneLoading || classLoading) ? "rgba(255,200,0,0.12)" : G.goldBorder}`,
                  background: (phoneLoading || classLoading) ? "transparent" : G.goldFaint,
                  color: (phoneLoading || classLoading) ? G.textDim : G.gold,
                  fontSize: 12, cursor: (phoneLoading || classLoading) ? "default" : "pointer",
                  fontWeight: 800, transition: "all 0.2s",
                }}
              >
                {(phoneLoading || classLoading) ? "\u00B7\u00B7\u00B7" : "\u21BB Actualizar"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Error ── */}
        {(phoneError || classError) && (
          <div style={{ margin: "16px 28px 0", background: "rgba(239,83,80,0.07)", border: "1px solid rgba(239,83,80,0.22)", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: G.red }}>
            {phoneError || classError}
          </div>
        )}

        {/* ── Content ── */}
        <div style={{ padding: "28px 24px 16px", maxWidth: 1200, margin: "0 auto" }}>

          {/* Row 1: 6 phones (3+3) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px 20px", alignItems: "start", marginBottom: 24 }}>
            {slots.map(({ slotName, phone }) => (
              <PhoneCard key={slotName} phone={phone} slotName={slotName} />
            ))}
          </div>

          {/* Row 2: CMS funnel + classification dashboard */}
          <FunnelBar stats={cmsStats} />

          {activeTab === "metrics" && (
            <ClassificationMetrics stats={classStats} />
          )}
          {activeTab === "feed" && campaignId && (
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
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ borderTop: `1px solid ${G.border}`, padding: "12px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: G.textDim, fontWeight: 600 }}>
            Monitor WA \u00B7 Phones {POLL_PHONES_MS / 1000}s \u00B7 SSE {sseStatus === "connected" ? "activo" : "inactivo"} \u00B7 Poll {sseStatus === "connected" ? POLL_SSE_MS / 1000 : POLL_FALLBACK_MS / 1000}s
          </span>
          <span style={{ fontSize: 11, color: G.textDim }}>
            {lastAt ? `Actualizado: ${lastAt.toLocaleTimeString("es-PE")}` : "\u2014"}
          </span>
        </div>
      </div>
    </>
  );
}
