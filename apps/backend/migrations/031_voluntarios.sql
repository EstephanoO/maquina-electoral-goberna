-- Migration: 031_voluntarios.sql
-- Purpose: Store volunteer brigadistas from public signup form
-- Created: 2026-03-04

CREATE TABLE IF NOT EXISTS voluntarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_completo VARCHAR(255) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  departamento VARCHAR(100) NOT NULL,
  provincia VARCHAR(100) NOT NULL,
  distrito VARCHAR(100) NOT NULL,
  rango_edad VARCHAR(10) NOT NULL,  -- '18-25' | '26-35' | '36-45'
  candidato_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  candidato_slug VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voluntarios_created_at ON voluntarios(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voluntarios_candidato_id ON voluntarios(candidato_id);
CREATE INDEX IF NOT EXISTS idx_voluntarios_departamento ON voluntarios(departamento);
CREATE INDEX IF NOT EXISTS idx_voluntarios_telefono ON voluntarios(telefono);

COMMENT ON TABLE voluntarios IS 'Volunteer brigadistas registered via public form';
COMMENT ON COLUMN voluntarios.rango_edad IS 'Age range: 18-25, 26-35, or 36-45';
