# Nexus Backend — v0.1.0 (Postgres)

API REST para el CRM. Node + Express + TypeScript + Postgres.

## Requisitos

- Node 22+
- Docker (para el Postgres local)

## Primer arranque

```bash
# 1. copia el env de ejemplo
cp .env.example .env

# 2. levanta Postgres local (puerto 5433 en host)
npm run db:up

# 3. instala deps
npm install

# 4. arranca el API (corre migrations automáticamente al boot)
npm run dev       # → http://localhost:4000
```

Las migrations se aplican solas al iniciar. Si quieres correrlas manualmente:

```bash
npm run migrate
```

## Importar datos legacy

Si tienes un `nexus.db.json` de la versión anterior (JSON store), puedes migrarlo:

```bash
npm run import-json
```

Es idempotente — lo puedes re-correr sin duplicar.

## Estructura

```
backend/
├── migrations/
│   └── 001_initial.sql       # schema
├── src/
│   ├── sql.ts                # pool Postgres (postgres.js)
│   ├── migrate.ts            # runner simple con tabla _migrations
│   ├── db.ts                 # data access layer (async)
│   ├── import-json.ts        # migración one-shot del JSON legacy
│   └── index.ts              # rutas Express + boot
├── docker-compose.dev.yml    # Postgres para desarrollo
├── .env                      # secrets locales (git-ignored)
└── .env.example
```

## Endpoints

| Método | Ruta                        | Descripción                               |
| ------ | --------------------------- | ----------------------------------------- |
| GET    | `/health`                   | Healthcheck + ping a Postgres             |
| GET    | `/leads`                    | Lista con filtros (`q`, `stage`, `course`, `level`, `year`, `tag`, `assigned_to`) |
| GET    | `/leads/:id`                | Detalle + campos computados               |
| GET    | `/leads/by-phone/:phone`    | Búsqueda por teléfono normalizado         |
| POST   | `/leads`                    | Upsert por teléfono                       |
| PATCH  | `/leads/:id`                | Update parcial (genera `stage_change` si cambia) |
| DELETE | `/leads/:id`                | Borra lead + interactions + sends         |
| GET    | `/leads/:id/interactions`   | Historial                                 |
| POST   | `/leads/:id/interactions`   | Añadir nota/evento                        |
| POST   | `/messages`                 | Registra mensaje (usado por la extensión) |
| GET/POST/PATCH/DELETE | `/templates[/:id]` | CRUD de templates                         |
| GET/POST/PATCH/DELETE | `/sends[/:id]`     | Cola de envíos                            |
| GET    | `/stats`                    | Totales por etapa/curso                   |

## Campos computados en Lead

Se calculan on-the-fly en SQL (LATERAL JOIN) al leer:

- `last_contacted_at` — timestamp del último `message_out` o `note`
- `days_since_contact` — entero, días desde esa fecha
- `was_previously_interested` — `true` si el lead estuvo en etapa `interested` y salió a algo ≠ `sold`

## Comandos útiles

```bash
npm run dev          # API + tsx watch
npm run migrate      # aplicar migrations manualmente
npm run import-json  # migrar nexus.db.json legacy
npm run db:up        # levantar Postgres local
npm run db:down      # bajar Postgres
npm run db:logs      # ver logs del Postgres
```

## Connect al Postgres local

```bash
docker exec -it nexus_leads_db_dev psql -U nexus -d nexus_leads
```
