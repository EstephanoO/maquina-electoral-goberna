-- 054: ERP de Goberna Escuela importado a electoral.
--
-- Origen: dump MariaDB del sistema operativo de Escuela (ventas, clientes,
-- matrículas, certificados, productos). Histórico desde marzo 2024.
-- Importamos un subset relevante para enriquecer voter_profile y leads-crm
-- con datos del cliente real cuando el bot recibe un mensaje.
--
-- Schema separado (`escuela`) para que las tablas no se confundan con las
-- nativas de electoral. ON DELETE CASCADE en relaciones para que un re-import
-- limpio sea idempotente (TRUNCATE escuela.clients CASCADE → todo se limpia).
--
-- Phone matching: tb_telefono.prefijo + numero_telefono se normaliza a
-- canonical_phone (solo dígitos, últimos 11 chars) — match con leads-crm
-- y voter_profiles.canonical_phone.

CREATE SCHEMA IF NOT EXISTS escuela;

-- ── Clientes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escuela.clients (
  id                BIGINT PRIMARY KEY,
  codigo_cliente    VARCHAR(20) UNIQUE,
  nombre            VARCHAR(150) NOT NULL DEFAULT '',
  apellido          VARCHAR(150) NOT NULL DEFAULT '',
  fecha_nacimiento  DATE,
  dni               VARCHAR(20),
  fecha_registro    TIMESTAMPTZ,
  fecha_edicion     TIMESTAMPTZ,
  estado            INT,
  ocupacion         VARCHAR(150),
  tratamiento       VARCHAR(150),
  moodle_email      VARCHAR(150),
  moodle_user_id    INT,
  pais_id           INT,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escuela_clients_dni        ON escuela.clients(dni) WHERE dni IS NOT NULL AND dni <> '';
CREATE INDEX IF NOT EXISTS idx_escuela_clients_moodle_uid ON escuela.clients(moodle_user_id) WHERE moodle_user_id IS NOT NULL;

-- ── Teléfonos (LLAVE de matching con leads-crm/voter_profile) ───────
CREATE TABLE IF NOT EXISTS escuela.phones (
  id              BIGINT PRIMARY KEY,
  client_id       BIGINT NOT NULL REFERENCES escuela.clients(id) ON DELETE CASCADE,
  tipo            VARCHAR(30),
  prefijo         VARCHAR(10),
  numero          VARCHAR(30),
  -- Phone normalizado: prefijo+numero stripeado a dígitos, truncado a últimos
  -- 11 chars (suficiente para Perú 51XXXXXXXXX). Match con
  -- voter_profiles.canonical_phone (9 dígitos finales) y leads.phone (con +).
  canonical_phone VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_escuela_phones_client     ON escuela.phones(client_id);
CREATE INDEX IF NOT EXISTS idx_escuela_phones_canonical  ON escuela.phones(canonical_phone) WHERE canonical_phone IS NOT NULL;

-- ── Correos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escuela.emails (
  id         BIGINT PRIMARY KEY,
  client_id  BIGINT NOT NULL REFERENCES escuela.clients(id) ON DELETE CASCADE,
  tipo       VARCHAR(30),
  email      VARCHAR(150) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_escuela_emails_client ON escuela.emails(client_id);
CREATE INDEX IF NOT EXISTS idx_escuela_emails_email  ON escuela.emails(LOWER(email));

-- ── Productos (catálogo de cursos) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS escuela.products (
  id                BIGINT PRIMARY KEY,
  sku               VARCHAR(50) UNIQUE,
  nombre            VARCHAR(250) NOT NULL,
  precio_normal     NUMERIC(12,2),
  precio_promocion  NUMERIC(12,2),
  estado            INT,
  categoria_id      INT,
  fecha_registro    DATE,
  -- Moodle integration
  cohorte_moodle_id INT,
  curso_moodle_id   INT,
  tipo_matricula    VARCHAR(15)
);
CREATE INDEX IF NOT EXISTS idx_escuela_products_estado ON escuela.products(estado);

-- ── Schedules de productos (fechas de inicio/fin, modalidad) ────────
CREATE TABLE IF NOT EXISTS escuela.product_schedules (
  id                BIGINT PRIMARY KEY,
  product_id        BIGINT NOT NULL REFERENCES escuela.products(id) ON DELETE CASCADE,
  fecha_inicio      DATE,
  fecha_fin         DATE,
  cantidad_modulos  VARCHAR(100),
  horas_academicas  VARCHAR(100),
  dias_semana       VARCHAR(120)
);
CREATE INDEX IF NOT EXISTS idx_escuela_product_schedules_product ON escuela.product_schedules(product_id);
CREATE INDEX IF NOT EXISTS idx_escuela_product_schedules_inicio  ON escuela.product_schedules(fecha_inicio) WHERE fecha_inicio IS NOT NULL;

-- ── Ventas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escuela.sales (
  id              BIGINT PRIMARY KEY,
  folio           VARCHAR(30) UNIQUE,
  client_id       BIGINT REFERENCES escuela.clients(id) ON DELETE SET NULL,
  monto_total     NUMERIC(14,2),
  moneda_id       INT,
  fecha_venta     TIMESTAMPTZ,
  fecha_registro  TIMESTAMPTZ,
  estado          INT,
  medio_venta     VARCHAR(30),
  origen_venta    VARCHAR(30)
);
CREATE INDEX IF NOT EXISTS idx_escuela_sales_client ON escuela.sales(client_id);
CREATE INDEX IF NOT EXISTS idx_escuela_sales_fecha  ON escuela.sales(fecha_venta DESC);

-- ── Pagos ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escuela.payments (
  id                  BIGINT PRIMARY KEY,
  monto_pagado        NUMERIC(14,2),
  voucher             VARCHAR(150),
  fecha_pago          DATE,
  cuota_id            BIGINT,
  metodo_id           INT,
  moneda_id           INT,
  estado              INT,
  fecha_confirmacion  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_escuela_payments_voucher ON escuela.payments(voucher) WHERE voucher IS NOT NULL AND voucher <> '';
CREATE INDEX IF NOT EXISTS idx_escuela_payments_fecha   ON escuela.payments(fecha_pago DESC);

-- ── Matrículas ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escuela.enrollments (
  id                       BIGINT PRIMARY KEY,
  client_id                BIGINT REFERENCES escuela.clients(id) ON DELETE SET NULL,
  product_id               BIGINT REFERENCES escuela.products(id) ON DELETE SET NULL,
  estado                   INT,
  fecha_matriculado        TIMESTAMPTZ,
  fecha_aprobacion         TIMESTAMPTZ,
  fecha_fin_acceso         DATE,
  motivo_baja              VARCHAR(200),
  moodle_user_id           INT,
  beneficiario_confirmado  BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_escuela_enrollments_client  ON escuela.enrollments(client_id);
CREATE INDEX IF NOT EXISTS idx_escuela_enrollments_product ON escuela.enrollments(product_id);

-- ── Certificados ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escuela.certificates (
  id                  BIGINT PRIMARY KEY,
  client_id           BIGINT REFERENCES escuela.clients(id) ON DELETE SET NULL,
  product_id          BIGINT REFERENCES escuela.products(id) ON DELETE SET NULL,
  fecha_emision       TIMESTAMPTZ,
  numero_certificado  VARCHAR(150),
  raw                 JSONB
);
CREATE INDEX IF NOT EXISTS idx_escuela_certificates_client ON escuela.certificates(client_id);

-- ── Contact leads (registros recientes con whatsapp + email) ────────
CREATE TABLE IF NOT EXISTS escuela.contact_leads (
  id                   BIGINT PRIMARY KEY,
  external_contact_id  BIGINT,
  email                VARCHAR(200),
  first_name           VARCHAR(200),
  last_name            VARCHAR(200),
  whatsapp             VARCHAR(50),
  canonical_phone      VARCHAR(20),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_escuela_contact_leads_canonical ON escuela.contact_leads(canonical_phone) WHERE canonical_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_escuela_contact_leads_email     ON escuela.contact_leads(LOWER(email)) WHERE email IS NOT NULL AND email <> '';

-- ── Vista materializada lead_360 ────────────────────────────────────
--
-- Rollup por canonical_phone con todo lo que el bot necesita en un sólo
-- lookup. Materializada para que el SELECT sea < 1ms (no recalcula joins
-- cada vez). REFRESH MATERIALIZED VIEW CONCURRENTLY se hace en el script
-- de import + via cron job.
CREATE MATERIALIZED VIEW IF NOT EXISTS escuela.lead_360 AS
SELECT
  p.canonical_phone,
  p.prefijo,
  c.id                                                AS client_id,
  c.codigo_cliente,
  c.nombre,
  c.apellido,
  TRIM(BOTH ' ' FROM c.nombre || ' ' || c.apellido)   AS nombre_completo,
  c.dni,
  c.ocupacion,
  c.tratamiento,
  c.fecha_nacimiento,
  c.fecha_registro                                     AS first_registered_at,
  c.moodle_email,
  c.moodle_user_id,

  -- Email primario: el primer email no-vacío del cliente (en su mayoría es 1).
  (SELECT email
     FROM escuela.emails e
    WHERE e.client_id = c.id AND COALESCE(e.email, '') <> ''
    ORDER BY e.id LIMIT 1)                            AS email_principal,

  -- Resumen de ventas
  (SELECT COUNT(*) FROM escuela.sales s
    WHERE s.client_id = c.id AND s.estado = 1)        AS sales_count,
  (SELECT COALESCE(SUM(s.monto_total), 0) FROM escuela.sales s
    WHERE s.client_id = c.id AND s.estado = 1)        AS sales_total,
  (SELECT MAX(s.fecha_venta) FROM escuela.sales s
    WHERE s.client_id = c.id AND s.estado = 1)        AS last_purchase_at,

  -- Resumen de matrículas
  (SELECT COUNT(*) FROM escuela.enrollments e
    WHERE e.client_id = c.id)                          AS enrollments_count,
  (SELECT COUNT(*) FROM escuela.enrollments e
    WHERE e.client_id = c.id AND e.estado = 1)        AS active_enrollments,

  -- Curso más reciente matriculado (nombre)
  (SELECT pr.nombre
     FROM escuela.enrollments en
     JOIN escuela.products pr ON pr.id = en.product_id
    WHERE en.client_id = c.id
    ORDER BY en.fecha_matriculado DESC NULLS LAST
    LIMIT 1)                                           AS last_enrolled_course,

  -- Certificados
  (SELECT COUNT(*) FROM escuela.certificates ce
    WHERE ce.client_id = c.id)                         AS certificates_count,

  -- Buyer tier derivado del histórico real
  CASE
    WHEN (SELECT COUNT(*) FROM escuela.sales s
           WHERE s.client_id = c.id AND s.estado = 1) >= 3 THEN 'vip'
    WHEN (SELECT COUNT(*) FROM escuela.sales s
           WHERE s.client_id = c.id AND s.estado = 1) = 2  THEN 'repeat'
    WHEN (SELECT COUNT(*) FROM escuela.sales s
           WHERE s.client_id = c.id AND s.estado = 1) = 1  THEN 'single'
    ELSE 'prospect'
  END                                                  AS buyer_tier
FROM escuela.phones p
JOIN escuela.clients c ON c.id = p.client_id
WHERE p.canonical_phone IS NOT NULL
  AND LENGTH(p.canonical_phone) >= 9;

CREATE UNIQUE INDEX IF NOT EXISTS idx_escuela_lead_360_phone_client
  ON escuela.lead_360 (canonical_phone, client_id);

CREATE INDEX IF NOT EXISTS idx_escuela_lead_360_phone
  ON escuela.lead_360 (canonical_phone);

CREATE INDEX IF NOT EXISTS idx_escuela_lead_360_tier
  ON escuela.lead_360 (buyer_tier) WHERE buyer_tier <> 'prospect';

COMMENT ON MATERIALIZED VIEW escuela.lead_360 IS
  'Rollup por canonical_phone para lookup rápido desde el bot/wa-events. Refresh con REFRESH MATERIALIZED VIEW CONCURRENTLY escuela.lead_360 después de cada import.';
