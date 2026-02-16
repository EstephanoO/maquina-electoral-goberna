# AGENTS.md - Modulo MAP/TEGOLA (Sistema Completo)

> **Hereda de:** `/AGENTS.md` (root)  
> **Referencia:** `/docs/MODULES.md`  
> **Alcance:** Tiles vectoriales en Backend + Web (+ Mobile futuro)

---

## Proposito

Servir mapas vectoriales de Peru (departamentos, provincias, distritos) via:
- Proxy a Tegola para tiles MVT
- Configuracion de capas para clientes
- Cache y revalidacion eficiente

---

## Componentes por App

### Backend (`apps/backend/src/modules/map/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `routes.ts` | Endpoints: config, capabilities, tiles |
| `tiles.ts` | Proxy a Tegola con cache headers |

### Web (`apps/web/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/(dashboard)/map/page.tsx` | MapLibre GL JS con tiles |

### Infraestructura

| Servicio | Responsabilidad |
|----------|-----------------|
| **Tegola** | Servidor de tiles MVT |
| **PostgreSQL + PostGIS** | Geometrias de Peru |

---

## Arquitectura de Tiles

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MAP ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  WEB                           BACKEND                TEGOLA        │
│  ───                           ───────                ──────        │
│                                                                      │
│  MapLibre GL JS                                                      │
│       │                                                              │
│       │ 1. GET /api/config                                           │
│       │    (obtener URL de tiles)                                    │
│       └─────────────────────────►  routes.ts                         │
│                                       │                              │
│       ◄─── { tile_url, layers } ─────┘                              │
│       │                                                              │
│       │ 2. GET /api/tiles/:z/:x/:y.vector.pbf                        │
│       │    (para cada tile visible)                                  │
│       └─────────────────────────►  tiles.ts                         │
│                                       │                              │
│                                       │ GET /:map/:z/:x/:y.pbf       │
│                                       └─────────────────────────────►│
│                                                                      │
│                                       ◄─── MVT binary ──────────────│
│                                       │                              │
│                                   Propagar headers:                  │
│                                   - ETag                             │
│                                   - Last-Modified                    │
│                                   - Cache-Control                    │
│                                       │                              │
│       ◄─── MVT tile ─────────────────┘                              │
│       │                                                              │
│       ▼                                                              │
│  Render en canvas                                                    │
│  (departamentos, provincias,                                         │
│   distritos como vectores)                                           │
│                                                                      │
│                                                                      │
│  POSTGRESQL + POSTGIS                                                │
│  ────────────────────                                                │
│                                                                      │
│  peru_departamentos ◄──────────────────────────────── Tegola         │
│  peru_provincias    ◄──────────────────────────────── lee y         │
│  peru_distritos     ◄──────────────────────────────── genera MVT    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Contratos API

### GET /api/config

**Auth:** No requerido

```typescript
// Response 200
{
  ok: true,
  map: "peru",
  tile_url: "/api/tiles/{z}/{x}/{y}.vector.pbf",
  layers: [
    { id: "departamentos", source_layer: "peru_departamentos" },
    { id: "provincias", source_layer: "peru_provincias" },
    { id: "distritos", source_layer: "peru_distritos" }
  ],
  center: [-76.0, -9.5],
  zoom: 5,
  bounds: [-81.4, -18.4, -68.7, -0.1]
}
```

### GET /api/capabilities

**Auth:** No requerido

```typescript
// Response 200 (proxy de Tegola /capabilities)
{
  maps: [{
    name: "peru",
    layers: [...]
  }]
}
```

### GET /api/tiles/:z/:x/:y.vector.pbf

**Auth:** No requerido (tiles publicos)

```typescript
// Response 200
// Content-Type: application/vnd.mapbox-vector-tile
// Headers: ETag, Last-Modified, Cache-Control
// Body: Binary MVT

// Response 304 (Not Modified)
// Si If-None-Match coincide con ETag

// Response 404
// Si tile no existe o coordenadas invalidas
```

---

## Configuracion Tegola

```toml
# tegola/config.toml

[webserver]
port = ":8080"

[cache]
type = "redis"
host = "redis"
port = 6379

[[providers]]
name = "peru_provider"
type = "postgis"
host = "postgres"
port = 5432
database = "appdb"
user = "appuser"
password = "${POSTGRES_PASSWORD}"
srid = 4326

[[providers.layers]]
name = "peru_departamentos"
tablename = "peru_departamentos"
id_fieldname = "gid"
geometry_fieldname = "geom"

[[providers.layers]]
name = "peru_provincias"
tablename = "peru_provincias"
id_fieldname = "gid"
geometry_fieldname = "geom"

[[providers.layers]]
name = "peru_distritos"
tablename = "peru_distritos"
id_fieldname = "gid"
geometry_fieldname = "geom"

[[maps]]
name = "peru"
center = [-76.0, -9.5, 5]

[[maps.layers]]
provider_layer = "peru_provider.peru_departamentos"
min_zoom = 0
max_zoom = 8

[[maps.layers]]
provider_layer = "peru_provider.peru_provincias"
min_zoom = 6
max_zoom = 12

[[maps.layers]]
provider_layer = "peru_provider.peru_distritos"
min_zoom = 9
max_zoom = 22
```

---

## Tablas PostGIS

```sql
-- peru_departamentos
CREATE TABLE peru_departamentos (
  gid SERIAL PRIMARY KEY,
  departamento VARCHAR(255),
  capital VARCHAR(255),
  ubigeo VARCHAR(6),
  geom GEOMETRY(MULTIPOLYGON, 4326)
);

-- peru_provincias
CREATE TABLE peru_provincias (
  gid SERIAL PRIMARY KEY,
  provincia VARCHAR(255),
  departamento VARCHAR(255),
  ubigeo VARCHAR(6),
  geom GEOMETRY(MULTIPOLYGON, 4326)
);

-- peru_distritos
CREATE TABLE peru_distritos (
  gid SERIAL PRIMARY KEY,
  distrito VARCHAR(255),
  provincia VARCHAR(255),
  departamento VARCHAR(255),
  ubigeo VARCHAR(6),
  geom GEOMETRY(MULTIPOLYGON, 4326)
);

-- Indices espaciales
CREATE INDEX idx_departamentos_geom ON peru_departamentos USING GIST(geom);
CREATE INDEX idx_provincias_geom ON peru_provincias USING GIST(geom);
CREATE INDEX idx_distritos_geom ON peru_distritos USING GIST(geom);
```

---

## Variables de Entorno (Backend)

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `TEGOLA_BASE_URL` | `http://localhost:8080` | URL interna de Tegola |
| `TEGOLA_MAP` | `peru` | Nombre del mapa en Tegola |
| `REQUEST_TIMEOUT_MS` | `5000` | Timeout para proxy |
| `UPSTREAM_RETRIES` | `2` | Reintentos a Tegola |

---

## Web: MapLibre Integration

```typescript
// apps/web/app/(dashboard)/map/page.tsx (conceptual)

import maplibregl from 'maplibre-gl';

// 1. Obtener config
const config = await fetch('/api/config').then(r => r.json());

// 2. Crear mapa
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      peru: {
        type: 'vector',
        tiles: [config.tile_url],
        minzoom: 0,
        maxzoom: 22
      }
    },
    layers: [
      {
        id: 'departamentos-fill',
        type: 'fill',
        source: 'peru',
        'source-layer': 'peru_departamentos',
        paint: {
          'fill-color': '#627BC1',
          'fill-opacity': 0.5
        }
      },
      {
        id: 'departamentos-line',
        type: 'line',
        source: 'peru',
        'source-layer': 'peru_departamentos',
        paint: {
          'line-color': '#333',
          'line-width': 1
        }
      }
      // ... provincias, distritos
    ]
  },
  center: config.center,
  zoom: config.zoom
});
```

---

## Readiness Check

El endpoint `/api/ready` verifica que Tegola responda:

```typescript
// apps/backend/src/modules/health/routes.ts

async function checkTegola(): Promise<boolean> {
  try {
    const res = await fetch(`${env.tegolaBaseUrl}/capabilities`, {
      signal: AbortSignal.timeout(env.requestTimeoutMs)
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

---

## Checklist de Cambios

Al modificar map/tegola, verificar:

- [ ] Backend: `bunx tsc --noEmit` sin errores
- [ ] Backend: `/api/config` retorna config valida
- [ ] Backend: `/api/tiles/5/9/15.vector.pbf` retorna tile
- [ ] Backend: `/api/ready` incluye check de Tegola
- [ ] Backend: Cache headers se propagan correctamente
- [ ] Web: Mapa carga y renderiza Peru
- [ ] Web: Zoom muestra provincias/distritos
- [ ] Tegola: Container healthy en docker ps
- [ ] PostGIS: Tablas tienen datos y indices espaciales
