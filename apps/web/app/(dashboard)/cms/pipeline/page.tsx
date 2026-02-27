"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type LockFilter = "all" | "free" | "blocked";

const PAGE_LIMIT = 50;
const LOCK_POLL_MS = 15_000;
const SCROLL_LOAD_THRESHOLD_PX = 120;

const EMPTY_GROUPED: GroupedContacts = {
  leads_recibidos: [],
  contacto_basura: [],
  voto_blando: [],
  voto_duro: [],
};

function buildGroupedContacts(contacts: CmsContact[]): GroupedContacts {
  const grouped: GroupedContacts = {
    leads_recibidos: [],
    contacto_basura: [],
    voto_blando: [],
    voto_duro: [],
  };

  for (const contact of contacts) {
    const tier = contact.cms_operator_notes?.vote_tier;
    if (tier === "contacto_basura" || tier === "voto_blando" || tier === "voto_duro") {
      grouped[tier].push(contact);
    } else {
      grouped.leads_recibidos.push(contact);
    }
  }

  const sortByActivity = (a: CmsContact, b: CmsContact) => getLastInteractionMs(b) - getLastInteractionMs(a);
  for (const key of Object.keys(grouped)) {
    grouped[key].sort(sortByActivity);
  }

  return grouped;
}

function mergeContacts(existing: CmsContact[], incoming: CmsContact[]): CmsContact[] {
  if (incoming.length === 0) return existing;
  const byId = new Map<string, CmsContact>();
  for (const contact of existing) byId.set(contact.id, contact);
  for (const contact of incoming) byId.set(contact.id, contact);
  return Array.from(byId.values());
}

/* ========== Page ========== */

export default function CmsPipelinePage() {
  const router = useRouter();
  const { user, activeCampaignId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [lockFilter, setLockFilter] = useState<LockFilter>("all");
  const [mobileOpenLevelKey, setMobileOpenLevelKey] = useState<string>(LEVELS[0].key);
  const [locksByContact, setLocksByContact] = useState<Record<string, CmsChatLockEntry>>({});
  const [contacts, setContacts] = useState<CmsContact[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  const currentUserId = user?.id ?? "";
  const currentUserName = user?.full_name?.trim() || user?.email?.trim() || "Operador";

  const loadPipeline = useCallback(async () => {
    if (!activeCampaignId) return;
    setLoading(true);
    setLoadingMore(false);
    loadingMoreRef.current = false;
    setError(null);

    const res = await listCmsContacts(activeCampaignId, "todos", PAGE_LIMIT, 0, "");
    if (!res.ok) {
      setContacts([]);
      setTotalContacts(0);
      setNextOffset(0);
      setError("No se pudieron cargar los contactos del pipeline.");
      setLoading(false);
      return;
    }

    setContacts(res.contacts);
    setTotalContacts(res.total);
    setNextOffset(res.contacts.length);
    setLoading(false);
  }, [activeCampaignId]);

  useEffect(() => { void loadPipeline(); }, [loadPipeline]);

  const hasMore = nextOffset < totalContacts;

  const loadMorePipeline = useCallback(async () => {
    if (!activeCampaignId || loading || loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    const res = await listCmsContacts(activeCampaignId, "todos", PAGE_LIMIT, nextOffset, "");
    if (!res.ok) {
      setError(res.error ?? "No se pudieron cargar mas contactos del pipeline.");
      setLoadingMore(false);
      loadingMoreRef.current = false;
      return;
    }

    setContacts((prev) => mergeContacts(prev, res.contacts));
    setTotalContacts(res.total);
    setNextOffset(res.contacts.length > 0 ? nextOffset + res.contacts.length : res.total);
    setLoadingMore(false);
    loadingMoreRef.current = false;
  }, [activeCampaignId, hasMore, loading, nextOffset]);

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

  const grouped = useMemo(() => {
    if (contacts.length === 0) return EMPTY_GROUPED;
    return buildGroupedContacts(contacts);
  }, [contacts]);

  const filteredGrouped = useMemo<GroupedContacts>(() => {
    const next: GroupedContacts = {
      leads_recibidos: [],
      contacto_basura: [],
      voto_blando: [],
      voto_duro: [],
    };

    for (const level of LEVELS) {
      const source = grouped[level.key] ?? [];
      if (lockFilter === "all") {
        next[level.key] = source;
        continue;
      }

      next[level.key] = source.filter((contact) => {
        const blockedByOther = getLockInfo(contact.id).lockedByOther;
        return lockFilter === "blocked" ? blockedByOther : !blockedByOther;
      });
    }

    return next;
  }, [grouped, lockFilter, getLockInfo]);

  const totalClassified = useMemo(
    () => filteredGrouped.contacto_basura.length + filteredGrouped.voto_blando.length + filteredGrouped.voto_duro.length,
    [filteredGrouped],
  );
  const totalAll = totalClassified + filteredGrouped.leads_recibidos.length;

  const lockTotals = useMemo(() => {
    let blocked = 0;
    let free = 0;

    for (const level of LEVELS) {
      const list = grouped[level.key] ?? [];
      for (const contact of list) {
        if (getLockInfo(contact.id).lockedByOther) {
          blocked += 1;
        } else {
          free += 1;
        }
      }
    }

    return {
      blocked,
      free,
      all: blocked + free,
    };
  }, [grouped, getLockInfo]);

  const getFilterCount = useCallback((filter: LockFilter): number => {
    if (filter === "all") return lockTotals.all;
    if (filter === "blocked") return lockTotals.blocked;
    return lockTotals.free;
  }, [lockTotals]);

  const getEmptyLabel = useCallback((level: LevelConfig): string => {
    if (lockFilter === "blocked") return "No hay contactos bloqueados en este nivel";
    if (lockFilter === "free") return "No hay contactos libres en este nivel";
    return level.emptyLabel;
  }, [lockFilter]);

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
    const preferred = LEVELS.find((level) => (filteredGrouped[level.key] ?? []).length > 0)?.key ?? LEVELS[0].key;
    if (!LEVELS.some((level) => level.key === mobileOpenLevelKey)) {
      setMobileOpenLevelKey(preferred);
      return;
    }
    if ((filteredGrouped[mobileOpenLevelKey] ?? []).length === 0) {
      setMobileOpenLevelKey(preferred);
    }
  }, [filteredGrouped, mobileOpenLevelKey]);

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
          {/* Lock filter */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
            {([
              { key: "all", label: "Todos" },
              { key: "free", label: "Libres" },
              { key: "blocked", label: "Bloqueados" },
            ] as const).map((opt) => {
              const active = lockFilter === opt.key;
              const count = getFilterCount(opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setLockFilter(opt.key)}
                  className={`inline-flex items-center gap-1.5 px-2.5 h-8 text-[11px] font-bold transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className={`tabular-nums rounded-full px-1.5 py-0.5 text-[10px] ${
                    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>

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
          {filteredGrouped.leads_recibidos.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1.5 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1.5 text-[12px] font-bold tabular-nums">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              {filteredGrouped.leads_recibidos.length} leads nuevos
            </span>
          )}

          {totalContacts > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1.5 border border-slate-200 bg-white text-slate-600 rounded-full px-2.5 py-1.5 text-[12px] font-bold tabular-nums">
              {Math.min(nextOffset, totalContacts)} / {totalContacts} cargados
            </span>
          )}

          {/* Reload */}
          <button
            type="button"
            onClick={() => { void loadPipeline(); }}
            disabled={loading || loadingMore}
            className="border border-slate-200 bg-white text-slate-700 rounded-xl px-2.5 py-2 text-[12px] font-bold cursor-pointer hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading || loadingMore ? "Cargando..." : "Recargar"}
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
                        {(filteredGrouped[level.key] ?? []).length}
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
                      <div
                        className="border-t border-slate-100 max-h-[52dvh] overflow-y-auto p-1.5"
                        onScroll={(event) => {
                          if (!hasMore || loadingMore) return;
                          const node = event.currentTarget;
                          const reachedBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - SCROLL_LOAD_THRESHOLD_PX;
                          if (reachedBottom) {
                            void loadMorePipeline();
                          }
                        }}
                      >
                        {(filteredGrouped[level.key] ?? []).length === 0 ? (
                          <div className="m-2 p-4 rounded-xl border border-dashed border-slate-300 text-center text-[12px] text-slate-400 font-medium">
                            {getEmptyLabel(level)}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {(filteredGrouped[level.key] ?? []).map((contact) => {
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

                        {hasMore && (
                          <div className="px-2 py-2 text-center text-[11px] font-semibold text-slate-400">
                            {loadingMore ? "Cargando mas..." : "Desliza para cargar mas"}
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
                  level={{ ...level, emptyLabel: getEmptyLabel(level) }}
                  contacts={filteredGrouped[level.key] ?? []}
                  compact={viewMode === "compact"}
                  onOpenChat={handleOpenChatFromPipeline}
                  isLockedByOther={(contactId) => getLockInfo(contactId).lockedByOther}
                  getLockLabel={(contactId) => getLockInfo(contactId).lockLabel}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={() => { void loadMorePipeline(); }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
