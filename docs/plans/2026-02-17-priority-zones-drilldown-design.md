# Priority Zones Drill-Down System Design

> Date: 2026-02-17
> Status: Approved
> Scope: PostGIS + Tegola + Frontend (tierra page)

## Problem

Each candidate/campaign has priority geographic zones at multiple administrative levels. Currently these exist as static GeoJSON files in `public/geo/` with no backend integration. The tierra map page needs hierarchical drill-down navigation through these zones, served as vector tiles from PostGIS via Tegola.

## Architecture

```
QGIS --SSH Tunnel--> PostgreSQL/PostGIS
Script import -----> PostgreSQL/PostGIS
                          |
                      Tegola (Redis cache)
                          |
                      Backend (tile proxy)
                          |
                      Frontend (tierra-map drill-down)
```

## Data Model

### campaign_priority_zones (references to base map)

For departamentos/provincias/distritos — stores only zone codes, JOINs with existing `peru_*` tables for geometry.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| campaign_id | UUID FK | References campaigns |
| zone_level | TEXT | 'departamento' / 'provincia' / 'distrito' |
| zone_code | TEXT | CODDEP / CODPROV_FULL / UBIGEO |
| priority | INT DEFAULT 1 | For ordering/coloring intensity |
| metadata | JSONB | Future: ArcGIS metrics, notes |
| created_at | TIMESTAMPTZ | |
| UNIQUE | | (campaign_id, zone_level, zone_code) |

### campaign_custom_zones (own geometry)

For sectors/subsectors — stores actual geometry because these don't exist in the INEI base map.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| campaign_id | UUID FK | References campaigns |
| zone_level | TEXT | 'sector' / 'subsector' |
| zone_code | TEXT | UBIGEO of parent distrito |
| zone_name | TEXT | "Sector 1", "Subsector 4" |
| sector | INT | Sector number |
| subsector | INT NULL | Subsector number (null for sectors) |
| parent_code | TEXT | UBIGEO of containing distrito |
| population | INT | From GeoJSON POBLACION field |
| metadata | JSONB | Future: ArcGIS data |
| geom | GEOMETRY(MultiPolygon, 3857) | Own geometry |
| source | TEXT DEFAULT 'import' | 'import' / 'arcgis' / 'qgis' |
| created_at | TIMESTAMPTZ | |
| UNIQUE | | (campaign_id, zone_level, zone_code, sector, subsector) |

## Tegola Layers

All in existing map `peru`. Campaign filtering done client-side via MapLibre `filter`.

| Layer | Source | SQL JOIN | Zoom |
|-------|--------|----------|------|
| priority_departamentos | peru_departamentos JOIN campaign_priority_zones | zone_level='departamento' | 3-20 |
| priority_provincias | peru_provincias JOIN campaign_priority_zones | zone_level='provincia' | 5-20 |
| priority_distritos | peru_distritos JOIN campaign_priority_zones | zone_level='distrito' | 8-20 |
| campaign_sectors | campaign_custom_zones | sector + subsector levels | 10-20 |

All layers include `campaign_id` as a property for client-side filtering:
```js
filter: ["==", ["get", "campaign_id"], currentCampaignId]
```

Redis caches one tile set for all campaigns. Few campaigns = negligible tile size overhead.

## Import Script

`scripts/import_priority_zones.ts`

```bash
# Reference levels (no geometry stored)
bun run scripts/import_priority_zones.ts --campaign=rocio --level=departamento --file=public/geo/abuelo_rocio.geojson --replace
bun run scripts/import_priority_zones.ts --campaign=rocio --level=provincia --file=public/geo/padre_rocio.geojson --replace
bun run scripts/import_priority_zones.ts --campaign=rocio --level=distrito --file=public/geo/hijo_rocio.geojson --replace

# Custom geometry levels
bun run scripts/import_priority_zones.ts --campaign=giovanna-castagnino --level=sector --file=public/geo/nieto_giovanna.geojson --replace
bun run scripts/import_priority_zones.ts --campaign=giovanna-castagnino --level=subsector --file=public/geo/bisnieto_giovanna_v1.geojson --replace
```

Options: `--dry-run`, `--replace`, `--validate`

## Frontend Drill-Down

State machine in tierra-map.tsx:

- **Level 0 (Peru):** Base departamentos + highlighted priority_departamentos. Click priority depto → Level 1.
- **Level 1 (Departamento):** Provincias of selected depto + highlighted priority_provincias. Click → Level 2.
- **Level 2 (Provincia):** Distritos of selected provincia + highlighted priority_distritos. Click → Level 3 if sectors exist.
- **Level 3 (Distrito):** campaign_sectors of selected distrito. Click → Level 4 if subsectors exist.
- **Level 4 (Sector):** campaign_sectors subsectors of selected sector.

Navigation: clickable breadcrumb, click empty space to go back one level. fitBounds + fly-to on each transition. Clusters and agents remain visible at all levels.

## QGIS Connection

SSH tunnel — no infra changes needed:
```bash
ssh -L 5432:localhost:5432 -i ~/.ssh/id_ed25519 deploy@161.132.39.165
```
QGIS connects to `localhost:5432`, edits `campaign_priority_zones` and `campaign_custom_zones` directly.

## Bug Fix: CAPAS Sidebar Overlap

Root cause: tierra page uses `position: fixed; inset: 0` starting at left:0, but collapsed sidebar is 52px wide at zIndex:999. Fix: change to `left: 52px` on tierra routes.

## Implementation Order

1. Fix CAPAS sidebar overlap
2. SQL migration (009)
3. Import script
4. Run import on VPS
5. Tegola config update
6. Frontend drill-down
7. QGIS docs
