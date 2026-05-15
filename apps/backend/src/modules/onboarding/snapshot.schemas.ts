// snapshot.schemas.ts
// Tipo que describe el snapshot completo del candidato tal como lo consume
// la pantalla de bienvenida del wizard (apps/onboarding-goberna).
// No confundir con CandidatoSnapshot (repo interno, extiende CandidatoContext).

export interface CandidatoSnapshotPublico {
  candidato: {
    fullName: string;
    avatarUrl: string | null;
    slug: string;
    primaryColor: string;
  };
  postulacion: {
    cargo: { codigo: string; nombre: string; ambito: string };
    partido: { codigo: string; nombre: string; siglas: string } | null;
    nivelGobierno: string;
  } | null;
  territorio: {
    pais: { id: number; nombre: string };
    departamento: { id: number; nombre: string } | null;
    provincia: { id: number; nombre: string } | null;
    distrito: {
      id: number;
      nombre: string;
      ubigeo: string;
      capital: string | null;
    } | null;
    geojson: object | null;
    area_km2: number | null;
    centroid: [number, number] | null;
  } | null;
  estrategia: {
    mode: string | null;
    description: string;
  };
  infra: {
    siteUrl: string;
    dashboardUrl: string;
    mailboxEmail: string;
    domain: string;
  };
  insights: {
    padron_electoral: { available: false } | { available: true; value: number };
    nse_ab_pct: { available: false } | { available: true; value: number };
    historial_partido:
      | { available: false }
      | { available: true; value: object[] };
  };
}

export const ESTRATEGIA_DESCRIPTIONS: Record<string, string> = {
  RACIONAL: "Propuestas concretas, datos y propuestas de valor verificables",
  EMOTIVA: "Conexión emocional, identidad y sentido de pertenencia",
  INSTINTIVA: "Presencia en territorio, contacto directo y eventos masivos",
  TRES_FRENTES: "Estrategia integral combinando tierra, mar y aire",
};

export function estrategiaDescription(mode: string | null | undefined): string {
  if (!mode) return "Estrategia personalizada";
  return ESTRATEGIA_DESCRIPTIONS[mode] ?? "Estrategia personalizada";
}
