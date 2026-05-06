-- 012_ai_training.sql
-- Sistema de entrenamiento personalizable del classifier del bot.
-- 3 tablas que el classifier lee en runtime con cache:
--
--   ai_rules            — regex → tag, agregadas en UI por el admin/operador
--   ai_prompt_override  — singleton: contexto + categorías custom + few-shot
--                         que se appendea al SYSTEM_PROMPT de Gemini
--   ai_feedback         — loop: operador corrige tags asignadas → se logea
--                         para que el admin promueva la corrección a rule

-- ── Custom Rules (regex → tag) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_rules (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,                    -- "Detecta interés en Diploma Parlamentaria"
  description TEXT,
  pattern     TEXT NOT NULL,                    -- regex (siempre /i)
  tag         TEXT NOT NULL,                    -- "interés:gestion-parlamentaria"
  weight      REAL NOT NULL DEFAULT 1.0,        -- multiplicador de confidence
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  hits_count  INT NOT NULL DEFAULT 0,           -- cuántas veces matcheó (telemetry)
  last_hit_at TIMESTAMPTZ,
  created_by  TEXT,                             -- email del user que la creó
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_rules_enabled ON ai_rules(enabled) WHERE enabled = TRUE;

-- ── Prompt Override (singleton) ─────────────────────────────────────
-- Singleton porque solo hay UN classifier prompt activo. id=1 siempre.
CREATE TABLE IF NOT EXISTS ai_prompt_override (
  id                 INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Texto que se concatena al final del SYSTEM_PROMPT base de Gemini.
  -- Útil para dar contexto del negocio: "Goberna Escuela vende diplomas en
  -- consultoría política. Productos vivos: X, Y, Z. Forma de pago: BCP/Yape."
  extra_context      TEXT NOT NULL DEFAULT '',
  -- Categorías custom adicionales que Gemini puede devolver. Una por línea.
  -- Ej: "tema_legal", "tema_marketing", "consulta_modalidad"
  extra_categories   TEXT NOT NULL DEFAULT '',
  -- Few-shot examples — pares (input, output) que enseñan a Gemini patrones
  -- específicos del dominio. Formato:
  --   [{"input": "quiero el diploma", "output": {"vote_class":"duro","category":"enrollment","confidence":0.9}}]
  few_shot_examples  JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by         TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garantiza que siempre haya una row id=1 (singleton).
INSERT INTO ai_prompt_override (id, extra_context, extra_categories, few_shot_examples)
VALUES (1, '', '', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Feedback (loop de correcciones) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_feedback (
  id                  SERIAL PRIMARY KEY,
  lead_id             INT REFERENCES leads(id) ON DELETE SET NULL,
  interaction_id      INT REFERENCES interactions(id) ON DELETE SET NULL,
  message_text        TEXT NOT NULL,            -- el texto del msg que se clasificó
  original_tags       TEXT[] NOT NULL DEFAULT '{}',  -- lo que el classifier puso
  corrected_tags      TEXT[] NOT NULL DEFAULT '{}',  -- lo que el operador corrigió a
  reason              TEXT,                          -- por qué corrigió (opcional)
  promoted_to_rule_id INT REFERENCES ai_rules(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'pending'   -- pending | promoted | dismissed
                      CHECK (status IN ('pending','promoted','dismissed')),
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_status ON ai_feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_lead   ON ai_feedback(lead_id) WHERE lead_id IS NOT NULL;

-- ── Seed inicial de rules específicas para Goberna Escuela ──────────
-- Pre-cargamos rules que reflejan vocabulario real detectado en el audit
-- de inbounds del P4 (audit 2026-05-06). El admin puede editarlas/desactivarlas.
INSERT INTO ai_rules (name, description, pattern, tag, weight, enabled, created_by) VALUES
  ('Diploma Parlamentaria',     'Lead pregunta por el diploma de Gestión Parlamentaria Bicameral',
   '(?i)gesti[oó]n\s*parlamentari|parlamentari[ao]\s*bicameral|diploma\s*parlamentari',
   'interés:diploma-parlamentaria', 1.0, TRUE, 'system_seed'),
  ('Análisis Inteligencia',     'Curso Análisis de Inteligencia',
   '(?i)an[aá]lisis\s*de\s*(la\s*)?inteligencia|analista\s*de\s*inteligencia',
   'interés:analisis-inteligencia', 1.0, TRUE, 'system_seed'),
  ('Marketing Político',         'Marketing y campaña política',
   '(?i)marketing\s*pol[ií]tic|marketing\s*electoral|campa[ñn]a\s*(electoral|pol[ií]tic)',
   'interés:marketing-politico', 1.0, TRUE, 'system_seed'),
  ('Pago Yape',                  'Cliente menciona Yape como método de pago',
   '(?i)\byape\b|yapeo|por\s*yape',
   'pago:yape', 1.0, TRUE, 'system_seed'),
  ('Pago BCP transferencia',     'Cliente quiere pagar por transferencia BCP',
   '(?i)\bbcp\b|interbank|transferenc|dep[oó]sit',
   'pago:transferencia', 1.0, TRUE, 'system_seed'),
  ('Voucher / comprobante',      'Cliente menciona el comprobante de pago',
   '(?i)voucher|comprobante\s*de\s*pago|transferid|ya\s*pagu[eé]',
   'pago:menciona_voucher', 1.5, TRUE, 'system_seed'),
  ('Solicita información',       'Lead pide info genérica del producto',
   '(?i)quisiera\s*(saber|m[aá]s\s*informaci[oó]n)|me\s*pueden\s*(decir|inform)',
   'intent:inquiry', 1.0, TRUE, 'system_seed'),
  ('Quiere inscribirse',         'Lead expresa intención clara de inscripción',
   '(?i)inscri[bp]|matric[uú]l|quiero\s*el\s*(curso|diploma|programa)|me\s*interes',
   'intent:enrollment', 1.5, TRUE, 'system_seed'),
  ('Pregunta precio',            'Lead pregunta cuánto cuesta',
   '(?i)cu[aá]nto\s*(cuesta|sale|es)|\bcosto\b|\bprecio\b',
   'consulta:precio', 1.0, TRUE, 'system_seed'),
  ('Pregunta horario',           'Lead pregunta cuándo arranca o el horario',
   '(?i)cu[aá]ndo\s*(empiez|arranca|inicia)|\bhorario\b|qu[eé]\s*d[ií]a',
   'consulta:horario', 1.0, TRUE, 'system_seed'),
  ('Pregunta envío provincial',  'Cliente fuera de Lima pregunta envío',
   '(?i)env[ií]o.*provinci|provinci.*env[ií]o|\benv[ií]an\s*a\s+\w|c[oó]mo\s*me\s*lleg|recoj',
   'consulta:envio', 1.0, TRUE, 'system_seed'),
  ('Confirma pago hecho',        'Lead dice que ya pagó o transfirió',
   '(?i)ya\s*pagu[eé]|ya\s*transfer|hice\s*el\s*dep[oó]sit|aqu[ií]\s*el\s*voucher|aqu[ií]\s*la\s*foto',
   'pago:confirmado_lead', 2.0, TRUE, 'system_seed'),
  ('Sector Salud',               'Lead trabaja en salud',
   '(?i)\b(sector\s+salud|enferm[ae]r|m[eé]dic[oa]|hospital|cesfam|posta)\b',
   'sector:salud', 1.0, TRUE, 'system_seed'),
  ('Sector Educación',           'Lead trabaja en educación',
   '(?i)\b(docente|profesor|maestr[oa]|colegio)\b',
   'sector:educacion', 1.0, TRUE, 'system_seed'),
  ('Cliente VIP',                'Texto sugiere LTV alto (referido o histórico)',
   '(?i)me\s*recomend|ya\s*estuve|otro\s*curso|el\s*a[ñn]o\s*pasado',
   'cliente:repeat-mention', 0.8, TRUE, 'system_seed'),
  ('No interesado',              'Rechaza expresamente',
   '(?i)no\s*me\s*interesa|no\s*gracias|por\s*ahora\s*no',
   'intent:negativo', 1.0, TRUE, 'system_seed'),
  ('Lead en duda',               'Pregunta más info pero no compromete',
   '(?i)voy\s*a\s*pensar|d[eé]jame\s*ver|m[aá]s\s*tarde\s*te\s*aviso',
   'estado:considerando', 1.0, TRUE, 'system_seed'),
  ('Tema laboral',               'Está buscando trabajo, no comprar',
   '(?i)tema\s*laboral|busco\s*trabajo|enviar\s*cv|\boportunidad\s*labor',
   'pide:trabajo', 1.0, TRUE, 'system_seed'),
  ('Spam — pide dinero',         'Pide dinero, ayuda económica',
   '(?i)\b(yape|plin|bim)\b.*plata|me\s*regal|dinero|ay[uú]da\s*econ[oó]mic',
   'invalido:pide_dinero', 1.0, TRUE, 'system_seed'),
  ('Saludo simple',              'Solo saluda, sin contenido',
   '(?i)^(hola|buen[oa]s\s*(d[ií]as|tardes|noches)?|saludos|hi|hey)[!.,]*\s*$',
   'intent:greeting', 1.0, TRUE, 'system_seed')
ON CONFLICT DO NOTHING;
