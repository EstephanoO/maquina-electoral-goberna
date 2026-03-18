"use client";

/**
 * CmsTagFilter — tag filter input + dropdown in the sidebar header.
 * Extracted from cms/page.tsx (~200 lines of inline JSX).
 */

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { getTagColor, withAlpha, FONT } from "../utils";

type CmsTagFilterProps = {
  availableTags: string[];
  selectedTagFilter: string;
  setSelectedTagFilter: (tag: string) => void;
  onCreateTag: (rawName: string) => string | null;
};

export const CmsTagFilter = memo(function CmsTagFilter({
  availableTags,
  selectedTagFilter,
  setSelectedTagFilter,
  onCreateTag,
}: CmsTagFilterProps) {
  const [tagSearch, setTagSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close on click outside
  useEffect(() => {
    if (!showDropdown) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  const selectTag = useCallback(
    (tag: string) => {
      setSelectedTagFilter(tag);
      setTagSearch("");
      setShowDropdown(false);
    },
    [setSelectedTagFilter],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setTagSearch("");
        setShowDropdown(false);
        (e.target as HTMLInputElement).blur();
      }
      if (e.key === "Enter" && tagSearch.trim()) {
        const query = tagSearch.trim().toLowerCase();
        const match = availableTags.find((t) => t.toLowerCase().includes(query));
        if (match) {
          selectTag(match);
        } else {
          const created = onCreateTag(tagSearch);
          if (created) selectTag(created);
        }
      }
    },
    [tagSearch, availableTags, selectTag, onCreateTag],
  );

  const selectedFilterColor =
    selectedTagFilter === "__all" ? "#3b82f6" : getTagColor(selectedTagFilter);

  const filteredTags = tagSearch.trim()
    ? availableTags.filter((t) =>
        t.toLowerCase().includes(tagSearch.trim().toLowerCase()),
      )
    : availableTags;

  const showCreateOption =
    tagSearch.trim() &&
    !availableTags.some(
      (t) => t.toLowerCase() === tagSearch.trim().toLowerCase(),
    );

  return (
    <div style={{ marginTop: 8, position: "relative" }} ref={dropdownRef}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {/* Active filter badge */}
        {selectedTagFilter !== "__all" && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 8px",
              borderRadius: 999,
              border: `1px solid ${withAlpha(selectedFilterColor, 0.55)}`,
              background: withAlpha(selectedFilterColor, 0.14),
              fontSize: 11,
              color: selectedFilterColor,
              fontWeight: 600,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: getTagColor(selectedTagFilter),
                flexShrink: 0,
              }}
            />
            <span>{selectedTagFilter}</span>
            <button
              type="button"
              onClick={() => {
                setSelectedTagFilter("__all");
                setTagSearch("");
              }}
              style={{
                border: "none",
                background: "transparent",
                color: selectedFilterColor,
                padding: 0,
                cursor: "pointer",
                fontSize: 13,
                lineHeight: 1,
                fontWeight: 700,
              }}
              aria-label="Quitar filtro de etiqueta"
            >
              x
            </button>
          </span>
        )}

        {/* Search input */}
        <input
          type="text"
          placeholder={
            selectedTagFilter === "__all"
              ? "Filtrar por etiqueta..."
              : "Cambiar etiqueta..."
          }
          value={tagSearch}
          onChange={(e) => setTagSearch(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            minWidth: 0,
            border: showDropdown
              ? "1px solid #93c5fd"
              : "1px solid #d6dde6",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12,
            fontFamily: FONT,
            background: "#ffffff",
            color: "#0f172a",
            outline: "none",
            boxShadow: showDropdown
              ? "0 0 0 3px rgba(59, 130, 246, 0.1)"
              : "none",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
        />
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "#ffffff",
            border: "1px solid #d6dde6",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
            zIndex: 50,
            maxHeight: 220,
            overflowY: "auto",
            animation: "tagDropdownIn 0.15s ease-out",
          }}
        >
          {/* "All tags" option */}
          {!tagSearch.trim() && (
            <button
              type="button"
              onClick={() => selectTag("__all")}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                gap: 8,
                textAlign: "left",
                padding: "9px 12px",
                fontSize: 12,
                fontFamily: FONT,
                border: "none",
                borderBottom:
                  availableTags.length > 0
                    ? "1px solid #f1f5f9"
                    : "none",
                background:
                  selectedTagFilter === "__all"
                    ? "#f0f7ff"
                    : "transparent",
                color: "#3b82f6",
                cursor: "pointer",
                fontWeight: 700,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f0f7ff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  selectedTagFilter === "__all"
                    ? "#f0f7ff"
                    : "transparent";
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#3b82f6",
                  flexShrink: 0,
                }}
              />
              Todas las etiquetas
              {selectedTagFilter === "__all" && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  style={{ marginLeft: "auto" }}
                >
                  <title>Seleccionado</title>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          )}

          {/* Tag list */}
          {filteredTags.map((tag) => {
            const isActive =
              selectedTagFilter.toLowerCase() === tag.toLowerCase();
            const tagColor = getTagColor(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => selectTag(tag)}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                  padding: "9px 12px",
                  fontSize: 12,
                  fontFamily: FONT,
                  border: "none",
                  background: isActive
                    ? withAlpha(tagColor, 0.08)
                    : "transparent",
                  color: tagColor,
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = withAlpha(
                    tagColor,
                    0.08,
                  );
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isActive
                    ? withAlpha(tagColor, 0.08)
                    : "transparent";
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: tagColor,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tag}
                </span>
                {isActive && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={tagColor}
                    strokeWidth="2.5"
                    style={{ flexShrink: 0 }}
                  >
                    <title>Seleccionado</title>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}

          {/* Create new tag */}
          {showCreateOption && (
            <button
              type="button"
              onClick={() => {
                const created = onCreateTag(tagSearch);
                if (created) selectTag(created);
              }}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                gap: 8,
                textAlign: "left",
                padding: "9px 12px",
                fontSize: 12,
                fontFamily: FONT,
                border: "none",
                borderTop: "1px solid #f1f5f9",
                background: "transparent",
                color: getTagColor(tagSearch),
                cursor: "pointer",
                fontWeight: 600,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f8fafc";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: getTagColor(tagSearch),
                  flexShrink: 0,
                }}
              />
              <span>+ Crear &ldquo;{tagSearch.trim()}&rdquo;</span>
            </button>
          )}

          {/* No results (when search matches exactly an existing tag but nothing else) */}
          {tagSearch.trim() &&
            filteredTags.length === 0 &&
            !showCreateOption && (
              <div
                style={{
                  padding: "9px 12px",
                  fontSize: 12,
                  color: "#94a3b8",
                  fontStyle: "italic",
                }}
              >
                No hay mas resultados
              </div>
            )}
        </div>
      )}
    </div>
  );
});
