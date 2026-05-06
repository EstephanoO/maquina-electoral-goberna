# Plan de Unificación — Goberna FunnelChat

> **Decisión tomada (2026-05-06)**: unificar el backend de `leads-crm` (Escuela)
> y `electoral` (Campañas) en un solo "core" alojado en este repo
> (`maquina-electoral-goberna`). Cada producto conserva su propio frontend.

## Por qué

Hoy hay dos backends con ~80% de la lógica duplicada (chat ingest, tags,
clasificación IA, conversaciones, sends, kanban). Cada feature nueva hay que
hacerla dos veces. La fragmentación tiene costo creciente.

Schema de electoral es **estricto superset** del de leads-crm:
- `voter_profiles` tiene tags, notes, engagement_state, ai_classification, pipeline_status
- `wa_messages` (paquete 4) soporta media, grupos, reacciones, quoted replies
- Classifier IA con cache + fallback de keywords
- State machine de fidelización (`comparte → responde → fidelizado`)

Faltan solo columnas de negocio (course, buyer_tier, total_usd_spent) para
que `voter_profiles` cubra también el caso de Escuela.

## Arquitectura objetivo

```
                    ┌──────────────────────────────────┐
                    │       Backend Único (core)       │
                    │  apps/backend (electoral repo)   │
                    │                                  │
                    │  • voter_profiles (multi-tenant) │
                    │  • wa_messages, conversations    │
                    │  • tags, ai_classification       │
                    │  • blast, templates, sends       │
                    │  • engagement state machine      │
                    │  • Gemini classifier             │
                    └────┬────────────────────────┬────┘
                         │                        │
                ┌────────▼────────┐      ┌────────▼─────────┐
                │  Bot Baileys    │      │  Frontends       │
                │  multi-line     │      │                  │
                │  → POST /api/   │      │  • crm.goberna   │
                │    cms/wa-events│      │    (Escuela)     │
                │                 │      │  • electoral.    │
                │                 │      │    goberna       │
                │                 │      │    (Campañas)    │
                └─────────────────┘      └──────────────────┘
```

**Tenant model**: cada `voter_profile` tiene `campaign_id` (FK a `campaigns`).
Escuela vive como **una campaign más** con `slug='escuela'`,
`config.kind='business'`. Las campañas políticas tienen `kind='campaign'`.
Cada frontend filtra por su tenant.

## Decisiones tomadas

| # | Decisión | Valor |
|---|---|---|
| 1 | Naming del modelo | Mantener `voter_profiles` (no renombrar). Costo de migración < beneficio cosmético. |
| 2 | Frontend Escuela | Quedarse en `/srv/leads-crm/web/` (Opción A). Solo cambiar `VITE_API_URL`. Mover al monorepo después de migración de datos. |
| 3 | Multi-tenant | Insertar campaign `slug='escuela'` con `config.kind='business'`. Bot rutea via `wa_phones → campaign_id`. |
| 4 | Estrategia | Gradual con dual-push, no big-bang. Feature flags donde haga falta. |

## Fases

| Fase | Qué | Tiempo | Reversible |
|------|-----|--------|------------|
| **0** | Fixes P0 leads-crm + commit p4-prep + apply migrations electoral | 2-3h | sí |
| **1** | Bot dual-push (electoral además de leads-crm) | 1-2 días | sí |
| **2** | Endpoints `/api/escuela/*` en core electoral con shape compatible al frontend Escuela | 2-3 días | sí |
| **3** | Switch del frontend Escuela: `VITE_API_URL → electoral` con feature flag | 1 día | sí (toggle) |
| **4** | Migración datos histórica leads-crm → electoral (54k leads + 1.2M interactions) | 1-2 días | parcial (rollback con backup) |
| **5** | Decommission leads-crm-api + leads-crm-db | 1 día | no (terminal) |
| **6** | Refactor UI: extraer components compartidos a `packages/funnelchat-ui` | 3-5 días | sí |

**Total**: ~3 semanas si todo va smooth, ~5 con margen para regresiones.

## Fase 0 — fixes P0 (HOY)

Bugs identificados en leads-crm:

- **#5** — `db.recordMessage` descarta `pushName` enviado por el bot. 511/54763 leads tienen `name=phone`.
- **#6** — bot llama a `classifyMessage()` pero solo loguea, nunca persiste tags ni course al lead.
- **#7** — `PRODUCT_RULES` cubre 7 cursos, falta "Gestión Parlamentaria Bicameral", "Análisis de Inteligencia", "Campañas de Contraste".
- **mark-as-read** — abrir un chat no marca leído; el badge solo baja si el operador responde.

Plus en electoral:
- Aplicar migrations 047-053 en prod (ya commiteadas + paquete 4 prep).
- Backfill de 511 leads sin nombre desde `interactions.meta`.

## Fase 1 — bot dual-push

Ver `apps/backend/docs/PAQUETE_4_BOT_CHANGES.md` para los diffs exactos.

Resumen:
1. `crm-api.ts` agrega `pushElectoralEvent()` + `uploadMediaToElectoral()` + `syncElectoralPhones()` cache.
2. `wa-instance.ts` deja de skippear grupos / newsletters / broadcasts.
3. `wa-instance.ts` subscribe a `messages.reaction`.
4. `wa-instance.ts` descarga media de WSP y la sube a `/api/cms/wa-media`.
5. `config.ts` + `.env` agregan `ELECTORAL_API_URL` y `ELECTORAL_BOT_SECRET`.

Verificación: el `+51944531711` (peru4) ya está registrado en `wa_phones` de
la campaña sandbox `pruebas-wsp` (migration 053). Cualquier inbound a ese
número aparece en electoral CMS además de leads-crm.

## Fase 2 — adapters /api/escuela/*

El frontend de Escuela hoy hace fetch a:
- `GET /chats?assigned_to=...` → lista de chats
- `GET /leads/:id/interactions` → mensajes del chat
- `POST /messages` → registrar mensaje (lo usa el bot)
- `POST /chats/:id/send` → enviar
- `GET /leads?...` → lista de leads
- `POST /leads`, `PATCH /leads/:id`, etc
- `GET /templates`, `POST /sends` → bulk send
- `GET /reports/*`

El plan: crear en `apps/backend/src/modules/escuela-adapter/` endpoints que sirvan ese shape leyendo de `voter_profiles` + `wa_messages` + `blast_*`. Esto es ~200-300 líneas de adapter code.

Mapping:
- `leads` → `voter_profiles` (filtrado por `campaign_id = escuela_id`, expuesto con campos business)
- `interactions` → `wa_messages`
- `sends` → `blast_messages`
- `templates` → existente en electoral (`audio_catalog` + texto)

## Fase 3 — switch del frontend

`/srv/leads-crm/web/.env`:
```
- VITE_API_URL=https://crm.goberna.club
+ VITE_API_URL=https://electoral.goberna.club
```

Y en electoral/nginx, agregar al server `crm.goberna.club`:
```nginx
# Proxy todo el tráfico de crm.goberna.club al backend electoral
# (los endpoints /api/escuela/* hacen el adapter al modelo viejo)
location ~* ^/(auth|leads|messages|chats|sends|templates|reports|...)(/|$) {
    proxy_pass https://api.goberna.us/api/escuela$request_uri;
}
```

Feature flag: env var `ESCUELA_USE_ELECTORAL_BACKEND=true|false` controla si
el frontend va al backend nuevo o al viejo. Permite rollback sin redeploy.

## Fase 4 — migración de datos

One-time SQL job que copia:
```
leads-crm.leads → electoral.voter_profiles WHERE campaign_id = escuela_id
leads-crm.interactions → electoral.wa_messages
leads-crm.sends → electoral.blast_messages (mapping de status)
leads-crm.templates → electoral.audio_catalog (texto)
leads-crm.users → electoral.users (con re-auth)
```

Timestamps preservados. IDs mapeados (electoral usa UUID, leads-crm BIGSERIAL — generamos UUIDs y guardamos `external_legacy_id` para auditoría).

Volumen: 54k leads + ~1.2M interactions. Timeframe estimado: 1-2 horas en una ventana de mantenimiento.

## Fase 5 — decommission

Una vez verificado que el flow nuevo lleva 1 semana sin issues:
1. Quitar dual-push del bot — solo electoral.
2. Apagar containers `leads_crm_api` + `leads_crm_db`.
3. Backup final + retain 30 días por seguridad.
4. Borrar `/srv/leads-crm/backend/` + `/srv/leads-crm/app/` (mantener `/web/`).

## Fase 6 — UI compartida (opcional)

Sacar componentes comunes a `packages/funnelchat-ui/`:
- `<ChatList>` con filtro por línea + tags
- `<ConversationPane>` con bubbles ricas (texto, imagen, audio, doc, reaction)
- `<TagPicker>`, `<KanbanColumn>`, `<LeadCard>`
- Hooks: `useChats`, `useMessages`, `useTags`

Cada frontend (Escuela, electoral) consume el package. Customización por theme tokens.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Bot dual-push duplica eventos | `external_id` único por conversación dedupea en electoral. Leads-crm no tiene dedup pero ya está en producción así. |
| Frontend de Escuela rompe al switchear backend | Feature flag + rollback en 5 min. |
| Migración de datos pierde rows | Backup pre-migración + verify counts post + dry-run en staging. |
| Schema mismatch durante adapter (Fase 2) | Tests integration por endpoint. |
| Operadores de Escuela tienen que re-loguearse | Comunicar 1 semana antes; opción: importar password hashes. |

## Métricas de éxito

- ✅ 100% de leads de Escuela visibles en electoral DB (post Fase 4)
- ✅ Latencia P95 de `/api/escuela/chats` ≤ latencia actual de `/chats` en leads-crm
- ✅ Cero downtime durante el switch (Fase 3)
- ✅ Operadores de Escuela siguen usando `crm.goberna.club` sin notar cambio
- ✅ Cada feature nueva (mark-as-read, AI tag, multi-channel) se implementa una sola vez
