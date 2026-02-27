"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { listCmsContacts, type CmsContact } from "@/lib/services/cms";
import {
  claimContactLock,
  getCampaignLocks,
  type CmsChatLockEntry,
  setPendingOpenContact,
} from "@/lib/cms-chat-lock";
import { PipelineColumn, type LevelConfig } from "./_components/pipeline-column";
import { ContactRow } from "./_components/contact-row";
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
const LOCK_POLL_MS = 15_000;

/* ========== Page ========== */

export default function CmsPipelinePage() {
  const router = useRouter();
  const { user, activeCampaignId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [mobileOpenLevelKey, setMobileOpenLevelKey] = useState<string>(LEVELS[0].key);
  const [locksByContact, setLocksByContact] = useState<Record<string, CmsChatLockEntry>>({});
  const [grouped, setGrouped] = useState<GroupedContacts>({
    leads_recibidos: [],
    contacto_basura: [],
    voto_blando: [],
    voto_duro: [],
  });

  const currentUserId = user?.id ?? "";
  const currentUserName = user?.full_name?.trim() || user?.email?.trim() || "Operador";

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

  const refreshLocks = useCallback(() => {
    if (!activeCampaignId) {
      setLocksByContact({});
      return;
    }
    setLocksByContact(getCampaignLocks(activeCampaignId));
  }, [activeCampaignId]);

  useEffect(() => {
    refreshLocks();
  }, [refreshLocks]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key && event.key !== "goberna:cms-chat-locks:v1") return;
      refreshLocks();
    }

    const timer = window.setInterval(refreshLocks, LOCK_POLL_MS);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshLocks]);

  const totalClassified = useMemo(
    () => grouped.contacto_basura.length + grouped.voto_blando.length + grouped.voto_duro.length,
    [grouped],
  );
  const totalAll = totalClassified + grouped.leads_recibidos.length;

  const getLockInfo = useCallback((contactId: string) => {
    const lock = locksByContact[contactId];
    if (!lock) {
      return {
        lockedByOther: false,
        lockLabel: null as string | null,
      };
    }
    const lockedByOther = lock.lockedByUserId !== currentUserId;
    return {
      lockedByOther,
      lockLabel: lockedByOther ? `Atendido por ${lock.lockedByName}` : null,
    };
  }, [locksByContact, currentUserId]);

  const handleOpenChatFromPipeline = useCallback((contact: CmsContact) => {
    if (!activeCampaignId || !currentUserId) return;
    const claim = claimContactLock({
      campaignId: activeCampaignId,
      contactId: contact.id,
      userId: currentUserId,
      userName: currentUserName,
    });

    if (!claim.ok && claim.lock) {
      setError(`Este lead ya esta atendido por ${claim.lock.lockedByName}.`);
      refreshLocks();
      return;
    }

    setPendingOpenContact(activeCampaignId, contact.id);
    refreshLocks();
    router.push("/cms");
  }, [
    activeCampaignId,
    currentUserId,
    currentUserName,
    refreshLocks,
    router,
  ]);

  useEffect(() => {
    const preferred = LEVELS.find((level) => (grouped[level.key] ?? []).length > 0)?.key ?? LEVELS[0].key;
    if (!LEVELS.some((level) => level.key === mobileOpenLevelKey)) {
      setMobileOpenLevelKey(preferred);
      return;
    }
    if ((grouped[mobileOpenLevelKey] ?? []).length === 0) {
      setMobileOpenLevelKey(preferred);
    }
  }, [grouped, mobileOpenLevelKey]);

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

        <div className="inline-flex items-center gap-2 flex-wrap justify-end">
          {/* View mode toggle */}
          <div className="hidden md:inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
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
            <span className="hidden sm:inline-flex items-center gap-1.5 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1.5 text-[12px] font-bold tabular-nums">
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
        <div className="flex-1 min-h-0">
          <div className="lg:hidden h-full min-h-0 overflow-y-auto pr-1 space-y-2">
            {LEVELS.map((level) => {
              const isOpen = mobileOpenLevelKey === level.key;
              return (
                <section key={level.key} className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMobileOpenLevelKey(level.key)}
                    className="w-full px-3 py-3 flex items-center justify-between gap-2 text-left bg-slate-50/80"
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] font-extrabold text-slate-900 truncate">{level.title}</div>
                      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{level.subtitle}</div>
                    </div>
                    <div className="inline-flex items-center gap-2 shrink-0">
                      <span
                        className="min-w-[26px] px-2 py-1 rounded-full text-center text-[11px] font-bold text-slate-800 border border-slate-200 bg-white tabular-nums"
                      >
                        {(grouped[level.key] ?? []).length}
                      </span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        className={`text-slate-500 transition-transform duration-300 ${isOpen ? "rotate-180" : "rotate-0"}`}
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </div>
                  </button>

                  <div
                    className={`grid transition-[grid-template-rows] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t border-slate-100 max-h-[52dvh] overflow-y-auto p-1.5">
                        {(grouped[level.key] ?? []).length === 0 ? (
                          <div className="m-2 p-4 rounded-xl border border-dashed border-slate-300 text-center text-[12px] text-slate-400 font-medium">
                            {level.emptyLabel}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {(grouped[level.key] ?? []).map((contact) => {
                              const lockInfo = getLockInfo(contact.id);
                              return (
                                <ContactRow
                                  key={contact.id}
                                  contact={contact}
                                  accent={level.accent}
                                  onOpenChat={handleOpenChatFromPipeline}
                                  lockedByOther={lockInfo.lockedByOther}
                                  lockLabel={lockInfo.lockLabel}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          <div className="hidden lg:block h-full min-h-0 overflow-x-auto overflow-y-hidden pb-1">
            <div className="h-full min-w-[1100px] grid grid-cols-4 gap-3">
              {LEVELS.map((level) => (
                <PipelineColumn
                  key={level.key}
                  level={level}
                  contacts={grouped[level.key] ?? []}
                  compact={viewMode === "compact"}
                  onOpenChat={handleOpenChatFromPipeline}
                  isLockedByOther={(contactId) => getLockInfo(contactId).lockedByOther}
                  getLockLabel={(contactId) => getLockInfo(contactId).lockLabel}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
