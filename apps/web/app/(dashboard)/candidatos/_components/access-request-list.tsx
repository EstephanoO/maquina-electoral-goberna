/**
 * GOBERNA — AccessRequestList Component
 * Display list of access requests or empty state.
 */

"use client";

import { EmptyState, CheckCircleIcon } from "../../../../lib/ui";
import type { AccessRequest } from "../../../../lib/types";
import { AccessRequestCard } from "./access-request-card";

type AccessRequestListProps = {
  requests: AccessRequest[];
  onResolved: () => void;
};

export function AccessRequestList({ requests, onResolved }: AccessRequestListProps) {
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircleIcon />}
        title="No hay solicitudes pendientes"
        description="Todas las solicitudes fueron procesadas."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {requests.map((req) => (
        <AccessRequestCard key={req.id} request={req} onResolved={onResolved} />
      ))}
    </div>
  );
}
