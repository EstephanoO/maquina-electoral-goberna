"use client";

/**
 * CMS Tag Manager — Dropdown for filtering by tag + creating new tags.
 * Used in the sidebar header for global tag filtering.
 */

import { useState, useRef, useEffect, useCallback } from "react";

type CmsTagManagerProps = {
  availableTags: string[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onCreateTag: (name: string) => void;
};

export function CmsTagManager({ availableTags, selectedTag, onSelectTag, onCreateTag }: CmsTagManagerProps) {
  const [open, setOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleCreate = useCallback(() => {
    const trimmed = newTag.trim().toLowerCase();
    if (!trimmed) return;
    if (availableTags.includes(trimmed)) {
      onSelectTag(trimmed);
    } else {
      onCreateTag(trimmed);
      onSelectTag(trimmed);
    }
    setNewTag("");
    setOpen(false);
  }, [newTag, availableTags, onSelectTag, onCreateTag]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
          selectedTag
            ? "bg-[var(--goberna-blue-100)] text-[var(--goberna-blue-700)] hover:bg-[var(--goberna-blue-200)]"
            : "bg-surface-active text-text-tertiary hover:bg-surface-active"
        }`}
      >
        <TagIcon />
        {selectedTag ? selectedTag : "Etiquetas"}
        {selectedTag && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectTag(null); }}
            className="ml-0.5 text-[10px] opacity-60 hover:opacity-100"
          >
            x
          </button>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-surface rounded-xl shadow-lg border border-border z-50 py-1 animate-in fade-in-0 zoom-in-95">
          {/* Create new */}
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                placeholder="Nueva etiqueta..."
                className="flex-1 text-[11px] px-2 py-1 rounded-md border border-border outline-none focus:border-[var(--goberna-blue-400)] placeholder:text-text-tertiary"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newTag.trim()}
                className="text-[10px] font-semibold text-[var(--goberna-blue-600)] hover:text-[var(--goberna-blue-800)] disabled:opacity-30 disabled:cursor-default"
              >
                +
              </button>
            </div>
          </div>

          {/* Clear filter */}
          {selectedTag && (
            <button
              type="button"
              onClick={() => { onSelectTag(null); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-text-tertiary hover:bg-surface-hover transition-colors"
            >
              Quitar filtro
            </button>
          )}

          {/* Tag list */}
          <div className="max-h-48 overflow-y-auto">
            {availableTags.length === 0 && (
              <p className="px-3 py-2 text-[11px] text-text-tertiary text-center">Sin etiquetas</p>
            )}
            {availableTags.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => { onSelectTag(tag); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  tag === selectedTag
                    ? "bg-[var(--goberna-blue-50)] text-[var(--goberna-blue-700)]"
                    : "text-text-secondary hover:bg-surface-hover"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TagIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Etiqueta</title>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}
