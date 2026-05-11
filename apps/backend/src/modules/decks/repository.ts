import { pool } from "../../db";
import type { PoolClient } from "pg";

// ── Structured analysis payload (capa 2) ─────────────────────────────

export type StructuredAnalysisInput = {
  summary?: string;
  fecha_corte?: string; // YYYY-MM-DD
  hallazgos?: Array<{
    categoria: "fortaleza" | "debilidad" | "oportunidad" | "amenaza" | "contexto";
    texto: string;
    evidencia?: string;
    peso?: number;
    tags?: string[];
  }>;
  riesgos?: Array<{
    riesgo: string;
    severidad: "baja" | "media" | "alta" | "critica";
    probabilidad?: "baja" | "media" | "alta";
    mitigacion?: string;
    responsable?: string;
  }>;
  oportunidades?: Array<{
    oportunidad: string;
    ventana_temporal?: string;
    recursos_necesarios?: string;
    impacto_esperado?: string;
  }>;
  competidores?: Array<{
    partido_codigo?: string;
    partido_nombre?: string;
    candidato_rival?: string;
    fortaleza_relativa?: number;
    jurisdiccion_clave?: string;
    notas?: string;
  }>;
  recomendaciones?: Array<{
    accion: string;
    area?: string;
    plazo?: "inmediato" | "corto" | "mediano" | "largo";
    recursos_estimados?: string;
    kpi_objetivo?: string;
    prioridad?: number;
  }>;
  kpis?: Array<{
    nombre: string;
    valor_actual?: number;
    valor_objetivo?: number;
    unidad?: string;
    fecha_objetivo?: string;
  }>;
};

/**
 * Crea o reemplaza el row maestro analisis.analisis + sus child rows.
 * Si ya existe un analisis para este deck_id, lo borra (CASCADE) y
 * recrea — esto matchea el comportamiento "auto-replace de drafts".
 */
export async function upsertAnalisisForDeck(input: {
  deck_id: string;
  candidato_id: number;
  campaign_id: string | null;
  uploaded_by_user_id: string;
  type: DeckRow["type"];
  title: string;
  structured: StructuredAnalysisInput;
}): Promise<{ analisis_id: string }> {
  const client = (await pool.connect()) as PoolClient;
  try {
    await client.query("BEGIN");

    // Borramos análisis previo del mismo deck (CASCADE → child rows)
    await client.query(`DELETE FROM analisis.analisis WHERE deck_id = $1`, [input.deck_id]);

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO analisis.analisis
         (candidato_id, campaign_id, deck_id, type, title, summary,
          uploaded_by_user_id, fecha_corte)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        input.candidato_id,
        input.campaign_id,
        input.deck_id,
        input.type,
        input.title,
        input.structured.summary ?? null,
        input.uploaded_by_user_id,
        input.structured.fecha_corte ?? null,
      ],
    );
    const analisisId = rows[0]!.id;

    // Hallazgos
    for (const h of input.structured.hallazgos ?? []) {
      await client.query(
        `INSERT INTO analisis.hallazgos
           (analisis_id, categoria, texto, evidencia, peso, tags)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [analisisId, h.categoria, h.texto, h.evidencia ?? null, h.peso ?? null, h.tags ?? null],
      );
    }

    // Riesgos
    for (const r of input.structured.riesgos ?? []) {
      await client.query(
        `INSERT INTO analisis.riesgos
           (analisis_id, riesgo, severidad, probabilidad, mitigacion, responsable)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          analisisId,
          r.riesgo,
          r.severidad,
          r.probabilidad ?? null,
          r.mitigacion ?? null,
          r.responsable ?? null,
        ],
      );
    }

    // Oportunidades
    for (const o of input.structured.oportunidades ?? []) {
      await client.query(
        `INSERT INTO analisis.oportunidades
           (analisis_id, oportunidad, ventana_temporal, recursos_necesarios, impacto_esperado)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          analisisId,
          o.oportunidad,
          o.ventana_temporal ?? null,
          o.recursos_necesarios ?? null,
          o.impacto_esperado ?? null,
        ],
      );
    }

    // Competidores
    for (const c of input.structured.competidores ?? []) {
      await client.query(
        `INSERT INTO analisis.competidores
           (analisis_id, partido_codigo, partido_nombre, candidato_rival,
            fortaleza_relativa, jurisdiccion_clave, notas)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          analisisId,
          c.partido_codigo ?? null,
          c.partido_nombre ?? null,
          c.candidato_rival ?? null,
          c.fortaleza_relativa ?? null,
          c.jurisdiccion_clave ?? null,
          c.notas ?? null,
        ],
      );
    }

    // Recomendaciones
    for (const r of input.structured.recomendaciones ?? []) {
      await client.query(
        `INSERT INTO analisis.recomendaciones
           (analisis_id, accion, area, plazo, recursos_estimados,
            kpi_objetivo, prioridad)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          analisisId,
          r.accion,
          r.area ?? null,
          r.plazo ?? null,
          r.recursos_estimados ?? null,
          r.kpi_objetivo ?? null,
          r.prioridad ?? null,
        ],
      );
    }

    // KPIs
    for (const k of input.structured.kpis ?? []) {
      await client.query(
        `INSERT INTO analisis.kpis
           (analisis_id, nombre, valor_actual, valor_objetivo, unidad, fecha_objetivo)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          analisisId,
          k.nombre,
          k.valor_actual ?? null,
          k.valor_objetivo ?? null,
          k.unidad ?? null,
          k.fecha_objetivo ?? null,
        ],
      );
    }

    await client.query("COMMIT");
    return { analisis_id: analisisId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}



export interface DeckRow {
  id: string;
  candidato_id: number;
  campaign_id: string | null;
  uploaded_by_user_id: string;
  reviewed_by_user_id: string | null;
  title: string;
  type: "diagnostico" | "analisis" | "plan" | "episodico" | "otro";
  description: string | null;
  storage_path: string;
  size_bytes: number | null;
  status: "draft" | "pending_review" | "published" | "rejected";
  rejection_reason: string | null;
  consultor_form: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  submitted_for_review_at: string | null;
}

/** Merge profundo (replace level 1) del form en consultor_form. */
export async function mergeConsultorForm(
  deckId: string,
  partial: Record<string, unknown>,
): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(
    `UPDATE public.decks
        SET consultor_form = consultor_form || $2::jsonb,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [deckId, JSON.stringify(partial)],
  );
  return rows[0] ?? null;
}

export type BitacoraEntry = {
  ts: string;
  consultor_user_id: string;
  consultor_name?: string | null;
  accion: "patch" | "note" | "submit" | "approve" | "reject" | "reopen";
  campos_tocados?: string[];
  nota?: string;
};

/**
 * Append a `consultor_form.bitacora[]`. Idempotente — siempre concatena.
 * Si bitacora no existe, la crea como array vacío primero.
 */
export async function appendBitacora(
  deckId: string,
  entry: BitacoraEntry,
): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(
    `UPDATE public.decks
        SET consultor_form = jsonb_set(
              COALESCE(consultor_form, '{}'::jsonb),
              '{bitacora}',
              COALESCE(consultor_form -> 'bitacora', '[]'::jsonb) || $2::jsonb,
              true
            ),
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [deckId, JSON.stringify(entry)],
  );
  return rows[0] ?? null;
}

export interface DeckListItem extends DeckRow {
  candidato_nombres: string;
  uploader_full_name: string;
  uploader_email: string;
  campaign_slug: string | null;
  campaign_name: string | null;
}

export async function insertDeck(input: {
  id: string;
  candidato_id: number;
  campaign_id: string | null;
  uploaded_by_user_id: string;
  title: string;
  type: DeckRow["type"];
  description: string | null;
  storage_path: string;
  size_bytes: number;
}): Promise<DeckRow> {
  const { rows } = await pool.query<DeckRow>(
    `INSERT INTO public.decks
       (id, candidato_id, campaign_id, uploaded_by_user_id, title, type,
        description, storage_path, size_bytes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
     RETURNING *`,
    [
      input.id,
      input.candidato_id,
      input.campaign_id,
      input.uploaded_by_user_id,
      input.title,
      input.type,
      input.description,
      input.storage_path,
      input.size_bytes,
    ],
  );
  return rows[0]!;
}

/** Lista decks de un candidato (cualquier status). */
export async function listDecksByCandidato(candidatoId: number): Promise<DeckListItem[]> {
  const { rows } = await pool.query<DeckListItem>(
    `SELECT d.*,
            cand.nombres   AS candidato_nombres,
            u.full_name    AS uploader_full_name,
            u.email        AS uploader_email,
            c.slug         AS campaign_slug,
            c.name         AS campaign_name
       FROM public.decks d
       JOIN candidatos.candidato cand ON cand.id = d.candidato_id
       JOIN public.users u ON u.id = d.uploaded_by_user_id
       LEFT JOIN public.campaigns c ON c.id = d.campaign_id
      WHERE d.candidato_id = $1
      ORDER BY d.created_at DESC`,
    [candidatoId],
  );
  return rows;
}

/** Lista los decks `published` del candidato dueño de la campaign. */
export async function listPublishedDecksForCampaign(
  campaignId: string,
): Promise<DeckListItem[]> {
  const { rows } = await pool.query<DeckListItem>(
    `SELECT d.*,
            cand.nombres   AS candidato_nombres,
            u.full_name    AS uploader_full_name,
            u.email        AS uploader_email,
            c.slug         AS campaign_slug,
            c.name         AS campaign_name
       FROM public.decks d
       JOIN candidatos.candidato cand ON cand.id = d.candidato_id
       JOIN public.users u ON u.id = d.uploaded_by_user_id
       LEFT JOIN public.campaigns c ON c.id = d.campaign_id
       JOIN candidatos.postulacion p ON p.id_candidato = cand.id
      WHERE d.status = 'published'
        AND p.campaign_id = $1
      ORDER BY d.published_at DESC NULLS LAST, d.created_at DESC`,
    [campaignId],
  );
  return rows;
}

// ── Lookups sobre analisis.* (capa 2 + 3) ─────────────────────────────

export type SimilarAnalisis = {
  id: string;
  candidato_id: number;
  candidato_nombres: string;
  type: string;
  title: string;
  summary: string | null;
  cargo_codigo: string | null;
  cargo_nombre: string | null;
  jurisdiccion_label: string | null;
  organizacion_codigo: string | null;
  hallazgos_count: number;
  recomendaciones_count: number;
  created_at: string;
};

/**
 * Busca análisis "similares": mismo cargo + ámbito geográfico (y opcionalmente
 * mismo partido). Útil para que Claude le diga al consultor "para alcaldes
 * de provincia con tu partido, los 3 análisis previos detectaron X".
 */
export async function findSimilarAnalisis(filters: {
  cargo_codigo?: string;
  ambito?: "pais" | "departamento" | "provincia" | "distrito";
  organizacion_codigo?: string;
  exclude_candidato_id?: number;
  limit?: number;
}): Promise<SimilarAnalisis[]> {
  const limit = Math.min(20, Math.max(1, filters.limit ?? 5));
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters.cargo_codigo) {
    params.push(filters.cargo_codigo);
    where.push(`cg.codigo = $${params.length}`);
  }
  if (filters.ambito) {
    params.push(filters.ambito);
    where.push(`cg.ambito_geografico = $${params.length}`);
  }
  if (filters.organizacion_codigo) {
    params.push(filters.organizacion_codigo);
    where.push(`op.codigo = $${params.length}`);
  }
  if (filters.exclude_candidato_id) {
    params.push(filters.exclude_candidato_id);
    where.push(`a.candidato_id <> $${params.length}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit);

  const { rows } = await pool.query<SimilarAnalisis>(
    `SELECT
        a.id,
        a.candidato_id,
        cand.nombres AS candidato_nombres,
        a.type,
        a.title,
        a.summary,
        cg.codigo AS cargo_codigo,
        cg.nombre AS cargo_nombre,
        COALESCE(gp_dist.distrito, gp_prov.provincia, gp_dep.departamento) AS jurisdiccion_label,
        op.codigo AS organizacion_codigo,
        (SELECT COUNT(*)::int FROM analisis.hallazgos h WHERE h.analisis_id = a.id) AS hallazgos_count,
        (SELECT COUNT(*)::int FROM analisis.recomendaciones r WHERE r.analisis_id = a.id) AS recomendaciones_count,
        a.created_at
       FROM analisis.analisis a
       JOIN candidatos.candidato cand ON cand.id = a.candidato_id
       JOIN candidatos.postulacion p  ON p.id_candidato = cand.id
       JOIN catalogos.cargo_gobierno cg ON cg.id = p.id_cargo_gobierno
       LEFT JOIN catalogos.organizacion_politica op ON op.id = p.id_organizacion_politica
       LEFT JOIN geografia_politica.peru_departamentos gp_dep  ON gp_dep.id  = p.id_departamento
       LEFT JOIN geografia_politica.peru_provincias    gp_prov ON gp_prov.id = p.id_provincia
       LEFT JOIN geografia_politica.peru_distritos     gp_dist ON gp_dist.id = p.id_distrito
       ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows;
}

export type BenchmarkRow = {
  cargo_codigo: string;
  ambito_geografico: string;
  kpi_nombre: string;
  valor_p10: number | null;
  valor_p50: number | null;
  valor_p90: number | null;
  unidad: string | null;
  n_muestras: number;
  last_computed_at: string;
};

export async function getBenchmarks(filters: {
  cargo_codigo?: string;
  ambito?: string;
}): Promise<BenchmarkRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters.cargo_codigo) {
    params.push(filters.cargo_codigo);
    where.push(`cargo_codigo = $${params.length}`);
  }
  if (filters.ambito) {
    params.push(filters.ambito);
    where.push(`ambito_geografico = $${params.length}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query<BenchmarkRow>(
    `SELECT * FROM analisis.benchmarks ${whereClause} ORDER BY kpi_nombre LIMIT 100`,
    params,
  );
  return rows;
}

/** Busca un draft existente para reemplazo (mismo candidato + uploader + tipo). */
export async function findDraftByKey(
  candidatoId: number,
  uploaderId: string,
  type: DeckRow["type"],
): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(
    `SELECT * FROM public.decks
      WHERE candidato_id = $1
        AND uploaded_by_user_id = $2
        AND type = $3
        AND status = 'draft'
      ORDER BY created_at DESC
      LIMIT 1`,
    [candidatoId, uploaderId, type],
  );
  return rows[0] ?? null;
}

export async function replaceDraftContent(
  id: string,
  input: { title: string; description: string | null; storage_path: string; size_bytes: number },
): Promise<DeckRow> {
  const { rows } = await pool.query<DeckRow>(
    `UPDATE public.decks
        SET title = $2,
            description = $3,
            storage_path = $4,
            size_bytes = $5,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, input.title, input.description, input.storage_path, input.size_bytes],
  );
  return rows[0]!;
}

/** Lista decks por status (admin). */
export async function listDecksByStatus(
  status: DeckRow["status"],
): Promise<DeckListItem[]> {
  const { rows } = await pool.query<DeckListItem>(
    `SELECT d.*,
            cand.nombres   AS candidato_nombres,
            u.full_name    AS uploader_full_name,
            u.email        AS uploader_email,
            c.slug         AS campaign_slug,
            c.name         AS campaign_name
       FROM public.decks d
       JOIN candidatos.candidato cand ON cand.id = d.candidato_id
       JOIN public.users u ON u.id = d.uploaded_by_user_id
       LEFT JOIN public.campaigns c ON c.id = d.campaign_id
      WHERE d.status = $1
      ORDER BY d.created_at DESC
      LIMIT 200`,
    [status],
  );
  return rows;
}

export async function findDeckById(id: string): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(`SELECT * FROM public.decks WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Publica un deck que actualmente está en draft. Pasa de status draft →
 * published, setea reviewed_by_user_id y published_at. La diferencia con
 * `publishDeck` (admin) es que esta versión es para que el consultor
 * mismo se autopublique — gateada en routes por consultor_global_access.
 */
export async function selfPublishDeck(id: string, consultorId: string): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(
    `UPDATE public.decks
        SET status = 'published',
            reviewed_by_user_id = $2,
            published_at = now(),
            updated_at = now()
      WHERE id = $1 AND status = 'draft'
      RETURNING *`,
    [id, consultorId],
  );
  return rows[0] ?? null;
}

/**
 * Publica un deck. Acepta tanto `draft` (autopublish/admin directo) como
 * `pending_review` (admin aprobando lo que el consultor mandó a revisar).
 */
export async function publishDeck(id: string, reviewerId: string): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(
    `UPDATE public.decks
        SET status = 'published',
            reviewed_by_user_id = $2,
            published_at = now(),
            rejection_reason = NULL,
            updated_at = now()
      WHERE id = $1 AND status IN ('draft', 'pending_review')
      RETURNING *`,
    [id, reviewerId],
  );
  return rows[0] ?? null;
}

/**
 * Rechaza un deck. Acepta tanto `draft` como `pending_review`. El consultor
 * puede reabrirlo via `reopenDraft`.
 */
export async function rejectDeck(
  id: string,
  reviewerId: string,
  reason: string,
): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(
    `UPDATE public.decks
        SET status = 'rejected',
            reviewed_by_user_id = $2,
            rejection_reason = $3,
            updated_at = now()
      WHERE id = $1 AND status IN ('draft', 'pending_review')
      RETURNING *`,
    [id, reviewerId, reason],
  );
  return rows[0] ?? null;
}

// ── Fase 2 deck (canonical, 1 por candidato) ──────────────────────────
//
// Cada candidato tiene 1 solo "Fase 2 deck" canónico — type='diagnostico'.
// Cuando el wizard de Fase 1 termina, se crea con status='draft' vacío. El
// consultor lo edita via consultor_form. Cuando manda a revisar, status pasa
// a 'pending_review'. Admin aprueba → 'published'.

const FASE2_TYPE: DeckRow["type"] = "diagnostico";

/** Devuelve el deck Fase 2 más reciente del candidato, o null si no existe. */
export async function findFase2Deck(candidatoId: number): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(
    `SELECT * FROM public.decks
      WHERE candidato_id = $1
        AND type = $2
        AND status <> 'rejected'
      ORDER BY
        CASE status
          WHEN 'published'      THEN 0
          WHEN 'pending_review' THEN 1
          WHEN 'draft'          THEN 2
          ELSE 3
        END,
        updated_at DESC
      LIMIT 1`,
    [candidatoId, FASE2_TYPE],
  );
  return rows[0] ?? null;
}

/** Crea el deck Fase 2 si no existe. Idempotente. */
export async function ensureFase2Deck(input: {
  candidato_id: number;
  campaign_id: string;
  uploaded_by_user_id: string;
  candidato_full_name: string;
}): Promise<DeckRow> {
  const existing = await findFase2Deck(input.candidato_id);
  if (existing) return existing;
  const id = randomUUIDForDeck();
  const storagePath = `/srv/uploads/decks/${id}.html`; // placeholder — el render React no usa esto
  return insertDeck({
    id,
    candidato_id: input.candidato_id,
    campaign_id: input.campaign_id,
    uploaded_by_user_id: input.uploaded_by_user_id,
    title: `Diagnóstico — ${input.candidato_full_name}`,
    type: FASE2_TYPE,
    description: "Deck Fase 2 generado del onboarding del candidato.",
    storage_path: storagePath,
    size_bytes: 0,
  });
}

function randomUUIDForDeck(): string {
  // Usamos node:crypto. Import dinámico evita ciclo a top.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
  return randomUUID();
}

/** Marca un deck como pending_review (consultor → admin). */
export async function submitForReview(
  deckId: string,
  consultorId: string,
): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(
    `UPDATE public.decks
        SET status = 'pending_review',
            submitted_for_review_at = now(),
            uploaded_by_user_id = COALESCE(uploaded_by_user_id, $2),
            updated_at = now()
      WHERE id = $1
        AND status IN ('draft', 'rejected')
      RETURNING *`,
    [deckId, consultorId],
  );
  return rows[0] ?? null;
}

/** Devuelve a draft un deck rechazado o pending para que consultor reedite. */
export async function reopenDraft(deckId: string): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(
    `UPDATE public.decks
        SET status = 'draft',
            rejection_reason = NULL,
            submitted_for_review_at = NULL,
            updated_at = now()
      WHERE id = $1
        AND status IN ('rejected', 'pending_review')
      RETURNING *`,
    [deckId],
  );
  return rows[0] ?? null;
}
