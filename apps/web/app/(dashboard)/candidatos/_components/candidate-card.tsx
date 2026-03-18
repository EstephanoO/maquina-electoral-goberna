/**
 * GOBERNA — CandidateCard Component
 * Display a single candidate in the list with actions for Tierra, Digital, and GA4 upload.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, StatusBadge, Button } from "../../../../lib/ui";
import type { Campaign } from "../../../../lib/types";
import { UploadGA4Modal } from "./upload-ga4-modal";

type CandidateCardProps = {
  candidate: Campaign;
  onEdit?: (candidate: Campaign) => void;
  onGA4Uploaded?: () => void;
};

export function CandidateCard({ candidate, onEdit, onGA4Uploaded }: CandidateCardProps) {
  const router = useRouter();
  const [showGA4Modal, setShowGA4Modal] = useState(false);
  const colorPrimario = candidate.config?.color_primario ?? "#163960";

  // Check if candidate has GA4 data (we'll use config to track this)
  const hasGA4Data = candidate.config?.has_ga4_data === true;

  return (
    <>
      <div style={styles.card}>
        {/* Photo */}
        <Avatar
          name={candidate.name}
          imageUrl={candidate.foto_url}
          size={48}
          borderColor={colorPrimario}
        />

        {/* Info */}
        <div style={styles.info}>
          <div style={styles.nameRow}>
            <span style={styles.name}>{candidate.name}</span>
            {candidate.numero && (
              <span style={styles.numero}>#{candidate.numero}</span>
            )}
            <StatusBadge status={candidate.status} />
          </div>
          <div style={styles.meta}>
            {candidate.cargo ?? ""}
            {candidate.cargo && candidate.partido ? " — " : ""}
            {candidate.partido ?? ""}
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          {/* Slug */}
          <span style={styles.slug}>{candidate.slug}</span>

          {/* Edit */}
          {onEdit && (
            <Button variant="secondary" size="sm" onClick={() => onEdit(candidate)}>
              Editar
            </Button>
          )}

          {/* Territorio */}
          <button
            type="button"
            onClick={() => router.push(`/candidatos/${candidate.slug}/tierra`)}
            style={{ ...styles.actionBtn, ...styles.tierraBtn }}
            title="Ver territorio"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            Territorio
          </button>

          {/* Analytics */}
          <button
            type="button"
            onClick={() => router.push(`/candidatos/${candidate.slug}/analytics`)}
            style={{ 
              ...styles.actionBtn, 
              ...styles.digitalBtn,
              opacity: hasGA4Data ? 1 : 0.5,
            }}
            title={hasGA4Data ? "Ver analytics" : "Sin datos GA4"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 20V10" />
              <path d="M12 20V4" />
              <path d="M6 20v-6" />
            </svg>
            Analytics
            {!hasGA4Data && <span style={styles.noBadge}>!</span>}
          </button>

          {/* Subir GA4 */}
          <button
            type="button"
            onClick={() => setShowGA4Modal(true)}
            style={{ ...styles.actionBtn, ...styles.uploadBtn }}
            title="Subir datos de GA4"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            GA4
          </button>
        </div>
      </div>

      {/* Upload GA4 Modal */}
      <UploadGA4Modal
        open={showGA4Modal}
        onClose={() => setShowGA4Modal(false)}
        campaign={candidate}
        onSuccess={() => {
          setShowGA4Modal(false);
          onGA4Uploaded?.();
        }}
      />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 12,
    padding: "16px 20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  name: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--color-text-primary)",
  },
  numero: {
    fontSize: 12,
    fontWeight: 700,
    padding: "1px 8px",
    borderRadius: 10,
    background: "var(--goberna-gold-100)",
    color: "var(--goberna-gold-600)",
  },
  meta: {
    fontSize: 12,
    color: "var(--color-text-tertiary)",
    marginTop: 2,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  slug: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--color-text-tertiary)",
    fontFamily: "monospace",
    marginRight: 4,
  },
  actionBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  tierraBtn: {
    backgroundColor: "var(--color-success-bg)",
    borderColor: "var(--color-success-border)",
    color: "var(--color-success)",
  },
  digitalBtn: {
    backgroundColor: "var(--color-info-bg)",
    borderColor: "var(--color-info-border)",
    color: "var(--color-info)",
    position: "relative" as const,
  },
  uploadBtn: {
    backgroundColor: "var(--color-warning-bg)",
    borderColor: "var(--color-warning-border)",
    color: "var(--color-warning)",
  },
  noBadge: {
    position: "absolute" as const,
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: "50%",
    backgroundColor: "var(--color-warning)",
    color: "var(--color-text-on-primary)",
    fontSize: 10,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
