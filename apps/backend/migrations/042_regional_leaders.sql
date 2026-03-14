-- Migration: 042_regional_leaders.sql
-- Purpose: Store regional leaders from public landing form
-- Created: 2026-03-14

CREATE TABLE IF NOT EXISTS regional_leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombres VARCHAR(120) NOT NULL,
  apellidos VARCHAR(120) NOT NULL,
  departamento VARCHAR(100) NOT NULL,
  provincia VARCHAR(100) NOT NULL,
  distrito VARCHAR(100) NOT NULL,
  dni CHAR(8) NOT NULL CHECK (dni ~ '^[0-9]{8}$'),
  celular CHAR(9) NOT NULL CHECK (celular ~ '^[0-9]{9}$'),
  direccion_domicilio VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regional_leaders_created_at ON regional_leaders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_regional_leaders_departamento ON regional_leaders(departamento);
CREATE INDEX IF NOT EXISTS idx_regional_leaders_provincia ON regional_leaders(provincia);
CREATE INDEX IF NOT EXISTS idx_regional_leaders_distrito ON regional_leaders(distrito);
CREATE INDEX IF NOT EXISTS idx_regional_leaders_dni ON regional_leaders(dni);
CREATE INDEX IF NOT EXISTS idx_regional_leaders_celular ON regional_leaders(celular);

COMMENT ON TABLE regional_leaders IS 'Regional leaders registered from landing page form';
