"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  claimPipelineContact,
  listCmsContacts,
  type CmsContact,
  type CmsVoteTierFilter,
} from "@/lib/services/cms";
import { setPendingOpenContact } from "@/lib/cms-chat-lock";
import { PipelineColumn, type LevelConfig } from "./_components/pipeline-column";
import { ContactRow } from "./_components/contact-row";
import { getLastInteractionMs } from "./_components/pipeline-utils";

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

const LEVEL_VOTE_TIER: Record<string, CmsVoteTierFilter> = {
  leads_recibidos: "sin_clasificar",
  contacto_basura: "contacto_basura",
  voto_blando: "voto_blando",
  voto_duro: "voto_duro",
};

type GroupedContacts = Record<string, CmsContact[]>;
type ViewMode = "board" | "compact";
type LockFilter = "all" | "free" | "blocked";

type LevelData = {
  contacts: CmsContact[];
  total: number;
  nextOffset: number;
  loadingMore: boolean;
};

type LevelDataMap = Record<string, LevelData>;

const PAGE_LIMIT = 50;
const SCROLL_LOAD_THRESHOLD_PX = 120;
const CLAIM_LOCK_TTL_MS = 20 * 60 * 1000;

function createInitialLevelData(): LevelDataMap {
  const next: LevelDataMap = {};
  for (const level of LEVELS) {
    next[level.key] = {
      contacts: [],
      total: 0,
      nextOffset: 0,
      loadingMore: false,
    };
  }
  return next;
}

function createInitialLoadingFlags(): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const level of LEVELS) next[level.key] = false;
  return next;
}

function mergeContacts(existing: CmsContact[], incoming: CmsContact[]): CmsContact[] {
  if (incoming.length === 0) return existing;
  const byId = new Map<string, CmsContact>();
  for (const contact of existing) byId.set(contact.id, contact);
  for (const contact of incoming) byId.set(contact.id, contact);
  const merged = Array.from(byId.values());
  merged.sort((a, b) => getLastInteractionMs(b) - getLastInteractionMs(a));
  return merged;
}

function toOperatorName(emailOrName: string): string {
  const value = emailOrName.trim();
  if (!value) return "otro operador";
  const at = value.indexOf("@");
  return at > 0 ? value.slice(0, at) : value;
}

export default function CmsPipelinePage() {
  const router = useRouter();
  const { user, activeCampaignId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [lockFilter, setLockFilter] = useState<LockFilter>("all");
  const [mobileOpenLevelKey, setMobileOpenLevelKey] = useState<string>(LEVELS[0].key);
  const [levelData, setLevelData] = useState<LevelDataMap>(() => createInitialLevelData());
  const loadingMoreRef = useRef<Record<string, boolean>>(createInitialLoadingFlags());

  const currentUserId = user?.id ?? "";

  const fetchLevelPage = useCallback(async (levelKey: string, offset: number) => {
    if (!activeCampaignId) {
      return { ok: false as const, contacts: [] as CmsContact[], total: 0, error: "MISSING_CAMPAIGN" };
    }
    return listCmsContacts(
      activeCampaignId,
      "todos",
      PAGE_LIMIT,
      offset,
      "",
      { voteTier: LEVEL_VOTE_TIER[levelKey] },
    );
  }, [activeCampaignId]);

  const loadPipeline = useCallback(async () => {
    if (!activeCampaignId) return;
    setLoading(true);
    setError(null);
    loadingMoreRef.current = createInitialLoadingFlags();

    const responses = await Promise.all(
      LEVELS.map(async (level) => ({
        key: level.key,
        result: await fetchLevelPage(level.key, 0),
      })),
    );

    const next = createInitialLevelData();
    let hasFailure = false;

    for (const { key, result } of responses) {
      if (!result.ok) {
        hasFailure = true;
        continue;
      }

      next[key] = {
        contacts: result.contacts,
        total: result.total,
        nextOffset: result.contacts.length,
        loadingMore: false,
      };
    }

    setLevelData(next);
    if (hasFailure) {
      setError("No se pudieron cargar todos los niveles del pipeline.");
    }
    setLoading(false);
  }, [activeCampaignId, fetchLevelPage]);

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline]);

  const loadMoreLevel = useCallback(async (levelKey: string) => {
    if (!activeCampaignId) return;
    const current = levelData[levelKey];
    if (!current) return;
    if (loading) return;
    if (current.nextOffset >= current.total) return;
    if (loadingMoreRef.current[levelKey]) return;

    loadingMoreRef.current[levelKey] = true;
    setLevelData((prev) => ({
      ...prev,
      [levelKey]: {
        ...prev[levelKey],
        loadingMore: true,
      },
    }));

    const result = await fetchLevelPage(levelKey, current.nextOffset);
    if (!result.ok) {
      setError(result.error ?? "No se pudieron cargar mas contactos.");
      loadingMoreRef.current[levelKey] = false;
      setLevelData((prev) => ({
        ...prev,
        [levelKey]: {
          ...prev[levelKey],
          loadingMore: false,
        },
      }));
      return;
    }

    setLevelData((prev) => {
      const latest = prev[levelKey];
      const contacts = mergeContacts(latest.contacts, result.contacts);
      const consumed = result.contacts.length > 0 ? latest.nextOffset + result.contacts.length : result.total;
      return {
        ...prev,
        [levelKey]: {
          contacts,
          total: result.total,
          nextOffset: consumed,
          loadingMore: false,
        },
      };
    });
    loadingMoreRef.current[levelKey] = false;
  }, [activeCampaignId, fetchLevelPage, levelData, loading]);

  const grouped = useMemo<GroupedContacts>(() => {
    const next: GroupedContacts = {
      leads_recibidos: [],
      contacto_basura: [],
      voto_blando: [],
      voto_duro: [],
    };
    for (const level of LEVELS) {
      next[level.key] = levelData[level.key]?.contacts ?? [];
    }
    return next;
  }, [levelData]);

  const contactById = useMemo(() => {
    const map = new Map<string, CmsContact>();
    for (const level of LEVELS) {
      for (const contact of grouped[level.key] ?? []) {
        map.set(contact.id, contact);
      }
    }
    return map;
  }, [grouped]);

  const getLockInfo = useCallback((contactId: string) => {
    const contact = contactById.get(contactId);
    if (!contact?.cms_claimed_by || contact.cms_claimed_by === currentUserId) {
      return { lockedByOther: false, lockLabel: null as string | null };
    }
    const claimedAtMs = contact.cms_claimed_at ? Date.parse(contact.cms_claimed_at) : 0;
    if (claimedAtMs <= 0) {
      return { lockedByOther: false, lockLabel: null as string | null };
    }
    if (Date.now() - claimedAtMs >= CLAIM_LOCK_TTL_MS) {
      return { lockedByOther: false, lockLabel: null as string | null };
    }
    const owner = toOperatorName(contact.claimed_by_email ?? "");
    return {
      lockedByOther: true,
      lockLabel: `Atendido por ${owner}`,
    };
  }, [contactById, currentUserId]);

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
      } else {
        next[level.key] = source.filter((contact) => {
          const blocked = getLockInfo(contact.id).lockedByOther;
          return lockFilter === "blocked" ? blocked : !blocked;
        });
      }
    }
    return next;
  }, [grouped, lockFilter, getLockInfo]);

  const totalContacts = useMemo(
    () => LEVELS.reduce((sum, level) => sum + (levelData[level.key]?.total ?? 0), 0),
    [levelData],
  );
  const loadedContacts = useMemo(
    () => LEVELS.reduce((sum, level) => sum + (levelData[level.key]?.contacts.length ?? 0), 0),
    [levelData],
  );
  const filteredTotal = useMemo(
    () => LEVELS.reduce((sum, level) => sum + (filteredGrouped[level.key]?.length ?? 0), 0),
    [filteredGrouped],
  );
  const summaryTotal = lockFilter === "all" ? totalContacts : filteredTotal;

  const lockTotals = useMemo(() => {
    let blocked = 0;
    let free = 0;
    for (const level of LEVELS) {
      for (const contact of grouped[level.key] ?? []) {
        if (getLockInfo(contact.id).lockedByOther) blocked += 1;
        else free += 1;
      }
    }
    return { blocked, free };
  }, [grouped, getLockInfo]);

  const getFilterCount = useCallback((filter: LockFilter): number => {
    if (filter === "all") return totalContacts;
    if (filter === "blocked") return lockTotals.blocked;
    return lockTotals.free;
  }, [lockTotals, totalContacts]);

  const hasMoreForLevel = useCallback((levelKey: string) => {
    const current = levelData[levelKey];
    if (!current) return false;
    return current.nextOffset < current.total;
  }, [levelData]);

  const getEmptyLabel = useCallback((level: LevelConfig): string => {
    if (lockFilter === "blocked") return "No hay contactos bloqueados en este nivel";
    if (lockFilter === "free") return "No hay contactos libres en este nivel";
    return level.emptyLabel;
  }, [lockFilter]);

  const handleOpenChatFromPipeline = useCallback(async (contact: CmsContact) => {
    if (!activeCampaignId || !currentUserId) return;
    setError(null);

    const claimed = await claimPipelineContact(activeCampaignId, contact.id);
    if (!claimed.ok) {
      setError(claimed.error ?? "Este lead ya esta atendido por otro operador.");
      void loadPipeline();
      return;
    }

    if (claimed.contact) {
      setLevelData((prev) => {
        const next = { ...prev };
        for (const level of LEVELS) {
          const list = next[level.key]?.contacts ?? [];
          const idx = list.findIndex((item) => item.id === claimed.contact!.id);
          if (idx < 0) continue;
          const updated = [...list];
          updated[idx] = claimed.contact!;
          next[level.key] = { ...next[level.key], contacts: updated };
        }
        return next;
      });
    }

    setPendingOpenContact(activeCampaignId, contact.id);
    router.push("/cms");
  }, [activeCampaignId, currentUserId, loadPipeline, router]);

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

  const isAnyLoadingMore = useMemo(
    () => LEVELS.some((level) => levelData[level.key]?.loadingMore),
    [levelData],
  );

  const leadsCount = lockFilter === "all"
    ? (levelData.leads_recibidos?.total ?? 0)
    : (filteredGrouped.leads_recibidos?.length ?? 0);

  if (!activeCampaignId) {
    return <div className="p-10 text-center text-slate-500 text-sm font-medium">Selecciona una campana para ver el pipeline.</div>;
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100dvh-64px)] min-h-0">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/cms"
            className="inline-flex items-center gap-2 border border-slate-200 bg-white text-slate-800 no-underline rounded-xl px-3 py-2 text-[12px] font-bold whitespace-nowrap hover:bg-slate-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><title>Volver</title><path d="M15 18l-6-6 6-6" /></svg>
            Volver al chat CMS
          </Link>

          <div className="inline-flex items-center gap-2">
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

            <button
              type="button"
              onClick={() => { void loadPipeline(); }}
              disabled={loading || isAnyLoadingMore}
              className="border border-slate-200 bg-white text-slate-700 rounded-xl px-2.5 py-2 text-[12px] font-bold cursor-pointer hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading || isAnyLoadingMore ? "Cargando..." : "Recargar"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-col items-start justify-center text-left pl-0.5">
            <span className="text-[13px] font-extrabold text-slate-800 leading-tight">Pipeline de 4 niveles</span>
            <span className="text-[12px] font-bold text-slate-500 leading-tight tabular-nums">{summaryTotal} contactos</span>
          </div>

          <div className="inline-flex items-center gap-2 flex-wrap">
            {leadsCount > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1.5 text-[12px] font-bold tabular-nums">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                {leadsCount} leads nuevos
              </span>
            )}

            {totalContacts > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 border border-slate-200 bg-white text-slate-600 rounded-full px-2.5 py-1.5 text-[12px] font-bold tabular-nums">
                {loadedContacts} / {totalContacts} cargados
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full justify-center">
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
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2.5 text-[13px] font-semibold">{error}</div>
      )}

      {loading ? (
        <div className="flex-1 min-h-0 border border-slate-200 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 font-semibold text-sm">
          Cargando pipeline...
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <div className="lg:hidden h-full min-h-0 overflow-y-auto pr-1 space-y-2">
            {LEVELS.map((level) => {
              const isOpen = mobileOpenLevelKey === level.key;
              const visibleCount = lockFilter === "all"
                ? (levelData[level.key]?.total ?? 0)
                : (filteredGrouped[level.key] ?? []).length;
              const levelHasMore = hasMoreForLevel(level.key);
              const levelLoadingMore = levelData[level.key]?.loadingMore ?? false;

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
                      <span className="min-w-[26px] px-2 py-1 rounded-full text-center text-[11px] font-bold text-slate-800 border border-slate-200 bg-white tabular-nums">
                        {visibleCount}
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

                  <div className={`grid transition-[grid-template-rows] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <div
                        className="border-t border-slate-100 max-h-[52dvh] overflow-y-auto p-1.5"
                        onScroll={(event) => {
                          if (!levelHasMore || levelLoadingMore) return;
                          const node = event.currentTarget;
                          const reachedBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - SCROLL_LOAD_THRESHOLD_PX;
                          if (reachedBottom) void loadMoreLevel(level.key);
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

                        {levelHasMore && (
                          <div className="px-2 py-2 text-center text-[11px] font-semibold text-slate-400">
                            {levelLoadingMore ? "Cargando mas..." : "Desliza para cargar mas"}
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
                  count={lockFilter === "all" ? (levelData[level.key]?.total ?? 0) : (filteredGrouped[level.key] ?? []).length}
                  compact={viewMode === "compact"}
                  onOpenChat={handleOpenChatFromPipeline}
                  isLockedByOther={(contactId) => getLockInfo(contactId).lockedByOther}
                  getLockLabel={(contactId) => getLockInfo(contactId).lockLabel}
                  hasMore={hasMoreForLevel(level.key)}
                  loadingMore={levelData[level.key]?.loadingMore ?? false}
                  onLoadMore={() => { void loadMoreLevel(level.key); }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
