-- 043_extraction_candidates.sql
-- Extracción estructurada desde mensajes manuales del operador.
--
-- Por qué: el operador (Kathy / asesores) escribe a mano precios, cuentas
-- bancarias, links de productos, números de Yape, imágenes de flyer, etc.
-- Esos datos viven solo en la conversación y no llegan a `bot_instances`,
-- `templates` o `products`. Cuando cambia un precio o cuenta, el bot sigue
-- usando el viejo y responde mal.
--
-- Solución: un job scanea los outbounds manuales recientes con regex +
-- normalización, agrupa por valor, y crea candidates. El operador revisa
-- en /admin/extraction/candidates y aprueba — recién ahí se aplica al
-- destino correspondiente. Cola de revisión (no auto-apply) porque el
-- incidente del password mostró que los operadores mandan info única que
-- no debería ser sobrescrita en bulk.
CREATE TABLE IF NOT EXISTS extraction_candidates (
  id              SERIAL PRIMARY KEY,

  -- Qué tipo de dato extrajimos
  kind            TEXT NOT NULL,
  -- Valores válidos: 'price', 'bank_account', 'yape', 'image_url',
  --                  'product_name', 'phone_other', 'whatsapp_link'.

  -- El valor crudo extraído (para mostrar al operador)
  value_raw       TEXT NOT NULL,

  -- Forma normalizada para comparar duplicados (ej. precio "S/. 500"
  -- → "500.00 PEN", cuenta "194-1234567-0-12 BCP" → "BCP:19412345670012").
  value_normalized TEXT NOT NULL,

  -- Metadata estructurada del valor — útil para apply
  -- (ej. price: { amount: 500, currency: "PEN" }, bank: { bank: "BCP",
  -- account: "194-1234567-0-12", type: "ahorros" })
  value_meta      JSONB,

  -- Cuántas veces se vio este valor en outbounds distintos. confidence
  -- = min(occurrences / 3, 1.0). 1+ es candidato pero solo aparece 1 vez,
  -- 3+ ya es "patrón confirmado".
  occurrences     INT NOT NULL DEFAULT 1,
  confidence      NUMERIC(3,2) NOT NULL DEFAULT 0.33,

  -- IDs de interactions donde se vio (audit + para mostrar contexto)
  source_message_ids INT[] NOT NULL DEFAULT '{}',
  -- Hasta 3 ejemplos del texto completo, para que el operador entienda
  -- contexto sin tener que abrir cada conversación
  sample_texts    TEXT[] NOT NULL DEFAULT '{}',

  -- Cuando aplicamos esto, ¿a dónde va? Ej:
  --   { type: "instance.cuenta_bancaria", instance_id: 4 }
  --   { type: "product.price", product_sku: "diploma-parlamentaria" }
  --   { type: "template.image", template_id: 12 }
  -- Si NULL, el operador elige al aprobar.
  suggested_target JSONB,

  -- Workflow
  status          TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'approved' | 'rejected' | 'superseded' | 'applied'

  approved_value  TEXT,                    -- el operador puede editar antes de apply
  approved_target JSONB,                   -- override de suggested_target
  applied_at      TIMESTAMPTZ,
  applied_by      TEXT,
  rejected_reason TEXT,

  -- Bot instance que generó el outbound (para filtrar candidates por
  -- línea — Kathy de p4 vs jahelly de p3).
  bot_instance_id INT REFERENCES bot_instances(id) ON DELETE SET NULL,

  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Únicos por (kind, value_normalized, bot_instance_id) — si el mismo
-- precio aparece de nuevo, hacemos UPDATE (occurrences++, last_seen_at).
CREATE UNIQUE INDEX IF NOT EXISTS ux_extraction_candidates_dedup
  ON extraction_candidates (kind, value_normalized, COALESCE(bot_instance_id, 0));

CREATE INDEX IF NOT EXISTS idx_extraction_candidates_pending
  ON extraction_candidates (kind, status, confidence DESC) WHERE status = 'pending';
