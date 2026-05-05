"use client";

/**
 * CMS Sidebar — Left panel with search, status tabs, tag filter, and contact list.
 * Supports infinite scroll and keyboard navigation.
 */

import { memo, useState, useRef, useCallback, useEffect } from "react";
import type { CmsContact, CmsStats, CmsTabFilter } from "@/lib/services/cms";
import { CmsContactCard } from "./cms-contact-card";
import { CmsTagManager } from "./cms-tag-manager";
import { CmsEmptyState } from "./cms-empty-state";

type CmsSidebarProps = {
  contacts: CmsContact[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  stats: CmsStats | null;
  activeTab: CmsTabFilter;
  searchQuery: string;
  selectedContactId: string | null;
  availableTags: string[];
  selectedTag: string | null;
  onTabChange: (tab: CmsTabFilter) => void;
  onSearchChange: (query: string) => void;
  onSelectContact: (id: string) => void;
  onOpenProfile: (contact: CmsContact) => void;
  onLoadMore: () => void;
  onSelectTag: (tag: string | null) => void;
  onCreateTag: (name: string) => void;
  error: string | null;
  onRetry: () => void;
};

type Tab = { key: CmsTabFilter; label: string; statKey: keyof CmsStats | null };

const TABS: Tab[] = [
  { key: "todos", label: "Todos", statKey: "total" },
  { key: "nuevo", label: "Nuevos", statKey: "nuevos" },
  { key: "hablado", label: "Hablados", statKey: "hablados" },
  { key: "respondieron", label: "Contestaron", statKey: "respondieron" },
  { key: "archivado", label: "Archivados", statKey: "archivados" },
];

export const CmsSidebar = memo(function CmsSidebar({
  contacts,
  total,
  loading,
  loadingMore,
  stats,
  activeTab,
  searchQuery,
  selectedContactId,
  availableTags,
  selectedTag,
  onTabChange,
  onSearchChange,
  onSelectContact,
  onOpenProfile,
  onLoadMore,
  onSelectTag,
  onCreateTag,
  error,
  onRetry,
}: CmsSidebarProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && !loadingMore && contacts.length < total) {
          onLoadMore();
        }
      },
      { root: scrollRef.current, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, contacts.length, total, onLoadMore]);

  // Scroll to top on tab change
  const handleTabChange = useCallback(
    (tab: CmsTabFilter) => {
      onTabChange(tab);
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [onTabChange],
  );

  return (
    <div className="flex flex-col h-full bg-surface border-r border-border/80">
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-bold text-text-primary">Contactos CMS</h2>
          <div className="flex items-center gap-1.5">
            <CmsTagManager
              availableTags={availableTags}
              selectedTag={selectedTag}
              onSelectTag={onSelectTag}
              onCreateTag={onCreateTag}
            />
          </div>
        </div>

        {/* Search */}
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ${
          searchFocused ? "border-[var(--goberna-blue-400)] bg-surface" : "border-border bg-surface-hover"
        }`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-tertiary shrink-0" aria-hidden="true">
            <title>Buscar</title>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Buscar nombre, telefono..."
            className="flex-1 text-[12px] bg-transparent outline-none placeholder:text-text-tertiary text-text-secondary"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="text-[10px] text-text-tertiary hover:text-text-secondary"
            >
              x
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-2.5 overflow-x-auto pb-0.5">
          {TABS.map((tab) => {
            const count = tab.statKey && stats ? stats[tab.statKey] : null;
            const isActive = activeTab === tab.key;
            return (
              <button
                type="button"
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-[var(--goberna-blue-900)] text-white"
                    : "text-text-tertiary hover:bg-surface-hover"
                }`}
              >
                {tab.label}
                {count !== null && count !== undefined && (
                  <span className={`text-[10px] tabular-nums ${isActive ? "text-white/70" : "text-text-tertiary"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contact list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {error && !loading && (
          <CmsEmptyState variant="error" message={error} onRetry={onRetry} />
        )}

        {!error && loading && contacts.length === 0 && (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`skeleton-${String(i)}`} className="flex items-start gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-surface-active shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-surface-active rounded w-3/4" />
                  <div className="h-2.5 bg-surface-active rounded w-1/2" />
                  <div className="h-2 bg-surface-hover rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!error && !loading && contacts.length === 0 && (
          <CmsEmptyState
            variant={searchQuery ? "no-results" : "no-contacts"}
          />
        )}

        {contacts.map((contact) => (
          <CmsContactCard
            key={contact.id}
            contact={contact}
            selected={contact.id === selectedContactId}
            onSelect={onSelectContact}
            onOpenProfile={onOpenProfile}
          />
        ))}

        {/* Infinite scroll sentinel */}
        {contacts.length > 0 && contacts.length < total && (
          <div ref={sentinelRef} className="py-3 text-center">
            {loadingMore ? (
              <div className="inline-block w-4 h-4 border-2 border-border border-t-[var(--goberna-blue-500)] rounded-full animate-spin" />
            ) : (
              <span className="text-[11px] text-text-tertiary">
                {contacts.length} de {total}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
