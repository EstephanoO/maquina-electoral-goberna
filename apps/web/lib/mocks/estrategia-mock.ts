/**
 * Catálogo de estrategias para Fase 3 del onboarding.
 *
 * Cada estrategia tiene un slider 1-10 (intensidad/multiplicador). El presupuesto
 * se calcula en vivo: sum(intensidad * costo_por_punto). Los costos son mock,
 * pensados para dar un orden de magnitud razonable a un candidato regional/local.
 *
 * Cuando el geógrafo + analytics tengan números reales, reemplazar `costoPorPuntoPen`
 * por una función que dependa de la jurisdicción (electores, presupuesto, etc.).
 */

export type EstrategiaTrackId = "digital" | "territorial";

export interface EstrategiaCategoria {
  id: string;
  nombre: string;
  descripcion: string;
  /** Costo en soles por cada punto de intensidad (1-10). */
  costoPorPuntoPen: number;
  /** Resumen de qué se entrega/activa al subir intensidad. */
  ejemplos: string[];
}

export interface EstrategiaTrack {
  id: EstrategiaTrackId;
  nombre: string;
  tagline: string;
  categorias: EstrategiaCategoria[];
}

export const ESTRATEGIA_CATALOGO: EstrategiaTrack[] = [
  {
    id: "digital",
    nombre: "Estrategia Digital",
    tagline: "Donde se libra la batalla de percepción.",
    categorias: [
      {
        id: "rrss",
        nombre: "RRSS y Comunidad",
        descripcion: "Presencia orgánica, contenido y manejo diario de redes.",
        costoPorPuntoPen: 3_000,
        ejemplos: [
          "Plan editorial semanal",
          "Community manager dedicado",
          "Lives, reels, foros, grupos de WhatsApp",
        ],
      },
      {
        id: "posicionamiento",
        nombre: "Posicionamiento y Publicidad",
        descripcion: "Pauta paga, branding y SEO/SEM en buscadores.",
        costoPorPuntoPen: 8_000,
        ejemplos: [
          "Meta Ads + Google Ads segmentados",
          "Branding y producción audiovisual",
          "Influencers locales",
        ],
      },
      {
        id: "inteligencia",
        nombre: "Inteligencia Electoral",
        descripcion: "Encuestas, escucha activa y segmentación de votantes.",
        costoPorPuntoPen: 5_000,
        ejemplos: [
          "Encuestas trimestrales",
          "Listening de redes y noticias",
          "Microsegmentación por padrón",
        ],
      },
    ],
  },
  {
    id: "territorial",
    nombre: "Estrategia Territorial",
    tagline: "Donde se ganan las elecciones.",
    categorias: [
      {
        id: "operacion",
        nombre: "Operación Territorial",
        descripcion: "Brigadas, recorridos y voluntariado en campo.",
        costoPorPuntoPen: 6_000,
        ejemplos: [
          "Coordinadores zonales",
          "Voluntariado y brigadas casa-por-casa",
          "Movilización para eventos clave",
        ],
      },
      {
        id: "comunicacion",
        nombre: "Comunicación Territorial",
        descripcion: "Volanteo, paneles, eventos y prensa local.",
        costoPorPuntoPen: 4_000,
        ejemplos: [
          "Material gráfico y volanteo",
          "Paneles y publicidad exterior",
          "Mítines y eventos comunitarios",
        ],
      },
    ],
  },
];

export type EstrategiaIntensidades = Record<string, number>;

/** Crea el estado inicial — todos los sliders en 5 (intensidad media). */
export function intensidadesInicial(): EstrategiaIntensidades {
  const out: EstrategiaIntensidades = {};
  for (const track of ESTRATEGIA_CATALOGO) {
    for (const cat of track.categorias) {
      out[cat.id] = 5;
    }
  }
  return out;
}

/** Suma total de presupuesto en PEN según las intensidades elegidas. */
export function calcularPresupuesto(intensidades: EstrategiaIntensidades): number {
  let total = 0;
  for (const track of ESTRATEGIA_CATALOGO) {
    for (const cat of track.categorias) {
      const intensidad = intensidades[cat.id] ?? 0;
      total += intensidad * cat.costoPorPuntoPen;
    }
  }
  return total;
}

/** Subtotal por track (Digital o Territorial). */
export function calcularSubtotal(
  trackId: EstrategiaTrackId,
  intensidades: EstrategiaIntensidades,
): number {
  const track = ESTRATEGIA_CATALOGO.find((t) => t.id === trackId);
  if (!track) return 0;
  let total = 0;
  for (const cat of track.categorias) {
    const intensidad = intensidades[cat.id] ?? 0;
    total += intensidad * cat.costoPorPuntoPen;
  }
  return total;
}
