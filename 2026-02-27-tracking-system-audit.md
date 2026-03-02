# Auditoría Completa del Sistema de Tracking

> **Fecha:** 2026-02-27
> **Autor:** Análisis automatizado
> **Archivos revisados:** ~70 archivos en 3 capas (mobile, backend, web)
> **Estado:** Diagnóstico + propuesta de mejora

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura Actual](#2-arquitectura-actual)
3. [Capa Mobile (Expo)](#3-capa-mobile-expo)
4. [Capa Backend (Fastify)](#4-capa-backend-fastify)
5. [Capa Web Dashboard (Next.js)](#5-capa-web-dashboard-nextjs)
6. [Flujo Completo Extremo a Extremo](#6-flujo-completo-extremo-a-extremo)
7. [Sistema de Triple Deduplicación](#7-sistema-de-triple-deduplicación)
8. [Diagnóstico: Problemas Identificados](#8-diagnóstico-problemas-identificados)
9. [Propuesta de Mejora](#9-propuesta-de-mejora)
10. [Archivos Involucrados](#10-archivos-involucrados)

---

## 1. Resumen Ejecutivo

El sistema de tracking de Goberna permite monitorear en tiempo real la ubicación de agentes de campo desde una app móvil (Expo) hasta un dashboard web (Next.js), pasando por un backend (Fastify) con ingesta de alta performance vía Redis Streams.

**Fortalezas del sistema actual:**
- Arquitectura offline-first sólida con SQLite como fuente de verdad local
- Triple deduplicación por sequence number (in-memory → Redis → PostgreSQL)
- Dual transport (WebSocket + HTTP batch fallback)
- Write-behind pattern con DLQ y alertas Telegram
- Optimizaciones de rendering del mapa bien documentadas (P1-P7)

**Problema principal identificado:**
El sistema no distingue correctamente entre "celular conectado pero quieto" y "celular desconectado". Un agente que deja de moverse desaparece del dashboard en 2 minutos, aunque su app siga abierta y el WebSocket activo.

---

## 2. Arquitectura Actual

```
┌─────────────────────────────────────────────────────────┐
│  MOBILE (Expo SDK 54 + React Native 0.81)               │
│                                                         │
│  expo-location watchPositionAsync (15s / 5m)            │
│       │                                                 │
│       ├──→ SQLite (pending_locations)                   │
│       │        │                                        │
│       ├──→ WebSocket wss://api.goberna.us/ws/tracking   │
│       │    (fire-and-forget, best-effort)               │
│       │                                                 │
│       └──→ Sync Service (cada 30s)                      │
│            ├─ Intenta WS batch primero                  │
│            └─ Fallback: POST /api/agents/locations/batch│
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  BACKEND (Fastify 5.6 + Bun)                            │
│                                                         │
│  Ingesta (WS + REST, misma pipeline)                    │
│  → Validar x-agent-token                                │
│  → Zod parse + toState()                                │
│  → DEDUP Capa 1: store.upsert() (in-memory seq)        │
│  → DEDUP Capa 2: Redis Lua HGET/XADD (atómico)         │
│  → Actualizar store in-memory                           │
│  → Staging para SSE batch                               │
│                         │                               │
│  Write-Behind Consumer (loop infinito)                  │
│  → XREADGROUP tracking:events (300 msgs, 250ms)        │
│  → DEDUP Capa 3: ON CONFLICT WHERE seq > t.seq         │
│  → Upsert agent_locations_live (1 fila/agente)          │
│  → Append agent_location_history (7 días rolling)       │
│                         │                               │
│  SSE Broadcast                                          │
│  → Batch flush cada 120ms                               │
│  → location.batch (filtrado por campaña)                │
│  → Stale sweep cada 60s → agent.offline                 │
│  → Heartbeat cada 25s                                   │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  WEB DASHBOARD (Next.js 16.1 + MapLibre GL)             │
│                                                         │
│  useAgentSSE → fetch() + ReadableStream                 │
│  useSSELocations → batching 250ms                       │
│  useEnrichedAgents → merge stats + locations + forms    │
│  TierraMap → 5 capas de agentes en MapLibre             │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Capa Mobile (Expo)

### 3.1 Archivos principales

| Archivo | Líneas | Responsabilidad |
|---------|--------|-----------------|
| `lib/tracking/index.ts` | 488 | Motor principal de tracking GPS |
| `lib/tracking/ws-transport.ts` | 349 | Transporte WebSocket persistente |
| `lib/offline-queue/locations.ts` | 223 | Cola SQLite de ubicaciones |
| `lib/offline-queue/sync-service.ts` | 425 | Servicio de sincronización |
| `lib/offline-queue/db.ts` | 115 | Base de datos SQLite (WAL mode) |
| `hooks/useAgentTracking.ts` | 155 | Hook React para UI |

### 3.2 Recolección de GPS

- **Solo foreground.** Background tracking deshabilitado por compliance Google Play.
- Las funciones `startBackgroundTracking()` y `requestBackgroundPermission()` son stubs vacíos.
- Usa `expo-location` `watchPositionAsync`:
  - `accuracy: Location.Accuracy.High`
  - `timeInterval: 15_000` (15s, solo Android)
  - `distanceInterval: 5` (5 metros)
- Captura ubicación inicial vía `getCurrentPositionAsync` antes de iniciar el watcher.
- **AppState listener:** Reinicia el GPS watcher cuando la app vuelve a foreground (el OS puede haberlo matado).
- Nivel de batería cacheado por 60 segundos para evitar llamadas async por cada ubicación.

### 3.3 Transporte dual

```
Cada punto GPS capturado se:
1. Guarda SIEMPRE en SQLite (durabilidad offline-first)
2. Envía vía WebSocket si conectado (fire-and-forget, baja latencia)
```

**WebSocket (`ws-transport.ts`):**
- URL: `wss://api.goberna.us/ws/tracking?token=<AGENT_INGEST_TOKEN>`
- Auto-reconexión con backoff exponencial: 1s → 30s máx
- Ping/pong cada 25s; si no hay pong en 10s, fuerza cierre y reconexión
- Auth failure (close 4001): no reconecta
- Soporta `config` push del server para reconfigurar GPS dinámicamente

**HTTP Batch (fallback via sync-service):**
- Cada 30 segundos, el sync service:
  1. Verifica conectividad de red
  2. Intenta sync vía WS batch (timeout 10s para ack)
  3. Si falla: `POST /api/agents/locations/batch` con `x-agent-token`
- Backoff exponencial en errores: 30s → 5 min máx
- Máximo 5 reintentos por item

### 3.4 Formato de datos (LocationPayload)

```typescript
{
  agent_id: string;       // User ID
  agent_name?: string;    // Nombre completo del usuario
  campaign_id?: string;   // Campaña activa
  ts: string;             // ISO 8601 timestamp
  lat: number;            // Latitud
  lng: number;            // Longitud
  seq: number;            // Sequence number monótono creciente
  accuracy?: number;      // Precisión GPS en metros
  speed?: number;         // Velocidad (≥0)
  heading?: number;       // Dirección 0-360°
  battery?: number;       // Nivel de batería 0-100
}
```

### 3.5 Cola offline (SQLite)

**3 tablas:**

| Tabla | Propósito |
|-------|-----------|
| `pending_locations` | Puntos GPS con `sync_status` (pending/syncing/synced/failed) |
| `pending_forms` | Formularios con `client_id` para dedup |
| `sync_meta` | Metadata persistente (seq counter, etc.) |

**Generación de sequence number:**
```
seq = max(storedSeq, floor(Date.now() / 1000)) + 1
```
Garantiza monotonía incluso tras reinstalar la app o borrar SQLite.

**Limpieza automática:**
- Locations synced: borradas tras 24 horas
- Forms synced: borrados tras 7 días

### 3.6 Status background/foreground

Cuando la app cambia de estado:
- `background`: envía `POST /api/agents/status` con `{ status: "background" }`
- `foreground` (solo si venía de `background` real, no de iOS `inactive`): envía status + reinicia GPS watcher

---

## 4. Capa Backend (Fastify)

### 4.1 Archivos principales

| Archivo | Líneas | Responsabilidad |
|---------|--------|-----------------|
| `modules/agents/routes.ts` | 636 | Endpoints REST + SSE + orquestación |
| `modules/agents/ws-routes.ts` | 329 | WebSocket handler |
| `modules/agents/write-behind-queue.ts` | 290 | Consumer Redis Streams → PostgreSQL |
| `modules/agents/store.ts` | 92 | Store in-memory (Map<agentId, state>) |
| `modules/agents/repository.ts` | ~200 | Queries PostgreSQL |
| `modules/agents/helpers.ts` | 26 | Parser toState() |
| `modules/agents/schema.ts` | 26 | Validación Zod |
| `modules/agents/types.ts` | 29 | Tipos TypeScript |

### 4.2 Pipeline de ingesta (compartida por WS y HTTP)

```
1. Validar x-agent-token (shared secret)
2. Zod parse + toState() → AgentLiveState
3. DEDUP Capa 1: store.upsert() — in-memory seq check (<1μs)
4. DEDUP Capa 2: Redis Lua script — atómico HGET+XADD (~1ms)
5. Actualizar store in-memory
6. Staging en pendingBatchByAgent para SSE broadcast
7. Emitir agent_connected si es nuevo agente
8. Retornar 202 Accepted (o 200 deduped)
```

### 4.3 WebSocket handler (`/ws/tracking`)

- Auth vía query param `?token=<value>`
- Envía `config` welcome message al conectar: `{ interval_ms: 15000, distance_m: 5 }`
- Rate limit per-connection: 10 msgs/segundo (sliding window)
- Ping/pong: server pinga cada 25s, espera pong dentro de 10s; si no, termina conexión
- Batch processing con concurrencia acotada (chunks de 10 parallel Redis calls)
- Health: `GET /ws/tracking/health` → `{ ok, ws_clients }`

### 4.4 Write-Behind (Redis Streams → PostgreSQL)

```
Redis Stream: tracking:events
    │
    ▼
Consumer Loop (infinito):
    ├─ XREADGROUP (300 msgs, 250ms block)
    ├─ XAUTOCLAIM (msgs idle >30s de consumers muertos)
    ├─ Dedup intra-batch (mayor seq por agente)
    ├─ upsertLatestAgentLocationsBatch() → PostgreSQL
    │   ├─ agent_locations_live (upsert, 1 fila/agente)
    │   └─ agent_location_history (append, 7 días rolling)
    ├─ XACK mensajes procesados
    └─ On error: retry count → DLQ tras 5 fallos
```

**Configuración:**

| Parámetro | Valor default | Propósito |
|-----------|---------------|-----------|
| `TRACKING_WB_BATCH_SIZE` | 300 | Mensajes por flush a DB |
| `TRACKING_WB_FLUSH_MS` | 250 | Block time en XREADGROUP |
| `TRACKING_WB_MAX_QUEUE` | 10,000 | Backpressure (503 si lleno) |
| `TRACKING_STREAM_MAX_LEN` | 200,000 | Trim del stream |
| `STREAM_CLAIM_IDLE_MS` | 30,000 | Reclamar de consumers muertos |
| `STREAM_DLQ_MAX_ATTEMPTS` | 5 | Reintentos antes de DLQ |

**Redis Lua script (dedup atómico):**
```lua
local current = redis.call('HGET', seqHashKey, agentId)
if current and tonumber(current) >= seq then
  return 0  -- deduplicado
end
redis.call('HSET', seqHashKey, agentId, seq)
redis.call('XADD', streamKey, 'MAXLEN', '~', maxLen, '*', 'payload', payload)
return 1  -- aceptado
```

### 4.5 Store in-memory (`AgentsStore`)

- `Map<string, AgentLiveState>` keyed por `agentId`
- `upsert(next)`: rechaza si `next.seq <= current.seq`
- `removeStale()`: elimina agentes con `lastSeenAtMs > agentStaleAfterMs` (default 2 min)
- `listLive()`: retorna agentes no-stale serializados
- Seed al startup desde `agent_locations_live` + JOIN con `users` para recuperar nombres

### 4.6 SSE Broadcast

**Eventos enviados al dashboard:**

| Evento | Trigger | Payload | Filtrado? |
|--------|---------|---------|-----------|
| `snapshot` | On connect | `{ ts, agents[] }` | Por campaña |
| `location.batch` | Batch flush (120ms) | `{ ts, agents[] }` | Por campaña |
| `agent.offline` | Stale sweep (60s) | `{ agent_id, agent_name, ts }` | No |
| `agent.status` | Status endpoint | `{ agent_id, status, campaign_id, ts }` | No |
| `heartbeat` | Timer (25s) | `{ ts }` | No |

**Filtrado por campaña:**
- Cada cliente SSE tiene `campaignIds` (del JWT) e `isAdmin`.
- `broadcastFiltered()` envía `location.batch` solo para agentes de las campañas del cliente.
- Admins reciben todos los agentes.

**Poda de clientes lentos:**
- Si `res.write()` retorna `false` (backpressure), el cliente se cierra y elimina.

### 4.7 Esquema de base de datos

**`agent_locations_live`** (upsert, 1 fila por agente):
```sql
agent_id     TEXT PRIMARY KEY
seq          BIGINT NOT NULL
ts           TIMESTAMPTZ NOT NULL
lat          DOUBLE PRECISION NOT NULL
lng          DOUBLE PRECISION NOT NULL
accuracy     DOUBLE PRECISION
speed        DOUBLE PRECISION
heading      DOUBLE PRECISION
battery      DOUBLE PRECISION
campaign_id  UUID REFERENCES campaigns(id)
created_at   TIMESTAMPTZ DEFAULT now()
updated_at   TIMESTAMPTZ DEFAULT now()
-- Indexes: seq DESC, updated_at DESC, campaign_id
```

**`agent_location_history`** (append-only, rolling 7 días):
```sql
id           BIGSERIAL PRIMARY KEY
agent_id     TEXT NOT NULL
campaign_id  UUID REFERENCES campaigns(id) ON DELETE SET NULL
meet_id      UUID REFERENCES meets(id) ON DELETE SET NULL
ts           TIMESTAMPTZ NOT NULL
lat          DOUBLE PRECISION NOT NULL
lng          DOUBLE PRECISION NOT NULL
accuracy     DOUBLE PRECISION
speed        DOUBLE PRECISION
heading      DOUBLE PRECISION
battery      DOUBLE PRECISION
created_at   TIMESTAMPTZ DEFAULT now()
-- Indexes: (agent_id, ts DESC), (campaign_id, ts DESC), (created_at)
```

### 4.8 Online/Offline detection

- **Online:** `Date.now() - state.lastSeenAtMs <= agentStaleAfterMs` (default 120s)
- **Stale sweep:** cada `agentStaleAfterMs / 2` (60s), elimina agentes expirados
- **Solo location ingest resetea `lastSeenAtMs`** — el status background/foreground NO lo resetea
- Al eliminar: broadcast `agent.offline` + emite `agent_disconnected` campaign event

### 4.9 Métricas expuestas

| Métrica | Tipo | Labels |
|---------|------|--------|
| `tracking_ingest_total` | Counter | HTTP status (200, 202, 401, 400, 500, 503) |
| `tracking_dedupe_total` | Counter | `live_seq` / `pending_seq` |
| `tracking_queue_depth` | Gauge | — |
| `tracking_sse_clients` | Gauge | — |
| `tracking_online_agents` | Gauge | — |
| `tracking_last_flush_age_ms` | Gauge | — |
| `ws_connections` | Counter | `open` / `close` |
| `ws_messages_in` | Counter | message type |
| `agents_write_behind_flush` | Latency | p50/p90/p95/p99 |

---

## 5. Capa Web Dashboard (Next.js)

### 5.1 Archivos principales (tierra/)

**Página:**
- `tierra/page.tsx` (209 líneas) — Orquestador principal

**Componentes (21 archivos):**
- `tierra-map.tsx` (446 líneas) — Mapa MapLibre GL
- `tierra-header.tsx` — Header + KPIs + control de vista
- `campo-overlay.tsx` — Panel lateral glassmorphism
- `agents-tab.tsx` — Lista de agentes filtrable
- `datos-tab.tsx` / `datos-view.tsx` — Tabla de formularios
- `pipeline-view.tsx` — Vista de analytics
- `activity-charts.tsx` — Gráficos Recharts
- Y 13 componentes más...

**Hooks (15 archivos):**
- `use-agent-sse.ts` — Conexión SSE (core)
- `use-sse-locations.ts` — Batching + estado background
- `use-enriched-agents.ts` — Merge stats + locations + forms → agents
- `use-drill-filters.ts` — Filtros MapLibre por drill level
- `use-map-click.ts` — Drill navigation + click de agentes
- Y 10 hooks más...

### 5.2 Conexión SSE (`use-agent-sse.ts`)

- **Transporte:** `fetch()` + `ReadableStream` (NO `EventSource`, porque necesita cookies)
- **Auth:** `credentials: "same-origin"` — cookies httpOnly van automáticamente vía proxy Next.js
- **401 handling:** intenta `POST /api/auth/refresh` una vez, luego reintenta SSE
- **Reconexión:** backoff exponencial `Math.min(1000 * 2^attempt, 30_000)` — max 30s
- **Heartbeat timeout:** si no llega data en 60s, aborta y reconecta
- **Parser SSE:** manual line-by-line de `event:` + `data:`

### 5.3 Batching de updates (`use-sse-locations.ts`)

- Locations entrantes se acumulan en un `Map` y se flushean a React state cada 250ms
- Evita re-renders por cada evento SSE individual
- Maneja `agent.status: "background"` → agrega a `backgroundAgentIds`
- Maneja `agent.offline` → elimina del mapa + genera log entry

### 5.4 Enriquecimiento de agentes (`use-enriched-agents.ts`)

```
stats.top_agents + SSE locations + polled forms → EnrichedAgent[]
```

- **Status derivado del timestamp:**
  - `< 2 min` = connected
  - `< 10 min` = idle
  - `> 10 min` = inactive
- Agentes con `backgroundAgentIds` forzados a `inactive`
- Agentes sin GPS usan coords del último formulario geolocalizado
- Fallback final: Lima (-12.046, -77.043)
- Ordenados: connected primero, luego por forms_count

### 5.5 Renderizado en mapa (MapLibre GL)

**5 capas de agentes:**

| Capa | Tipo | Propósito |
|------|------|-----------|
| `agents-selected-ring` | circle | Anillo de selección (24px, primaryColor, 20% opacity) |
| `agents-pulse` | circle | Pulso "breathing" (18px, teal, solo connected) |
| `agents-circles` | circle | Marker principal (9px normal, 12px selected) |
| `agents-labels` | symbol | Nombre debajo del marker (zoom ≥ 10) |
| `agents-count` | symbol | Conteo de formularios sobre el marker (zoom ≥ 8) |

**Colores por status:**
- Connected: `#0d9488` (teal)
- Idle: `#d97706` (amber)
- Inactive: `#64748b` (slate)

**Optimizaciones documentadas (P1-P7):**

| ID | Optimización | Impacto |
|----|-------------|---------|
| P1 | Sources siempre montados; visibilidad por `layout.visibility` | Evita destruir buffers WebGL |
| P2 | Paint/layout estáticos en módulo separado | Cero allocations por render |
| P3 | Handlers de alta frecuencia leen de refs | No closures sobre state |
| P4 | Feature-state hover vía `setFeatureState` | Cero re-renders React durante mouse |
| P5 | Tiles array y GeoJSON memoizados | Nueva referencia = Source rebuild |
| P6 | Componente wrapped en `memo(forwardRef)` | Solo re-render si props cambian |
| P7 | `interactiveLayerIds` como constante de módulo | Referencialmente estable |

**Tooltips:** DOM directo + `requestAnimationFrame` para 60fps sin React state.

### 5.6 Polling complementario

| Hook | Intervalo | Propósito |
|------|-----------|-----------|
| `useCampaignStats(slug)` | 10s | Totales, top agents, eventos recientes |
| `useRecentForms(campaignId)` | 5s | Formularios (con structuralSharing) |
| `useBrigadistaMetrics(campaignId)` | 30s | Métricas por brigadista |

---

## 6. Flujo Completo Extremo a Extremo

### 6.1 Un punto GPS desde el celular hasta el mapa

```
1. expo-location dispara callback con LocationObject
   └─ processLocation() en lib/tracking/index.ts:160

2. Se construye LocationPayload con agent_id, ts, lat, lng, seq, battery...
   └─ seq se asigna por queueLocation() (monotónico, SQLite)

3. Se escribe SIEMPRE a SQLite (offline-first)
   └─ queueLocation() en lib/offline-queue/locations.ts

4. Si WebSocket conectado: sendLocation() fire-and-forget
   └─ ws-transport.ts:281 → { type: "location", data: payload }

5. Backend recibe (WS handler ws-routes.ts o HTTP routes.ts):
   a. Valida x-agent-token
   b. Zod parse → AgentLiveState (helpers.ts:toState)
   c. DEDUP 1: store.get(agentId) → seq check (store.ts:31)
   d. DEDUP 2: Redis Lua HGET/XADD (redis.ts:enqueueTrackingEvent)
   e. Store upsert → actualiza in-memory
   f. Staging en pendingBatchByAgent

6. Cada 120ms, batch flush timer:
   └─ broadcastFiltered() → SSE event "location.batch" a dashboard clients

7. Write-behind consumer (asíncrono, 250ms block):
   └─ XREADGROUP → dedup intra-batch → upsertLatestAgentLocationsBatch()
       ├─ agent_locations_live (upsert)
       └─ agent_location_history (append)

8. Dashboard recibe SSE event:
   └─ useAgentSSE → handleSseEvent("location.batch")
   └─ useSSELocations → batch 250ms → setLocations()
   └─ useEnrichedAgents → merge → EnrichedAgent[]
   └─ useAgentsSource → GeoJSON FeatureCollection
   └─ TierraMap re-render → MapLibre actualiza source data
```

**Latencia total estimada (best case):**
- GPS → SQLite + WS send: ~5ms
- WS → Backend ingest: ~10ms (red)
- Backend → SSE broadcast: ≤120ms (batch timer)
- SSE → React state: ≤250ms (batching)
- **Total: ~300-400ms GPS-to-pixel**

### 6.2 Detección de offline

```
1. Agente deja de enviar GPS (app cerrada, sin red, celular apagado)

2. Backend stale sweep (cada 60s):
   └─ store.removeStale() → elimina si lastSeenAtMs > 120s
   └─ Broadcast "agent.offline" a todos los SSE clients
   └─ emitCampaignEvent("agent_disconnected")

3. Dashboard recibe:
   └─ useSSELocations.handleAgentOffline() → elimina del mapa
   └─ Genera LogEntry "se desconectó"

Tiempo máximo para detectar offline: ~180s (120s stale + 60s sweep interval)
```

---

## 7. Sistema de Triple Deduplicación

El `seq` (sequence number) es un entero monótonamente creciente generado en el mobile. Cada nueva ubicación tiene `seq > anterior`. Esto permite deduplicar en 3 niveles:

| Capa | Ubicación | Mecanismo | Latencia | Propósito |
|------|-----------|-----------|----------|-----------|
| **1** | In-memory store | `next.seq <= current.seq` → rechaza | <1μs | Fast-path, evita Redis call |
| **2** | Redis Lua script | `HGET tracking:last-seq` → atómico | ~1ms | Durabilidad cross-restart |
| **3** | PostgreSQL | `ON CONFLICT WHERE EXCLUDED.seq > t.seq` | ~5-50ms | Safety net final |

**¿Por qué 3 capas?**
- Capa 1: Performance. La mayoría de duplicados se rechazan sin I/O.
- Capa 2: Durabilidad. Si el backend reinicia, Redis conserva el último seq por agente.
- Capa 3: Correctitud. Si Redis pierde datos, PostgreSQL no acepta regresiones.

**El mobile puede reenviar** datos (sync de cola offline), y los duplicados se atrapan en una de estas capas. El sistema acepta "at-least-once delivery" y deduplicación idempotente.

---

## 8. Diagnóstico: Problemas Identificados

### 8.1 CRÍTICO — Inconsistencia en detección de conectividad

**El problema central:** El sistema no distingue entre "celular conectado pero quieto" y "celular desconectado".

**Backend (store.ts):**
- `agentStaleAfterMs = 120_000` (2 min)
- Elimina al agente del store in-memory tras 2 min sin datos
- Emite `agent.offline` y el agente desaparece del dashboard

**Web (utils.ts):**
- `< 2 min` = connected
- `< 10 min` = idle
- `> 10 min` = inactive

**La inconsistencia:**
- Un agente a los 2:01 sin enviar GPS ya fue **eliminado** del store.
- El estado "idle" (2-10 min) definido en el web **nunca se alcanza** vía SSE porque el backend ya lo borró.
- El estado "idle" solo aparece si el agente tiene datos en `stats.top_agents` pero no en locations (merge en `useEnrichedAgents`).

**Resultado:** El dashboard muestra transición abrupta de "connected" → desaparece. No hay estado intermedio visible.

### 8.2 ALTO — No hay heartbeat del mobile al backend

- Solo el **location ingest** resetea `lastSeenAtMs` en el store
- El **status background/foreground** (`POST /api/agents/status`) NO lo resetea
- El **WebSocket ping/pong** (cada 25s) NO lo resetea

**Consecuencia:** Un agente quieto (sin moverse, `distanceInterval` de 5m no se cumple) pero con la app abierta y WS activo, es marcado como offline tras 2 minutos. El backend tiene un WebSocket conectado con ping/pong activo, pero no lo usa como señal de presencia.

### 8.3 ALTO — El store no sabe sobre conexiones WebSocket

- `wsClients` es un `Set<WebSocket>` en `ws-routes.ts`, pero es **anónimo** — no trackea qué agente está detrás de cada socket
- El stale sweep elimina agentes que tienen WS activo
- No hay forma de preguntar "¿el agente X tiene WebSocket conectado?"

### 8.4 MEDIO — `agent_location_history` no tiene columna `seq`

- La tabla de historial no tiene `seq`, así que no hay dedup a nivel de historial
- Si el write-behind procesa el mismo lote dos veces (retry), puede haber filas duplicadas en el historial
- No es crítico (el historial es best-effort y rolling), pero contamina datos

### 8.5 MEDIO — Cleanup timer reutiliza env var semánticamen incorrecta

- `cleanupLocationHistory()` usa `refreshTokenCleanupIntervalMs` (default 1h) como intervalo
- Semánticamente confuso — debería tener su propio env var
- El nombre sugiere limpieza de refresh tokens, no de location history

### 8.6 BAJO — SSE batch flush de 120ms puede ser agresivo a escala

- Con muchos agentes activos: ~8 SSE events/segundo
- Para la escala actual (decenas de agentes) está bien
- Escalar a cientos de agentes podría saturar browsers lentos
- Los clients lentos se podan (backpressure), pero la frecuencia podría subir

### 8.7 BAJO — Autenticación de tracking es un shared secret

- `AGENT_INGEST_TOKEN` es un solo token para todos los agentes
- Si se filtra, cualquiera puede enviar ubicaciones falsas a cualquier `agent_id`
- No hay validación de que el `agent_id` en el payload corresponde a un usuario real

### 8.8 BAJO — No hay validación geográfica

- `lat` se valida como `[-90, 90]`, `lng` como `[-180, 180]`
- No hay geo-fence para Perú
- Un agente podría enviar coordenadas en otro continente

---

## 9. Propuesta de Mejora

### 9.1 WebSocket como canal de presencia (resuelve 8.1, 8.2, 8.3)

**Concepto:** El WebSocket ya mantiene ping/pong cada 25s. Usar esto como señal de presencia real. Si el WS está abierto y respondiendo pongs, el agente está **conectado** — independientemente de si envió GPS.

**Cambios requeridos:**

**Backend — `ws-routes.ts`:**
- Trackear `agentId` por cada WebSocket (extraer del primer `location` message, o agregar un `{ type: "identify", agent_id: "..." }` al protocolo)
- Exponer `wsAgentMap: Map<string, WebSocket>` al `IngestContext`
- Al recibir pong, actualizar `lastSeenAtMs` del agente en el store

**Backend — `store.ts`:**
- Nuevo campo: `connectionType: "ws" | "http" | null`
- `removeStale()` no elimina agentes con WS activo y pong reciente
- Nuevo estado intermedio: agente con WS pero sin GPS reciente = "connected pero quieto"

**Backend — `routes.ts` (stale sweep):**
- Antes de eliminar un agente: verificar si tiene WS activo
- Si tiene WS: emitir `agent.idle` en vez de `agent.offline`
- Si no tiene WS y pasó el stale time: emitir `agent.offline`

**Web — `types.ts`:**
- Ya tiene `AgentStatus = "connected" | "idle" | "inactive"` — se mantiene

**Web — `use-enriched-agents.ts`:**
- Usar el estado del SSE directamente en vez de derivarlo solo del timestamp
- `connected`: WS activo + GPS reciente (< 2 min)
- `idle`: WS activo + GPS no reciente (> 2 min)
- `inactive`: sin WS, sin GPS reciente

### 9.2 Heartbeat del mobile como extensión de presencia (resuelve 8.2)

**Si no se implementa 9.1** (más invasivo), una alternativa más simple:

**Mobile — `ws-transport.ts`:**
- El ping que ya envía cada 25s es suficiente
- No se necesita cambio en mobile

**Backend — `ws-routes.ts`:**
- Al recibir `pong` del WebSocket (línea actual solo actualiza `lastPongMs`):
  - También actualizar `lastSeenAtMs` en el store si se conoce el `agentId`
  - Esto mantiene al agente "vivo" mientras el WS esté activo

**Efecto:** Un agente con WS conectado nunca es marcado como stale mientras el ping/pong funcione. Resuelve el problema de "agente quieto = offline".

### 9.3 Agregar `seq` a `agent_location_history` (resuelve 8.4)

```sql
ALTER TABLE agent_location_history ADD COLUMN seq BIGINT;
CREATE UNIQUE INDEX CONCURRENTLY idx_history_agent_seq 
  ON agent_location_history (agent_id, seq);
```

Cambio en `repository.ts` `insertLocationHistory()` para incluir `seq` y usar `ON CONFLICT (agent_id, seq) DO NOTHING`.

### 9.4 Env var dedicada para cleanup de history (resuelve 8.5)

```typescript
// env.ts
locationHistoryCleanupIntervalMs: toNumber(
  process.env.LOCATION_HISTORY_CLEANUP_INTERVAL_MS, 3600000
),
```

### 9.5 SSE broadcast adaptivo (resuelve 8.6)

En vez de flush fijo cada 120ms, adaptar al número de cambios pendientes:
- 0 cambios: no enviar nada (ya funciona así)
- 1-5 cambios: flush inmediato (baja latencia)
- 5+ cambios: batch en 120ms (coalescing)

Esto reduce la frecuencia con pocos agentes y mantiene la eficiencia con muchos.

---

## 10. Archivos Involucrados

### Mobile (`apps/mobile/`)

| Archivo | Relevancia |
|---------|------------|
| `lib/tracking/index.ts` | Motor GPS, AppState, config push |
| `lib/tracking/ws-transport.ts` | WebSocket transport, ping/pong, reconnect |
| `lib/offline-queue/index.ts` | Re-exports de la cola |
| `lib/offline-queue/db.ts` | SQLite setup (WAL mode) |
| `lib/offline-queue/locations.ts` | Queue/dequeue de GPS points |
| `lib/offline-queue/forms.ts` | Queue/dequeue de formularios |
| `lib/offline-queue/sync-service.ts` | Auto-sync, backoff, cleanup |
| `hooks/useAgentTracking.ts` | Hook React para dashboard mobile |
| `hooks/useAgentsStream.ts` | SSE read-only para supervisor view |
| `lib/api.ts` | API_BASE, AGENT_INGEST_TOKEN |
| `lib/auth-store.ts` | SecureStore para JWT |
| `app.json` | Permisos de location (solo foreground) |

### Backend (`apps/backend/`)

| Archivo | Relevancia |
|---------|------------|
| `src/modules/agents/routes.ts` | REST endpoints + SSE + timers |
| `src/modules/agents/ws-routes.ts` | WebSocket handler |
| `src/modules/agents/write-behind-queue.ts` | Redis Streams consumer |
| `src/modules/agents/store.ts` | In-memory Map |
| `src/modules/agents/repository.ts` | PostgreSQL queries |
| `src/modules/agents/helpers.ts` | Parser toState() |
| `src/modules/agents/schema.ts` | Validación Zod |
| `src/modules/agents/types.ts` | TypeScript types |
| `src/config/env.ts` | Variables de entorno |
| `src/infra/redis.ts` | Redis client + Lua scripts |
| `src/infra/metrics.ts` | Registry de métricas |
| `src/server.ts` | Bootstrap + cleanup timers |

### Web (`apps/web/`)

| Archivo | Relevancia |
|---------|------------|
| `app/(dashboard)/candidatos/[slug]/tierra/page.tsx` | Orquestador |
| `tierra/_components/tierra-map.tsx` | Mapa MapLibre |
| `tierra/_components/types.ts` | Tipos de dominio |
| `tierra/_components/utils.ts` | getAgentStatus(), timeAgo() |
| `tierra/_components/constants.ts` | Colores, tiles config |
| `tierra/_components/map-paint-constants.ts` | Paint objects estáticos |
| `tierra/_components/hooks/use-agent-sse.ts` | Conexión SSE |
| `tierra/_components/hooks/use-sse-locations.ts` | Batching 250ms |
| `tierra/_components/hooks/use-enriched-agents.ts` | Merge de datos |
| `tierra/_components/hooks/use-map-sources.ts` | GeoJSON sources |
| `tierra/_components/campo-overlay.tsx` | Panel lateral |
| `tierra/_components/agents-tab.tsx` | Lista de agentes |
| `lib/hooks/use-tierra-queries.ts` | TanStack Query hooks |

---

## Apéndice: Configuración de Entorno Relevante

```bash
# Tracking core
AGENT_INGEST_TOKEN=<shared-secret>
AGENT_STALE_AFTER_MS=120000          # 2 min → marca offline
AGENT_STREAM_HEARTBEAT_MS=25000      # SSE heartbeat
AGENT_STREAM_BATCH_FLUSH_MS=120      # SSE coalescing window

# Write-behind
TRACKING_WB_BATCH_SIZE=300
TRACKING_WB_FLUSH_MS=250
TRACKING_WB_MAX_QUEUE=10000
TRACKING_STREAM_KEY=tracking:events
TRACKING_STREAM_MAX_LEN=200000

# GPS config (pushed to mobile via WS)
TRACKING_DEFAULT_INTERVAL_MS=15000   # 15s
TRACKING_DEFAULT_DISTANCE_M=5        # 5 metros

# Health
TRACKING_HEALTH_MAX_LAG=1000

# Rate limits
RATE_LIMIT_AGENTS_LOCATION_PER_MINUTE=12000
RATE_LIMIT_AGENTS_LIVE_PER_MINUTE=3000
RATE_LIMIT_AGENTS_STREAM_PER_MINUTE=500

# History
LOCATION_HISTORY_RETENTION_DAYS=7
```
