import { pool } from "../../db";

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
  status: "draft" | "published" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface DeckListItem extends DeckRow {
  candidato_nombres: string;
  uploader_full_name: string;
  uploader_email: string;
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
            u.email        AS uploader_email
       FROM public.decks d
       JOIN candidatos.candidato cand ON cand.id = d.candidato_id
       JOIN public.users u ON u.id = d.uploaded_by_user_id
      WHERE d.candidato_id = $1
      ORDER BY d.created_at DESC`,
    [candidatoId],
  );
  return rows;
}

/** Lista decks por status (admin). */
export async function listDecksByStatus(
  status: DeckRow["status"],
): Promise<DeckListItem[]> {
  const { rows } = await pool.query<DeckListItem>(
    `SELECT d.*,
            cand.nombres   AS candidato_nombres,
            u.full_name    AS uploader_full_name,
            u.email        AS uploader_email
       FROM public.decks d
       JOIN candidatos.candidato cand ON cand.id = d.candidato_id
       JOIN public.users u ON u.id = d.uploaded_by_user_id
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

export async function publishDeck(id: string, reviewerId: string): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(
    `UPDATE public.decks
        SET status = 'published',
            reviewed_by_user_id = $2,
            published_at = now(),
            updated_at = now()
      WHERE id = $1 AND status = 'draft'
      RETURNING *`,
    [id, reviewerId],
  );
  return rows[0] ?? null;
}

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
      WHERE id = $1 AND status = 'draft'
      RETURNING *`,
    [id, reviewerId, reason],
  );
  return rows[0] ?? null;
}
