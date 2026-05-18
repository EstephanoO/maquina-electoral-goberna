// apps/web/app/onboarding/[slug]/fase-2/lib/deck-scores.ts
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { calcPentaD } from "@/lib/onboarding-schema";

export interface DeckScores {
  perfilPct: number;
  territorioPct: number;
  digitalPct: number;
  datosPct: number;
}

function semaforoToPct(s?: string | null): number | null {
  if (s === "verde") return 100;
  if (s === "amarillo") return 60;
  if (s === "rojo") return 20;
  return null;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function buildDeckScores(f2?: ConsultorFormFase2 | null): DeckScores {
  // Perfil: semáforos 5N (n3/n4/n5 del perfil unificado PerfilCandidato5N)
  // Each Nx node has a `semaforo` field (not semaforo_global).
  // Fallback: resumen_ejecutivo.semaforo_global if individual nodes are empty.
  const semaforos = [
    semaforoToPct(f2?.perfil?.n3_riesgo?.semaforo),
    semaforoToPct(f2?.perfil?.n4_patrimonio?.semaforo),
    semaforoToPct(f2?.perfil?.n5_salud?.semaforo),
  ].filter((v): v is number => v !== null);

  let perfilPct: number;
  if (semaforos.length > 0) {
    perfilPct = avg(semaforos);
  } else {
    // Fallback to resumen_ejecutivo.semaforo_global if per-node semáforos are absent
    const globalSemaforo = semaforoToPct(
      f2?.perfil?.resumen_ejecutivo?.semaforo_global
    );
    perfilPct = globalSemaforo ?? 65;
  }

  // Territorial: TerritoryEcd (f2?.territorio_ecd) fields are all descriptive
  // (text, arrays) — no numeric puntuacion. Use a filled-section heuristic:
  // count how many of the 5 E-sections have any content × 20.
  const eFilledCount = [
    f2?.territorio_ecd?.e1_capital_economico,
    f2?.territorio_ecd?.e2_capital_social,
    f2?.territorio_ecd?.e3_capital_cultural,
    f2?.territorio_ecd?.e4_campo_politico,
    f2?.territorio_ecd?.e5_infraestructura,
  ].filter(Boolean).length;
  const territorioPct = eFilledCount > 0 ? eFilledCount * 20 : 40;

  // Digital: calcPentaD × 10
  const prop = f2?.presencia?.candidato_propio;
  const digitalPct = prop ? Math.round(calcPentaD(prop) * 10) : 30;

  // Datos: heurística campos completados
  const filled = [
    f2?.ficha_basica?.dni,
    f2?.perfil_candidato?.n1_identidad?.nombre_completo,
    f2?.territorio_ecd?.e1_capital_economico,
    f2?.presencia?.candidato_propio,
    f2?.votos_para_ganar?.padron_actual,
    f2?.analisis_electoral?.comentario_consultor,
  ].filter(Boolean).length;
  const datosPct = Math.round((filled / 6) * 100);

  return { perfilPct, territorioPct, digitalPct, datosPct };
}
