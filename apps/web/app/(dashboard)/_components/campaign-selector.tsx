"use client";

/**
 * CampaignSelector — dropdown for switching between campaigns.
 * Extracted from layout.tsx.
 */

import { useState, useCallback, memo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronIcon } from "./icons";

// ── Types ───────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  name: string;
  slug?: string;
};

type CampaignSelectorProps = {
  campaigns: Campaign[];
  activeCampaignId: string | null;
  isAdmin: boolean;
  setActiveCampaign: (id: string | null) => void;
};

// ── Component ───────────────────────────────────────────────────────

export const CampaignSelector = memo(function CampaignSelector({
  campaigns,
  activeCampaignId,
  isAdmin,
  setActiveCampaign,
}: CampaignSelectorProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);

  const handleSelect = useCallback(
    (campaignId: string | null, slug?: string) => {
      setActiveCampaign(campaignId);
      setOpen(false);

      // If on a /candidatos/[slug]/* route, navigate to same sub-route with new slug
      if (campaignId && slug) {
        const slugMatch = pathname.match(/^\/candidatos\/([^/]+)(\/.*)?$/);
        if (slugMatch && slugMatch[1] !== slug) {
          const subPath = slugMatch[2] ?? "/tierra";
          router.push(`/candidatos/${slug}${subPath}`);
        }
      }
    },
    [setActiveCampaign, pathname, router],
  );

  return (
    <div
      style={{
        padding: "10px 16px",
        borderTop: "1px solid var(--sidebar-border)",
        position: "relative",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          padding: "8px 12px",
          background: activeCampaignId
            ? "rgba(255,255,255,0.05)"
            : "rgba(255,200,0,0.06)",
          border: activeCampaignId
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid rgba(255,200,0,0.15)",
          borderRadius: "var(--radius-sm)",
          color: "#ffffff",
          fontSize: 12,
          fontWeight: 500,
          fontFamily: "inherit",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition:
            "background var(--duration-fast) ease, border-color var(--duration-fast) ease",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {activeCampaign?.name ??
            (isAdmin ? "Admin — General" : "Seleccionar campaña")}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 16,
            right: 16,
            background: "var(--goberna-blue-900)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 -8px 24px rgba(0,0,0,0.35)",
            maxHeight: 220,
            overflowY: "auto",
            zIndex: 10,
            marginBottom: 4,
          }}
        >
          {/* Admin global option */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => handleSelect(null)}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: !activeCampaignId
                  ? "rgba(255,200,0,0.08)"
                  : "transparent",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                color: !activeCampaignId
                  ? "var(--goberna-gold)"
                  : "rgba(255,255,255,0.7)",
                fontSize: 12,
                fontWeight: !activeCampaignId ? 700 : 400,
                fontFamily: "inherit",
                cursor: "pointer",
                textAlign: "left",
                transition: "background var(--duration-fast) ease",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flexShrink: 0, opacity: 0.7 }}
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Admin — General
            </button>
          )}
          {campaigns.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => handleSelect(c.id, c.slug)}
              style={{
                width: "100%",
                padding: "10px 12px",
                background:
                  c.id === activeCampaignId
                    ? "rgba(255,200,0,0.08)"
                    : "transparent",
                border: "none",
                color:
                  c.id === activeCampaignId
                    ? "var(--goberna-gold)"
                    : "rgba(255,255,255,0.7)",
                fontSize: 12,
                fontWeight: c.id === activeCampaignId ? 600 : 400,
                fontFamily: "inherit",
                cursor: "pointer",
                textAlign: "left",
                transition: "background var(--duration-fast) ease",
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
