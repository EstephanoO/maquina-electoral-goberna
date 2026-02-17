/**
 * GOBERNA — CandidateCard Component
 * Display a single candidate in the list.
 */

"use client";

import { useRouter } from "next/navigation";
import { Avatar, StatusBadge, Button } from "../../../../lib/ui";
import { FONT_STACK } from "../../../../lib/constants";
import type { Campaign } from "../../../../lib/types";

type CandidateCardProps = {
  candidate: Campaign;
};

export function CandidateCard({ candidate }: CandidateCardProps) {
  const router = useRouter();
  const colorPrimario = candidate.config?.color_primario ?? "#163960";

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "16px 20px",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      {/* Photo */}
      <Avatar
        name={candidate.name}
        imageUrl={candidate.foto_url}
        size={48}
        borderColor={colorPrimario}
      />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>
            {candidate.name}
          </span>
          {candidate.numero && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "1px 8px",
                borderRadius: 10,
                background: "var(--goberna-gold-100)",
                color: "var(--goberna-gold-600)",
              }}
            >
              #{candidate.numero}
            </span>
          )}
          <StatusBadge status={candidate.status} />
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
          {candidate.cargo ?? ""}
          {candidate.cargo && candidate.partido ? " — " : ""}
          {candidate.partido ?? ""}
          {candidate.user_count !== undefined && (
            <span>
              {" "}
              &middot; {candidate.user_count} usuario{candidate.user_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
            fontFamily: "monospace",
          }}
        >
          {candidate.slug}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => router.push(`/candidatos/${candidate.slug}/tierra`)}
        >
          Dashboard
        </Button>
      </div>
    </div>
  );
}
