/**
 * Cliente para el enrichment de fase-2 desde `onboarding_fase1`.
 *
 * Estos endpoints viven en el backend y leen del pool secundario
 * (ONBOARDING_DATABASE_URL). Si esa env no está, los endpoints devuelven
 * 503 y este cliente retorna null silenciosamente — las slides aplican
 * graceful degradation.
 */
import { api } from "./api-client";

export type DistritoDetail = {
  id: number;
  distrito: string;
  id_provincia: number;
  provincia: string;
  id_departamento: number;
  departamento: string;
  poblacion_total_2025: number;
  area_km2: number;
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  centroid: [number, number];
  bbox: [number, number, number, number];
  anio_referencia: number;
  padron: {
    id_eleccion: number;
    eleccion_codigo: string;
    eleccion_nombre: string;
    fuente: string;
    fecha_corte: string | null;
    poblacion_electoral: number | null;
    votos_emitidos: number | null;
  } | null;
  presupuesto: {
    pia: string | null;
    pim: string | null;
    certificacion: string | null;
    compromiso: string | null;
    devengado: string | null;
    girado: string | null;
    nombre_entidad: string | null;
    codigo_pliego: string | null;
    fuente: string;
    fuente_url: string | null;
    fecha_corte: string | null;
  } | null;
  ranking_pim: {
    posicion: number;
    total: number;
    pim: number | null;
  } | null;
};

export type ProvinciaDistritos = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  {
    id: number;
    distrito: string;
    poblacion_total_2025: number;
    area_km2: number;
    densidad_hab_km2: number | null;
  }
>;

/** Fetch detalle del distrito + enrichment. Retorna null si no configurado o no existe. */
export async function fetchDistritoDetail(
  idDistrito: number,
  opts?: { simplify?: 0 | 0.001 | 0.002 | 0.005 | 0.01; anio?: number },
): Promise<DistritoDetail | null> {
  const params = new URLSearchParams();
  if (opts?.simplify !== undefined) params.set("simplify", String(opts.simplify));
  if (opts?.anio) params.set("anio", String(opts.anio));
  const qs = params.toString() ? `?${params}` : "";
  try {
    return await api<DistritoDetail>(`/api/geo/distrito/${idDistrito}${qs}`);
  } catch (e: any) {
    if (e?.status === 503 || e?.status === 404) return null;
    throw e;
  }
}

/** Fetch FeatureCollection de los distritos de una provincia. */
export async function fetchProvinciaDistritos(
  idProvincia: number,
  opts?: { simplify?: 0.001 | 0.002 | 0.005 | 0.01 },
): Promise<ProvinciaDistritos | null> {
  const params = new URLSearchParams();
  if (opts?.simplify !== undefined) params.set("simplify", String(opts.simplify));
  const qs = params.toString() ? `?${params}` : "";
  try {
    return await api<ProvinciaDistritos>(`/api/geo/provincia/${idProvincia}/distritos${qs}`);
  } catch (e: any) {
    if (e?.status === 503 || e?.status === 404) return null;
    throw e;
  }
}

/** Helper: formato Soles peruanos. */
export function formatSoles(value: number | string | null): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  // Soles: "S/ 169.4 M" para millones, "S/ 1.2 B" para billones
  if (n >= 1e9) return `S/ ${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `S/ ${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `S/ ${(n / 1e3).toFixed(0)} K`;
  return `S/ ${n.toFixed(0)}`;
}

/** Helper: formato número con separadores de miles. */
export function formatNumero(value: number | string | null): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-PE");
}

// ── CRM types ─────────────────────────────────────────────────────

export type EstadoPipeline =
  | "lead" | "calificado" | "en_pitch" | "aprobado" | "rechazado" | "pausado";

export type Candidato = {
  id: number;
  slug: string;
  nombres: string;
  apellidos: string;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  foto_url: string | null;
  fecha_nacimiento: string | null;
  lugar_nacimiento: string | null;
  genero: string | null;
  estado_pipeline: EstadoPipeline;
  creado_por_user_id: string | null;
  exported_user_id: string | null;
  exported_at: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type Postulacion = {
  id: number;
  id_candidato: number;
  id_cargo_gobierno: number | null;
  id_organizacion_politica: number | null;
  id_proceso_electoral: number | null;
  id_departamento: number | null;
  id_provincia: number | null;
  id_distrito: number | null;
  cargo_nombre: string | null;
  organizacion_nombre: string | null;
  proceso_descripcion: string | null;
  departamento_nombre: string | null;
  provincia_nombre: string | null;
  distrito_nombre: string | null;
};

export type Formula = {
  id: number;
  orden: number;
  nombres: string;
  apellidos: string;
  dni: string | null;
  cargo_companero: string | null;
  notas: string | null;
};

export type Nota = {
  id: number;
  user_id: string | null;
  texto: string;
  creado_en: string;
};

export type Evento = {
  id: number;
  tipo: string;
  user_id: string | null;
  payload: unknown;
  ocurrido_en: string;
};

export type CandidatoDetail = Candidato & {
  postulacion: Postulacion | null;
  formula: Formula[];
  notas: Nota[];
  eventos: Evento[];
};

// ── Catálogos ─────────────────────────────────────────────────────

export type Cargo = {
  id: number; cargo: string; id_nivel_gobierno: number; nivel: string;
  id_jurisdiccion: number; ambito: string;
};
export type OrganizacionPolitica = { id: number; nombre: string; tipo: string };
export type ProcesoElectoral = { id: number; codigo: string; descripcion: string; dia_eleccion: string | null };
export type Departamento = { id: number; departamento: string };
export type Provincia    = { id: number; provincia: string; id_departamento: number };
export type DistritoCat  = { id: number; distrito: string; id_provincia: number; poblacion_total_2025: number };

// ── Candidatos CRUD ───────────────────────────────────────────────

export async function createCandidato(input: {
  nombres: string; apellidos: string;
  dni?: string; telefono?: string; email?: string;
  fecha_nacimiento?: string; lugar_nacimiento?: string; genero?: string;
}): Promise<Candidato> {
  return api<Candidato>("/api/onboarding-fase1/candidatos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listCandidatos(params: {
  estado?: EstadoPipeline; creado_por?: string; q?: string;
  limit?: number; offset?: number;
} = {}): Promise<{ items: Candidato[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.estado) qs.set("estado", params.estado);
  if (params.creado_por) qs.set("creado_por", params.creado_por);
  if (params.q) qs.set("q", params.q);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return api<{ items: Candidato[]; total: number }>(
    `/api/onboarding-fase1/candidatos${suffix}`,
  );
}

export async function getCandidato(slug: string): Promise<CandidatoDetail> {
  return api<CandidatoDetail>(`/api/onboarding-fase1/candidatos/${slug}`);
}

export async function updateCandidato(
  slug: string,
  patch: Partial<{
    nombres: string; apellidos: string;
    dni: string; telefono: string; email: string;
    fecha_nacimiento: string; lugar_nacimiento: string; genero: string;
    foto_url: string | null;
  }>,
): Promise<Candidato> {
  return api<Candidato>(`/api/onboarding-fase1/candidatos/${slug}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function upsertPostulacion(
  slug: string,
  input: {
    id_cargo_gobierno: number;
    id_organizacion_politica?: number;
    id_proceso_electoral: number;
    id_departamento?: number; id_provincia?: number; id_distrito?: number;
  },
): Promise<Postulacion> {
  return api<Postulacion>(`/api/onboarding-fase1/candidatos/${slug}/postulacion`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function addFormula(
  slug: string,
  input: {
    orden: number; nombres: string; apellidos: string;
    dni?: string; cargo_companero?: string; notas?: string;
  },
): Promise<Formula> {
  return api<Formula>(`/api/onboarding-fase1/candidatos/${slug}/formula`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function addNota(slug: string, texto: string): Promise<Nota> {
  return api<Nota>(`/api/onboarding-fase1/candidatos/${slug}/notas`, {
    method: "POST",
    body: JSON.stringify({ texto }),
  });
}

export async function transicionar(
  slug: string,
  nuevo_estado: EstadoPipeline,
  motivo?: string,
): Promise<Candidato> {
  return api<Candidato>(`/api/onboarding-fase1/candidatos/${slug}/transicion`, {
    method: "POST",
    body: JSON.stringify({ nuevo_estado, motivo }),
  });
}

// ── Catálogos ─────────────────────────────────────────────────────

export async function listCargos(): Promise<Cargo[]> {
  const { items } = await api<{ items: Cargo[] }>("/api/onboarding-fase1/catalogos/cargos");
  return items;
}
export async function listPartidos(): Promise<OrganizacionPolitica[]> {
  const { items } = await api<{ items: OrganizacionPolitica[] }>("/api/onboarding-fase1/catalogos/partidos");
  return items;
}
export async function listProcesos(): Promise<ProcesoElectoral[]> {
  const { items } = await api<{ items: ProcesoElectoral[] }>("/api/onboarding-fase1/catalogos/procesos");
  return items;
}
export async function listDepartamentos(): Promise<Departamento[]> {
  const { items } = await api<{ items: Departamento[] }>("/api/onboarding-fase1/catalogos/departamentos");
  return items;
}
export async function listProvincias(id_departamento?: number): Promise<Provincia[]> {
  const qs = id_departamento ? `?id_departamento=${id_departamento}` : "";
  const { items } = await api<{ items: Provincia[] }>(`/api/onboarding-fase1/catalogos/provincias${qs}`);
  return items;
}
export async function listDistritos(id_provincia?: number): Promise<DistritoCat[]> {
  const qs = id_provincia ? `?id_provincia=${id_provincia}` : "";
  const { items } = await api<{ items: DistritoCat[] }>(`/api/onboarding-fase1/catalogos/distritos${qs}`);
  return items;
}

// ── Consultor form + Deck ─────────────────────────────────────────

export type ConsultorFormState = {
  id_candidato: number;
  payload: Record<string, unknown>;
  ultima_seccion: string | null;
  completado: boolean;
  actualizado_en: string | null;
  actualizado_por: string | null;
};

export async function getConsultorForm(slug: string): Promise<ConsultorFormState> {
  return api<ConsultorFormState>(`/api/onboarding-fase1/candidatos/${slug}/consultor-form`);
}

export async function upsertConsultorForm(
  slug: string,
  input: { payload: Record<string, unknown>; ultima_seccion?: string; completado?: boolean },
): Promise<ConsultorFormState> {
  return api<ConsultorFormState>(`/api/onboarding-fase1/candidatos/${slug}/consultor-form`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function publishDeck(
  slug: string,
  payload: Record<string, unknown>,
): Promise<{ id: number; version: number; publicado_en: string }> {
  return api(`/api/onboarding-fase1/candidatos/${slug}/deck`, {
    method: "POST",
    body: JSON.stringify({ payload }),
  });
}

// ── Helpers de presentación ───────────────────────────────────────

export const ESTADO_LABEL: Record<EstadoPipeline, string> = {
  lead: "Lead",
  calificado: "Calificado",
  en_pitch: "En pitch",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  pausado: "Pausado",
};

export const ESTADO_COLOR: Record<EstadoPipeline, { bg: string; text: string; ring: string }> = {
  lead:       { bg: "bg-slate-100",  text: "text-slate-700",  ring: "ring-slate-200" },
  calificado: { bg: "bg-blue-100",   text: "text-blue-800",   ring: "ring-blue-200" },
  en_pitch:   { bg: "bg-amber-100",  text: "text-amber-800",  ring: "ring-amber-300" },
  aprobado:   { bg: "bg-emerald-100",text: "text-emerald-800",ring: "ring-emerald-300" },
  rechazado:  { bg: "bg-rose-100",   text: "text-rose-800",   ring: "ring-rose-200" },
  pausado:    { bg: "bg-zinc-100",   text: "text-zinc-700",   ring: "ring-zinc-200" },
};

export const ESTADOS_ORDEN: EstadoPipeline[] = [
  "lead", "calificado", "en_pitch", "aprobado", "rechazado", "pausado",
];
