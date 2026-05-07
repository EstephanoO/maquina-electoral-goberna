/**
 * Helper de clasificación pseudo-AI usado por reportes y enrichment para
 * detectar interés / tier desde un texto inbound. NO es el classifier del
 * bot — ese vive en bot/src/classifier.ts y maneja productos, intents,
 * country detection, semantic fallback.
 *
 * Acá solo hay reglas heurísticas simples:
 *   - tier: vip/repeat según keywords explícitas
 *   - interests: bag-of-words match contra un set conocido (precio, online,
 *     diplomado, etc.)
 *
 * Lo usa /reports/daily para agrupar mensajes IN del período por interés
 * detectado.
 */
export async function classifyMessage(body: string): Promise<{
  tier: string | null;
  interests: string[];
}> {
  const text = (body ?? "").toLowerCase();

  let tier: string | null = null;
  if (/vip|premium|exclusive|elite|black|gold|platinum/i.test(text)) tier = "vip";
  else if (/ya soy cliente|ya compr|ya tengo|repit|segunda/i.test(text)) tier = "repeat";

  const interests: string[] = [];
  const kw: Record<string, string[]> = {
    "certificacion": ["certificacion", "certificado"],
    "curso": ["curso", "cursos"],
    "diplomado": ["diplomado"],
    "master": ["master", "máster"],
    "posgrado": ["posgrado"],
    "beca": ["beca", "becas"],
    "online": ["online", "virtual"],
    "presencial": ["presencial"],
    "precio": ["precio", "costo", "cuánto", "cuanto"],
  };
  for (const [interest, words] of Object.entries(kw)) {
    if (words.some(w => text.includes(w))) interests.push(interest);
  }
  return { tier, interests };
}
