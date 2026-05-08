/**
 * Catalogos API client — read-only desde electoral backend.
 *
 * Alimenta los selectores del wizard de onboarding (Fase 2):
 *   - cargos (cargo_gobierno)
 *   - organizaciones políticas
 *   - jurisdicciones (departamento/provincia/distrito) — stub hasta migración geo
 *
 * En demo mode (NEXT_PUBLIC_DEMO_MODE=true) devuelve mocks PE estáticos
 * para que la UX/UI iterar sin necesidad del backend.
 */

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// En apps/web el fetch va relativo (/api/*) — Next.js rewrites lo proxean
// al backend. Solo usar URL absoluta si NEXT_PUBLIC_ELECTORAL_API_URL viene
// seteada explícitamente (override).
const BASE = process.env.NEXT_PUBLIC_ELECTORAL_API_URL ?? "/api";

const REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    clearTimeout(timer);
    const err = e as Error & { name?: string };
    if (err.name === "AbortError") {
      throw new Error("El servidor está tardando demasiado. Probá de nuevo.");
    }
    throw new Error("Sin conexión con el servidor. Revisá tu internet o probá de nuevo.");
  }
  clearTimeout(timer);

  if (!res.ok) {
    let body: { message?: string; error?: string } | null = null;
    try { body = await res.json(); } catch { /* noop */ }
    if (res.status >= 500) {
      throw new Error(body?.message ?? "El servidor tuvo un problema. Probá en un momento.");
    }
    const msg = body?.message ?? body?.error ?? `Error ${res.status}`;
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

// ── Tipos ────────────────────────────────────────────────────────────

export interface CargoCatalog {
  id: number;
  codigo: string;
  nombre: string;
  ambito_geografico: "pais" | "departamento" | "provincia" | "distrito";
  nivel_id: number;
  nivel_codigo: string;
  nivel_nombre: string;
}

export interface OrganizacionPoliticaCatalog {
  id: number;
  codigo: string;
  nombre: string;
  siglas: string | null;
}

export interface JurisdiccionCatalog {
  id: number;
  codigo: string;
  nombre: string;
  parent_id: number | null;
  /** GeoJSON geometry (Polygon | MultiPolygon) — solo presente si se pidió with_geom */
  geom?: import("geojson").Geometry;
}

// ── Demo mocks ───────────────────────────────────────────────────────

const DEMO_CARGOS: CargoCatalog[] = [
  { id: 1, codigo: "presidente",             nombre: "Presidente",                ambito_geografico: "pais",         nivel_id: 1, nivel_codigo: "nacional", nivel_nombre: "Nacional" },
  { id: 2, codigo: "vicepresidente",         nombre: "Vicepresidente",            ambito_geografico: "pais",         nivel_id: 1, nivel_codigo: "nacional", nivel_nombre: "Nacional" },
  { id: 3, codigo: "congresista",            nombre: "Congresista",               ambito_geografico: "departamento", nivel_id: 1, nivel_codigo: "nacional", nivel_nombre: "Nacional" },
  { id: 4, codigo: "parlamentario_andino",   nombre: "Parlamentario Andino",      ambito_geografico: "pais",         nivel_id: 1, nivel_codigo: "nacional", nivel_nombre: "Nacional" },
  { id: 5, codigo: "gobernador_regional",    nombre: "Gobernador Regional",       ambito_geografico: "departamento", nivel_id: 2, nivel_codigo: "regional", nivel_nombre: "Regional" },
  { id: 6, codigo: "vicegobernador_regional",nombre: "Vicegobernador Regional",   ambito_geografico: "departamento", nivel_id: 2, nivel_codigo: "regional", nivel_nombre: "Regional" },
  { id: 7, codigo: "consejero_regional",     nombre: "Consejero Regional",        ambito_geografico: "provincia",    nivel_id: 2, nivel_codigo: "regional", nivel_nombre: "Regional" },
  { id: 8, codigo: "alcalde_provincial",     nombre: "Alcalde Provincial",        ambito_geografico: "provincia",    nivel_id: 3, nivel_codigo: "local",    nivel_nombre: "Local"    },
  { id: 9, codigo: "alcalde_distrital",      nombre: "Alcalde Distrital",         ambito_geografico: "distrito",     nivel_id: 3, nivel_codigo: "local",    nivel_nombre: "Local"    },
  { id: 10, codigo: "regidor",               nombre: "Regidor",                   ambito_geografico: "distrito",     nivel_id: 3, nivel_codigo: "local",    nivel_nombre: "Local"    },
];

// 16 partidos PE más conocidos (placeholder para iteración UX — el backend tiene la tabla vacía hoy)
const DEMO_ORGS: OrganizacionPoliticaCatalog[] = [
  { id: 1, codigo: "fuerza_popular",     nombre: "Fuerza Popular",        siglas: "FP" },
  { id: 2, codigo: "peru_libre",         nombre: "Perú Libre",            siglas: "PL" },
  { id: 3, codigo: "alianza_pais",       nombre: "Alianza País",          siglas: "AP" },
  { id: 4, codigo: "accion_popular",     nombre: "Acción Popular",        siglas: "AP" },
  { id: 5, codigo: "avanza_pais",        nombre: "Avanza País",           siglas: "AVP" },
  { id: 6, codigo: "renovacion_popular", nombre: "Renovación Popular",    siglas: "RP" },
  { id: 7, codigo: "podemos_peru",       nombre: "Podemos Perú",          siglas: "PP" },
  { id: 8, codigo: "somos_peru",         nombre: "Somos Perú",            siglas: "SP" },
  { id: 9, codigo: "partido_morado",     nombre: "Partido Morado",        siglas: "PM" },
  { id: 10, codigo: "juntos_por_el_peru",nombre: "Juntos por el Perú",    siglas: "JP" },
  { id: 11, codigo: "frente_amplio",     nombre: "Frente Amplio",         siglas: "FA" },
  { id: 12, codigo: "victoria_nacional", nombre: "Victoria Nacional",     siglas: "VN" },
  { id: 13, codigo: "apra",              nombre: "Partido Aprista Peruano", siglas: "PAP" },
  { id: 14, codigo: "moradoperu",        nombre: "Morado Perú",           siglas: "MP" },
  { id: 15, codigo: "movimiento_indep",  nombre: "Movimiento Independiente", siglas: "MI" },
  { id: 16, codigo: "otros",             nombre: "Otro / Movimiento local", siglas: null },
];

// ── Endpoints ────────────────────────────────────────────────────────

export const catalogosApi = {
  async listCargos(opts?: { pais?: string; nivel?: string }): Promise<{ cargos: CargoCatalog[] }> {
    if (DEMO_MODE) {
      const filtered = opts?.nivel
        ? DEMO_CARGOS.filter((c) => c.nivel_codigo === opts.nivel)
        : DEMO_CARGOS;
      return { cargos: filtered };
    }
    const qs = new URLSearchParams();
    if (opts?.pais) qs.set("pais", opts.pais);
    if (opts?.nivel) qs.set("nivel", opts.nivel);
    const path = `/catalogos/cargos${qs.toString() ? `?${qs}` : ""}`;
    const res = await request<{ ok: true; cargos: CargoCatalog[] }>(path);
    return { cargos: res.cargos };
  },

  async listOrganizacionesPoliticas(opts?: { pais?: string }): Promise<{ organizaciones: OrganizacionPoliticaCatalog[] }> {
    if (DEMO_MODE) {
      return { organizaciones: DEMO_ORGS };
    }
    const qs = new URLSearchParams();
    if (opts?.pais) qs.set("pais", opts.pais);
    const path = `/catalogos/organizaciones-politicas${qs.toString() ? `?${qs}` : ""}`;
    const res = await request<{ ok: true; organizaciones: OrganizacionPoliticaCatalog[] }>(path);
    return { organizaciones: res.organizaciones };
  },

  async listJurisdicciones(opts: {
    ambito: "departamento" | "provincia" | "distrito";
    parent_id?: number;
    with_geom?: boolean;
  }): Promise<{ jurisdicciones: JurisdiccionCatalog[]; stub?: boolean }> {
    if (DEMO_MODE) {
      return { jurisdicciones: [], stub: true };
    }
    const qs = new URLSearchParams({ ambito: opts.ambito });
    if (opts.parent_id) qs.set("parent_id", String(opts.parent_id));
    if (opts.with_geom) qs.set("with_geom", "true");
    const path = `/catalogos/jurisdicciones?${qs}`;
    const res = await request<{ ok: true; jurisdicciones: JurisdiccionCatalog[]; stub?: boolean }>(path);
    return { jurisdicciones: res.jurisdicciones, stub: res.stub };
  },
};
