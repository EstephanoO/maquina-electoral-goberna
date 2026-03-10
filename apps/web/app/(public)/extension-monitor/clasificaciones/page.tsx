"use client";

/**
 * GOBERNA — Classification Monitor Dashboard
 *
 * War-room view for monitoring real-time message classifications
 * from the WhatsApp extension. Features:
 * - Real-time event feed (auto-refresh every 15s)
 * - Inline correction UI (fix misclassifications)
 * - Aggregated accuracy metrics + category breakdown
 * - Filter by source, category, vote class
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  getClassificationEvents,
  getClassificationStats,
  connectClassificationStream,
  type ClassificationEvent,
  type ClassificationStats,
  type ClassificationSseEvent,
} from "@/lib/services/classification";
import { ClassificationMetrics, ClassificationFeed } from "./_components";

// ── Config ─────────────────────────────────────────────────────────
const CAMPAIGN_ID = "eece49d5-a315-4764-83f9-681cabae5c51";
const POLL_INTERVAL_SSE_MS = 60_000;    // slow poll when SSE is connected
const POLL_INTERVAL_FALLBACK_MS = 15_000; // fast poll when SSE is down
const PAGE_SIZE = 30;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif";

// ── Palette ────────────────────────────────────────────────────────
const G = {
  gold: "#FFC800",
  goldDim: "#CC9F00",
  goldFaint: "rgba(255,200,0,0.10)",
  goldBorder: "rgba(255,200,0,0.25)",
  navyDark: "#0e2640",
  bg: "#060e18",
  surface: "#0c1a28",
  border: "rgba(255,255,255,0.06)",
  text: "#e9eef3",
  textMid: "#7a95aa",
  textDim: "#334d63",
  green: "#22c55e",
  red: "#ef5350",
} as const;

// ── Tab type ───────────────────────────────────────────────────────
type Tab = "feed" | "metrics";

// ── SSE connection status ──────────────────────────────────────────
type SseStatus = "connecting" | "connected" | "disconnected";

export default function ClasificacionesPage() {
  const [events, setEvents] = useState<ClassificationEvent[]>([]);
  const [stats, setStats] = useState<ClassificationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [filters, setFilters] = useState({ source: "", category: "", vote_class: "" });
  const [sseStatus, setSseStatus] = useState<SseStatus>("connecting");
  const [sseEventCount, setSseEventCount] = useState(0);
  const statsStaleRef = useRef(false);

  // ── Load events ────────────────────────────────────────────────
  const loadEvents = useCallback(async (pageNum = 1, append = false) => {
    setLoading(true);
    setError(null);
    const res = await getClassificationEvents(CAMPAIGN_ID, {
      page: pageNum,
      limit: PAGE_SIZE,
      source: filters.source || undefined,
      category: filters.category || undefined,
      vote_class: filters.vote_class || undefined,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Error cargando eventos");
      return;
    }
    if (append) {
      setEvents(prev => [...prev, ...(res.items ?? [])]);
    } else {
      setEvents(res.items ?? []);
    }
    setTotal(res.total ?? 0);
    setPage(pageNum);
    setLastRefresh(new Date());
  }, [filters]);

  // ── Load stats ─────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    const res = await getClassificationStats(CAMPAIGN_ID);
    if (res.ok && res.stats) {
      setStats(res.stats);
      statsStaleRef.current = false;
    }
  }, []);

  // ── SSE handler ────────────────────────────────────────────────
  const handleSseEvent = useCallback((ev: ClassificationSseEvent) => {
    if (ev.type === "connected") {
      setSseStatus("connected");
      return;
    }
    if (ev.type === "heartbeat") return;

    if (ev.type === "classification.new") {
      setSseEventCount(c => c + 1);
      setLastRefresh(new Date());
      // Only prepend if we're on page 1 with no filters
      setEvents(prev => {
        // Avoid duplicates
        if (prev.some(e => e.id === ev.event.id)) return prev;
        return [ev.event, ...prev].slice(0, PAGE_SIZE + 20); // keep buffer
      });
      setTotal(t => t + 1);
      // Mark stats as stale (will refresh on next poll)
      statsStaleRef.current = true;
    }

    if (ev.type === "classification.corrected") {
      setSseEventCount(c => c + 1);
      setLastRefresh(new Date());
      setEvents(prev => prev.map(e =>
        e.id === ev.event.id ? { ...e, ...ev.event } : e,
      ));
      statsStaleRef.current = true;
    }
  }, []);

  // ── SSE connection ─────────────────────────────────────────────
  useEffect(() => {
    setSseStatus("connecting");
    const cleanup = connectClassificationStream(
      CAMPAIGN_ID,
      handleSseEvent,
      () => setSseStatus("disconnected"),
    );
    return cleanup;
  }, [handleSseEvent]);

  // ── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    loadEvents(1);
    loadStats();
  }, [loadEvents, loadStats]);

  // ── Auto-refresh (slower when SSE connected) ──────────────────
  useEffect(() => {
    const interval = sseStatus === "connected"
      ? POLL_INTERVAL_SSE_MS
      : POLL_INTERVAL_FALLBACK_MS;
    const id = setInterval(() => {
      // Only do full reload if SSE is down OR stats are stale
      if (sseStatus !== "connected") {
        loadEvents(1);
      }
      // Always refresh stats periodically (SSE doesn't carry stats)
      if (statsStaleRef.current || sseStatus !== "connected") {
        loadStats();
      }
    }, interval);
    return () => clearInterval(id);
  }, [sseStatus, loadEvents, loadStats]);

  // ── Filter change resets to page 1 ────────────────────────────
  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Load more ──────────────────────────────────────────────────
  const handleLoadMore = useCallback(() => {
    loadEvents(page + 1, true);
  }, [loadEvents, page]);

  // ── Event update (after correction) ───────────────────────────
  const handleEventUpdate = useCallback((updated: ClassificationEvent) => {
    setEvents(prev => prev.map(ev =>
      ev.id === updated.id ? { ...ev, ...updated } : ev,
    ));
  }, []);

  const hasMore = events.length < total;

  return (
    <>
      <style>{`
        @keyframes gobPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.4; transform:scale(0.7); }
        }
        * { box-sizing:border-box; margin:0; padding:0; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: `radial-gradient(ellipse 90% 40% at 50% -5%, rgba(22,57,96,0.28) 0%, transparent 65%), ${G.bg}`,
        color: G.text, fontFamily: FONT,
      }}>

        {/* ── Header ── */}
        <div style={{
          background: "rgba(9,22,38,0.94)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,200,0,0.14)",
          padding: "0 28px",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            height: 56, gap: 16,
          }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: G.gold,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 900, color: G.navyDark,
                boxShadow: "0 0 16px rgba(255,200,0,0.20)",
              }}>
                G
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: G.gold, letterSpacing: "3px" }}>
                  GOBERNA
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,200,0,0.38)", fontWeight: 600, marginTop: 1 }}>
                  Monitor de Clasificaciones WA
                </div>
              </div>
            </div>

            {/* Center: totals + live indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: G.gold, letterSpacing: "-0.5px", lineHeight: 1 }}>
                  {total}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: G.goldDim, textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 2 }}>
                  Eventos
                </div>
              </div>
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.07)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: G.text, letterSpacing: "-0.5px", lineHeight: 1 }}>
                  {stats?.accuracy_rate ?? "---"}<span style={{ fontSize: 14, color: G.textMid, fontWeight: 600 }}>%</span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: G.textMid, textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 2 }}>
                  Precision
                </div>
              </div>
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.07)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: sseStatus === "connected" ? G.green
                    : sseStatus === "connecting" ? G.gold
                    : G.red,
                  boxShadow: `0 0 6px ${sseStatus === "connected" ? G.green : sseStatus === "connecting" ? G.gold : G.red}`,
                  animation: sseStatus === "connected" ? "gobPulse 2.5s ease-in-out infinite" : "none",
                }} />
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: sseStatus === "connected" ? G.green
                    : sseStatus === "connecting" ? G.gold
                    : G.red,
                }}>
                  {sseStatus === "connected" ? "EN VIVO"
                    : sseStatus === "connecting" ? "CONECTANDO..."
                    : "DESCONECTADO"}
                </span>
                {sseEventCount > 0 && sseStatus === "connected" && (
                  <span style={{ fontSize: 10, color: G.textMid, fontVariantNumeric: "tabular-nums" }}>
                    ({sseEventCount} RT)
                  </span>
                )}
              </div>
            </div>

            {/* Right: tabs + refresh */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Tabs */}
              {(["feed", "metrics"] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "6px 14px", borderRadius: 7,
                    border: `1px solid ${activeTab === tab ? G.goldBorder : G.border}`,
                    background: activeTab === tab ? G.goldFaint : "transparent",
                    color: activeTab === tab ? G.gold : G.textMid,
                    fontSize: 12, fontWeight: 800, cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {tab === "feed" ? "Feed" : "Metricas"}
                </button>
              ))}

              {lastRefresh && (
                <span style={{ fontSize: 11, color: G.textDim, fontVariantNumeric: "tabular-nums" }}>
                  {lastRefresh.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              <button
                type="button"
                onClick={() => { loadEvents(1); loadStats(); }}
                disabled={loading}
                style={{
                  padding: "6px 14px", borderRadius: 7,
                  border: `1px solid ${loading ? "rgba(255,200,0,0.12)" : G.goldBorder}`,
                  background: loading ? "transparent" : G.goldFaint,
                  color: loading ? G.textDim : G.gold,
                  fontSize: 12, cursor: loading ? "default" : "pointer",
                  fontWeight: 800, transition: "all 0.2s",
                }}
              >
                {loading ? "..." : "Actualizar"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{
            margin: "16px 28px 0",
            background: "rgba(239,83,80,0.07)", border: "1px solid rgba(239,83,80,0.22)",
            borderRadius: 10, padding: "10px 16px",
            fontSize: 13, color: "#ef5350",
          }}>
            {error}
          </div>
        )}

        {/* ── Content ── */}
        <div style={{
          padding: "20px 28px 48px",
          maxWidth: 1200,
          margin: "0 auto",
        }}>
          {activeTab === "metrics" && (
            <ClassificationMetrics stats={stats} />
          )}
          {activeTab === "feed" && (
            <ClassificationFeed
              events={events}
              campaignId={CAMPAIGN_ID}
              loading={loading}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              onEventUpdate={handleEventUpdate}
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          borderTop: `1px solid ${G.border}`,
          padding: "12px 28px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: G.textDim, fontWeight: 600 }}>
            GOBERNA -- Monitor de Clasificaciones WA -- SSE {sseStatus === "connected" ? "activo" : "inactivo"} -- Poll {sseStatus === "connected" ? POLL_INTERVAL_SSE_MS / 1000 : POLL_INTERVAL_FALLBACK_MS / 1000}s
          </span>
          <span style={{ fontSize: 11, color: G.textDim }}>
            {lastRefresh ? `Actualizado: ${lastRefresh.toLocaleTimeString("es-PE")}` : "---"}
          </span>
        </div>
      </div>
    </>
  );
}
