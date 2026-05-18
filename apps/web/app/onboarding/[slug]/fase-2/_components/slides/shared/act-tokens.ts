export type ActNumber = 1 | 2 | 3 | 4;

export const ACT_TOKENS = {
  1: { color: "#fbbf24", label: "ACTO I",   title: "QUIÉN SOS",    subtitle: "Identidad, perfil y credenciales del candidato" },
  2: { color: "#ef4444", label: "ACTO II",  title: "DÓNDE ESTÁS",  subtitle: "Territorio, electorado y posición actual" },
  3: { color: "#3b82f6", label: "ACTO III", title: "CONTRA QUIÉN", subtitle: "Competencia, segmentos y campo de batalla" },
  4: { color: "#22c55e", label: "ACTO IV",  title: "CÓMO GANÁS",   subtitle: "Estrategia, núcleo y plan de cierre" },
} as const;

export type ActTokens = typeof ACT_TOKENS;
