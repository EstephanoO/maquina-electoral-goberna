import { z } from "zod";

/* ─── Validation status pipeline ─── */

export const VALIDATION_STATUSES = ["pendiente", "contactado", "respondido", "invalido"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/* ─── Scoring tags ─── */

export const SCORING_TAGS = [
  { key: "respondio", label: "Respondió", points: 1 },
  { key: "amable", label: "Amable", points: 1 },
  { key: "conoce_candidato", label: "Conoce al candidato", points: 1 },
  { key: "interesado", label: "Interesado", points: 2 },
  { key: "voluntario", label: "Voluntario", points: 3 },
  { key: "voto_seguro", label: "Voto seguro", points: 3 },
] as const;

export type ScoringTagKey = (typeof SCORING_TAGS)[number]["key"];

export function computeScore(tags: string[]): number {
  let score = 0;
  for (const t of SCORING_TAGS) {
    if (tags.includes(t.key)) score += t.points;
  }
  return score;
}

export function classifyVote(score: number): "duro" | "blando" | "tibio" {
  if (score >= 5) return "duro";
  if (score >= 2) return "blando";
  return "tibio";
}

/* ─── Zod schemas ─── */

export const updateStatusSchema = z.object({
  status: z.enum(VALIDATION_STATUSES),
  notes: z.string().max(500).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

/* ─── Row types ─── */

export type ValidationRow = {
  id: string;
  form_id: string;
  campaign_id: string;
  nombre: string;
  telefono: string;
  encuestador: string;
  zona: string;
  created_at: string;
  status: ValidationStatus;
  notes: string | null;
  tags: string[];
  score: number;
  vote_class: string;
  claimed_by: string | null;
  claimed_by_name: string | null;
  updated_at: string;
};
