# AGENTS.md — Goberna Platform
> Fuente de verdad absoluta del monorepo. Si hay conflicto con cualquier otro AGENTS.md, este prevalece.
> Última actualización: 2026-03-17 | Leer COMPLETO antes de cualquier tarea.

---

## 0. Protocolo de arranque para agentes de IA

**Antes de escribir una sola línea de código, el agente DEBE:**

```
1. Leer este archivo completo
2. Identificar el área de trabajo (backend / web / mobile / extension)
3. Leer el AGENTS.md específico de esa área
4. Leer los archivos directamente afectados (no asumir contenido)
5. Verificar con herramientas (grep/glob/read) — nunca desde memoria
6. Declarar qué va a hacer y esperar confirmación si hay ambigüedad
```

**Regla de oro:** Contexto primero, herramientas segundo, ejecución al final.

**El agente NUNCA debe:**
- Asumir que una función existe sin verificarla en disco
- Copiar patrones de conversaciones anteriores sin verificar que siguen siendo válidos
- Crear archivos sin leer primero los existentes en la misma área
- Hacer cambios que rompan el contrato backwards-compatible sin avisar
- Pushear a `main` directamente — siempre commit, siempre verificar health post-deploy

---

## 1. Identidad del producto

**Goberna** — plataforma SaaS de operación territorial para campañas políticas en Perú.

| Aspecto | Detalle |
|---|---|
| Organización | Grupo Goberna |
| Mercado | Perú — conectividad intermitente, campo operativo real |
| Diferenciador | Offline-first, mapas PostGIS, CRM/CMS integrado, multi-campaña, extensión Chrome para WA |
| Equipo | EstephanoO (lead) + Maximoff19 (dev CMS) |
| Prioridad | Operabilidad > Sofisticación |

---

## 2. Mapa del monorepo

```
maquina-electoral-goberna/
  AGENTS.md                    ← Este archivo (root, fuente de verdad)
  docs/                        ← Documentación técnica generada
    ARCHITECTURE.md            ← Diagrama completo del sistema
    ROADMAP.md                 ← Plan de trabajo por fases
    EXTENSION-MESSAGES.md     ← Protocolo de mensajes de la extensión
    EXTENSION-WA-MODULES.md   ← Módulos WA Web y pipeline PTT
    CALL-CENTER.md             ← Documentación del call center de 6 celulares
  apps/
    backend/                   ← Fastify API (VPS producción)
      AGENTS.md                ← Reglas específicas del backend
      src/
        app.ts                 ← Composition root: 30 módulos registrados
        server.ts              ← Bootstrap: env + conexiones + listen
        db.ts                  ← Pool PostgreSQL compartido
        config/env.ts          ← ÚNICA fuente de verdad de env vars
        infra/                 ← Auth, RBAC, Redis, métricas, etc.
        modules/               ← 30 módulos de dominio
        migrations/            ← SQL migrations numeradas 001..N
    web/                       ← Next.js Dashboard (Vercel)
      AGENTS.md
    mobile/                    ← Expo App (agentes de campo)
      AGENTS.md
  extensions/
    wspp-store-tester/         ← Extensión Chrome MV3
      src/
        inject/                ← Contexto MAIN (accede a window.require WA)
        background/            ← Service Worker (fetch al backend)
        inject-entry.js        ← Entry del inject bundle
        background-entry.js    ← Entry del background bundle
      build.js                 ← Build con esbuild
      zip.js                   ← Genera whatsapp-helper.zip
  docker-compose.yml           ← Producción
  docker-compose.dev.yml       ← Desarrollo local
  nginx/                       ← Templates Nginx
```

---

## 3. Stack tecnológico (estado real, 2026-03-17)

| Capa | Tecnología | Versión | Estado |
|---|---|---|---|
| Backend API | Fastify + TypeScript + Bun | fastify 5.6, ts 5.9 | ✅ Producción |
| Base de datos | PostgreSQL + PostGIS | 15 + 3.4 | ✅ Producción |
| Cache / Queues | Redis Streams | 7.4, noeviction | ✅ Producción |
| Vector tiles | Tegola | latest | ✅ Producción |
| ORM / Validación | Drizzle ORM + Zod | drizzle 0.44, zod 4.x | ✅ Producción |
| Web dashboard | Next.js + React + Tailwind | 16.1 + 19.2 + 4.x | ✅ Producción (Vercel) |
| Mapas web | MapLibre GL + vis.gl | 5.x | ✅ Producción |
| Data fetching | TanStack Query | 5.x | ✅ Producción |
| Mobile | Expo + React Native | SDK 54, RN 0.81 | 🟡 Desarrollo |
| Offline mobile | expo-sqlite | 16.x | 🟡 Desarrollo |
| Extensión Chrome | MV3 + esbuild IIFE | — | ✅ Producción (v9.0.0) |
| TTS | ElevenLabs API | — | ✅ En uso |
| CI/CD | GitHub Actions | — | ✅ Producción |

---

## 4. Infraestructura de producción

```
Internet
  │
  ▼
Cloudflare (DNS proxy ON)
  ├─► Vercel → dashboard.grupogoberna.com (Next.js)
  └─► VPS 161.132.39.165 → api.goberna.us
        └─ Nginx :443
             └─ Backend Fastify :3001
                  ├─ PostgreSQL :5432 (Docker interno)
                  ├─ Redis :6379 (Docker interno)
                  └─ Tegola :8080 (Docker interno)
```

| Recurso | Valor |
|---|---|
| VPS | `161.132.39.165` (32GB RAM) |
| SSH | `deploy@161.132.39.165` |
| Project dir | `/srv/app` |
| API domain | `api.goberna.us` |
| Web domain | `dashboard.grupogoberna.com` |

---

## 5. Módulos del backend (30 registrados en app.ts)

> ⚠️ Este número es la fuente de verdad. El AGENTS.md anterior decía 23 — estaba desactualizado.

### Infraestructura
| Módulo | Prefijo API |
|---|---|
| `health` | `/api/health`, `/api/ready` |
| `auth` | `/api/auth/*`, `/api/users/*` |
| `map` | `/api/config`, `/api/tiles/*`, `/api/geo/*`, `/api/capabilities` |
| `uploads` | `/api/uploads/*` |
| `analytics` | `/api/campaigns/:id/analytics`, `/api/analytics/*` |

### Campaña
| Módulo | Prefijo API |
|---|---|
| `campaigns` | `/api/campaigns/*`, `/api/candidates` |
| `org-hierarchy` | `/api/org-hierarchy/*` |
| `invitations` | `/api/invitations/*` |
| `access-requests` | `/api/access-requests/*` |
| `access-codes` | `/api/access-codes/*` |
| `objectives` | `/api/objectives/*` |

### Campo
| Módulo | Prefijo API |
|---|---|
| `forms` | `/api/forms/*` (legacy write-behind) |
| `form-submissions` | `/api/form-submissions/*` (nuevo, directo) |
| `form-definitions` | `/api/form-definitions/*` |
| `agents` | `/api/agents/*`, `/ws/tracking` |
| `meets` | `/api/meets/*` |
| `zones` | `/api/zones/*` |
| `validacion` | `/api/validacion/*` |
| `voluntarios` | `/api/voluntarios/*` |
| `regional-leaders` | `/api/regional-leaders/*` |

### Comunicación / CRM
| Módulo | Prefijo API |
|---|---|
| `cms` | `/api/cms/*` |
| `twilio` | `/api/twilio/*`, `/api/webhooks/twilio/*` |
| `conversations` | `/api/conversations/*` |
| `leads` | `/api/leads/*` |
| `support` | `/api/support/*` |

### Inteligencia / Extensión
| Módulo | Prefijo API |
|---|---|
| `ai` | `/api/ai/*` (Gemini: spam-check + classify) |
| `voter-profiles` | `/api/voter-profiles/*` |
| `audio-catalog` | `/api/audio-catalog[/*]`, `/api/audio-catalog-categories[/*]` |
| `blast` | `/api/blast/*` (call center 6 celulares) |
| `wa-validator` | `/api/wa-validator/*` (validación números WA) |
| `qr-leads` | `/api/qr-leads/*` (QR por brigadista) |

**Ruta especial:** `GET /api/metrics` — definida directamente en `app.ts`.

---

## 6. Patrones de implementación obligatorios

### 6.1 Módulo backend (estructura canónica)

```
src/modules/<nombre>/
  routes.ts      ← Handler HTTP delgado. Parse → call repo → respuesta.
  repository.ts  ← SQL con pg.Pool. Sin lógica de negocio.
  schemas.ts     ← Validación Zod de todo input externo.
  types.ts       ← Tipos TypeScript (opcional).
  service.ts     ← Lógica de negocio compleja (solo si existe).
```

**Respuesta estándar — SIEMPRE:**
```typescript
// Success
{ ok: true, request_id: string, ...data }

// Error — usar errorPayload() de infra/http.ts
{ ok: false, request_id: string, code: string, message: string }
```

**Handler delgado — ejemplo canónico:**
```typescript
app.post("/api/blast/mark-hablado", {
  preHandler: [app.authenticate, authorize({ requireCampaign: true })],
}, async (request, reply) => {
  const requestId = String(request.id);
  const parsed = markHabladoSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send(
      errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Payload inválido")
    );
  }
  try {
    const result = await repo.markHablado(req.activeCampaignId!, parsed.data.ids);
    return reply.code(200).send({ ok: true, request_id: requestId, ...result });
  } catch (err) {
    app.log.error({ err }, "[blast] markHablado failed");
    return reply.code(500).send(errorPayload(requestId, "UPSTREAM_ERROR", "Error interno"));
  }
});
```

### 6.2 Extensión Chrome — reglas críticas

**Regla 1 — Live bindings:**
esbuild IIFE snapshot los valores de `export let` al compilar. Para estado mutable compartido:
```js
// ❌ El consumidor siempre recibe null
export let _lastActiveChatJid = null;

// ✅ El consumidor llama la función y obtiene el valor actual
let _lastActiveChatJid = null;
export function getLastActiveChatJid() { return _lastActiveChatJid; }
```

**Regla 2 — Módulos WA Web con fallbacks:**
```js
// ✅ Siempre múltiples nombres — WA los renombra con cada deploy
function _requireAny(...names) {
  for (const name of names) {
    try { const m = window.require(name); if (m) return m; } catch (_) {}
  }
  throw new Error('None found: ' + names.join(', '));
}
const prepMod = _requireAny('WAWebPrepRawMedia', 'WAWebPrepareMediaUtils');
```

**Regla 3 — Agregar un mensaje nuevo:**
1. Definir el type string en ambos extremos
2. Bridge en `content.js` (relay inject ↔ background)
3. Handler en `background/` con `return true` para async
4. Documentar en `docs/EXTENSION-MESSAGES.md`

**Regla 4 — Build + distribución:**
```bash
node build.js        # genera inject.js + background.js
node zip.js          # genera apps/web/public/whatsapp-helper.zip
# Siempre actualizar: manifest.json version + package.json + página /extension
```

### 6.3 Web Next.js

```
app/(dashboard)/<feature>/
  _components/    ← Componentes propios del feature
    index.ts      ← Re-exports
  page.tsx        ← Orquestador (~200 líneas máx)
```

**Rutas nuevas → agregar a `middleware.ts`:**
- Si es protegida: agregar a `PROTECTED_PREFIXES`
- Si es pública: agregar a `PUBLIC_PATHS`
- Fail-closed: rutas desconocidas se tratan como protegidas

**SSE pattern (obligatorio):**
```
fetch SSE → 401 → POST /api/auth/refresh (1 intento) → retry SSE
Reconexión: backoff exponencial (base 1s, máx 30s), NUNCA intervalo fijo
```

### 6.4 Mobile Expo

```
lib/api.ts         ← Todas las llamadas al backend
lib/auth-store.ts  ← Tokens en expo-secure-store (NUNCA AsyncStorage)
lib/app-context.tsx ← Estado global
lib/offline-queue/ ← SQLite para offline-first
```

**Offline-first siempre:** capturar en SQLite → sync en background cuando hay red.

---

## 7. RBAC y autenticación

### Roles (6 niveles)

| Rol | Nivel |
|---|---|
| `admin` | 50 |
| `consultor` | 40 |
| `candidato` | 30 |
| `brigadista_zonal` | 20 |
| `agente_campo` | 10 |
| `agente_digital` | 10 |

`authorize({ roles: ["candidato"] })` = nivel 30+. No usar `jefe_campana` (eliminado).

### Resolución de campaign_id (en orden)
1. Header `x-campaign-id`
2. Route param `campaignId`
3. Body `campaign_id`

### Auth dual-mode

| Cliente | Transporte | Storage |
|---|---|---|
| Web (Next.js) | httpOnly cookie `goberna_access_token` | Cookie browser |
| Mobile (Expo) | `Authorization: Bearer <token>` | expo-secure-store |

**Nunca:** localStorage, sessionStorage, tokens en JS accesible del browser.

---

## 8. Formato de respuesta API

```typescript
// Success
{ ok: true, request_id: string, ...data }

// Error
{ ok: false, request_id: string, code: string, message: string }
```

### Códigos de error estándar

| Código | Descripción |
|---|---|
| `VALIDATION_ERROR` | Schema Zod inválido |
| `AUTH_TOKEN_MISSING` | Sin token |
| `AUTH_TOKEN_EXPIRED` | JWT vencido |
| `AUTH_INVALID_CREDENTIALS` | Login fallido |
| `AUTHZ_ROLE_INSUFFICIENT` | Sin permiso de rol |
| `AUTHZ_CAMPAIGN_DENIED` | Sin acceso a la campaña |
| `RATE_LIMITED` | Demasiadas requests |
| `NOT_FOUND` | Recurso no existe |
| `UPSTREAM_ERROR` | Error de servicio externo |
| `ALREADY_CLAIMED` | Contacto CMS ya tomado |
| `MISSING_CAMPAIGN` | Falta campaign_id |

---

## 9. Cómo trabajar con IA en este proyecto

Esta sección define el protocolo de colaboración humano-IA para avanzar de manera ordenada y sin regresiones.

### 9.1 Flujo de trabajo estándar

```
┌─────────────────────────────────────────────────────────────┐
│                    CICLO DE TRABAJO                          │
│                                                             │
│  1. CONTEXTO    Leer AGENTS.md + archivos afectados         │
│       ↓         Verificar con herramientas (no memoria)     │
│                                                             │
│  2. DIAGNÓSTICO Identificar el problema REAL                │
│       ↓         Documentar gaps antes de codificar          │
│                                                             │
│  3. PLAN        Listar archivos a crear/modificar           │
│       ↓         Declarar impacto (breaking? backwards?)     │
│                                                             │
│  4. IMPLEMENTAR Un archivo a la vez                         │
│       ↓         Verificar TypeScript/build entre pasos      │
│                                                             │
│  5. VERIFICAR   Typecheck + build + health check            │
│       ↓         Sin errores antes de commitear              │
│                                                             │
│  6. COMMIT      Mensaje atómico y descriptivo               │
│       ↓         Push → verificar CI/CD                      │
│                                                             │
│  7. DOCUMENTAR  Actualizar AGENTS.md si cambia arquitectura  │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Estructura de una tarea bien definida

Cuando se pide una tarea nueva, el agente debe responder con:

```
## Diagnóstico
- Qué existe actualmente (leído de disco, no asumido)
- Qué está roto o falta
- Causa raíz (no síntoma)

## Plan
- Lista de archivos a modificar/crear
- Orden de cambios (dependencias entre ellos)
- Riesgos de regresión

## Implementación
[código]

## Verificación
[comandos de verificación + resultado esperado]
```

### 9.3 Niveles de tarea

| Nivel | Descripción | Proceso |
|---|---|---|
| **L1 — Fix** | Bug aislado en 1-2 archivos | Diagnóstico → Fix → Verificar |
| **L2 — Feature** | Funcionalidad nueva en 3-8 archivos | Plan completo → Implementar por pasos → Verificar |
| **L3 — Módulo** | Nuevo módulo (backend + extension + web) | Arquitectura → Backend → Extension → Web → Documentar |
| **L4 — Refactor** | Cambio arquitectural (múltiples módulos) | RFC primero → Aprobación → Implementar en ramas |

### 9.4 Checklist de Definition of Done

**Antes de commitear cualquier cambio:**

```
□ Backend TypeScript:  cd apps/backend && bunx tsc --noEmit      → sin errores
□ Web build:           cd apps/web && bun run build               → sin errores
□ Mobile TypeScript:   cd apps/mobile && bunx tsc --noEmit        → sin errores
□ Extension build:     cd extensions/wspp-store-tester && node build.js → "Errors: 0"
□ Si cambió API:       ¿El contrato es backwards-compatible?
□ Si módulo nuevo:     ¿Registrado en app.ts?
□ Si endpoint nuevo:   ¿Documentado en sección 10 de este archivo?
□ Si variable nueva:   ¿Agregada a config/env.ts?
□ Si cambió schema:    ¿Migración SQL en migrations/?
□ Si cambió extensión: ¿Actualizado manifest.json + zip + página /extension?
□ Producción health:   curl https://api.goberna.us/api/health   → {"ok":true}
□ Producción ready:    curl https://api.goberna.us/api/ready    → {"ok":true,...}
```

### 9.5 Gestión de deuda técnica

Cuando se detecta deuda técnica durante el trabajo, NO se arregla en el mismo PR. Se documenta en `docs/ROADMAP.md` bajo la fase correspondiente y se crea un TODO con:

```
// TODO(deuda): descripción del problema
// Ver: docs/ROADMAP.md > Fase N > item
// Impacto: bajo/medio/alto
```

### 9.6 Protocolo de ambigüedad

Si la instrucción es ambigua, el agente DEBE preguntar antes de implementar:

```
Antes de continuar, necesito confirmar:
1. ¿[pregunta específica]?
2. ¿[pregunta específica]?

Mi interpretación actual es: [explicación]
```

Nunca asumir y ejecutar. Siempre preguntar y esperar.

---

## 10. Principios de arquitectura (no negociables)

1. **Offline-first.** Perú tiene conectividad intermitente. Todo lo que pueda ir a SQLite, va.
2. **Multi-tenant por campaign_id.** Cada query lleva `campaign_id`. Sin excepciones.
3. **JSONB para formularios.** Estructura dinámica, no columnas fijas.
4. **Write-behind en Redis.** Ingesta rápida, persistencia eventual para tracking y forms.
5. **Contratos explícitos.** Zod schema en todo input externo. Sin `any`.
6. **Seguridad server-side.** Las apps son untrusted. JWT y campaign_id validados en backend.
7. **Config centralizada.** Usar `env` de `config/env.ts`. NUNCA `process.env` en módulos.
8. **Handlers delgados.** Business logic en services/repositories. Routes solo parsean y responden.
9. **Errores seguros.** Sin stack traces, sin detalles internos al cliente.
10. **Backwards-compatible por default.** Breaking change = versionar o deprecar con aviso.

---

## 11. Anti-patterns prohibidos

```
❌ process.env directo en módulos (usar env de config/env.ts)
❌ Lógica de negocio en route handlers
❌ export let de estado mutable en módulos inject (usar getter functions)
❌ instanceof para módulos WA Web (usar duck-typing)
❌ localStorage/sessionStorage para tokens en web
❌ Reconexión SSE con intervalo fijo (usar backoff exponencial)
❌ CORS wildcard * en producción
❌ Exponer URL internas de infra en respuestas de API
❌ El rol jefe_campana en código nuevo (eliminado)
❌ Push directo a main sin verificar health
❌ Cambios en múltiples áreas sin verificar TypeScript entre pasos
❌ Asumir que un módulo WA Web existe sin verificar con _requireAny
❌ autorelease() antes de uploadMedia en el pipeline PTT
❌ Duplicar parseCookies() o AUTH_COOKIE_NAMES (importar de infra/auth.ts)
```

---

## 12. Jerarquía de AGENTS.md

```
/AGENTS.md (root — este archivo)
    │
    ├── docs/ARCHITECTURE.md          ← Sistema completo
    ├── docs/ROADMAP.md               ← Plan de trabajo
    ├── docs/EXTENSION-MESSAGES.md    ← Protocolo mensajes extensión
    ├── docs/EXTENSION-WA-MODULES.md  ← Módulos WA Web
    ├── docs/CALL-CENTER.md           ← Call center 6 celulares
    │
    ├── apps/backend/AGENTS.md        ← Reglas backend Fastify
    │   └── apps/backend/src/modules/AGENTS.md
    │
    ├── apps/web/AGENTS.md            ← Reglas web Next.js
    │
    └── apps/mobile/AGENTS.md         ← Reglas mobile Expo
```

**Reglas de herencia:**
- AGENTS.md locales deben declarar `Hereda de: /AGENTS.md`
- Si hay conflicto, prevalece el root
- Los locales agregan reglas específicas de su dominio, no redefinen arquitectura global
- No deben existir AGENTS.md individuales por módulo del backend

---

## 13. Comandos de referencia rápida

```bash
# Desarrollo local
cd apps/backend && bun run dev          # API en :3001
cd apps/web && bun run dev              # Web en :3000
cd apps/mobile && bun start             # Mobile Expo

# Verificación
bunx tsc --noEmit                       # TypeCheck (en backend o mobile)
bun run build                           # Build (en web)
node build.js                           # Build extensión
node zip.js                             # Zip extensión

# Producción
curl https://api.goberna.us/api/health
curl https://api.goberna.us/api/ready

# Deploy manual backend (si CI falla)
ssh deploy@161.132.39.165
cd /srv/app && git pull origin main
docker compose --env-file .env up -d --build backend

# DB inspection
docker exec nexus_postgres psql -U appuser -d appdb -c "SELECT ..."
```

---

## 14. Estado del sistema (2026-03-17)

| Componente | Versión | Estado |
|---|---|---|
| Backend | 30 módulos en app.ts | ✅ Producción |
| Web | Next.js 16.1 | ✅ Producción (Vercel) |
| Mobile | Expo SDK 54 | 🟡 Desarrollo |
| Extensión Chrome | v9.0.0 | ✅ Producción |
| PostgreSQL | 15 + PostGIS 3.4 | ✅ Producción |
| Redis | 7.4 | ✅ Producción (noeviction) |
| Tegola | latest | ✅ Producción |
| CI/CD smoke test | — | ⚠️ Falla por orden migraciones (bug pre-existente) |

**Bugs conocidos activos (ver `docs/ROADMAP.md` para detalle):**
- Orden de migraciones en CI (schema `form_validations` no existe en DB de CI)
- `POST /api/validacion/events` en `classification-reporter.js` — endpoint no confirmado
- `/brigadistas` y `/leads` no en `PROTECTED_PREFIXES` del middleware web (protegidas por fail-closed pero sin registro explícito)
