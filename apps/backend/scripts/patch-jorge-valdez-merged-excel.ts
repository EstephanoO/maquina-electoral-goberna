/**
 * patch-jorge-valdez-merged-excel.ts
 *
 * Aplica la data nueva de Candidato-Form-JorgeValdez-merged.xlsx al deck
 * de Jorge Valdez. Lee el form existente del DB, deep-mergea la nueva data
 * a nivel de sub-campos (no reemplaza todo el `terreno`) y lo escribe.
 *
 * Secciones nuevas vs provision-jorge-valdez.ts:
 *   ✚ terreno.e5_cleavages   — 3 fracturas sociales
 *   ✚ terreno.c1_identidades — descripción identidades
 *   ✚ terreno.c2_psicografia — 5 segmentos completos con valores/temores
 *   ✚ terreno.c3_memoria_politica — hitos electorales + figuras
 *   ✚ terreno.c4_issues      — 8 issues priorizados con %
 *   ✚ terreno.c5_medios      — periodistas + encuesta abril 2026
 *   ✚ terreno.d3_oferta      — 3 competidores con fortalezas/debilidades
 *   ✚ terreno.d4_logica      — barreras, catalizadores, tipo decisión
 *
 * Uso (desde /srv/app):
 *   bun run apps/backend/scripts/patch-jorge-valdez-merged-excel.ts
 */

import "dotenv/config";
import { pool } from "../src/db";

const NEXUS_TENANT_ID = "goberna-jorge-valdez-surco-2026";

// ─── Nueva data del Excel merged ────────────────────────────────────────────

const TERRENO_PATCH = {
  e5_cleavages: {
    fracturas_vigentes: [
      {
        nombre: "Seguridad ciudadana",
        descripcion:
          "Principal preocupación del vecino de Surco. Robo de vehículos, extorsión a comercios, delincuencia callejera. Candidato que ofrezca soluciones concretas gana puntos.",
        intensidad: "alta",
      },
      {
        nombre: "Gestión de parques y medio ambiente",
        descripcion:
          "Surco tiene 100+ parques. Mantenimiento, arborización, fauna callejera. Identidad ecologista del distrito.",
        intensidad: "media",
      },
      {
        nombre: "Tráfico y movilidad",
        descripcion:
          "Congestión en vías principales (Benavides, Javier Prado). Vía Expresa Sur mal entregada (López Aliaga). Ciclistas vs conductores.",
        intensidad: "media",
      },
    ],
  },

  c1_identidades: {
    descripcion: "conservadores de derecha",
    partido_dominante: "Somos Perú",
    percepciones_clave: [
      "orden", "familia", "propiedad privada", "seguridad", "conservador",
      "clase media-alta y alta",
    ],
    notas: "Electorado residencial, familiar, con baja volatilidad vs Lima popular.",
  },

  c2_psicografia: [
    {
      id: "familias-nse-ab",
      nombre: "Familias NSE A/B asentadas",
      pct_aprox: 35,
      problema_principal: "Seguridad, limpieza, calidad de vida barrial",
      valores: ["Orden", "familia", "propiedad privada", "educación"],
      aspiraciones: ["Distrito limpio", "seguro", "bien gestionado"],
      temores: ["Inseguridad", "caída de valor de propiedades", "desorden"],
      medio_info_preferido:
        "Grupos de WhatsApp de junta vecinal, Facebook, TV cable",
    },
    {
      id: "jovenes-profesionales",
      nombre: "Jóvenes profesionales / millennials",
      pct_aprox: 25,
      problema_principal: "Tráfico, movilidad, espacios públicos, medio ambiente",
      valores: ["Modernidad", "sostenibilidad", "innovación", "transparencia"],
      aspiraciones: [
        "Ciclovías", "parques activos", "eventos culturales", "gestión digital",
      ],
      temores: ["Corrupción", "gestión ineficiente", "statu quo"],
      medio_info_preferido: "Instagram, TikTok, grupos WhatsApp, podcast",
    },
    {
      id: "adultos-mayores",
      nombre: "Adultos mayores / jubilados",
      pct_aprox: 20,
      problema_principal: "Seguridad, salud, transporte, parques",
      valores: ["Tradición", "respeto", "orden", "familia"],
      aspiraciones: [
        "Servicios de salud municipales",
        "actividades culturales",
        "cuidado de parques",
      ],
      temores: ["Inseguridad callejera", "abandono", "cambios bruscos"],
      medio_info_preferido:
        "TV abierta, WhatsApp, reuniones presenciales, radio",
    },
    {
      id: "comerciantes-empresarios",
      nombre: "Comerciantes y empresarios locales",
      pct_aprox: 12,
      problema_principal:
        "Licencias, ambulantes, seguridad para negocios, infraestructura",
      valores: ["Formalidad", "libre empresa", "gestión eficiente"],
      aspiraciones: [
        "Distrito ordenado", "sin ambulantes", "con flujo comercial",
      ],
      temores: ["Informalidad", "extorsión", "mala gestión municipal"],
      medio_info_preferido:
        "WhatsApp, Facebook, reuniones de cámara de comercio",
    },
    {
      id: "animalistas-ecologistas",
      nombre: "Animalistas / ecologistas / ciclistas",
      pct_aprox: 8,
      problema_principal:
        "Fauna callejera, áreas verdes, ciclovías, contaminación",
      valores: ["Bienestar animal", "sostenibilidad", "comunidad activa"],
      aspiraciones: ["CAS municipal", "ciclovías conectadas", "más arborización"],
      temores: [
        "Gestión indiferente al medioambiente", "maltrato animal",
      ],
      medio_info_preferido:
        "Instagram, grupos FB animalistas, WhatsApp activista",
    },
  ],

  c3_memoria_politica: {
    hitos_electorales: [
      {
        anio: 2022,
        hecho:
          "Carlos Bruce (Avanza País) gana con 40% — mayoría absoluta. " +
          "Juan del Mar (RP) segundo con 17%. Gina Gálvez (Somos Perú) tercero 15%.",
        impacto:
          "Distrito consolida voto de derecha-centroderecha. Somos Perú cae a tercer lugar.",
      },
      {
        anio: 2026,
        hecho:
          "Carlos Bruce abandona Surco y postula a Lima (alcaldía MML). " +
          "David Vera (PPC) emerge como líder con ~31% encuestas abril.",
        impacto:
          "Escenario abierto — sin incumbente claro. Oportunidad para candidatos alternativos si logran diferenciarse.",
      },
      {
        anio: 2018,
        hecho:
          "Jean Pierre Combe (AP) gana con ~24% en campo fragmentado (18 candidatos). " +
          "Surco demuestra alta volatilidad cuando no hay incumbente fuerte.",
        impacto:
          "Con incumbente ausente el voto se dispersa — el que consolida más rápido gana.",
      },
    ],
    partidos_desprestigiados: [
      "A.N.T.A.U.R.O. (cancelado 18/03/2025)",
      "Somos Perú (bajando en Surco)",
      "Partidos fujimoristas en Surco tras 2021",
    ],
    figuras_positivas: [
      "Carlos Bruce (alcalde saliente, gestión reconocida aunque se va a Lima)",
      "Líderes vecinales activos (Juntas Vecinales, Junta de Propietarios)",
    ],
    figuras_negativas: [
      "Roberto Gómez Baca (investigado lavado activos 2013-2015, archivado)",
      "Rafael López Aliaga (Vía Expresa Sur incompleta y cuestionada)",
      "Políticos con escándalos o investigaciones activas",
    ],
  },

  c4_issues: [
    { issue: "Seguridad ciudadana",            pct_menciona: 72, prioridad: 1 },
    { issue: "Tráfico y movilidad",             pct_menciona: 55, prioridad: 2 },
    { issue: "Limpieza / residuos sólidos",     pct_menciona: 40, prioridad: 3 },
    { issue: "Parques y áreas verdes",          pct_menciona: 35, prioridad: 4 },
    { issue: "Obras de infraestructura",        pct_menciona: 30, prioridad: 5 },
    { issue: "Animalismo / fauna callejera",    pct_menciona: 20, prioridad: 6 },
    { issue: "Medio ambiente / ecología",       pct_menciona: 20, prioridad: 7 },
    { issue: "Comercio ambulatorio / informalidad", pct_menciona: 15, prioridad: 8 },
  ],

  c5_medios: {
    periodistas_clave: [
      {
        nombre: "Lima Gris",
        medio: "limagris.com — portal de investigación municipal Lima",
        tendencia: "neutro",
      },
      {
        nombre: "La República / Perú21",
        medio: "larepublica.pe / peru21.pe",
        tendencia: "neutro",
      },
    ],
    medios_relevantes: [
      {
        nombre: "Radio Exitosa / Exitosa Noticias",
        tipo: "radio + YouTube",
        alcance:
          "Conductor habitual 'Exitosa Te Escucha' 22h-00h (abr 2024-presente). " +
          "Canal YouTube Exitosa Noticias 1.22M suscriptores. 900-1,300 vistas/episodio.",
      },
    ],
    encuestas_disponibles: [
      {
        fuente: "encuestas.com.pe (online)",
        fecha: "Abril 2026",
        link: null,
        notas:
          "514 votos. David Vera PPC 31.52% | Gómez Baca AP 13.81% | Narvaez AP 12.84% | " +
          "Palma Aurazo RP 11.67% | Toledo SP 7.59% | Gálvez 5.84% | Aco Miranda 5.06% | " +
          "Moreno RP 3.11%. NO probabilística/online — dato referencial.",
      },
    ],
    notas:
      "Candidato es conductor propio en Exitosa — ventaja comunicacional única sobre competidores.",
  },

  d3_oferta: {
    candidatos: [
      {
        nombre: "David Vera Trujillo",
        partido: "PPC (Partido Popular Cristiano)",
        nivel_amenaza: "alto",
        fortalezas: [
          "Líder de encuestas con ~31% (abr 2026)",
          "Ex-regidor Surco con conocimiento del territorio",
          "Respaldo PPC — partido histórico del distrito",
          "Imagen limpia, sin escándalos",
          "Discurso de continuidad de gestión Bruce",
        ],
        debilidades: [
          "Sin gestión propia como alcalde",
          "PPC en declive electoral nacional",
          "Cambió de Avanza País a PPC — puede verse como oportunista",
        ],
        notas:
          "Pre-candidato Avanza País 2022, ganó internas pero se pasó a PPC. " +
          "Principal adversario a derrotar.",
      },
      {
        nombre: "Roberto Gómez Baca",
        partido: "Avanza País",
        nivel_amenaza: "alto",
        fortalezas: [
          "Nombre reconocido — fue alcalde Surco 2011-2014",
          "Base de simpatizantes propios en el distrito",
          "Conocimiento de gestión municipal real",
        ],
        debilidades: [
          "Investigado por lavado de activos 2013-2015 (archivado pero no olvidado)",
          "Imagen desgastada por investigación",
          "Partido Avanza País debilitado tras gestión Bruce",
        ],
        notas:
          "~13.81% encuesta abril 2026. Jorge Valdez fue también investigado junto a él " +
          "en el mismo caso 2014 (archivado). Riesgo de ataque cruzado.",
      },
      {
        nombre: "Juan Palma Aurazo",
        partido: "Renovación Popular",
        nivel_amenaza: "medio",
        fortalezas: [
          "Partido en crecimiento en Lima (López Aliaga efecto)",
          "Base electoral conservadora-cristiana sólida en Surco",
          "Voto ideológico fiel",
        ],
        debilidades: [
          "Dependencia imagen López Aliaga (alcalde Lima)",
          "Gestión Vía Expresa Sur cuestionada — daño colateral",
          "Sin perfil propio fuerte",
        ],
        notas: "~11.67% encuesta abril 2026. Ha participado en múltiples elecciones en Surco.",
      },
    ],
  },

  d4_logica: {
    tipo_decision_predominante: "racional",
    factores_clave: [
      "Propuesta concreta en seguridad ciudadana",
      "Imagen de gestor competente (no candidato eterno)",
      "Sin escándalos activos o investigaciones vigentes",
      "Conocimiento real del distrito (vecino, no foráneo)",
    ],
    barreras_voto_candidato: [
      "Sin partido político activo (A.N.T.A.U.R.O. cancelado) — debe afiliar antes 16/06/2026",
      "Afiliación previa A.N.T.A.U.R.O. genera estigma etnocacerista incompatible con base conservadora de Surco",
      "7 afiliaciones en 26 años — percepción de oportunista sin convicción",
      "Investigación lavado activos 2014 (archivada) — puede ser revivida como ataque",
      "Título Abogado UIGV bajo riesgo SUNEDU 2020",
    ],
    catalizadores: [
      "Perfil ecologista-animalista único en el campo — nicho del 20-28% del electorado (animalistas + ecologistas + ciclistas)",
      "Conocimiento institucional (3 períodos regidor: 2003, 2011, 2019)",
      "Show propio en Exitosa = plataforma comunicacional que ningún competidor tiene",
      "Potencial de capturar voto joven (25%) con propuesta de movilidad + modernidad",
      "Sin incumbente Bruce → 39.98% de votos 2022 sin dueño claro",
    ],
    notas:
      "Electorado de Surco: mixto — racional en NSE alto, emotivo en seguridad/animalismo. " +
      "Decisión de voto se concentra en últimas 3 semanas. Canal principal: WhatsApp vecinal.",
  },
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("▶  Buscando deck de Jorge Valdez...");

  // Obtener deck por NEXUS_TENANT_ID → campaign_id → deck
  const { rows: candidatoRows } = await pool.query<{
    campaign_id: string;
    candidato_id: string;
  }>(
    `SELECT c.campaign_id, c.id AS candidato_id
     FROM candidatos c
     JOIN campaigns ca ON ca.id = c.campaign_id
     WHERE ca.nexus_tenant_id = $1
     LIMIT 1`,
    [NEXUS_TENANT_ID],
  );

  if (candidatoRows.length === 0) {
    console.error("✗  Candidato no encontrado. Ejecutar provision-jorge-valdez.ts primero.");
    process.exit(1);
  }

  const { campaign_id } = candidatoRows[0]!;
  console.log(`  ✓  campaign_id: ${campaign_id}`);

  const { rows: deckRows } = await pool.query<{ id: string; consultor_form: Record<string, unknown> }>(
    `SELECT id, consultor_form FROM decks WHERE campaign_id = $1 AND kind = 'fase2' LIMIT 1`,
    [campaign_id],
  );

  if (deckRows.length === 0) {
    console.error("✗  Deck Fase 2 no encontrado. Ejecutar provision-jorge-valdez.ts primero.");
    process.exit(1);
  }

  const deck = deckRows[0]!;
  console.log(`  ✓  deck_id: ${deck.id}`);

  const existingForm = (deck.consultor_form ?? {}) as Record<string, unknown>;
  const existingTerreno = (existingForm.terreno ?? {}) as Record<string, unknown>;

  // Deep merge: preservar terreno existente y agregar las secciones nuevas
  const mergedTerreno = {
    ...existingTerreno,
    ...TERRENO_PATCH,
  };

  const patchedForm = {
    ...existingForm,
    terreno: mergedTerreno,
  };

  await pool.query(
    `UPDATE decks SET consultor_form = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(patchedForm), deck.id],
  );

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  PATCH APLICADO — Jorge Valdez — Excel Merged        ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log("║  ✚ terreno.e5_cleavages   — 3 fracturas sociales     ║");
  console.log("║  ✚ terreno.c1_identidades — identidades dist.        ║");
  console.log("║  ✚ terreno.c2_psicografia — 5 segmentos completos    ║");
  console.log("║  ✚ terreno.c3_memoria_politica — hitos + figuras     ║");
  console.log("║  ✚ terreno.c4_issues      — 8 issues con %           ║");
  console.log("║  ✚ terreno.c5_medios      — Exitosa + encuesta abr   ║");
  console.log("║  ✚ terreno.d3_oferta      — 3 competidores detail    ║");
  console.log("║  ✚ terreno.d4_logica      — barreras + catalizadores ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  deck_id: ${deck.id}  ║`);
  console.log("╚══════════════════════════════════════════════════════╝");

  await pool.end();
}

main().catch((err) => {
  console.error("\n✗ Patch falló:", err);
  process.exit(1);
});
