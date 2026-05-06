-- ai_rules: identifica origen de la rule (manual / product / promoted_feedback / system_seed)
ALTER TABLE ai_rules ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
CREATE INDEX IF NOT EXISTS idx_ai_rules_source ON ai_rules(source);
