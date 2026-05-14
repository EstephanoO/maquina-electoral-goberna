/**
 * Deck repo — consultor_form (wizard fase-1 JSONB) + deck_fase2 versionado.
 *
 * El consultor_form es 1:1 con candidato — UPSERT con merge sobre payload
 * existente (deep merge a nivel top-level keys, no recursive). El frontend
 * envía el form completo o un subset; el backend hace merge.
 *
 * deck_fase2 es append: cada `publicar` agrega una fila con version++.
 */
import { getOnboardingPool } from "../../../db";
import type { ConsultorFormUpdate, DeckPublish } from "../_schemas";

export type ConsultorFormState = {
  id_candidato: number;
  payload: Record<string, unknown>;
  ultima_seccion: string | null;
  completado: boolean;
  actualizado_en: string;
  actualizado_por: string | null;
};

export type DeckSnapshot = {
  id: number;
  id_candidato: number;
  version: number;
  payload: Record<string, unknown>;
  publicado_por: string | null;
  publicado_en: string;
};

export async function getConsultorForm(idCandidato: number): Promise<ConsultorFormState | null> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<ConsultorFormState>(
    `SELECT id_candidato, payload, ultima_seccion, completado,
            actualizado_en::text AS actualizado_en,
            actualizado_por::text AS actualizado_por
       FROM deck.consultor_form
      WHERE id_candidato = $1`,
    [idCandidato],
  );
  return rows[0] ?? null;
}

/**
 * Upsert merge top-level: si la fila existe, hace `payload || $new_payload`
 * (operador JSONB `||`, top-level merge). Las claves nuevas o cambiadas
 * pisan; las que no se envían se preservan.
 */
export async function upsertConsultorForm(
  idCandidato: number,
  input: ConsultorFormUpdate,
  userId: string,
): Promise<ConsultorFormState> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<ConsultorFormState>(
    `INSERT INTO deck.consultor_form
       (id_candidato, payload, ultima_seccion, completado, actualizado_por, actualizado_en)
     VALUES ($1, $2::jsonb, $3, COALESCE($4, false), $5, now())
     ON CONFLICT (id_candidato) DO UPDATE SET
       payload         = deck.consultor_form.payload || EXCLUDED.payload,
       ultima_seccion  = COALESCE(EXCLUDED.ultima_seccion, deck.consultor_form.ultima_seccion),
       completado      = COALESCE(EXCLUDED.completado, deck.consultor_form.completado),
       actualizado_por = EXCLUDED.actualizado_por,
       actualizado_en  = now()
     RETURNING id_candidato, payload, ultima_seccion, completado,
               actualizado_en::text AS actualizado_en,
               actualizado_por::text AS actualizado_por`,
    [
      idCandidato,
      JSON.stringify(input.payload),
      input.ultima_seccion ?? null,
      input.completado ?? null,
      userId,
    ],
  );
  return rows[0]!;
}

/**
 * Publica una nueva versión del deck. Version se autocalcula como
 * MAX(version) + 1 por candidato.
 */
export async function publishDeck(
  idCandidato: number,
  input: DeckPublish,
  userId: string,
): Promise<DeckSnapshot> {
  const pool = getOnboardingPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: maxRows } = await client.query<{ max_version: number | null }>(
      `SELECT MAX(version) AS max_version FROM deck.deck_fase2 WHERE id_candidato = $1`,
      [idCandidato],
    );
    const nextVersion = (maxRows[0]?.max_version ?? 0) + 1;

    const { rows } = await client.query<DeckSnapshot>(
      `INSERT INTO deck.deck_fase2 (id_candidato, version, payload, publicado_por)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id, id_candidato, version, payload,
                 publicado_por::text AS publicado_por,
                 publicado_en::text AS publicado_en`,
      [idCandidato, nextVersion, JSON.stringify(input.payload), userId],
    );

    await client.query(
      `INSERT INTO candidatos.evento (id_candidato, tipo, user_id, payload)
       VALUES ($1, 'deck_publicado', $2, $3)`,
      [idCandidato, userId, { version: nextVersion }],
    );

    await client.query("COMMIT");
    return rows[0]!;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function getDeckUltimaVersion(idCandidato: number): Promise<DeckSnapshot | null> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<DeckSnapshot>(
    `SELECT id, id_candidato, version, payload,
            publicado_por::text AS publicado_por,
            publicado_en::text AS publicado_en
       FROM deck.deck_fase2
      WHERE id_candidato = $1
      ORDER BY version DESC
      LIMIT 1`,
    [idCandidato],
  );
  return rows[0] ?? null;
}

export async function listDeckVersiones(idCandidato: number): Promise<DeckSnapshot[]> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<DeckSnapshot>(
    `SELECT id, id_candidato, version, payload,
            publicado_por::text AS publicado_por,
            publicado_en::text AS publicado_en
       FROM deck.deck_fase2
      WHERE id_candidato = $1
      ORDER BY version DESC`,
    [idCandidato],
  );
  return rows;
}
