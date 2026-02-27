# Plan de Implementacion: Flujo QGIS → PostGIS → Mapa del Candidato

> **Fecha:** 2026-02-27  
> **Autor:** Analisis tecnico automatizado  
> **Estado:** Pendiente de implementacion  
> **Prioridad:** Alta (data sensible + near-realtime requerido)

---

## 1. Contexto del Requerimiento

El geografo de Goberna conecta QGIS directo a PostGIS para editar zonas prioritarias y sectores custom de cada campana. El objetivo es que esos cambios se reflejen en el mapa del dashboard (`/candidatos/[slug]/tierra/`) en menos de 30 segundos, con aislamiento total entre campanas (data sensible).

### Restricciones operativas

| Parametro | Valor |
|-----------|-------|
| Campanas activas simultaneas | 1-3 |
| Sensibilidad de datos geo | Alta (cada campana solo ve sus propias zonas) |
| Latencia aceptable de propagacion | < 30 segundos |
| Flujo del geografo | QGIS conectado directo a PostGIS (ya funciona) |

---

## 2. Arquitectura Actual (Estado de las Cosas)

### Diagrama de flujo completo

```
┌──────────────────┐     ┌─────────────────────────────────┐     ┌──────────────┐
│   QGIS Desktop   │     │      PostgreSQL + PostGIS       │     │    Tegola     │
│                  │────>│                                 │────>│  (MVT tiles)  │
│  Edita vistas:   │     │  peru_departamentos             │     │  8 layers     │
│  v_qgis_dep_*    │     │  peru_provincias                │     │  Redis cache  │
│  v_qgis_prov_*   │     │  peru_distritos                 │     └──────┬───────┘
│  v_qgis_dist_*   │     │  campaign_priority_zones        │            │
│                  │     │  campaign_custom_zones           │     ┌──────▼───────┐
│  Dibuja poligonos│     │  (geom -> trigger -> geom_3857) │     │   Backend    │
│  en ccz directa  │     └─────────────────────────────────┘     │  /api/tiles  │
└──────────────────┘                                             │  (proxy)     │
                         ┌─────────────────────────────────┐     └──────┬───────┘
                         │  Script CLI                     │            │
                         │  import_priority_zones.ts       │     ┌──────▼───────┐
                         │  (GeoJSON -> DB)                │     │    Nginx     │
                         └─────────────────────────────────┘     │  tile cache  │
                                                                 │  (256MB disk)│
                                                                 └──────┬───────┘
                                                                        │
                                                                 ┌──────▼───────┐
                                                                 │  TierraMap   │
                                                                 │  MapLibre GL │
                                                                 │  14 layers   │
                                                                 │  5-lvl drill │
                                                                 └──────────────┘
```

### Tablas geograficas en PostGIS

| Tabla | Tipo | Geometria | Origen |
|-------|------|-----------|--------|
| `peru_departamentos` | Base cartografica (25 rows) | `geom` (4326) + `geom_3857` (pre-proyectado, GIST) | Shapefiles INEI importados |
| `peru_provincias` | Base cartografica (196 rows) | `geom` (4326) + `geom_3857` | Shapefiles INEI |
| `peru_distritos` | Base cartografica (1,874 rows) | `geom` (4326) + `geom_3857` | Shapefiles INEI |
| `campaign_priority_zones` | Referencia ligera | **Sin geometria** (solo `zone_code`) | QGIS vistas o script CLI |
| `campaign_custom_zones` | Sectores/subsectores | `geom` (4326) + `geom_3857` (auto-trigger) | QGIS dibujo directo |
| `zones` | Operacional (centro+radio) | Sin PostGIS (lat/lng planos) | API REST backend |

### Tegola: 8 layers en un solo mapa `peru`

| Layer | SQL Base | Zoom | Filtra por campaign? |
|-------|----------|------|---------------------|
| `departamentos` | `peru_departamentos` | 3-14 | No (data publica) |
| `provincias` | `peru_provincias` | 5-14 | No (data publica) |
| `distritos` | `peru_distritos` | 8-14 | No (data publica) |
| `priority_departamentos` | `INNER JOIN campaign_priority_zones` | 3-14 | **NO** (emite `campaign_id` como property) |
| `priority_provincias` | `INNER JOIN campaign_priority_zones` | 5-14 | **NO** |
| `priority_distritos` | `INNER JOIN campaign_priority_zones` | 8-14 | **NO** |
| `campaign_sectors` | `campaign_custom_zones` | 10-14 | **NO** |

### Cache de tiles: 3 capas

| Capa | Mecanismo | TTL | Clave |
|------|-----------|-----|-------|
| Tegola Redis | Cache interno | Hasta z14, sin TTL explicito | z/x/y |
| Nginx disco | `proxy_cache` 256MB | 2h (200), 1m (204/404) | `$uri` (sin campaign_id) |
| Browser | `Cache-Control` header | z<=7: 1h, z8-12: 10m, z13+: 2m | URL |

### Edicion QGIS: Vistas editables con INSTEAD OF triggers

**Migracion:** `apps/backend/migrations/010_qgis_priority_views.sql`

3 vistas CROSS JOIN (`peru_* x campaigns`) con triggers:

| Vista | Accion en QGIS | Trigger ejecuta |
|-------|----------------|-----------------|
| `v_qgis_dep_priority` | Set `is_priority = true` | `INSERT INTO campaign_priority_zones` |
| `v_qgis_dep_priority` | Set `is_priority = false` | `DELETE FROM campaign_priority_zones` |
| `v_qgis_dep_priority` | Cambiar `priority` (1-5) | `UPDATE campaign_priority_zones` |
| `v_qgis_prov_priority` | (idem para provincias) | (idem) |
| `v_qgis_dist_priority` | (idem para distritos) | (idem) |

Para sectores custom, el geografo dibuja poligonos directamente en `campaign_custom_zones`. Un trigger (`trg_ccz_sync_geom_3857`, migracion 025) auto-reproyecta `geom` -> `geom_3857` en cada INSERT/UPDATE.

---

## 3. Problemas Detectados (Gaps)

### GAP 1: Data Leak entre Campanas (CRITICO)

Tegola sirve zonas de **TODAS** las campanas en cada tile. El SQL de las priority layers y campaign_sectors no tiene `WHERE campaign_id = ...` porque Tegola no soporta parametros por request.

**Impacto:** Cualquier usuario puede inspeccionar el trafico de red y ver geometria, nombres de zonas, y prioridades de otras campanas.

**Archivos afectados:**
- `tegola/config.toml` — SQL sin filtro campaign
- `apps/backend/src/modules/map/routes.ts` — Proxy sin auth ni filtrado

### GAP 2: Sin Near-Realtime (cambios tardan hasta 2 horas)

Cuando el geografo edita en QGIS:
1. PostGIS se actualiza instantaneamente
2. Tegola Redis cache sigue sirviendo tile viejo
3. Nginx disco cache (2h TTL) sigue sirviendo tile viejo
4. Browser cache (hasta 1h) sigue sirviendo tile viejo

**No hay mecanismo de invalidacion de cache.**

**Archivos afectados:**
- `tegola/config.toml` — Redis cache sin invalidacion
- `nginx/default.cloudflare-origin.conf.template` — `proxy_cache_valid 200 2h`
- `apps/backend/src/modules/map/routes.ts` — Cache-Control headers largos

### GAP 3: Priority Layers Deshabilitados en Frontend

El hook `use-drill-filters.ts` tiene los 3 filtros de priority hardcodeados a `HIDE_FILTER` (nunca se renderizan):

```typescript
// use-drill-filters.ts lineas 76-79
const priorityDepFilter: FilterSpecification = HIDE_FILTER;
const priorityProvFilter: FilterSpecification = HIDE_FILTER;
const priorityDistFilter: FilterSpecification = HIDE_FILTER;
```

Los sectors SI tienen filtro por campaign_id:
```typescript
const campaignFilter: FilterSpecification = ["==", ["get", "campaign_id"], campaignId];
```

**Archivo afectado:** `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/hooks/use-drill-filters.ts`

### GAP 4: Tile Endpoint Sin Autenticacion

`GET /api/tiles/:z/:x/:y.vector.pbf` no tiene `preHandler` con `app.authenticate`. Es completamente publico.

**Archivo afectado:** `apps/backend/src/modules/map/routes.ts`

### GAP 5: No hay pg_notify/LISTEN

El codebase no usa NOTIFY/LISTEN de PostgreSQL. Todo el realtime se hace via Redis Streams + SSE. No hay mecanismo para que un cambio en PostGIS (desde QGIS) dispare una accion en el backend.

### GAP 6: Nginx Cache Key No Incluye Campaign

`proxy_cache_key $uri` significa que si se implementan tiles por campana con URL diferente, Nginx cachearia correctamente. Pero si se usa query param (`?campaign=X`), habria que cambiar la key.

---

## 4. Estrategia Elegida: Backend Filtra MVT por Campaign

### Por que esta estrategia

| Alternativa | Pros | Contras | Descartada porque |
|-------------|------|---------|-------------------|
| Tegola maps por campana | 0 latencia extra | Requiere regenerar config.toml y reiniciar Tegola por cada campana nueva | Complejidad operativa inaceptable para 2 devs |
| Bypass Tegola (ST_AsMVT directo) | Control total | Reimplementar tile server desde cero | Esfuerzo desproporcionado |
| **Backend filtra MVT** | Seguro, near-realtime, incremental | +20-50ms latencia por tile | **ELEGIDA** |
| Solo filtro client-side | Zero cambios backend | Data leak en trafico de red | Data sensible, inaceptable |

### Diagrama de flujo propuesto

```
┌──────────────────┐
│   QGIS Desktop   │
│  (geografo edita) │
└────────┬─────────┘
         │ Conexion directa PostgreSQL
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL + PostGIS                          │
│                                                                 │
│  1. INSTEAD OF triggers aplican cambio                          │
│  2. AFTER trigger dispara pg_notify('geo_change', campaign_id)  │  <-- NUEVO
│                                                                 │
└────────┬────────────────────────────────────────────────────────┘
         │ pg_notify
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Fastify)                             │
│                                                                 │
│  3. LISTEN geo_change recibe notificacion                       │  <-- NUEVO
│  4. Bump geo:version:{campaignId} en Redis                      │  <-- NUEVO
│  5. Push SSE event geo_updated a clientes conectados            │  <-- NUEVO
│                                                                 │
│  Cuando llega request de tile:                                  │
│  GET /api/tiles/:campaignId/:z/:x/:y.vector.pbf                │  <-- NUEVO
│                                                                 │
│  6. Verificar JWT + pertenencia a campana                       │  <-- NUEVO
│  7. Fetch tile de Tegola (raw, todas las campanas)              │
│  8. Decodificar MVT protobuf                                    │  <-- NUEVO
│  9. Filtrar features: solo campaign_id del request              │  <-- NUEVO
│  10. Re-encodar MVT filtrado                                    │  <-- NUEVO
│  11. Responder con Cache-Control corto + ETag con version       │  <-- NUEVO
│                                                                 │
└────────┬────────────────────────────────────────────────────────┘
         │ SSE: { type: "geo_updated" }
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (TierraMap)                          │
│                                                                 │
│  12. Recibe SSE geo_updated                                     │  <-- NUEVO
│  13. Fuerza refetch de tiles visibles (cache bust)              │  <-- NUEVO
│  14. MapLibre re-renderiza con datos nuevos                     │
│  15. Priority layers ACTIVADOS con filtro campaign_id           │  <-- NUEVO
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Tiempo total estimado: QGIS save -> mapa actualizado en < 5 segundos**
- pg_notify: < 50ms
- Redis bump + SSE push: < 50ms
- Browser refetch tile: ~200-500ms (red local)
- Backend filter MVT: ~20-50ms
- MapLibre re-render: < 100ms

---

## 5. Plan de Implementacion por Fases

### Fase 1: Tile Filtering Seguro en el Backend

**Objetivo:** Resolver el data leak. Cada campana solo recibe sus propios datos en los tiles.

#### 1.1 Agregar dependencias MVT al backend

```bash
cd apps/backend && bun add pbf @mapbox/vector-tile
```

**Justificacion:** Son las mismas libs que usa MapLibre internamente (`pbf@4.0.1`, `@mapbox/vector-tile@2.0.4`). Probadas en produccion por millones de usuarios.

**Archivo:** `apps/backend/package.json`

#### 1.2 Crear modulo `tile-filter.ts`

**Archivo nuevo:** `apps/backend/src/modules/map/tile-filter.ts`

```typescript
/**
 * filterMvtByCampaign — Decodifica un tile MVT, filtra features por campaign_id,
 * y re-encoda el resultado.
 *
 * Layers base (departamentos, provincias, distritos) pasan sin filtrar (data publica de Peru).
 * Layers con campaign scope (priority_*, campaign_sectors) filtran por campaign_id.
 */
import Pbf from "pbf";
import { VectorTile } from "@mapbox/vector-tile";

const CAMPAIGN_SCOPED_LAYERS = new Set([
  "priority_departamentos",
  "priority_provincias",
  "priority_distritos",
  "campaign_sectors",
]);

export function filterMvtByCampaign(
  tileBuffer: Buffer,
  campaignId: string,
): Buffer {
  // 1. Decodificar
  const pbf = new Pbf(tileBuffer);
  const tile = new VectorTile(pbf);

  // 2. Construir nuevo tile filtrado
  const outPbf = new Pbf();

  for (const layerName of Object.keys(tile.layers)) {
    const layer = tile.layers[layerName];

    if (!CAMPAIGN_SCOPED_LAYERS.has(layerName)) {
      // Layer base: copiar sin filtrar
      // (copiar raw bytes del layer original)
      writeLayerRaw(outPbf, layer, layerName);
    } else {
      // Layer campaign-scoped: filtrar features
      writeLayerFiltered(outPbf, layer, layerName, campaignId);
    }
  }

  return Buffer.from(outPbf.finish());
}
```

> **Nota:** La implementacion exacta de `writeLayerRaw` y `writeLayerFiltered` requiere trabajar con el formato MVT protobuf a nivel de bytes. Hay dos opciones:
> - Usar `@maplibre/vt-pbf` para re-encodar (mas simple, ~20ms overhead)
> - Manipular bytes directamente con `pbf` (mas complejo, ~5ms overhead)
>
> Recomendar empezar con `@maplibre/vt-pbf` y optimizar despues si la latencia es problema.

#### 1.3 Nueva ruta de tiles autenticada

**Archivo:** `apps/backend/src/modules/map/routes.ts`

```typescript
// NUEVA RUTA — tiles filtrados por campana (autenticado)
app.get<{
  Params: { campaignId: string; z: string; x: string; y: string };
}>("/api/tiles/:campaignId/:z/:x/:y.vector.pbf", {
  preHandler: [app.authenticate],
  handler: async (request, reply) => {
    const { campaignId, z: zStr, x: xStr, y: yStr } = request.params;

    // Verificar pertenencia a campana
    if (!request.campaignPerms?.[campaignId] && request.userRole !== "admin") {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }

    // Validar z/x/y
    const z = parseTileParam(zStr, 0, 22);
    const x = parseTileParam(xStr, 0, (1 << (z ?? 0)) - 1);
    const y = parseTileParam(yStr, 0, (1 << (z ?? 0)) - 1);
    if (z === null || x === null || y === null || z < 3) {
      return reply.code(204).send();
    }

    // Fetch de Tegola (raw, todas las campanas)
    const upstream = `${tegolaBaseUrl}/maps/${tegolaMap}/${z}/${x}/${y}.vector.pbf`;
    const response = await fetchWithRetry(upstream, { timeout: env.requestTimeoutMs });

    if (!response.ok) {
      return reply.code(response.status).send();
    }

    // Buffer completo (necesario para decode/filter/encode)
    const rawBuffer = Buffer.from(await response.arrayBuffer());

    // Filtrar features por campaign_id
    const filtered = filterMvtByCampaign(rawBuffer, campaignId);

    // Geo version para ETag (invalidacion near-realtime)
    const version = await redisClient.get(`geo:version:${campaignId}`) ?? "0";

    reply
      .header("Content-Type", "application/x-protobuf")
      .header("Cache-Control", tileCacheControl(z))  // TTLs reducidos
      .header("ETag", `"t-${z}-${x}-${y}-${version}"`)
      .header("X-Tile-Zoom", z)
      .send(filtered);
  },
});
```

#### 1.4 Cache-Control reducido para near-realtime

**Archivo:** `apps/backend/src/modules/map/routes.ts`

```typescript
// ANTES (proxy legacy):
// z <= 7:  max-age=3600, stale-while-revalidate=600
// z 8-12: max-age=600,  stale-while-revalidate=600
// z 13+:  max-age=120,  stale-while-revalidate=600

// DESPUES (tiles filtrados):
function tileCacheControl(z: number): string {
  if (z <= 7)  return "public, max-age=60, stale-while-revalidate=30";
  if (z <= 12) return "public, max-age=30, stale-while-revalidate=30";
  return "public, max-age=10, stale-while-revalidate=10";
}
```

#### 1.5 Actualizar Nginx cache key

**Archivo:** `nginx/default.cloudflare-origin.conf.template`

```nginx
# ANTES:
# proxy_cache_key $uri;
# proxy_cache_valid 200 2h;

# DESPUES (la URI ya incluye campaignId en el path):
proxy_cache_key $uri;          # /api/tiles/{campaignId}/{z}/{x}/{y} ya es unico por campana
proxy_cache_valid 200 30s;     # Reducido para near-realtime
proxy_cache_valid 204 404 10s;
```

---

### Fase 2: Invalidacion Near-Realtime de Cache

**Objetivo:** Cuando el geografo guarda en QGIS, el mapa del candidato se actualiza en < 30s.

#### 2.1 Triggers pg_notify en tablas geo

**Archivo nuevo:** `apps/backend/migrations/0XX_geo_notify.sql`

```sql
-- Trigger function: notifica cambios geo al backend
CREATE OR REPLACE FUNCTION notify_geo_change() RETURNS trigger AS $$
DECLARE
  cid text;
BEGIN
  -- Extraer campaign_id del row afectado
  IF TG_OP = 'DELETE' THEN
    cid := OLD.campaign_id::text;
  ELSE
    cid := NEW.campaign_id::text;
  END IF;

  -- Payload: campaign_id:tabla:operacion
  PERFORM pg_notify('geo_change', cid || ':' || TG_TABLE_NAME || ':' || TG_OP);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger en campaign_priority_zones
CREATE TRIGGER trg_notify_cpz
  AFTER INSERT OR UPDATE OR DELETE ON campaign_priority_zones
  FOR EACH ROW EXECUTE FUNCTION notify_geo_change();

-- Trigger en campaign_custom_zones
CREATE TRIGGER trg_notify_ccz
  AFTER INSERT OR UPDATE OR DELETE ON campaign_custom_zones
  FOR EACH ROW EXECUTE FUNCTION notify_geo_change();
```

#### 2.2 Backend escucha LISTEN + bumps version en Redis

**Archivo nuevo:** `apps/backend/src/modules/map/geo-listener.ts`

```typescript
/**
 * geo-listener — Escucha pg_notify('geo_change') y:
 * 1. Bumps geo:version:{campaignId} en Redis
 * 2. Publica evento SSE a clientes conectados del dashboard
 */
import { Client } from "pg";
import { redisClient } from "../../infra/redis";

let listenClient: Client | null = null;

export async function startGeoListener(databaseUrl: string): Promise<void> {
  listenClient = new Client({ connectionString: databaseUrl });
  await listenClient.connect();
  await listenClient.query("LISTEN geo_change");

  listenClient.on("notification", async (msg) => {
    if (!msg.payload) return;

    const [campaignId, table, op] = msg.payload.split(":");
    if (!campaignId) return;

    // Bump version en Redis (timestamp como version)
    const version = Date.now().toString();
    await redisClient.set(`geo:version:${campaignId}`, version);

    // Publicar en Redis pub/sub para que todos los backends
    // (si hay multiples instancias) puedan emitir SSE
    await redisClient.publish("geo:updated", JSON.stringify({
      campaignId,
      table,
      operation: op,
      version,
    }));

    console.log(`[geo-listener] ${op} on ${table} for campaign ${campaignId} — version bumped to ${version}`);
  });

  // Reconexion en caso de desconexion
  listenClient.on("error", async (err) => {
    console.error("[geo-listener] Connection error:", err.message);
    // Reintentar despues de 3 segundos
    setTimeout(() => startGeoListener(databaseUrl), 3000);
  });
}

export async function stopGeoListener(): Promise<void> {
  if (listenClient) {
    await listenClient.end();
    listenClient = null;
  }
}
```

#### 2.3 Push al frontend via SSE

**Archivo:** `apps/backend/src/modules/map/routes.ts` (agregar endpoint SSE)

```typescript
// SSE endpoint para invalidacion de tiles geo
app.get("/api/geo/stream", {
  preHandler: [app.authenticate],
  handler: async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Suscribirse a Redis pub/sub para geo:updated
    const subscriber = redisClient.duplicate();
    await subscriber.connect();

    await subscriber.subscribe("geo:updated", (message) => {
      const data = JSON.parse(message);
      // Solo enviar si el usuario pertenece a la campana
      if (request.campaignPerms?.[data.campaignId] || request.userRole === "admin") {
        reply.raw.write(`event: geo_updated\ndata: ${message}\n\n`);
      }
    });

    // Heartbeat cada 30s
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 30_000);

    // Cleanup al cerrar conexion
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      subscriber.unsubscribe("geo:updated");
      subscriber.disconnect();
    });
  },
});
```

---

### Fase 3: Activar Priority Layers en el Frontend

**Objetivo:** Las zonas prioritarias de la campana se renderizan en el mapa (hoy estan deshabilitadas).

#### 3.1 Habilitar filtros de priority en `use-drill-filters.ts`

**Archivo:** `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/hooks/use-drill-filters.ts`

```typescript
// ANTES (lineas 76-79):
const priorityDepFilter: FilterSpecification = HIDE_FILTER;
const priorityProvFilter: FilterSpecification = HIDE_FILTER;
const priorityDistFilter: FilterSpecification = HIDE_FILTER;

// DESPUES:
const campaignFilter: FilterSpecification = campaignId
  ? ["==", ["get", "campaign_id"], campaignId]
  : HIDE_FILTER;

// Priority deps visibles cuando estamos en nivel departamento o superior
const priorityDepFilter: FilterSpecification = campaignId
  ? campaignFilter  // Mostrar siempre (filtro solo por campaign)
  : HIDE_FILTER;

// Priority provs visibles cuando drill >= nivel provincia
const priorityProvFilter: FilterSpecification = campaignId
  ? (drillState.depCode
    ? ["all", campaignFilter, ["==", ["get", "coddep"], drillState.depCode]]
    : campaignFilter)
  : HIDE_FILTER;

// Priority dists visibles cuando drill >= nivel distrito
const priorityDistFilter: FilterSpecification = campaignId
  ? (drillState.provCode
    ? ["all", campaignFilter, ["==", ["get", "codprov_full"], drillState.provCode]]
    : drillState.depCode
      ? ["all", campaignFilter, ["==", ["get", "coddep"], drillState.depCode]]
      : campaignFilter)
  : HIDE_FILTER;
```

#### 3.2 Actualizar tile URL con campaignId

**Archivo:** `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/constants.ts`

```typescript
// ANTES:
export const DEFAULT_TILE_TEMPLATE = "/api/tiles/{z}/{x}/{y}.vector.pbf";

// DESPUES:
// El template ahora requiere campaignId, que se inyecta en tierra-map.tsx
export const TILE_TEMPLATE = (campaignId: string) =>
  `/api/tiles/${campaignId}/{z}/{x}/{y}.vector.pbf`;
```

**Archivo:** `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/tierra-map.tsx`

```typescript
// ANTES (linea 208):
setTileUrl(`${window.location.origin}${DEFAULT_TILE_TEMPLATE}`);

// DESPUES:
setTileUrl(`${window.location.origin}${TILE_TEMPLATE(campaignId)}`);
```

#### 3.3 Listener de invalidacion geo en TierraMap

**Archivo:** `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/tierra-map.tsx`

Agregar hook para escuchar SSE de cambios geo:

```typescript
// Nuevo hook: useGeoInvalidation
useEffect(() => {
  if (!campaignId) return;

  const controller = new AbortController();

  const connect = async () => {
    try {
      const res = await fetch("/api/geo/stream", {
        credentials: "same-origin",
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        if (text.includes("geo_updated")) {
          // Forzar refetch de tiles visibles
          const source = mapRef.current?.getSource("peru");
          if (source && "setTiles" in source) {
            const bustUrl = `${window.location.origin}${TILE_TEMPLATE(campaignId)}&_=${Date.now()}`;
            (source as any).setTiles([bustUrl]);
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        // Reconectar con backoff exponencial
        setTimeout(connect, 5000);
      }
    }
  };

  connect();
  return () => controller.abort();
}, [campaignId]);
```

---

### Fase 4: Mejoras al Flujo QGIS

**Objetivo:** Documentar y optimizar el workflow del geografo.

#### 4.1 Vista QGIS filtrada por campana

Las vistas actuales ya exponen `campaign_name` como columna. Documentar que el geografo DEBE:

1. Agregar la capa `v_qgis_dep_priority` en QGIS
2. Aplicar filtro: `"campaign_name" = 'Nombre de la Campana'`
3. Editar el campo `is_priority` y `priority` directamente en la tabla de atributos
4. Guardar cambios (Ctrl+S)
5. Verificar en el dashboard que el cambio aparece en < 30s

#### 4.2 Feedback loop visual

El geografo puede tener el dashboard (`/candidatos/[slug]/tierra/`) abierto en un segundo monitor:

```
Monitor 1: QGIS                    Monitor 2: Dashboard
  Edita poligono ─────────────────> Aparece en < 30s
  Marca priority ─────────────────> Zona se pinta de rojo
  Dibuja sector  ─────────────────> Sector aparece en drill z10+
```

---

## 6. Archivos a Crear/Modificar (Resumen)

### Archivos nuevos

| Archivo | Fase | Proposito |
|---------|------|-----------|
| `apps/backend/src/modules/map/tile-filter.ts` | 1.2 | Decodificar/filtrar/recodificar MVT por campaign_id |
| `apps/backend/src/modules/map/geo-listener.ts` | 2.2 | LISTEN pg_notify + bump Redis version + pub/sub |
| `apps/backend/migrations/0XX_geo_notify.sql` | 2.1 | Triggers pg_notify en tablas geo |

### Archivos modificados

| Archivo | Fase | Cambio |
|---------|------|--------|
| `apps/backend/package.json` | 1.1 | Agregar `pbf`, `@mapbox/vector-tile` |
| `apps/backend/src/modules/map/routes.ts` | 1.3, 2.3 | Nueva ruta autenticada + SSE endpoint |
| `nginx/default.cloudflare-origin.conf.template` | 1.5 | Cache TTL reducido |
| `apps/web/.../hooks/use-drill-filters.ts` | 3.1 | Activar priority filters |
| `apps/web/.../constants.ts` | 3.2 | Tile URL con campaignId |
| `apps/web/.../tierra-map.tsx` | 3.2, 3.3 | Tile URL dinamica + SSE listener |
| `apps/backend/src/app.ts` | 2.2 | Iniciar geo-listener al arrancar |
| `docs/qgis-connection-guide.md` | 4.1 | Actualizar flujo documentado |

---

## 7. Riesgos y Mitigaciones

| Riesgo | Prob. | Impacto | Mitigacion |
|--------|-------|---------|------------|
| MVT decode/encode agrega latencia (+20-50ms) | Alta | Bajo | Solo filtrar layers campaign-scoped (4 de 7), pasar layers base sin tocar. Tiles son 10-100KB. |
| Buffer de tiles consume mas RAM que streaming | Media | Bajo | Con 1-3 campanas y tiles de 10-100KB, el overhead es despreciable (~30MB max en pico). |
| pg_notify se pierde si backend reinicia | Media | Medio | Al reconectar LISTEN, bump version global para invalidar todo el cache. |
| QGIS desconexion (red inestable) | Media | Medio | QGIS maneja reconexion nativa a PostgreSQL. Datos no se pierden. |
| Tegola Redis cache sirve tile viejo al backend | Alta | Medio | Evaluar: (a) reducir TTL del cache Redis de Tegola, o (b) agregar endpoint de purge si Tegola lo soporta. |
| Multiples backends (scaling) | Baja | Medio | Redis pub/sub ya maneja broadcast. Cada instancia escucha y emite SSE. |

### Riesgo especial: Tegola Redis Cache

El cache Redis de Tegola es el cuello de botella para near-realtime. Tegola no expone API de purge. Opciones:

1. **Deshabilitar cache Redis de Tegola** — Tegola consulta PostGIS en cada request. Con 1-3 campanas y trafico bajo, es viable. Los tiles siguen cacheados en Nginx y browser.
2. **TTL corto en Tegola** — No es configurable por layer; es global.
3. **Flush manual via Redis CLI** — `FLUSHDB` en la DB de Tegola cuando hay cambio geo. Brutal pero efectivo para 1-3 campanas.
4. **Selective key delete** — Buscar keys de Tegola por patron y borrar las afectadas. Requiere conocer el formato de key de Tegola.

**Recomendacion:** Opcion 1 (deshabilitar cache Redis de Tegola). Con el cache de Nginx (30s) y browser como capas de cache, Tegola no necesita su propio cache para 1-3 campanas.

```toml
# tegola/config.toml — ANTES:
[cache]
type = "redis"
uri = "redis://:${REDIS_PASSWORD}@redis:6379/0"
max_zoom = 14

# DESPUES: Comentar/eliminar la seccion [cache]
# El caching lo manejan Nginx (disco, 30s) y el browser (Cache-Control)
```

---

## 8. Orden de Ejecucion Recomendado

| Prioridad | Fase | Esfuerzo | Impacto |
|-----------|------|----------|---------|
| **P0** | 3.1 — Activar priority layers | 30 min | Alto (habilita funcionalidad existente desactivada) |
| **P1** | 1.1-1.5 — Tile filtering seguro | 1-2 dias | Critico (resuelve data leak) |
| **P2** | 2.1-2.3 — Near-realtime | 1 dia | Alto (QGIS -> mapa en < 30s) |
| **P3** | 3.2-3.3 — Frontend tile URL + SSE | 0.5 dia | Alto (completa el flujo end-to-end) |
| **P4** | 4.1-4.2 — Mejoras QGIS UX | 0.5 dia | Medio (documentacion + workflow) |
| **Total** | | **3-4 dias** | |

---

## 9. Definition of Done

| Check | Criterio |
|-------|----------|
| Seguridad | Tiles de campana A no contienen features de campana B (verificar con `pbf` decode en test) |
| Auth | `GET /api/tiles/:campaignId/...` retorna 401 sin JWT, 403 si no pertenece a campana |
| Near-realtime | Cambio en QGIS visible en dashboard en < 30 segundos (medir con cronometro) |
| Priority layers | Zonas priority se pintan de rojo en el mapa al nivel de drill correcto |
| Cache | Browser no sirve tiles stale despues de invalidacion SSE |
| Backend build | `bunx tsc --noEmit` sin errores |
| Web build | `bun run build` exitoso |
| Produccion | `curl /api/health` → 200, `curl /api/ready` → 200 |

---

## 10. Archivos de Referencia (Codebase Actual)

### Base de datos / Migraciones
- `apps/backend/migrations/009_campaign_priority_zones.sql` — Tablas campaign_priority_zones + campaign_custom_zones
- `apps/backend/migrations/010_qgis_priority_views.sql` — Vistas QGIS editables + INSTEAD OF triggers
- `apps/backend/migrations/011_organizational_model.sql` — Tabla zones (operacional, centro+radio)
- `apps/backend/migrations/025_ccz_geom_3857.sql` — Columna geom_3857 + trigger auto-sync

### Backend
- `apps/backend/src/modules/map/routes.ts` — Tile proxy + geo hierarchy + config endpoint
- `apps/backend/src/modules/map/geo-cache.ts` — Redis-cached PostGIS queries (bounds, reverse geocode)
- `apps/backend/src/modules/map/tiles.ts` — Tile parameter validator
- `apps/backend/src/infra/auth.ts` — JWT auth decorator
- `apps/backend/src/infra/authorize.ts` — RBAC + campaign scope checks
- `apps/backend/src/infra/redis.ts` — Redis client setup

### Tegola
- `tegola/config.toml` — 8 layers, Redis cache, zoom-adaptive simplification

### Docker / Nginx
- `docker-compose.yml` — Produccion (postgis/postgis:15-3.4, tegola, redis, nginx)
- `docker-compose.dev.yml` — Desarrollo local
- `nginx/default.cloudflare-origin.conf.template` — Tile disk cache (256MB, 2h TTL)

### Frontend (Tierra)
- `apps/web/app/(dashboard)/candidatos/[slug]/tierra/page.tsx` — Page container
- `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/tierra-map.tsx` — MapLibre component (446 lines)
- `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/constants.ts` — Map style, tile URL, Peru bounds
- `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/map-paint-constants.ts` — Static paint/layout objects
- `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/hooks/use-drill-filters.ts` — 5-level drill-down filter logic
- `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/hooks/use-map-click.ts` — Map click handler
- `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/hooks/use-map-sources.ts` — GeoJSON sources
- `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/hooks/use-zone-tooltip.ts` — Zone name tooltip
- `apps/web/lib/services/geo.ts` — Web client for geo hierarchy + reverse geocode

### QGIS / Scripts
- `docs/qgis-connection-guide.md` — Guia de conexion QGIS
- `scripts/import_priority_zones.ts` — CLI GeoJSON importer
- `scripts/populate-geo-names.sql` — Province name population
