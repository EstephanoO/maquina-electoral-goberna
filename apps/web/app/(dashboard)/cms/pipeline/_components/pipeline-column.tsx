"use client";

import { useEffect, useRef } from "react";
import type { CmsContact } from "@/lib/services/cms";
import { AnimatedList } from "@/registry/magicui/animated-list";
import { ContactCard } from "./contact-card";
import { ContactRow } from "./contact-row";

export type LevelConfig = {
  key: string;
  title: string;
  subtitle: string;
  accent: string;
  emptyLabel: string;
};

type Props = {
  level: LevelConfig;
  contacts: CmsContact[];
  compact?: boolean;
  onOpenChat?: (contact: CmsContact) => void;
  getLockLabel?: (contactId: string) => string | null;
  isLockedByOther?: (contactId: string) => boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

export function PipelineColumn({
  level,
  contacts,
  compact,
  onOpenChat,
  getLockLabel,
  isLockedByOther,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: Props) {
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const root = scrollRootRef.current;
    const target = loadMoreRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || loadingMore) return;
        onLoadMore();
      },
      {
        root,
        rootMargin: "120px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, contacts.length]);

  return (
    <section className="min-h-0 flex flex-col border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/80 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <header className="flex items-start justify-between gap-2 px-3 py-3 bg-slate-100/80">
        <div>
          <div className="text-[16px] font-extrabold text-slate-900">{level.title}</div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{level.subtitle}</div>
        </div>
        <span className="min-w-[28px] px-2 py-1 rounded-full text-center text-[12px] font-bold text-slate-800 border border-slate-200 bg-white tabular-nums">
          {contacts.length}
        </span>
      </header>

      {/* Accent bar */}
      <div className="h-[3px] mx-3 rounded-full" style={{ background: level.accent }} />

      {/* Body */}
      <div ref={scrollRootRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {contacts.length === 0 ? (
          <div className="m-3 p-4 rounded-xl border border-dashed border-slate-300 text-center text-[12px] text-slate-400 font-medium">
            {level.emptyLabel}
          </div>
        ) : compact ? (
          <div className="flex flex-col gap-0.5 p-1.5">
            {contacts.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                accent={level.accent}
                onOpenChat={onOpenChat}
                lockLabel={getLockLabel?.(c.id) ?? null}
                lockedByOther={Boolean(isLockedByOther?.(c.id))}
              />
            ))}
          </div>
        ) : (
          <AnimatedList className="flex flex-col gap-2.5 p-3" delay={90}>
            {contacts.map((c) => (
              <ContactCard
                key={c.id}
                contact={c}
                accent={level.accent}
                onOpenChat={onOpenChat}
                lockLabel={getLockLabel?.(c.id) ?? null}
                lockedByOther={Boolean(isLockedByOther?.(c.id))}
              />
            ))}
          </AnimatedList>
        )}

        {hasMore && (
          <div ref={loadMoreRef} className="px-3 pb-3 pt-1 text-center text-[11px] font-semibold text-slate-400">
            {loadingMore ? "Cargando mas..." : "Desliza para cargar mas"}
          </div>
        )}
      </div>
    </section>
  );
}
