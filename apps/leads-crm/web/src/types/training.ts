export type Rule = {
  id: number;
  name: string;
  description: string | null;
  pattern: string;
  tag: string;
  weight: number;
  enabled: boolean;
  hits_count: number;
  last_hit_at: string | null;
  source: string | null;          // manual | product | learned_p4 | system_seed
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RuleDraft = Partial<Rule>;

export type PromptOverride = {
  id: number;
  extra_context: string;
  extra_categories: string;
  few_shot_examples: Array<{ input: string; output: Record<string, unknown> }>;
  enabled: boolean;
  updated_by: string | null;
  updated_at: string;
};

export type ClassifyMatch = { rule_id: number; rule_name: string; tag: string; weight: number };
export type ClassifyResult = { text: string; matched: ClassifyMatch[]; tags: string[]; rules_checked: number };

export const RULE_SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  product: "Producto",
  learned_p4: "Aprendida p4",
  system_seed: "Seed",
};

export const RULE_SOURCE_COLORS: Record<string, string> = {
  manual: "bg-slate-100 text-slate-700",
  product: "bg-blue-100 text-blue-700",
  learned_p4: "bg-purple-100 text-purple-700",
  system_seed: "bg-amber-100 text-amber-700",
};

/** Suggested rule starter templates for the "Crear desde plantilla" UX. */
export type RuleTemplate = { name: string; pattern: string; tag: string; description: string };

export const RULE_TEMPLATES: RuleTemplate[] = [
  { name: "Saludo", pattern: "(?i)\\b(hola|buen[oa]s? d[ií]as?|buen[oa]s? tardes?|buen[oa]s? noches?)\\b", tag: "intent:saludo", description: "Detecta saludos iniciales" },
  { name: "Pregunta de precio", pattern: "(?i)\\b(precio|costo|cu[aá]nto (cuesta|vale))\\b", tag: "intent:precio", description: "Lead pregunta cuánto cuesta" },
  { name: "Pregunta de horario", pattern: "(?i)\\b(horario|d[ií]as|cu[aá]ndo (empieza|inicia))\\b", tag: "intent:horario_fecha", description: "Lead pregunta horarios o fechas" },
  { name: "Quiere matricularse", pattern: "(?i)\\b(matr[ií]cul|inscrib|me apunto)\\b", tag: "intent:matricula", description: "Intent fuerte de matrícula" },
  { name: "Comprobante de pago", pattern: "(?i)\\b(comprobante|yape|deposito|transferencia|pagar)\\b", tag: "intent:pago", description: "Lead quiere pagar / envió comprobante" },
  { name: "No interesado", pattern: "(?i)\\b(no me interesa|no gracias|no por ahora)\\b", tag: "intent:no_interesado", description: "Lead descarta — bajar prioridad" },
];
