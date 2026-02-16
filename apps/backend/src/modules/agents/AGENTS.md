# AGENTS.md - Modulo TRACKING (Sistema Completo)

> **Hereda de:** `/AGENTS.md` (root)  
> **Referencia:** `/docs/MODULES.md`  
> **Alcance:** Tracking GPS en Backend + Web + Mobile

---

## Proposito

Tracking GPS en tiempo real de agentes de campo con:
- Ingesta de alta frecuencia (write-behind)
- Estado live separado del historico
- Streaming SSE para dashboard web
- Offline-first en mobile

---

## Componentes por App

### Backend (`apps/backend/src/modules/agents/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `routes.ts` | Endpoints: location, live, stream, health |
| `store.ts` | Estado live en Redis (agentes online) |
| `repository.ts` | Persistencia en PostgreSQL |
| `write-behind-queue.ts` | Cola Redis Streams + batch flush |
| `schema.ts` | Validacion Zod |
| `types.ts` | Tipos TypeScript |

### Web (`apps/web/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/(dashboard)/map/page.tsx` | Mapa con marcadores de agentes |
| (hooks internos) | SSE subscription, markers update |

### Mobile (`apps/mobile/lib/tracking/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `service.ts` | Background location task |
| `queue.ts` | Cola SQLite offline |
| `sync.ts` | Envio batch cuando hay conexion |

---

## Flujo de Tracking

```
┌─────────────────────────────────────────────────────────────────────┐
│                      TRACKING FLOW                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  MOBILE                        BACKEND                    WEB       │
│  ──────                        ───────                    ───       │
│                                                                      │
│  1. GPS event                                                        │
│     (expo-location)                                                  │
│         │                                                            │
│         ▼                                                            │
│  tracking/service.ts                                                 │
│  - Genera seq monotono                                               │
│  - Guarda en SQLite                                                  │
│         │                                                            │
│         ▼                                                            │
│  2. Sync (cuando hay red)                                            │
│     POST /api/agents/location  ─────►  routes.ts                    │
│     {                                      │                         │
│       agent_id,                            │                         │
│       ts, lat, lng, seq,                   ▼                         │
│       accuracy, speed,              store.ts                         │
│       battery, campaign_id          - Dedupe por seq                 │
│     }                               - Actualiza Redis live           │
│     Header: x-agent-token                  │                         │
│                                            ▼                         │
│                                   write-behind-queue.ts              │
│                                   - Encola en Redis Stream           │
│                                   - Batch flush cada 200ms           │
│                                            │                         │
│                                            ▼                         │
│                                   repository.ts                      │
│                                   - INSERT batch PostgreSQL          │
│                                            │                         │
│  3. Response             ◄────────────────┘                         │
│     { accepted: true }                                               │
│                                                                      │
│                                            │                         │
│                                            ▼                    4. SSE
│                                   GET /api/agents/stream  ◄──── map/page.tsx
│                                            │                         │
│                                            │                         │
│                                   Cada 120ms:                        │
│                                   - Lee estado live                  │
│                                   - Envia posiciones ──────────────►│
│                                                              Render  │
│                                                              markers │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Contratos API

### POST /api/agents/location

**Auth:** `x-agent-token` header (NO JWT)

```typescript
// Request
{
  agent_id: string,      // UUID del agente
  ts: string,            // ISO timestamp
  lat: number,           // Latitud
  lng: number,           // Longitud
  seq: number,           // Secuencia monotona (para dedupe)
  accuracy?: number,     // Precision en metros
  speed?: number,        // Velocidad m/s
  heading?: number,      // Direccion en grados
  battery?: number,      // Bateria 0-100
  campaign_id?: string   // Campana activa
}

// Response 202 (accepted)
{
  ok: true,
  accepted: true,
  queue_depth: number
}

// Response 200 (deduped)
{
  ok: true,
  accepted: false,
  reason: "deduped"
}

// Response 401
{ ok: false, code: "AUTH_INVALID_TOKEN" }

// Response 429
{ ok: false, code: "RATE_LIMITED" }
```

### GET /api/agents/live

**Auth:** JWT Bearer

```typescript
// Response 200
{
  ok: true,
  agents: [{
    agent_id: string,
    lat: number,
    lng: number,
    ts: string,
    accuracy?: number,
    speed?: number,
    battery?: number,
    online: boolean,
    campaign_id?: string
  }],
  online_count: number
}
```

### GET /api/agents/stream (SSE)

**Auth:** JWT Bearer

```typescript
// Response: Server-Sent Events
// Content-Type: text/event-stream

// Evento de datos (cada ~120ms)
event: agents
data: {"agents":[...],"online_count":5}

// Heartbeat (cada ~25s)
:heartbeat
```

### GET /api/agents/health

```typescript
// Response 200
{
  ok: true,
  queue_depth: number,
  online_agents: number,
  sse_clients: number,
  last_flush_age_ms: number
}
```

---

## Arquitectura de Datos

### Redis (Estado Live)

```
tracking:live:{agent_id} = {
  lat, lng, ts, accuracy, speed, battery, campaign_id
}
TTL: 2 minutos (agentStaleAfterMs)

tracking:events = Redis Stream (write-behind queue)
tracking:last-seq:{agent_id} = ultimo seq procesado (dedupe)
```

### PostgreSQL (Historico)

```sql
CREATE TABLE agent_locations_live (
  agent_id UUID NOT NULL,
  campaign_id UUID,
  ts TIMESTAMPTZ NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  accuracy REAL,
  speed REAL,
  heading REAL,
  battery SMALLINT,
  seq BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agent_id, seq)
);

CREATE INDEX idx_agent_locations_campaign ON agent_locations_live(campaign_id, ts DESC);
```

---

## Mobile: Offline Queue

```typescript
// apps/mobile/lib/tracking/queue.ts

// SQLite schema
CREATE TABLE tracking_queue (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  seq INTEGER NOT NULL,
  accuracy REAL,
  speed REAL,
  heading REAL,
  battery INTEGER,
  campaign_id TEXT,
  synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

// Sync batch cuando hay conexion
SELECT * FROM tracking_queue WHERE synced = 0 ORDER BY seq LIMIT 100;
// POST /api/agents/location (uno por uno o batch)
// UPDATE tracking_queue SET synced = 1 WHERE id IN (...);
```

---

## Variables de Entorno (Backend)

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `AGENT_INGEST_TOKEN` | **requerido** | Token fijo para tracking |
| `AGENT_STALE_AFTER_MS` | `120000` | Timeout para marcar offline |
| `AGENT_STREAM_HEARTBEAT_MS` | `25000` | Heartbeat SSE |
| `AGENT_STREAM_BATCH_FLUSH_MS` | `120` | Intervalo de flush SSE |
| `TRACKING_WB_BATCH_SIZE` | `300` | Batch size write-behind |
| `TRACKING_WB_FLUSH_MS` | `250` | Flush interval write-behind |
| `TRACKING_WB_MAX_QUEUE` | `10000` | Max queue antes de backpressure |
| `RATE_LIMIT_AGENTS_LOCATION_PER_MINUTE` | `12000` | Rate limit ingesta |

---

## Mobile: Configuracion

```json
// apps/mobile/app.json > extra
{
  "EXPO_PUBLIC_BACKEND_API_URL": "http://161.132.39.165/api",
  "EXPO_PUBLIC_AGENT_INGEST_TOKEN": "<token>"
}
```

```typescript
// apps/mobile/lib/api.ts
const AGENT_INGEST_TOKEN = Constants.expoConfig?.extra?.EXPO_PUBLIC_AGENT_INGEST_TOKEN;

// Enviar ubicacion
await fetch(`${API_BASE}/agents/location`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-agent-token': AGENT_INGEST_TOKEN,
  },
  body: JSON.stringify(payload),
});
```

---

## Web: SSE Subscription

```typescript
// apps/web/app/(dashboard)/map/page.tsx (conceptual)

useEffect(() => {
  const token = getAccessToken();
  const eventSource = new EventSource(
    `/api/agents/stream`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  eventSource.addEventListener('agents', (e) => {
    const data = JSON.parse(e.data);
    setAgents(data.agents);
  });
  
  return () => eventSource.close();
}, []);
```

---

## Metricas Expuestas

En `/api/metrics` (requiere auth):

```typescript
{
  tracking: {
    queue_depth: number,
    online_agents: number,
    sse_clients: number,
    last_flush_age_ms: number,
    flush_duration_ms: number
  },
  ingest_outcome_latencies: {
    tracking: {
      accepted: { p50, p90, p95, p99 },
      deduped: { p50, p90, p95, p99 },
      auth_failed: { p50, p90, p95, p99 },
      rate_limited: { p50, p90, p95, p99 }
    }
  }
}
```

---

## Checklist de Cambios

Al modificar tracking, verificar:

- [ ] Backend: `bunx tsc --noEmit` sin errores
- [ ] Backend: `/api/agents/health` responde con metricas
- [ ] Backend: Write-behind no pierde datos bajo carga
- [ ] Backend: SSE mantiene conexiones estables
- [ ] Web: Mapa actualiza posiciones en tiempo real
- [ ] Web: Reconexion SSE funciona tras desconexion
- [ ] Mobile: Background location funciona
- [ ] Mobile: Queue offline persiste en SQLite
- [ ] Mobile: Sync funciona al recuperar conexion
- [ ] Token `AGENT_INGEST_TOKEN` coincide en backend y mobile
