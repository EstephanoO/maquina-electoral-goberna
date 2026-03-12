-- Migration 041: Add perm_audio_admin to user_campaigns
-- Allows agente_digital users to CRUD audio catalog items without being consultor.
-- Consultor+ (level 40+) still auto-passes by role level; this flag is for lower roles.

ALTER TABLE user_campaigns ADD COLUMN IF NOT EXISTS perm_audio_admin BOOLEAN NOT NULL DEFAULT false;

-- Set perm_audio_admin = true for the 4 designers in César Vásquez campaign (campaign 1)
-- Paloma Ramos Gonzales: paloma@goberna.pe
-- Victor: victor@goberna.pe
-- Cristian Mallma Antonio: cristian@goberna.pe
-- Aaron Yasser Vega Pajuelo: aaron@goberna.pe

UPDATE user_campaigns
SET perm_audio_admin = true
WHERE user_id IN (
  SELECT id FROM users WHERE lower(email) IN (
    'paloma@goberna.pe',
    'victor@goberna.pe',
    'cristian@goberna.pe',
    'aaron@goberna.pe'
  )
);

-- Fix Cristian's campaign role: agente_campo → agente_digital
UPDATE user_campaigns
SET role = 'agente_digital'
WHERE user_id = (SELECT id FROM users WHERE lower(email) = 'cristian@goberna.pe')
  AND role = 'agente_campo';
