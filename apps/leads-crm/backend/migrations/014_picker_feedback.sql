-- Sprint 2.C (2026-05-07): tabla picker_feedback para 👍/👎 sobre auto-replies.
--
-- El operador ve una respuesta auto del bot en el chat (interactions con
-- meta.auto_reply=true) y la marca útil/no-útil. Después de N votos podemos
-- ajustar thresholds del cascade (learned_replies 0.85, semantic 0.72) por
-- percentil basado en lo que efectivamente ayudó.
--
-- Sin UI por ahora — solo la tabla + endpoint POST /interactions/:id/feedback.
-- Cuando el frontend agregue los botones, ya está la API lista.

CREATE TABLE IF NOT EXISTS picker_feedback (
  id              BIGSERIAL PRIMARY KEY,
  interaction_id  INTEGER     NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  lead_id         INTEGER     NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  picker_method   TEXT,                        -- copia desde interactions.meta para query rápido
  picker_score    REAL,                        -- idem
  template_id     INTEGER,                     -- si fue match de template
  learned_reply_id INTEGER,                    -- si fue learned_reply
  ai_model        TEXT,                        -- 'gemini:...', 'openai:...'
  was_helpful     BOOLEAN     NOT NULL,        -- true=👍, false=👎
  notes           TEXT,                        -- comentario opcional del operador
  created_by      TEXT,                        -- email del operador (si auth)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un operador puede cambiar su voto: UPDATE en lugar de duplicar.
  UNIQUE (interaction_id, created_by)
);

CREATE INDEX IF NOT EXISTS idx_picker_feedback_method
  ON picker_feedback (picker_method, was_helpful, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_picker_feedback_lead
  ON picker_feedback (lead_id, created_at DESC);

-- View útil para análisis: success rate por picker_method en últimos 30d.
CREATE OR REPLACE VIEW picker_feedback_summary AS
  SELECT
    picker_method,
    count(*) AS total_votes,
    count(*) FILTER (WHERE was_helpful)        AS helpful,
    count(*) FILTER (WHERE NOT was_helpful)    AS unhelpful,
    ROUND(100.0 * count(*) FILTER (WHERE was_helpful) / NULLIF(count(*), 0), 1)::real AS helpful_pct,
    avg(picker_score) FILTER (WHERE picker_score IS NOT NULL) AS avg_score
  FROM picker_feedback
  WHERE created_at > now() - interval '30 days'
  GROUP BY picker_method
  ORDER BY total_votes DESC;
