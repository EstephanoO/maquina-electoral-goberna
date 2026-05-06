# Goberna Escuela CRM (`leads-crm`)

Live at **https://crm.goberna.club** — operada por Kathy + asesores de Goberna Escuela.

## Stack

- **backend/** — Express + TypeScript + Postgres (`postgres.js`). Auth con JWT.
- **web/** — Vite + React + Tailwind. Pages: Leads · Chat · Reports · Entrenamiento IA · Productos.
- **bot/** — Baileys 7.0.0-rc.9 (WhatsApp). Clasificador con cache 60s + envío via API.
- **migrations/** — SQL migrations 011→021. Aplicar con `psql -f` (no hay tooling automático).
- **scripts/** — One-shot scripts (consolidación ERP→leads, etc.).

## Database

Postgres en container `leads_crm_db` (DB: `leads_crm`). Schema principal: `public.leads`,
`public.interactions`, `public.escuela_products`, `public.ai_rules`, `public.ai_feedback`,
`public.templates`, `public.users`.

## Modules

### Leads (`leads`, `interactions`)
Pipeline: `contacted → interested → sold → delivered → follow_up → recontact → resold → lost`
Display in Spanish via `STAGE_LABELS`. Buyer tier: vip / repeat / single / prospect.

### AI Training (`ai_rules`, `ai_prompt_override`, `ai_feedback`)
- `ai_rules`: regex → tag, leídas por bot cada 60s con cache.
- `source` distingue: `manual`, `product`, `learned_p4`, `system_seed`.
- UI: `/web/src/pages/TrainingPage.tsx` con tabs Reglas/Prompt/Sandbox.

### Productos (`escuela_products`)
Catálogo editable de los 7 cursos del flyer activo. Cada producto puede tener una
regla IA atada (`ai_rule_id`) — al editar el regex del producto, la regla se sincroniza.
UI: `/web/src/pages/ProductsPage.tsx`.

### Templates (`templates`)
Mensajes recurrentes seedados desde el historial de p4 (saludos, datos para registro,
medios de pago, descripciones de cursos). Variables como `{{curso}}` reemplazadas
en runtime por el bot.

### Bot (`bot/`)
- WA via Baileys, sesión persistida en `auth_info_*/` (no commiteado).
- `classifier.ts` aplica `ai_rules` + reglas hard-coded de productos.
- `auto-reply.ts` está **DESHABILITADO** — el operador debe activarlo explícitamente.

## Migrations aplicadas (orden cronológico)

| # | Descripción |
|---|-------------|
| 011 | `lead_last_read_at` para chat read indicator |
| 012 | Tablas `ai_rules`, `ai_prompt_override`, `ai_feedback` (entrenamiento IA) |
| 013 | Tabla `escuela_products` con seed de 6 cursos del flyer |
| 014 | Columnas `dni`, `ocupacion`, `fecha_nacimiento`, `escuela_client_id`, `last_course`, `enrollments_count`, `certificates_count` en `leads` |
| 015 | `ai_rules.source` para distinguir origen |
| 016 | Link product ↔ ai_rule (6 reglas atadas) |
| 017 | (revertida) — rename de stages a español |
| 018 | Revert a stages en inglés (la UI las traduce) + consolida `new` → `contacted` |
| 019 | Dedup revenue: zero `total_usd_spent` en duplicados de `escuela_client_id` |
| 020 | Learned from p4: 12 ai_rules de intenciones + producto Director Comunicaciones |
| 021 | Seed de 12 templates más usados extraídos del historial p4 |

## Consolidación ERP → leads-crm

El histórico del ERP MariaDB de Escuela (~5,800 ventas, 4,140 clientes) está en
`escuela.*` del DB de electoral. Se consolida en `leads-crm.leads` así:

1. `scripts/consolidate-escuela-to-leads.ts` (TS/Node) — exporta `escuela.lead_360`
   a CSV.
2. `migrations/consolidate.sql` — UPDATEs por phone match (last 9 digits).
3. `migrations/insert-new-clients.sql` — INSERT de los que no matchearon.
4. `migrations/fix-revenue-usd.sql` — convierte montos a USD usando `escuela.monedas`
   (PEN×0.29, COP×0.00023, MXN×0.058, etc.).

**Estado actual**: 5,165 leads linkeados al ERP · revenue real $853K USD · 1,365 con
DNI · 1,294 con ocupación.

## Deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Containers: `leads_crm_db` (postgres) · `leads_crm_api` (express) ·
`leads_crm_ui` (nginx static) · `leads_crm_bot` (baileys).
