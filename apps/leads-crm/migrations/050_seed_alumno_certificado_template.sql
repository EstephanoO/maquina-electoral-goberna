-- 050_seed_alumno_certificado_template.sql
--
-- Pattern post-venta: alumno que ya tomó un curso pregunta por la descarga
-- de su certificado. Kathy responde con "Sí, su certificado lo puede
-- descargar desde el campus virtual 🎓" (corto, directo, action-oriented).
--
-- Importante: NO confundir con intent:soporte_acceso (que escala a humano
-- por "no puedo acceder al campus") ni con intent:certificado original
-- (que matchea "certificado físico"). Acá el alumno SÍ tiene acceso, solo
-- necesita saber dónde está el certificado.

INSERT INTO templates (name, body, category, uses_count) VALUES
  ('kathy_certificado_campus',
   E'Sí, su certificado lo puede descargar desde el campus virtual 🎓',
   'certificado_campus',
   8)
ON CONFLICT (name) DO UPDATE SET
  body = EXCLUDED.body,
  category = EXCLUDED.category,
  updated_at = now();

INSERT INTO ai_rules (name, description, pattern, tag, weight, enabled, source) VALUES
  ('intent:certificado_descarga',
   'Alumno post-venta pregunta dónde / cómo descargar su certificado',
   '(?i)\b(no\s*(he|hemos)?\s*descarg|no\s*(puedo|encuentro|s[eé])\s*descarg|d[oó]nde\s*descarg|c[oó]mo\s*(descargo|bajo|obtengo)|no\s*encuentro\s*(mi|el)\s*(certificado|diploma)|necesito\s*(mi|el)\s*certificado|quiero\s*(descargar|bajar)\s*(mi|el)\s*certificado)',
   'intent:certificado_descarga',
   1.0,
   TRUE,
   'kathy_top')
ON CONFLICT DO NOTHING;

-- Stats post-fix
SELECT name, category, uses_count FROM templates WHERE name = 'kathy_certificado_campus';
SELECT name, tag, enabled FROM ai_rules WHERE name = 'intent:certificado_descarga';
