import { sql } from "../sql.js";

/**
 * Stats globales para dashboard del CRM. No drillea — solo counters
 * por stage / course / priority. Agregaciones más profundas viven en
 * /reports/daily o /bot-activity/*.
 */
export async function stats() {
  const [total] = await sql`SELECT COUNT(*)::int AS c FROM leads`;
  const byStage = await sql`SELECT stage, COUNT(*)::int AS c FROM leads GROUP BY stage`;
  const byCourse = await sql`SELECT course, COUNT(*)::int AS c FROM leads WHERE course IS NOT NULL GROUP BY course`;
  const byPriority = await sql`SELECT priority, COUNT(*)::int AS c FROM leads GROUP BY priority`;
  return {
    total: total.c,
    byStage: byStage.map((r: any) => ({ stage: r.stage, c: r.c })),
    byCourse: byCourse.map((r: any) => ({ course: r.course, c: r.c })),
    byPriority: byPriority.map((r: any) => ({ priority: r.priority, c: r.c })),
  };
}
