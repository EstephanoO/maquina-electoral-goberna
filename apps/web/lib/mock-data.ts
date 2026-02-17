/**
 * GOBERNA — Mock Data (Legacy)
 * This file is being phased out. Use lib/constants for constants
 * and lib/types for type definitions.
 * 
 * @deprecated Import from lib/constants and lib/types instead.
 */

// Re-export constants for backward compatibility
export { CARGO_OPTIONS } from "./constants";

// Legacy types that may still be used elsewhere
// TODO: Migrate consumers to use lib/types

export type MockRole = "admin" | "candidato" | "operadora";

export type MockCandidate = {
  id: string;
  name: string;
  slug: string;
  cargo: string;
  numero: number;
  partido: string;
  foto_url: string | null;
  logo_partido_url: string | null;
  color_primario: string;
  color_secundario: string;
  status: "active" | "paused" | "archived";
  agentes_count: number;
  operadoras_count: number;
  forms_count: number;
};

export type MockAgent = {
  id: string;
  name: string;
  email: string;
  campaign_id: string;
  status: "online" | "offline";
  last_activity: string;
  forms_sent: number;
  zona: string;
  lat: number;
  lng: number;
};

export type MockOperadora = {
  id: string;
  name: string;
  email: string;
  campaign_id: string;
  status: "active" | "inactive";
  submissions_processed: number;
  last_activity: string;
};

export type MockSubmission = {
  id: string;
  campaign_id: string;
  form_name: string;
  form_id: string;
  agent_name: string;
  agent_id: string;
  submitted_at: string;
  zona: string;
  status: "nuevo" | "revisado" | "procesado";
  lat: number;
  lng: number;
  data: Record<string, string | number | boolean>;
};

export type MockFormDefinition = {
  id: string;
  campaign_id: string;
  name: string;
  slug: string;
  description: string;
  status: "active" | "draft";
  fields_count: number;
};

// Empty arrays - real data comes from API
export const MOCK_CANDIDATES: MockCandidate[] = [];
export const MOCK_AGENTS: MockAgent[] = [];
export const MOCK_OPERADORAS: MockOperadora[] = [];
export const MOCK_FORM_DEFINITIONS: MockFormDefinition[] = [];
export const MOCK_SUBMISSIONS: MockSubmission[] = [];

// Helper functions (deprecated - data should come from API)
export function getCandidateAgents(_campaignId: string): MockAgent[] {
  return [];
}

export function getCandidateOperadoras(_campaignId: string): MockOperadora[] {
  return [];
}

export function getCandidateSubmissions(_campaignId: string): MockSubmission[] {
  return [];
}

export function getCandidateForms(_campaignId: string): MockFormDefinition[] {
  return [];
}

export function getAdminKPIs() {
  return {
    totalCandidates: 0,
    totalAgentsOnline: 0,
    totalFormsToday: 0,
    totalPendingSubmissions: 0,
  };
}

export function getCandidatoKPIs(_campaignId: string) {
  return {
    agentsOnline: 0,
    formsToday: 0,
    pendingSubmissions: 0,
    totalAgents: 0,
  };
}

export function getOperadoraKPIs(_campaignId: string) {
  return {
    pendingSubmissions: 0,
    processedToday: 0,
  };
}
