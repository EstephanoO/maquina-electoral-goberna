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
  telefono: string;
  encuestador: string;
  created_at: string;
  agent_id?: string;
};

export type DatosVizMode = "points" | "heatmap" | "bars3d";
export type MapTheme = "dark" | "light";

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

/* ─── Pinned tooltip data (passed from datos → map) ─── */

export type PinnedTooltipData = {
  lng: number;
  lat: number;
  nombre: string;
  telefono: string;
  encuestador: string;
  created_at: string;
};

export type CameraNudge = {
  panX?: number;
  panY?: number;
  zoomDelta?: number;
  bearingDelta?: number;
  pitchDelta?: number;
};

/* ─── Map Handle (imperative API) ─── */

export type TierraMapHandle = {
  flyToPoint: (lng: number, lat: number, zoom?: number, withDrill?: boolean) => void;
  getDrillState: () => DrillState;
  /** Show a pinned tooltip for a specific form point after flyTo completes */
  showPinnedTooltip: (data: PinnedTooltipData) => void;
  /** Small camera step (pan/zoom/rotate/pitch) for external UI controls */
  nudgeCamera: (delta: CameraNudge) => void;
  /** Reset angle only (north-up + flat) */
  resetCameraOrientation: () => void;
  /** Reset to Perú default position */
  resetCameraPosition: () => void;
  /**
   * Fit map to given bounds, bypassing useAutoFit (sets skipNextFit internally).
   * Use this when the caller already has the bounding box (e.g. demo mode).
   */
  fitToBounds: (bounds: [[number, number], [number, number]], padding?: number) => void;
  /**
   * Disable useAutoFit permanently for this map instance.
   * Once called, the map never auto-fits again — the caller owns the camera.
   * Used by demo mode to prevent any source from resetting the viewport.
   */
  disableAutoFit: () => void;
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
  datosVizMode: DatosVizMode;
  heatmapRadius: number;
  heatmapOpacity: number;
  mapTheme: MapTheme;
  showRoutes: boolean;
  drillState: DrillState;
  onDrillChange: (state: DrillState) => void;
  onMapDoubleClick?: () => void;
  /**
   * When set, the map is locked to these bounds forever:
   * - initialViewState is derived from them (no Peru flash)
   * - autoFit is permanently disabled
   * - handleLoad re-applies fitBounds with duration:0 as a hard pin
   * - pendingDrillRef is never set (no reverse-geocode drift)
   */
  lockedBounds?: [[number, number], [number, number]];
};

/* ─── Log Entries ─── */

export type LogEntry = {
  id: string;
  type: "form_submitted" | "agent_connected" | "agent_disconnected" | "form_new";
  agentName: string;
  message: string;
  timestamp: Date;
  /** Coordinates for fly-to on click (null = no location) */
  lat: number | null;
  lng: number | null;
  /** Enriched form data — only present for form_new/form_submitted entries */
  nombre?: string;
  telefono?: string;
  zona?: string;
  encuestador?: string;
  /** Original form submission ID (for delete operations) */
  formId?: string;
  /** Campaign ID the form belongs to */
  campaignId?: string;
};
