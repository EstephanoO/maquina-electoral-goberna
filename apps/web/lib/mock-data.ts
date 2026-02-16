/**
 * GOBERNA — Centralized Mock Data
 * Used across all UI pages during the mock/UI-only phase.
 * No backend calls — everything renders from these constants.
 */

// ── Types ───────────────────────────────────────────────────────────

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

// ── Candidates ──────────────────────────────────────────────────────

export const MOCK_CANDIDATES: MockCandidate[] = [
  {
    id: "cand-001",
    name: "Juan Carlos Ramirez",
    slug: "juan-carlos-ramirez",
    cargo: "Alcalde",
    numero: 7,
    partido: "Partido Nacional",
    foto_url: null,
    logo_partido_url: null,
    color_primario: "#163960",
    color_secundario: "#FFC800",
    status: "active",
    agentes_count: 12,
    operadoras_count: 3,
    forms_count: 4,
  },
  {
    id: "cand-002",
    name: "Maria Elena Torres",
    slug: "maria-elena-torres",
    cargo: "Regidora",
    numero: 12,
    partido: "Fuerza Popular",
    foto_url: null,
    logo_partido_url: null,
    color_primario: "#E85D04",
    color_secundario: "#FFFFFF",
    status: "active",
    agentes_count: 8,
    operadoras_count: 2,
    forms_count: 3,
  },
  {
    id: "cand-003",
    name: "Roberto Diaz Medina",
    slug: "roberto-diaz-medina",
    cargo: "Gobernador Regional",
    numero: 3,
    partido: "Accion Regional",
    foto_url: null,
    logo_partido_url: null,
    color_primario: "#059669",
    color_secundario: "#ECFDF5",
    status: "active",
    agentes_count: 22,
    operadoras_count: 5,
    forms_count: 6,
  },
  {
    id: "cand-004",
    name: "Ana Patricia Vega",
    slug: "ana-patricia-vega",
    cargo: "Congresista",
    numero: 21,
    partido: "Alianza Progresista",
    foto_url: null,
    logo_partido_url: null,
    color_primario: "#7C3AED",
    color_secundario: "#EDE9FE",
    status: "paused",
    agentes_count: 5,
    operadoras_count: 1,
    forms_count: 2,
  },
];

// ── Agents ──────────────────────────────────────────────────────────

export const MOCK_AGENTS: MockAgent[] = [
  { id: "ag-001", name: "Carlos Mendoza", email: "cmendoza@campo.pe", campaign_id: "cand-001", status: "online", last_activity: "2026-02-16T14:32:00Z", forms_sent: 47, zona: "San Juan de Lurigancho", lat: -12.0194, lng: -76.9950 },
  { id: "ag-002", name: "Luis Fernandez", email: "lfernandez@campo.pe", campaign_id: "cand-001", status: "online", last_activity: "2026-02-16T14:28:00Z", forms_sent: 35, zona: "Comas", lat: -11.9468, lng: -77.0482 },
  { id: "ag-003", name: "Rosa Gutierrez", email: "rgutierrez@campo.pe", campaign_id: "cand-001", status: "offline", last_activity: "2026-02-16T11:15:00Z", forms_sent: 28, zona: "Villa El Salvador", lat: -12.2125, lng: -76.9419 },
  { id: "ag-004", name: "Pedro Sanchez", email: "psanchez@campo.pe", campaign_id: "cand-001", status: "online", last_activity: "2026-02-16T14:30:00Z", forms_sent: 52, zona: "Ate", lat: -12.0261, lng: -76.9186 },
  { id: "ag-005", name: "Maria Lopez", email: "mlopez@campo.pe", campaign_id: "cand-001", status: "offline", last_activity: "2026-02-15T18:45:00Z", forms_sent: 19, zona: "San Martin de Porres", lat: -12.0090, lng: -77.0568 },
  { id: "ag-006", name: "Jorge Vargas", email: "jvargas@campo.pe", campaign_id: "cand-001", status: "online", last_activity: "2026-02-16T14:25:00Z", forms_sent: 41, zona: "Independencia", lat: -11.9900, lng: -77.0500 },
  { id: "ag-007", name: "Susana Rios", email: "srios@campo.pe", campaign_id: "cand-002", status: "online", last_activity: "2026-02-16T14:20:00Z", forms_sent: 31, zona: "Trujillo Centro", lat: -8.1116, lng: -79.0287 },
  { id: "ag-008", name: "Fernando Castro", email: "fcastro@campo.pe", campaign_id: "cand-002", status: "offline", last_activity: "2026-02-16T10:00:00Z", forms_sent: 22, zona: "La Esperanza", lat: -8.0785, lng: -79.0440 },
];

// ── Operadoras ──────────────────────────────────────────────────────

export const MOCK_OPERADORAS: MockOperadora[] = [
  { id: "op-001", name: "Diana Paredes", email: "dparedes@goberna.pe", campaign_id: "cand-001", status: "active", submissions_processed: 142, last_activity: "2026-02-16T14:35:00Z" },
  { id: "op-002", name: "Lucia Herrera", email: "lherrera@goberna.pe", campaign_id: "cand-001", status: "active", submissions_processed: 98, last_activity: "2026-02-16T14:20:00Z" },
  { id: "op-003", name: "Carmen Flores", email: "cflores@goberna.pe", campaign_id: "cand-001", status: "inactive", submissions_processed: 67, last_activity: "2026-02-14T16:00:00Z" },
  { id: "op-004", name: "Patricia Rojas", email: "projas@goberna.pe", campaign_id: "cand-002", status: "active", submissions_processed: 54, last_activity: "2026-02-16T13:50:00Z" },
];

// ── Form Definitions ────────────────────────────────────────────────

export const MOCK_FORM_DEFINITIONS: MockFormDefinition[] = [
  { id: "form-001", campaign_id: "cand-001", name: "Encuesta Puerta a Puerta", slug: "encuesta-puerta", description: "Encuesta basica de intencion de voto", status: "active", fields_count: 8 },
  { id: "form-002", campaign_id: "cand-001", name: "Registro de Simpatizante", slug: "registro-simpatizante", description: "Registro de nuevos simpatizantes", status: "active", fields_count: 6 },
  { id: "form-003", campaign_id: "cand-001", name: "Reporte de Actividad", slug: "reporte-actividad", description: "Reporte diario del agente", status: "draft", fields_count: 5 },
  { id: "form-004", campaign_id: "cand-001", name: "Necesidades del Barrio", slug: "necesidades-barrio", description: "Relevamiento de problemas locales", status: "active", fields_count: 10 },
  { id: "form-005", campaign_id: "cand-002", name: "Encuesta Distrital", slug: "encuesta-distrital", description: "Encuesta por distrito", status: "active", fields_count: 7 },
  { id: "form-006", campaign_id: "cand-002", name: "Evento de Campana", slug: "evento-campana", description: "Registro de asistentes a eventos", status: "active", fields_count: 5 },
];

// ── Submissions ─────────────────────────────────────────────────────

export const MOCK_SUBMISSIONS: MockSubmission[] = [
  {
    id: "sub-001", campaign_id: "cand-001", form_name: "Encuesta Puerta a Puerta", form_id: "form-001",
    agent_name: "Carlos Mendoza", agent_id: "ag-001", submitted_at: "2026-02-16T14:32:00Z",
    zona: "San Juan de Lurigancho", status: "nuevo", lat: -12.0194, lng: -76.9950,
    data: { nombre: "Jose Gutierrez", edad: 45, intencion_voto: "Candidato A", problema_principal: "Seguridad ciudadana", telefono: "987654321" },
  },
  {
    id: "sub-002", campaign_id: "cand-001", form_name: "Registro de Simpatizante", form_id: "form-002",
    agent_name: "Luis Fernandez", agent_id: "ag-002", submitted_at: "2026-02-16T14:15:00Z",
    zona: "Comas", status: "nuevo", lat: -11.9468, lng: -77.0482,
    data: { nombre: "Ana Quispe", dni: "45678912", telefono: "912345678", quiere_colaborar: true },
  },
  {
    id: "sub-003", campaign_id: "cand-001", form_name: "Necesidades del Barrio", form_id: "form-004",
    agent_name: "Pedro Sanchez", agent_id: "ag-004", submitted_at: "2026-02-16T13:50:00Z",
    zona: "Ate", status: "revisado", lat: -12.0261, lng: -76.9186,
    data: { barrio: "Santa Clara", problema_1: "Agua potable", problema_2: "Pistas en mal estado", prioridad: "Alta", comentario: "Vecinos muy preocupados por cortes de agua" },
  },
  {
    id: "sub-004", campaign_id: "cand-001", form_name: "Encuesta Puerta a Puerta", form_id: "form-001",
    agent_name: "Rosa Gutierrez", agent_id: "ag-003", submitted_at: "2026-02-16T11:20:00Z",
    zona: "Villa El Salvador", status: "procesado", lat: -12.2125, lng: -76.9419,
    data: { nombre: "Miguel Torres", edad: 32, intencion_voto: "Candidato B", problema_principal: "Empleo", telefono: "956789123" },
  },
  {
    id: "sub-005", campaign_id: "cand-001", form_name: "Encuesta Puerta a Puerta", form_id: "form-001",
    agent_name: "Carlos Mendoza", agent_id: "ag-001", submitted_at: "2026-02-16T10:45:00Z",
    zona: "San Juan de Lurigancho", status: "revisado", lat: -12.0210, lng: -76.9980,
    data: { nombre: "Luisa Paredes", edad: 58, intencion_voto: "Candidato A", problema_principal: "Salud publica", telefono: "934567891" },
  },
  {
    id: "sub-006", campaign_id: "cand-001", form_name: "Registro de Simpatizante", form_id: "form-002",
    agent_name: "Jorge Vargas", agent_id: "ag-006", submitted_at: "2026-02-16T09:30:00Z",
    zona: "Independencia", status: "nuevo", lat: -11.9900, lng: -77.0500,
    data: { nombre: "Roberto Flores", dni: "12345678", telefono: "978123456", quiere_colaborar: false },
  },
  {
    id: "sub-007", campaign_id: "cand-001", form_name: "Necesidades del Barrio", form_id: "form-004",
    agent_name: "Luis Fernandez", agent_id: "ag-002", submitted_at: "2026-02-16T08:15:00Z",
    zona: "Comas", status: "procesado", lat: -11.9500, lng: -77.0450,
    data: { barrio: "La Pascana", problema_1: "Alumbrado publico", problema_2: "Recojo de basura", prioridad: "Media", comentario: "Zona oscura por las noches" },
  },
  {
    id: "sub-008", campaign_id: "cand-001", form_name: "Reporte de Actividad", form_id: "form-003",
    agent_name: "Pedro Sanchez", agent_id: "ag-004", submitted_at: "2026-02-15T17:00:00Z",
    zona: "Ate", status: "procesado", lat: -12.0300, lng: -76.9200,
    data: { casas_visitadas: 23, personas_contactadas: 31, incidencias: "Ninguna", horas_trabajo: 6 },
  },
  {
    id: "sub-009", campaign_id: "cand-002", form_name: "Encuesta Distrital", form_id: "form-005",
    agent_name: "Susana Rios", agent_id: "ag-007", submitted_at: "2026-02-16T14:10:00Z",
    zona: "Trujillo Centro", status: "nuevo", lat: -8.1116, lng: -79.0287,
    data: { nombre: "Eduardo Chavez", edad: 40, distrito: "Trujillo", intencion_voto: "Candidato C", satisfaccion_actual: 3 },
  },
  {
    id: "sub-010", campaign_id: "cand-002", form_name: "Evento de Campana", form_id: "form-006",
    agent_name: "Susana Rios", agent_id: "ag-007", submitted_at: "2026-02-16T12:00:00Z",
    zona: "Trujillo Centro", status: "revisado", lat: -8.1100, lng: -79.0300,
    data: { evento: "Caravana distrital", asistentes: 150, fotos_tomadas: true, comentario: "Gran acogida en el mercado central" },
  },
  {
    id: "sub-011", campaign_id: "cand-001", form_name: "Encuesta Puerta a Puerta", form_id: "form-001",
    agent_name: "Maria Lopez", agent_id: "ag-005", submitted_at: "2026-02-15T16:30:00Z",
    zona: "San Martin de Porres", status: "nuevo", lat: -12.0090, lng: -77.0568,
    data: { nombre: "Carmen Huaman", edad: 67, intencion_voto: "Indeciso", problema_principal: "Transporte", telefono: "945678123" },
  },
  {
    id: "sub-012", campaign_id: "cand-001", form_name: "Registro de Simpatizante", form_id: "form-002",
    agent_name: "Carlos Mendoza", agent_id: "ag-001", submitted_at: "2026-02-15T15:00:00Z",
    zona: "San Juan de Lurigancho", status: "procesado", lat: -12.0180, lng: -76.9960,
    data: { nombre: "Patricia Ramos", dni: "78901234", telefono: "923456789", quiere_colaborar: true },
  },
  {
    id: "sub-013", campaign_id: "cand-001", form_name: "Necesidades del Barrio", form_id: "form-004",
    agent_name: "Jorge Vargas", agent_id: "ag-006", submitted_at: "2026-02-15T14:00:00Z",
    zona: "Independencia", status: "revisado", lat: -11.9920, lng: -77.0520,
    data: { barrio: "Ermitano", problema_1: "Areas verdes", problema_2: "Seguridad", prioridad: "Alta", comentario: "Parque central abandonado" },
  },
  {
    id: "sub-014", campaign_id: "cand-001", form_name: "Encuesta Puerta a Puerta", form_id: "form-001",
    agent_name: "Rosa Gutierrez", agent_id: "ag-003", submitted_at: "2026-02-15T10:30:00Z",
    zona: "Villa El Salvador", status: "procesado", lat: -12.2150, lng: -76.9400,
    data: { nombre: "Diego Mamani", edad: 28, intencion_voto: "Candidato A", problema_principal: "Educacion", telefono: "967891234" },
  },
  {
    id: "sub-015", campaign_id: "cand-001", form_name: "Reporte de Actividad", form_id: "form-003",
    agent_name: "Luis Fernandez", agent_id: "ag-002", submitted_at: "2026-02-15T17:30:00Z",
    zona: "Comas", status: "nuevo", lat: -11.9480, lng: -77.0490,
    data: { casas_visitadas: 18, personas_contactadas: 25, incidencias: "Perro agresivo en manzana C", horas_trabajo: 5 },
  },
];

// ── Helper functions ────────────────────────────────────────────────

export function getCandidateAgents(campaignId: string): MockAgent[] {
  return MOCK_AGENTS.filter((a) => a.campaign_id === campaignId);
}

export function getCandidateOperadoras(campaignId: string): MockOperadora[] {
  return MOCK_OPERADORAS.filter((o) => o.campaign_id === campaignId);
}

export function getCandidateSubmissions(campaignId: string): MockSubmission[] {
  return MOCK_SUBMISSIONS.filter((s) => s.campaign_id === campaignId);
}

export function getCandidateForms(campaignId: string): MockFormDefinition[] {
  return MOCK_FORM_DEFINITIONS.filter((f) => f.campaign_id === campaignId);
}

// ── Global KPIs ─────────────────────────────────────────────────────

export function getAdminKPIs() {
  const totalAgentsOnline = MOCK_AGENTS.filter((a) => a.status === "online").length;
  const totalFormsToday = MOCK_SUBMISSIONS.filter((s) => s.submitted_at.startsWith("2026-02-16")).length;
  const totalPendingSubmissions = MOCK_SUBMISSIONS.filter((s) => s.status === "nuevo").length;
  return {
    totalCandidates: MOCK_CANDIDATES.filter((c) => c.status === "active").length,
    totalAgentsOnline,
    totalFormsToday,
    totalPendingSubmissions,
  };
}

export function getCandidatoKPIs(campaignId: string) {
  const agents = getCandidateAgents(campaignId);
  const submissions = getCandidateSubmissions(campaignId);
  const today = submissions.filter((s) => s.submitted_at.startsWith("2026-02-16"));
  return {
    agentsOnline: agents.filter((a) => a.status === "online").length,
    formsToday: today.length,
    pendingSubmissions: submissions.filter((s) => s.status === "nuevo").length,
    totalAgents: agents.length,
  };
}

export function getOperadoraKPIs(campaignId: string) {
  const submissions = getCandidateSubmissions(campaignId);
  const today = submissions.filter((s) => s.submitted_at.startsWith("2026-02-16"));
  return {
    pendingSubmissions: submissions.filter((s) => s.status === "nuevo").length,
    processedToday: today.filter((s) => s.status === "procesado").length,
  };
}

// ── Cargo options ───────────────────────────────────────────────────

export const CARGO_OPTIONS = [
  "Alcalde",
  "Regidor",
  "Congresista",
  "Gobernador Regional",
  "Consejero Regional",
  "Alcalde Distrital",
] as const;
