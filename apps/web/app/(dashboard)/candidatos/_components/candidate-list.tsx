/**
 * GOBERNA — CandidateList Component
 * Display list of candidates or empty state.
 */

"use client";

import { EmptyState, UsersIcon } from "../../../../lib/ui";
import type { Campaign } from "../../../../lib/types";
import { CandidateCard } from "./candidate-card";

type CandidateListProps = {
  candidates: Campaign[];
  onEdit?: (candidate: Campaign) => void;
};

export function CandidateList({ candidates, onEdit }: CandidateListProps) {
  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={<UsersIcon />}
        title="No hay candidatos registrados"
        description='Hacé clic en "Nuevo Candidato" para agregar uno.'
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {candidates.map((c) => (
        <CandidateCard key={c.id} candidate={c} onEdit={onEdit} />
      ))}
    </div>
  );
}
