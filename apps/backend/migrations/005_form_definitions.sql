-- 005_form_definitions.sql
-- Dynamic forms system for candidate-specific data collection.

-- 1) Create form_definitions table
CREATE TABLE IF NOT EXISTS public.form_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  schema JSONB NOT NULL DEFAULT '{"version": "1.0", "fields": []}',
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')) DEFAULT 'draft',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Add form_definition_id to existing forms table
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS form_definition_id UUID REFERENCES form_definitions(id);

-- 3) Create indexes
CREATE INDEX IF NOT EXISTS idx_form_definitions_campaign ON public.form_definitions (campaign_id);
CREATE INDEX IF NOT EXISTS idx_form_definitions_status ON public.form_definitions (status);
CREATE INDEX IF NOT EXISTS idx_form_definitions_slug ON public.form_definitions (slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_definitions_campaign_slug 
  ON public.form_definitions (campaign_id, slug);

-- 4) Add updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 5) Add trigger for updated_at
DROP TRIGGER IF EXISTS update_form_definitions_updated_at ON public.form_definitions;
CREATE TRIGGER update_form_definitions_updated_at
  BEFORE UPDATE ON public.form_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
