-- Migration: 029_leads.sql
-- Purpose: Store TestFlight access leads from /descargar page
-- Created: 2026-02-26

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  correo VARCHAR(255) NOT NULL,
  plataforma VARCHAR(20) NOT NULL DEFAULT 'iphone',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_correo ON leads(correo);

COMMENT ON TABLE leads IS 'TestFlight access requests from /descargar page';
