# AGENTS.md - Modulo FORMS (Sistema Completo)

> **Hereda de:** `/AGENTS.md` (root)  
> **Referencia:** `/docs/MODULES.md`  
> **Alcance:** Formularios dinamicos en Backend + Web + Mobile

---

## Proposito

Sistema de formularios dinamicos para encuestas de campo:
- Definiciones de formularios por campana (JSONB)
- Ingesta offline-first desde mobile
- Dedupe por client_id
- Write-behind para alta concurrencia
- Admin de submissions en web

---

## Componentes por App

### Backend (`apps/backend/src/modules/forms/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `routes.ts` | Endpoints: submit, batch |
| `repository.ts` | Persistencia PostgreSQL |
| `write-behind-queue.ts` | Cola Redis Streams |
| `schema.ts` | Validacion Zod |

### Backend (`apps/backend/src/modules/form-definitions/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `routes.ts` | CRUD de definiciones |
| `repository.ts` | Queries form_definitions |
| `schemas.ts` | Validacion |

### Web (`apps/web/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/(dashboard)/formularios/page.tsx` | Lista de submissions |
| (futuro) | Editor de definiciones |

### Mobile (`apps/mobile/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/(main)/forms/` | Lista y render de formularios |
| `lib/forms/` | Queue offline, sync |

---

## Flujo de Formularios

```
┌─────────────────────────────────────────────────────────────────────┐
│                       FORMS FLOW                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  MOBILE                        BACKEND                    WEB       │
│  ──────                        ───────                    ───       │
│                                                                      │
│  1. Cargar definiciones                                              │
│     GET /form-definitions/active ────►  form-definitions/           │
│     ?campaign_id=xxx                    routes.ts                   │
│                                              │                       │
│     ◄──── [{ id, name, schema, ... }] ──────┘                       │
│                                                                      │
│  2. Usuario llena formulario                                         │
│     (form-renderer)                                                  │
│         │                                                            │
│         ▼                                                            │
│  3. Guardar local                                                    │
│     SQLite queue                                                     │
│     - client_id (UUID unico)                                         │
│     - form_definition_id                                             │
│     - data (JSON)                                                    │
│     - location                                                       │
│     - synced = false                                                 │
│         │                                                            │
│         ▼                                                            │
│  4. Sync cuando hay red                                              │
│     POST /api/forms     ─────────────►  routes.ts                   │
│     {                                      │                         │
│       client_id,                           │                         │
│       form_definition_id,                  ▼                         │
│       campaign_id,                   schema.ts                       │
│       data: {...},                   (validacion)                    │
│       location: {lat, lng},                │                         │
│       submitted_at,                        │                         │
│       encuestador_id                       ▼                         │
│     }                              Dedupe por client_id              │
│                                   (Redis SET NX + TTL)               │
│                                            │                         │
│                                            ▼                         │
│                                   write-behind-queue.ts              │
│                                   - Encola en Redis Stream           │
│                                            │                         │
│                                            ▼                         │
│                                   repository.ts                      │
│                                   - INSERT JSONB                     │
│                                            │                         │
│  5. Response             ◄────────────────┘                         │
│     { accepted: 1, deduped: 0 }                                      │
│                                                                      │
│  6. Marcar synced                                                    │
│     SQLite: synced = true                                            │
│                                                                      │
│                                                           7. Admin   │
│                                   GET /api/forms   ◄──── formularios/│
│                                   ?campaign_id=x          page.tsx   │
│                                            │                         │
│                                            └────────────────────────►│
│                                                      Lista submissions│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Contratos API

### GET /api/form-definitions/active

**Auth:** JWT Bearer + x-campaign-id header

```typescript
// Response 200
{
  ok: true,
  form_definitions: [{
    id: string,
    name: string,
    description?: string,
    schema: {
      fields: [{
        name: string,
        type: "text" | "number" | "select" | "checkbox" | "location" | "photo",
        label: string,
        required?: boolean,
        options?: string[],  // para select
        validation?: {...}
      }]
    },
    version: number,
    status: "active" | "draft" | "archived"
  }]
}
```

### POST /api/forms

**Auth:** JWT Bearer + x-campaign-id header

```typescript
// Request
{
  client_id: string,         // UUID generado en cliente (para dedupe)
  form_definition_id: string,
  campaign_id: string,
  encuestador_id?: string,
  data: Record<string, any>, // Datos del formulario
  location?: {
    lat: number,
    lng: number,
    accuracy?: number
  },
  submitted_at: string       // ISO timestamp (cuando se lleno)
}

// Response 202
{
  ok: true,
  accepted: 1,
  deduped: 0,
  queue_depth: number
}

// Response 200 (ya existia)
{
  ok: true,
  accepted: 0,
  deduped: 1
}
```

### POST /api/forms/batch

**Auth:** JWT Bearer + x-campaign-id header

```typescript
// Request
{
  forms: [/* array de forms como POST /api/forms */]
}

// Response 202
{
  ok: true,
  accepted: number,
  deduped: number,
  queue_depth: number
}
```

---

## Estructura de Datos

### PostgreSQL

```sql
-- form_definitions (esquemas de formularios)
CREATE TABLE form_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  schema JSONB NOT NULL,        -- { fields: [...] }
  version INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- forms (submissions)
CREATE TABLE forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID UNIQUE,         -- Para dedupe
  form_definition_id UUID REFERENCES form_definitions(id),
  campaign_id UUID REFERENCES campaigns(id),
  encuestador_id UUID,
  data JSONB NOT NULL,           -- Datos del formulario
  location GEOGRAPHY(POINT, 4326),
  submitted_at TIMESTAMPTZ,      -- Cuando el usuario lo lleno
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_forms_campaign ON forms(campaign_id, created_at DESC);
CREATE INDEX idx_forms_client_id ON forms(client_id);
```

### Redis (Dedupe)

```
forms:dedupe:{client_id} = "1"
TTL: 7 dias (formsDedupeTtlSec)
```

---

## Mobile: Offline Queue

```typescript
// apps/mobile/lib/forms/queue.ts

// SQLite schema
CREATE TABLE forms_queue (
  id INTEGER PRIMARY KEY,
  client_id TEXT UNIQUE NOT NULL,
  form_definition_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  encuestador_id TEXT,
  data TEXT NOT NULL,           -- JSON stringified
  lat REAL,
  lng REAL,
  accuracy REAL,
  submitted_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

// Generar client_id unico
const client_id = `${deviceUUID}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Sync batch
const pending = await db.getAllAsync(
  `SELECT * FROM forms_queue WHERE synced = 0 ORDER BY submitted_at LIMIT 50`
);
const result = await api.post('/forms/batch', { forms: pending });
// Marcar synced los aceptados
```

---

## Variables de Entorno (Backend)

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `RATE_LIMIT_FORMS_PER_MINUTE` | `1200` | Rate limit por actor |
| `RATE_LIMIT_FORMS_IP_PER_MINUTE` | `12000` | Rate limit guardrail por IP |
| `FORMS_BATCH_REQUEST_LIMIT` | `200` | Max forms por batch |
| `FORMS_WB_BATCH_SIZE` | `200` | Batch size write-behind |
| `FORMS_WB_FLUSH_MS` | `300` | Flush interval |
| `FORMS_WB_MAX_QUEUE` | `10000` | Max queue |
| `FORMS_DEDUPE_PREFIX` | `forms:dedupe:` | Prefix Redis dedupe |
| `FORMS_DEDUPE_TTL_SEC` | `604800` | TTL dedupe (7 dias) |

---

## Schema de Formulario (Ejemplo)

```json
{
  "fields": [
    {
      "name": "nombre",
      "type": "text",
      "label": "Nombre completo",
      "required": true
    },
    {
      "name": "edad",
      "type": "number",
      "label": "Edad",
      "validation": { "min": 18, "max": 120 }
    },
    {
      "name": "partido",
      "type": "select",
      "label": "Partido de preferencia",
      "options": ["Partido A", "Partido B", "Ninguno", "NS/NC"]
    },
    {
      "name": "acepta_contacto",
      "type": "checkbox",
      "label": "Acepta ser contactado"
    },
    {
      "name": "ubicacion",
      "type": "location",
      "label": "Ubicacion de la entrevista",
      "required": true
    },
    {
      "name": "foto_fachada",
      "type": "photo",
      "label": "Foto de referencia"
    }
  ]
}
```

---

## Metricas Expuestas

En `/api/metrics`:

```typescript
{
  forms: {
    queue_depth: number,
    last_flush_age_ms: number,
    flush_duration_ms: number
  },
  ingest_outcome_latencies: {
    forms: {
      accepted: { p50, p90, p95, p99 },
      deduped: { p50, p90, p95, p99 },
      invalid_payload: { p50, p90, p95, p99 },
      rate_limited: { p50, p90, p95, p99 }
    }
  }
}
```

---

## Checklist de Cambios

Al modificar forms, verificar:

- [ ] Backend: `bunx tsc --noEmit` sin errores
- [ ] Backend: POST /api/forms acepta y persiste
- [ ] Backend: Dedupe funciona (mismo client_id = deduped)
- [ ] Backend: Batch funciona con multiples forms
- [ ] Backend: Rate limit no bloquea uso legitimo
- [ ] Web: Lista de submissions carga correctamente
- [ ] Mobile: Formulario renderiza desde schema
- [ ] Mobile: Guarda en SQLite offline
- [ ] Mobile: Sync funciona al recuperar conexion
- [ ] Mobile: client_id es unico por submission
