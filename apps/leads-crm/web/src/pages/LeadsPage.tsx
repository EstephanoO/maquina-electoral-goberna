import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Lead } from "../types";
import { cn, formatMoney, TIER_CONFIG, STAGE_CONFIG } from "../lib/utils";
import {
  Search, Filter, ChevronLeft, ChevronRight, Users, DollarSign, Crown,
  Repeat, UserCheck, UserX, LayoutGrid, List, Table2, Phone, MapPin,
} from "lucide-react";

const PAGE_SIZE = 50;
const PIPELINE_PER_STAGE = 30;

type ViewMode = "pipeline" | "list" | "table";
type Stats = { total: number; revenue: number; vips: number; repeats: number; buyers: number; noname: number; byCountry: Record<string, number> };

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; headerBg: string }> = {
  // Venta
  new:        { bg: "bg-indigo-50/60", border: "border-indigo-200", text: "text-indigo-700", dot: "bg-indigo-500", headerBg: "bg-indigo-100" },
  contacted:  { bg: "bg-blue-50/60",   border: "border-blue-200",   text: "text-blue-700",   dot: "bg-blue-500",   headerBg: "bg-blue-100" },
  interested: { bg: "bg-[#FAF6EB]/60",  border: "border-amber-200",  text: "text-[#1B365D]",  dot: "bg-[#C8A951]",  headerBg: "bg-[#F5ECD5]" },
  sold:       { bg: "bg-green-50/60",  border: "border-green-200",  text: "text-green-700",  dot: "bg-green-500",  headerBg: "bg-green-100" },
  // Post-venta
  delivered:  { bg: "bg-teal-50/60",   border: "border-teal-200",   text: "text-teal-700",   dot: "bg-teal-500",   headerBg: "bg-teal-100" },
  follow_up:  { bg: "bg-cyan-50/60",   border: "border-cyan-200",   text: "text-cyan-700",   dot: "bg-cyan-500",   headerBg: "bg-cyan-100" },
  recontact:  { bg: "bg-violet-50/60", border: "border-violet-200", text: "text-violet-700", dot: "bg-violet-500", headerBg: "bg-violet-100" },
  resold:     { bg: "bg-emerald-50/60",border: "border-emerald-200",text: "text-emerald-700",dot: "bg-emerald-500",headerBg: "bg-emerald-100" },
  // Salida
  lost:       { bg: "bg-red-50/60",    border: "border-red-200",    text: "text-red-700",    dot: "bg-red-500",    headerBg: "bg-red-100" },
};

export default function LeadsPage({ onOpenLead }: { onOpenLead: (id: number) => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [country, setCountry] = useState("");
  const [stage, setStage] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("pipeline");
  const [stats, setStats] = useState<Stats>({ total: 0, revenue: 0, vips: 0, repeats: 0, buyers: 0, noname: 0, byCountry: {} });

  // Fetch stats
  useEffect(() => {
    const t = setTimeout(() => {
      api.leadsCount({ q: q || undefined, stage: stage || undefined, country: country || undefined, year: year || undefined }).then(setStats).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q, stage, country, year]);

  // Fetch leads for list/table views (paginated)
  const fetchLeads = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        q: q || undefined,
        stage: stage || undefined,
        country: country || undefined,
        year: year || undefined,
        buyer_tier: tier === "vip" ? "vip" : tier === "repeat" ? "repeat" : undefined,
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
      };
      if (tier === "buyers" || tier === "noname") {
        params.limit = 200;
        params.offset = 0;
        delete params.buyer_tier;
      }
      const data = await api.listLeads(params);
      setLeads(data);
    } catch {}
    setLoading(false);
  }, [q, stage, tier, country, year]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [q, stage, tier, country, year]);

  // Fetch leads for list/table views
  useEffect(() => {
    if (viewMode === "pipeline") return;
    const t = setTimeout(() => fetchLeads(page), 300);
    return () => clearTimeout(t);
  }, [page, viewMode, fetchLeads]);

  // Client-side filters (only for tier subtypes not handled server-side)
  const applyFilters = (list: Lead[]) => list.filter((l) => {
    if (tier === "buyers" && (l.n_purchases || 0) === 0) return false;
    if (tier === "noname" && l.name && l.name !== "Sin nombre") return false;
    return true;
  });

  const displayLeads = applyFilters(leads);
  const totalFiltered = tier === "vip" ? stats.vips : tier === "repeat" ? stats.repeats : tier === "buyers" ? stats.buyers : tier === "noname" ? stats.noname : stats.total;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const countryList = Object.entries(stats.byCountry).sort((a, b) => b[1] - a[1]);

  const chips = [
    { key: "", label: "Todos", icon: Users, count: stats.total },
    { key: "vip", label: "VIP", icon: Crown, count: stats.vips },
    { key: "repeat", label: "Repeat", icon: Repeat, count: stats.repeats },
    { key: "buyers", label: "Compraron", icon: UserCheck, count: stats.buyers },
    { key: "noname", label: "Sin nombre", icon: UserX, count: stats.noname },
  ];

  const viewModes: { key: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
    { key: "pipeline", icon: LayoutGrid, label: "Pipeline" },
    { key: "list", icon: List, label: "Lista" },
    { key: "table", icon: Table2, label: "Tabla" },
  ];

  return (
    <div className={cn("p-6 mx-auto space-y-5", viewMode === "pipeline" ? "max-w-full" : "max-w-7xl")}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">{stats.total.toLocaleString()} contactos · {formatMoney(stats.revenue)} revenue</p>
        </div>
        {/* View mode toggle */}
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1">
          {viewModes.map((v) => (
            <button key={v.key} onClick={() => setViewMode(v.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                viewMode === v.key ? "bg-[#C8A951] text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"
              )}>
              <v.icon className="w-3.5 h-3.5" />
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {chips.map((c) => (
          <button key={c.key} onClick={() => setTier(tier === c.key ? "" : c.key)}
            className={cn(
              "flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left",
              tier === c.key ? "border-[#C8A951] bg-[#FAF6EB]/50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
            )}>
            <c.icon className={cn("w-5 h-5", tier === c.key ? "text-[#B8942F]" : "text-slate-400")} />
            <div>
              <div className="text-lg font-bold text-slate-900">{c.count.toLocaleString()}</div>
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{c.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Revenue bar */}
      <div className="flex items-center gap-6 px-4 py-3 bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <DollarSign className="w-4 h-4 text-green-600" />
          <span className="text-xl font-bold text-green-600">{formatMoney(stats.revenue)}</span>
          <span className="text-xs text-slate-400">revenue total</span>
        </div>
        <div className="h-6 w-px bg-slate-200 shrink-0" />
        {countryList.slice(0, 6).map(([c, n]) => (
          <button key={c} onClick={() => setCountry(country === c ? "" : c)}
            className={cn("text-xs font-semibold px-2 py-1 rounded-md transition-all shrink-0",
              country === c ? "bg-[#F5ECD5] text-[#1B365D]" : "text-slate-500 hover:bg-slate-100")}>
            {c} ({n.toLocaleString()})
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C8A951]/20 focus:border-[#C8A951]"
            placeholder="Buscar nombre, teléfono, email, país..." />
        </div>
        {viewMode !== "pipeline" && (
          <select value={stage} onChange={(e) => setStage(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C8A951]/20">
            <option value="">Todas las etapas</option>
            {Object.entries(STAGE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        )}
        <select value={year} onChange={(e) => setYear(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C8A951]/20">
          <option value="">Todos los años</option>
          {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {(tier || country || q || stage || year) && (
          <button onClick={() => { setTier(""); setCountry(""); setQ(""); setStage(""); setYear(""); }}
            className="px-3 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50">
            <Filter className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content area */}
      {viewMode === "pipeline" ? (
        <PipelineView filters={{ q, country, tier, year }} stats={stats} onOpenLead={onOpenLead} />
      ) : loading ? (
        <ListSkeleton />
      ) : (
        <>
          {false && null /* pipeline handled above */}
          {viewMode === "list" && (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{totalFiltered.toLocaleString()} resultados{page > 0 && ` · Página ${page + 1} de ${totalPages}`}</span>
                <Paginator page={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
              <div className="space-y-2">
                {displayLeads.length === 0 ? <Empty /> : displayLeads.map((l) => <LeadRow key={l.id} lead={l} onClick={() => onOpenLead(l.id)} />)}
              </div>
              <BottomPaginator page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
          {viewMode === "table" && (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{totalFiltered.toLocaleString()} resultados{page > 0 && ` · Página ${page + 1} de ${totalPages}`}</span>
                <Paginator page={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
              <TableView leads={displayLeads} onOpenLead={onOpenLead} />
              <BottomPaginator page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ===== PIPELINE / KANBAN VIEW ===== */
type PipelineFilters = { q: string; country: string; tier: string; year: string };

function PipelineView({ filters, stats, onOpenLead }: { filters: PipelineFilters; stats: Stats; onOpenLead: (id: number) => void }) {
  const stages = Object.entries(STAGE_CONFIG);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 500 }}>
      {stages.map(([key, cfg]) => (
        <PipelineColumn key={key} stageKey={key} stageLabel={cfg.label} filters={filters} onOpenLead={onOpenLead} />
      ))}
    </div>
  );
}

function PipelineColumn({ stageKey, stageLabel, filters, onOpenLead }: {
  stageKey: string; stageLabel: string; filters: PipelineFilters; onOpenLead: (id: number) => void;
}) {
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sc = STAGE_COLORS[stageKey] || STAGE_COLORS.new;

  const buildParams = useCallback((offset: number, limit: number): Record<string, string | number | undefined> => {
    const params: Record<string, string | number | undefined> = {
      q: filters.q || undefined,
      stage: stageKey,
      country: filters.country || undefined,
      year: filters.year || undefined,
      buyer_tier: filters.tier === "vip" ? "vip" : filters.tier === "repeat" ? "repeat" : undefined,
      limit,
      offset,
    };
    if (filters.tier === "buyers" || filters.tier === "noname") {
      delete params.buyer_tier;
    }
    return params;
  }, [stageKey, filters]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    setItems([]);
    const t = setTimeout(async () => {
      try {
        const [data, countData] = await Promise.all([
          api.listLeads(buildParams(0, PIPELINE_PER_STAGE)),
          api.leadsCount({ q: filters.q || undefined, stage: stageKey, country: filters.country || undefined, year: filters.year || undefined }),
        ]);
        let filtered = data;
        if (filters.tier === "buyers") filtered = data.filter((l) => (l.n_purchases || 0) > 0);
        if (filters.tier === "noname") filtered = data.filter((l) => !l.name || l.name === "Sin nombre");
        setItems(filtered);
        const t = filters.tier === "buyers" ? countData.buyers : filters.tier === "noname" ? countData.noname : countData.total;
        setTotal(t);
      } catch {}
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [buildParams, filters.q, filters.country, filters.tier, filters.year, stageKey]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await api.listLeads(buildParams(items.length, PIPELINE_PER_STAGE));
      let filtered = data;
      if (filters.tier === "buyers") filtered = data.filter((l) => (l.n_purchases || 0) > 0);
      if (filters.tier === "noname") filtered = data.filter((l) => !l.name || l.name === "Sin nombre");
      setItems((prev) => [...prev, ...filtered]);
    } catch {}
    setLoadingMore(false);
  }

  const stageRevenue = items.reduce((s, l) => s + (l.total_usd_spent || 0), 0);
  const hasMore = items.length < total;

  return (
    <div className={cn("flex flex-col rounded-2xl border shrink-0 w-72", sc.border, sc.bg)}>
      {/* Column header */}
      <div className={cn("px-4 py-3 rounded-t-2xl", sc.headerBg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("w-2.5 h-2.5 rounded-full", sc.dot)} />
            <span className={cn("text-sm font-bold", sc.text)}>{stageLabel}</span>
          </div>
          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", sc.headerBg, sc.text)}>
            {total.toLocaleString()}
          </span>
        </div>
        {stageRevenue > 0 && (
          <div className="text-[11px] font-semibold text-slate-500 mt-1">{formatMoney(stageRevenue)}</div>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[60vh]">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">Sin leads</div>
        ) : (
          <>
            {items.map((l) => <PipelineCard key={l.id} lead={l} onClick={() => onOpenLead(l.id)} />)}
            {hasMore && (
              <button onClick={loadMore} disabled={loadingMore}
                className="w-full py-2.5 text-xs font-semibold text-slate-500 bg-white/80 rounded-xl border border-dashed border-slate-300 hover:border-[#C8A951] hover:text-[#B8942F] transition-all disabled:opacity-50">
                {loadingMore ? "Cargando..." : `Cargar más (${(total - items.length).toLocaleString()} restantes)`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Column footer */}
      <div className={cn("px-4 py-2 border-t text-[10px] text-slate-400 font-medium", sc.border)}>
        {items.length} de {total.toLocaleString()} lead{total !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function PipelineCard({ lead: l, onClick }: { lead: Lead; onClick: () => void }) {
  const isPending = !l.name || l.name === "Sin nombre";
  const hasPurchases = (l.n_purchases || 0) > 0;
  const tierCfg = l.buyer_tier ? TIER_CONFIG[l.buyer_tier as keyof typeof TIER_CONFIG] : null;

  return (
    <div onClick={onClick}
      className={cn(
        "bg-white rounded-xl p-3 border border-slate-200 cursor-pointer transition-all hover:shadow-md hover:border-amber-300 group",
        l.buyer_tier === "vip" && "ring-1 ring-amber-300",
      )}>
      {/* Top row: name + tier */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0",
            l.buyer_tier === "vip" ? "bg-gradient-to-br from-[#C8A951] to-orange-500" :
            hasPurchases ? "bg-gradient-to-br from-green-400 to-emerald-600" :
            "bg-gradient-to-br from-slate-300 to-slate-400"
          )}>
            {(isPending ? "?" : l.name.charAt(0)).toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-slate-800 truncate group-hover:text-[#1B365D] transition-colors">
            {isPending ? (l.phone || "Sin datos") : l.name}
          </span>
        </div>
        {tierCfg && <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0", tierCfg.color)}>{tierCfg.label}</span>}
      </div>

      {/* Contact info */}
      <div className="mt-2 space-y-1">
        {l.phone && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Phone className="w-3 h-3" />
            <span className="truncate">{l.phone}</span>
          </div>
        )}
        {l.country && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <MapPin className="w-3 h-3" />
            <span>{l.country}</span>
          </div>
        )}
      </div>

      {/* Revenue */}
      {hasPurchases && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-green-600">${(l.total_usd_spent || 0).toLocaleString()}</span>
          <span className="text-[10px] text-slate-400">{l.n_purchases} compra{l.n_purchases === 1 ? "" : "s"}</span>
        </div>
      )}
    </div>
  );
}

/* ===== TABLE VIEW ===== */
function TableView({ leads, onOpenLead }: { leads: Lead[]; onOpenLead: (id: number) => void }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Teléfono</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">País</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Etapa</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Tier</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Compras</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">Sin resultados</td></tr>
            ) : leads.map((l) => <TableRow key={l.id} lead={l} onClick={() => onOpenLead(l.id)} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableRow({ lead: l, onClick }: { lead: Lead; onClick: () => void }) {
  const isPending = !l.name || l.name === "Sin nombre";
  const hasPurchases = (l.n_purchases || 0) > 0;
  const tierCfg = l.buyer_tier ? TIER_CONFIG[l.buyer_tier as keyof typeof TIER_CONFIG] : null;
  const stageCfg = STAGE_CONFIG[l.stage as keyof typeof STAGE_CONFIG];

  return (
    <tr onClick={onClick}
      className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-[#FAF6EB]/40 transition-colors group">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0",
            l.buyer_tier === "vip" ? "bg-gradient-to-br from-[#C8A951] to-orange-500" :
            hasPurchases ? "bg-gradient-to-br from-green-400 to-emerald-600" :
            "bg-gradient-to-br from-slate-300 to-slate-400"
          )}>
            {(isPending ? "?" : l.name.charAt(0)).toUpperCase()}
          </div>
          <div>
            <span className="font-semibold text-slate-800 group-hover:text-[#1B365D] transition-colors">{isPending ? (l.phone || "Sin datos") : l.name}</span>
            {l.email && <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{l.email}</div>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-500 text-xs">{l.phone || "—"}</td>
      <td className="px-4 py-3 text-slate-500 text-xs">{l.country || "—"}</td>
      <td className="px-4 py-3">
        {stageCfg && <span className={cn("text-[10px] font-semibold px-2 py-1 rounded-md", stageCfg.color)}>{stageCfg.label}</span>}
      </td>
      <td className="px-4 py-3">
        {tierCfg && <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", tierCfg.color)}>{tierCfg.label}</span>}
      </td>
      <td className="px-4 py-3 text-right text-xs text-slate-500">{l.n_purchases || 0}</td>
      <td className="px-4 py-3 text-right">
        {hasPurchases ? <span className="text-xs font-bold text-green-600">${(l.total_usd_spent || 0).toLocaleString()}</span> : <span className="text-xs text-slate-300">—</span>}
      </td>
    </tr>
  );
}

/* ===== LIST VIEW (original) ===== */
function LeadRow({ lead: l, onClick }: { lead: Lead; onClick: () => void }) {
  const isPending = !l.name || l.name === "Sin nombre";
  const hasPurchases = (l.n_purchases || 0) > 0;
  const tierCfg = l.buyer_tier ? TIER_CONFIG[l.buyer_tier as keyof typeof TIER_CONFIG] : null;
  const stageCfg = STAGE_CONFIG[l.stage as keyof typeof STAGE_CONFIG];

  return (
    <div onClick={onClick} className={cn(
      "flex items-center gap-4 p-4 bg-white rounded-xl border cursor-pointer transition-all hover:shadow-md hover:border-amber-200 group",
      l.buyer_tier === "vip" && "border-l-4 border-l-[#C8A951]",
      isPending && "border-l-4 border-l-orange-300",
    )}>
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0",
        l.buyer_tier === "vip" ? "bg-gradient-to-br from-[#C8A951] to-orange-500" :
        hasPurchases ? "bg-gradient-to-br from-green-400 to-emerald-600" :
        "bg-gradient-to-br from-slate-300 to-slate-400"
      )}>
        {(isPending ? "?" : l.name.charAt(0)).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-slate-900 truncate group-hover:text-[#1B365D] transition-colors">{isPending ? l.phone : l.name}</span>
          {tierCfg && <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", tierCfg.color)}>{tierCfg.label}</span>}
          {stageCfg && <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", stageCfg.color)}>{stageCfg.label}</span>}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
          {l.country && <span>{l.country}</span>}
          {l.phone && <span>{l.phone}</span>}
          {l.email && <span className="truncate max-w-[180px]">{l.email}</span>}
        </div>
      </div>
      {hasPurchases && (
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-green-600">${(l.total_usd_spent || 0).toLocaleString()}</div>
          <div className="text-[11px] text-slate-400">{l.n_purchases} compra{l.n_purchases === 1 ? "" : "s"}</div>
        </div>
      )}
    </div>
  );
}

/* ===== SHARED COMPONENTS ===== */
function Empty() {
  return <div className="text-center py-12 text-slate-400">Sin resultados</div>;
}

function Paginator({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <button disabled={page === 0} onClick={() => onPageChange(page - 1)}
        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="font-medium text-xs">{page + 1} / {totalPages}</span>
      <button disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}
        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function BottomPaginator({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex justify-center gap-2 pt-4">
      <button disabled={page === 0} onClick={() => { onPageChange(page - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium hover:bg-slate-50 disabled:opacity-30">
        Anterior
      </button>
      <div className="flex items-center gap-1">
        {Array.from({ length: Math.min(7, totalPages) }).map((_, i) => {
          let p: number;
          if (totalPages <= 7) p = i;
          else if (page < 4) p = i;
          else if (page > totalPages - 5) p = totalPages - 7 + i;
          else p = page - 3 + i;
          return (
            <button key={p} onClick={() => { onPageChange(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className={cn("w-8 h-8 rounded-lg text-xs font-medium transition-all",
                page === p ? "bg-[#C8A951] text-white" : "hover:bg-slate-100 text-slate-500")}>
              {p + 1}
            </button>
          );
        })}
      </div>
      <button disabled={page >= totalPages - 1} onClick={() => { onPageChange(page + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium hover:bg-slate-50 disabled:opacity-30">
        Siguiente
      </button>
    </div>
  );
}

function PipelineSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="w-72 shrink-0 rounded-2xl border border-slate-200 bg-slate-50/50">
          <div className="px-4 py-3 bg-slate-100 rounded-t-2xl animate-pulse">
            <div className="h-4 w-24 bg-slate-200 rounded" />
          </div>
          <div className="p-2 space-y-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-[72px] bg-white rounded-xl border border-slate-200 animate-pulse" />
      ))}
    </div>
  );
}
