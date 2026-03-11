/**
 * GOBERNA — Validacion WhatsApp Page (iOS style)
 *
 * 3-panel layout: Contact queue | Classification feed (SSE) | Brigadista metrics.
 * Frosted glass headers, SF Pro typography, iOS pill buttons.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { listValidations, getValidationStats, claimValidation, getValidationBrigadistaStats } from "@/lib/services/validacion";
import type { ValidationItem, ValidationStats, ValidationBrigadistaStats } from "@/lib/services/validacion";
import { getClassificationStats, correctClassification, connectClassificationStream } from "@/lib/services/classification";
import type { ClassificationEvent, ClassificationStats, ClassificationSseEvent } from "@/lib/services/classification";
import { WaContactCard, ClassificationFeed, BrigadistaPanel, StatsBar } from "./_components";

const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";

type StatusFilter = "pendiente" | "contactado" | "all";
const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "pendiente", label: "Pendientes" },
  { key: "contactado", label: "Contactados" },
  { key: "all", label: "Todos" },
];

export default function ValidacionWaPage() {
  const params = useParams<{ slug: string }>();
  const { user, campaigns } = useAuth();
  const campaign = campaigns.find((c) => c.slug === params.slug);
  const campaignId = campaign?.id ?? "";
  const userId = user?.id ?? null;

  const [items, setItems] = useState<ValidationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendiente");
  const [selectedItem, setSelectedItem] = useState<ValidationItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [feedEvents, setFeedEvents] = useState<ClassificationEvent[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [vStats, setVStats] = useState<ValidationStats | null>(null);
  const [cStats, setCStats] = useState<ClassificationStats | null>(null);
  const [brigadistas, setBrigadistas] = useState<ValidationBrigadistaStats[]>([]);
  const [brigadistasLoading, setBrigadistasLoading] = useState(true);
  const sseCleanupRef = useRef<(() => void) | null>(null);

  const fetchQueue = useCallback(async (page = 1, append = false) => {
    if (!campaignId) return;
    setLoading(true);
    const status = statusFilter === "all" ? undefined : statusFilter;
    const res = await listValidations(campaignId, status, page, 50);
    if (res.ok && res.data) {
      setItems((prev) => append ? [...prev, ...res.data!.items] : res.data!.items);
      setTotalItems(res.data.total);
      setCurrentPage(page);
    }
    setLoading(false);
  }, [campaignId, statusFilter]);

  const fetchStats = useCallback(async () => {
    if (!campaignId) return;
    const [vRes, cRes, bRes] = await Promise.all([
      getValidationStats(campaignId),
      getClassificationStats(campaignId),
      getValidationBrigadistaStats(campaignId),
    ]);
    if (vRes.ok && vRes.data) setVStats(vRes.data.stats);
    if (cRes.ok && cRes.stats) setCStats(cRes.stats);
    if (bRes.ok && bRes.data) { setBrigadistas(bRes.data.brigadistas); setBrigadistasLoading(false); }
  }, [campaignId]);

  useEffect(() => { fetchQueue(1); }, [fetchQueue]);
  useEffect(() => { fetchStats(); const t = setInterval(fetchStats, 60_000); return () => clearInterval(t); }, [fetchStats]);

  const updateQueueFromSSE = useCallback((ev: ClassificationEvent) => {
    if (!ev.phone) return;
    const phone = ev.phone.replace(/\D/g, "");
    setItems((prev) => prev.map((item) => {
      const p = item.telefono.replace(/\D/g, "");
      if (p === phone || p.endsWith(phone) || phone.endsWith(p)) {
        return { ...item, status: (ev.corrected_status ?? ev.status) as ValidationItem["status"], vote_class: ev.corrected_vote_class ?? ev.vote_class };
      }
      return item;
    }));
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    sseCleanupRef.current?.();
    const cleanup = connectClassificationStream(campaignId, (ev: ClassificationSseEvent) => {
      if (ev.type === "connected") setSseConnected(true);
      else if (ev.type === "classification.new") { setFeedEvents((p) => [ev.event, ...p].slice(0, 200)); updateQueueFromSSE(ev.event); }
      else if (ev.type === "classification.corrected") setFeedEvents((p) => p.map((e) => e.id === ev.event.id ? ev.event : e));
    }, () => setSseConnected(false));
    sseCleanupRef.current = cleanup;
    return () => { cleanup(); sseCleanupRef.current = null; };
  }, [campaignId, updateQueueFromSSE]);

  const handleClaim = useCallback(async (item: ValidationItem) => {
    if (!campaignId) return;
    const res = await claimValidation(item.id, campaignId);
    if (res.ok && res.data) setItems((p) => p.map((i) => i.id === item.id ? res.data!.item : i));
  }, [campaignId]);

  const handleCorrect = useCallback(async (eventId: string, vc: string, st: string) => {
    if (!campaignId) return;
    const res = await correctClassification(campaignId, eventId, vc, st);
    if (res.ok && res.event) setFeedEvents((p) => p.map((e) => e.id === eventId ? res.event! : e));
  }, [campaignId]);

  const handleLoadMore = useCallback(() => { if (items.length < totalItems) fetchQueue(currentPage + 1, true); }, [items.length, totalItems, currentPage, fetchQueue]);

  const filtered = search
    ? items.filter((i) => i.nombre.toLowerCase().includes(search.toLowerCase()) || i.telefono.includes(search) || i.encuestador.toLowerCase().includes(search.toLowerCase()))
    : items;

  if (!campaign) return <div style={{ padding: 48, textAlign: "center", color: "#c7c7cc", fontSize: 15, fontFamily: SF }}>Campana no encontrada</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", overflow: "hidden", fontFamily: SF, background: "#f2f2f7" }}>
      {/* Header — frosted glass */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "0.5px solid rgba(60,60,67,.12)", background: "rgba(249,249,249,.94)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", flexShrink: 0 }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: "#1c1c1e", margin: 0, letterSpacing: "-0.4px" }}>Validacion WA</h1>
        <Link href={`/candidatos/${params.slug}/validacion`} style={{ fontSize: 12, fontWeight: 600, color: "#007aff", textDecoration: "none", padding: "3px 12px", borderRadius: 20, background: "rgba(0,122,255,.08)" }}>
          Kanban
        </Link>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#8e8e93" }}>{campaign.name}</span>
      </div>

      <StatsBar vStats={vStats} cStats={cStats} />

      {/* 3-panel */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* LEFT — Queue */}
        <aside style={{ width: 290, minWidth: 250, borderRight: "0.5px solid rgba(60,60,67,.12)", display: "flex", flexDirection: "column", background: "#fff" }}>
          <div style={{ padding: "8px 12px", borderBottom: "0.5px solid rgba(60,60,67,.12)", flexShrink: 0 }}>
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "none", background: "rgba(120,120,128,.12)", fontSize: 14, outline: "none", color: "#1c1c1e", fontFamily: SF }}
            />
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              {FILTERS.map((f) => (
                <button key={f.key} type="button" onClick={() => setStatusFilter(f.key)} style={{
                  padding: "4px 10px", borderRadius: 20, border: "none",
                  background: statusFilter === f.key ? "#007aff" : "rgba(120,120,128,.12)",
                  color: statusFilter === f.key ? "#fff" : "#8e8e93",
                  fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all .15s",
                }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {loading && items.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "#c7c7cc", fontSize: 13 }}>Cargando...</div>}
            {filtered.map((item) => (
              <WaContactCard key={item.id} item={item} isActive={selectedItem?.id === item.id} onSelect={setSelectedItem} onClaim={handleClaim} userId={userId} />
            ))}
            {items.length < totalItems && (
              <button type="button" onClick={handleLoadMore} style={{ width: "100%", padding: 12, border: "none", background: "transparent", color: "#007aff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cargar mas ({totalItems - items.length})
              </button>
            )}
          </div>
        </aside>

        {/* CENTER — Live feed */}
        <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" }}>
          <ClassificationFeed events={feedEvents} connected={sseConnected} onCorrect={handleCorrect} />
        </section>

        {/* RIGHT — Brigadistas */}
        <aside style={{ width: 250, minWidth: 210, borderLeft: "0.5px solid rgba(60,60,67,.12)", display: "flex", flexDirection: "column", background: "#fff" }}>
          <BrigadistaPanel brigadistas={brigadistas} loading={brigadistasLoading} />
        </aside>
      </div>
    </div>
  );
}
