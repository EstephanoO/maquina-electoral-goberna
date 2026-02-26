"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { listCmsContacts, type CmsContact } from "@/lib/services/cms";
import { PipelineColumn, type LevelConfig } from "./_components/pipeline-column";
import { getLastInteractionMs } from "./_components/pipeline-utils";

/* ─── Level definitions (4 columns, left → right) ─── */

const LEVELS: LevelConfig[] = [
  {
    key: "leads_recibidos",
    title: "Leads recibidos",
    subtitle: "Sin clasificar",
    accent: "#6366f1",
    emptyLabel: "No hay leads sin clasificar",
  },
  {
    key: "contacto_basura",
    title: "Contacto basura",
    subtitle: "Nivel 1",
    accent: "#ef4444",
    emptyLabel: "No hay contactos clasificados como basura",
  },
  {
    key: "voto_blando",
    title: "Voto blando",
    subtitle: "Nivel 2",
    accent: "#f59e0b",
    emptyLabel: "No hay contactos clasificados como voto blando",
  },
  {
    key: "voto_duro",
    title: "Voto duro",
    subtitle: "Nivel 3",
    accent: "#10b981",
    emptyLabel: "No hay contactos clasificados como voto duro",
  },
];

type GroupedContacts = Record<string, CmsContact[]>;
type ViewMode = "board" | "compact";

const PAGE_LIMIT = 100;

/* ========== Page ========== */

export default function CmsPipelinePage() {
  const { activeCampaignId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [grouped, setGrouped] = useState<GroupedContacts>({
    leads_recibidos: [],
    contacto_basura: [],
    voto_blando: [],
    voto_duro: [],
  });

  const loadPipeline = useCallback(async () => {
    if (!activeCampaignId) return;
    setLoading(true);
    setError(null);

    const all: CmsContact[] = [];
    let offset = 0;
    let total = 0;
    let pages = 0;

    while (pages < 50) {
      const res = await listCmsContacts(activeCampaignId, "todos", PAGE_LIMIT, offset, "");
      if (!res.ok) {
        setError("No se pudieron cargar los contactos del pipeline.");
        setLoading(false);
        return;
      }
      total = res.total;
      all.push(...res.contacts);
      offset += res.contacts.length;
      pages += 1;
      if (all.length >= total || res.contacts.length === 0) break;
    }

    const g: GroupedContacts = { leads_recibidos: [], contacto_basura: [], voto_blando: [], voto_duro: [] };
    for (const c of all) {
      const tier = c.cms_operator_notes?.vote_tier;
      if (tier === "contacto_basura" || tier === "voto_blando" || tier === "voto_duro") {
        g[tier].push(c);
      } else {
        g.leads_recibidos.push(c);
      }
    }

    const sortByActivity = (a: CmsContact, b: CmsContact) => getLastInteractionMs(b) - getLastInteractionMs(a);
    for (const key of Object.keys(g)) g[key].sort(sortByActivity);

    setGrouped(g);
    setLoading(false);
  }, [activeCampaignId]);

  useEffect(() => { void loadPipeline(); }, [loadPipeline]);

  const totalClassified = useMemo(
    () => grouped.contacto_basura.length + grouped.voto_blando.length + grouped.voto_duro.length,
    [grouped],
  );
  const totalAll = totalClassified + grouped.leads_recibidos.length;

  /* ─── No campaign ─── */
  if (!activeCampaignId) {
    return <div className="p-10 text-center text-slate-500 text-sm font-medium">Selecciona una campana para ver el pipeline.</div>;
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100dvh-64px)] min-h-0">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/cms"
          className="inline-flex items-center gap-2 border border-slate-200 bg-white text-slate-800 no-underline rounded-xl px-3 py-2 text-[12px] font-bold whitespace-nowrap hover:bg-slate-50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><title>Volver</title><path d="M15 18l-6-6 6-6" /></svg>
          Volver al chat CMS
        </Link>

        <div className="inline-flex items-center gap-2">
          {/* View mode toggle */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`inline-flex items-center justify-center w-8 h-8 transition-colors ${viewMode === "board" ? "bg-slate-900 text-white" : "bg-white text-slate-400 hover:text-slate-700"}`}
              title="Vista tarjetas"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><title>Board</title><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("compact")}
              className={`inline-flex items-center justify-center w-8 h-8 transition-colors ${viewMode === "compact" ? "bg-slate-900 text-white" : "bg-white text-slate-400 hover:text-slate-700"}`}
              title="Vista compacta"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><title>Lista</title><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
          </div>

          {/* Summary pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold">
            <span>Pipeline de 4 niveles</span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span className="tabular-nums">{totalAll} contactos</span>
          </div>

          {/* Leads badge */}
          {grouped.leads_recibidos.length > 0 && (
            <span className="inline-flex items-center gap-1.5 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1.5 text-[12px] font-bold tabular-nums">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              {grouped.leads_recibidos.length} leads nuevos
            </span>
          )}

          {/* Reload */}
          <button
            type="button"
            onClick={() => { void loadPipeline(); }}
            disabled={loading}
            className="border border-slate-200 bg-white text-slate-700 rounded-xl px-2.5 py-2 text-[12px] font-bold cursor-pointer hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Cargando..." : "Recargar"}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2.5 text-[13px] font-semibold">{error}</div>
      )}

      {/* ── Grid ── */}
      {loading ? (
        <div className="flex-1 min-h-0 border border-slate-200 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 font-semibold text-sm">
          Cargando pipeline...
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden pb-1">
          <div className="h-full min-w-[1100px] grid grid-cols-4 gap-3">
            {LEVELS.map((level) => (
              <PipelineColumn key={level.key} level={level} contacts={grouped[level.key] ?? []} compact={viewMode === "compact"} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
