/* ========== Tierra Map — Domain Types ========== */

import type { FilterSpecification } from "maplibre-gl";

/* ─── Agent ─── */

export type AgentStatus = "connected" | "idle" | "inactive";

export type EnrichedAgent = {
  id: string;
  name: string;
  status: AgentStatus;
  lastSeen: Date;
  forms_count: number;
  lat: number;
  lng: number;
};

/* ─── Forms ─── */

export type FormPoint = {
  id: string;
  lat: number;
  lng: number;
  nombre: string;
  created_at: string;
  agent_id?: string;
};

/* ─── Drill Navigation ─── */

export type DrillLevel = 0 | 1 | 2 | 3 | 4;

export type DrillState = {
  level: DrillLevel;
  /** Selected departamento code (CODDEP, 2 chars) */
  depCode: string | null;
  depName: string | null;
  /** Selected provincia code (CODDEP+CODPROV, 4 chars) */
  provCode: string | null;
  provName: string | null;
  /** Selected distrito code (UBIGEO, 6 chars) */
  distCode: string | null;
  distName: string | null;
  /** Selected sector number */
  sector: number | null;
  sectorName: string | null;
};

export const INITIAL_DRILL: DrillState = {
  level: 0,
  depCode: null, depName: null,
  provCode: null, provName: null,
  distCode: null, distName: null,
  sector: null, sectorName: null,
};

/* ─── Map Handle (imperative API) ─── */

export type TierraMapHandle = {
  flyToPoint: (lng: number, lat: number, zoom?: number) => void;
  getDrillState: () => DrillState;
};

/* ─── Drill Filters (output of useDrillFilters) ─── */

export type DrillFilters = {
  depFillFilter: FilterSpecification;
  depLineFilter: FilterSpecification;
  provFillFilter: FilterSpecification;
  provLineFilter: FilterSpecification;
  distFillFilter: FilterSpecification;
  distLineFilter: FilterSpecification;
  priorityDepFilter: FilterSpecification;
  priorityProvFilter: FilterSpecification;
  priorityDistFilter: FilterSpecification;
  sectorFilter: FilterSpecification;
};

/* ─── Map Props ─── */

export type TierraMapProps = {
  campaignId: string;
  slug: string;
  primaryColor: string;
  agents: EnrichedAgent[];
  forms: FormPoint[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  showTracking: boolean;
  showDatos: boolean;
  showHeatmap: boolean;
  drillState: DrillState;
  onDrillChange: (state: DrillState) => void;
};
