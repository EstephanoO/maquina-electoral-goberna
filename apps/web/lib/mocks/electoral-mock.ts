/**
 * Mocks de datos electorales para Fase 2.
 *
 * Mientras el geógrafo no termina de cargar resultados ONPE históricos
 * y datos de presupuesto/incumbentes por jurisdicción, generamos números
 * plausibles a partir del nombre/ámbito de la jurisdicción.
 *
 * IMPORTANTE: cada función está marcada como mock — el dashboard muestra
 * un badge "Datos en construcción" cuando los usa.
 */

export type ContextoJurisdiccion = {
  electores: number;
  autoridad_actual: { nombre: string; partido: string } | null;
  presupuesto_anual_pen: number | null;
  proceso_electoral: { codigo: string; descripcion: string; fecha: string } | null;
};

/** Hash simple para tener números pseudoaleatorios pero estables por nombre. */
function seedFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getContextoJurisdiccionMock(
  ambito: "pais" | "departamento" | "provincia" | "distrito",
  jurisdiccionNombre: string,
): ContextoJurisdiccion {
  const seed = seedFromName(jurisdiccionNombre);

  const baseElectores =
    ambito === "pais"
      ? 25_000_000
      : ambito === "departamento"
        ? 800_000 + (seed % 1_500_000)
        : ambito === "provincia"
          ? 50_000 + (seed % 350_000)
          : 5_000 + (seed % 60_000);

  const presupuesto =
    ambito === "pais"
      ? null // Presupuesto nacional no aplica
      : ambito === "departamento"
        ? 800_000_000 + (seed % 1_500_000_000)
        : ambito === "provincia"
          ? 50_000_000 + (seed % 200_000_000)
          : 5_000_000 + (seed % 30_000_000);

  return {
    electores: baseElectores,
    autoridad_actual: null, // pendiente de carga
    presupuesto_anual_pen: presupuesto,
    proceso_electoral: {
      codigo: "ERM2026",
      descripcion: "Elecciones Regionales y Municipales 2026",
      fecha: "2026-04-10",
    },
  };
}

export type ResultadoElectoral = {
  partido: string;
  siglas: string;
  votos: number;
  porcentaje: number;
  color: string; // hex para el mapa
};

const PARTIDOS_PARA_MOCK: Array<Pick<ResultadoElectoral, "partido" | "siglas" | "color">> = [
  { partido: "Fuerza Popular", siglas: "FP", color: "#f97316" }, // orange
  { partido: "Acción Popular", siglas: "AP", color: "#dc2626" }, // red
  { partido: "Perú Libre", siglas: "PL", color: "#7c3aed" }, // violet
  { partido: "Alianza para el Progreso", siglas: "APP", color: "#0ea5e9" }, // sky
  { partido: "Renovación Popular", siglas: "RP", color: "#facc15" }, // yellow
  { partido: "Avanza País", siglas: "AVP", color: "#10b981" }, // emerald
  { partido: "Partido Morado", siglas: "PM", color: "#a855f7" }, // purple
];

/** Devuelve los 3 partidos "más importantes" en la zona, con votos plausibles. */
export function getPartidosImportantesMock(jurisdiccionNombre: string): ResultadoElectoral[] {
  const seed = seedFromName(jurisdiccionNombre);
  const totalVotos = 30_000 + (seed % 200_000);

  // Picks 3 partidos sin colisión basados en el seed
  const indexes = [seed % 7, (seed >> 3) % 7, (seed >> 6) % 7];
  const picks: number[] = [];
  for (const i of indexes) {
    let n = i;
    while (picks.includes(n)) n = (n + 1) % 7;
    picks.push(n);
  }

  // Distribución de votos: 38% / 28% / 18% (resto = otros)
  const pcts = [38, 28, 18];
  return picks.map((idx, i) => {
    const p = PARTIDOS_PARA_MOCK[idx]!;
    const pct = pcts[i]!;
    return {
      partido: p.partido,
      siglas: p.siglas,
      votos: Math.round((totalVotos * pct) / 100),
      porcentaje: pct,
      color: p.color,
    };
  });
}

/** Para mapa: por cada distrito/provincia retorna un partido ganador (mock). */
export function getGanadorPorJurisdiccionMock(jurisdiccionId: number): {
  partido: string;
  siglas: string;
  color: string;
} {
  const idx = jurisdiccionId % PARTIDOS_PARA_MOCK.length;
  return PARTIDOS_PARA_MOCK[idx]!;
}

export const PARTIDOS_PALETTE = PARTIDOS_PARA_MOCK;
