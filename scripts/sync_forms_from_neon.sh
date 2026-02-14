#!/usr/bin/env bash

set -euo pipefail

if [[ -f "/srv/app/.env" ]]; then
	ENV_FILE="/srv/app/.env"
elif [[ -f ".env" ]]; then
	ENV_FILE=".env"
else
	echo "[forms-sync] no se encontro .env" >&2
	exit 1
fi

read_env() {
	python3 - "$ENV_FILE" "$1" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]

for raw in path.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    if k.strip() != key:
        continue
    value = v.strip()
    if (value.startswith("\"") and value.endswith("\"")) or (value.startswith("'") and value.endswith("'")):
        value = value[1:-1]
    print(value)
    raise SystemExit(0)

raise SystemExit(1)
PY
}

PROJECT_DIR="$(read_env PROJECT_DIR || true)"
POSTGRES_DB="$(read_env POSTGRES_DB || true)"
POSTGRES_USER="$(read_env POSTGRES_USER || true)"
NEON_FORMS_SOURCE_DSN="$(read_env NEON_FORMS_SOURCE_DSN || true)"

PROJECT_DIR="${PROJECT_DIR:-/srv/app}"

if [[ -z "$POSTGRES_DB" || -z "$POSTGRES_USER" || -z "$NEON_FORMS_SOURCE_DSN" ]]; then
	echo "[forms-sync] faltan variables requeridas: POSTGRES_DB/POSTGRES_USER/NEON_FORMS_SOURCE_DSN" >&2
	exit 1
fi

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
	-v ON_ERROR_STOP=1 \
	-v neon_dsn="${NEON_FORMS_SOURCE_DSN}" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS dblink;

CREATE TABLE IF NOT EXISTS public.forms (
	nombre text NOT NULL,
	telefono text NOT NULL,
	fecha timestamptz NOT NULL,
	x double precision NOT NULL,
	y double precision NOT NULL,
	zona text NOT NULL,
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	candidate text NOT NULL DEFAULT '',
	encuestador text NOT NULL,
	encuestador_id text NOT NULL,
	candidato_preferido text NOT NULL,
	client_id text,
	created_at timestamptz NOT NULL DEFAULT now(),
	home_maps_url text,
	polling_place_url text,
	comentarios text
);

CREATE UNIQUE INDEX IF NOT EXISTS forms_client_id_key ON public.forms (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS forms_client_id_idx ON public.forms (client_id);

INSERT INTO public.forms (
	nombre,
	telefono,
	fecha,
	x,
	y,
	zona,
	id,
	candidate,
	encuestador,
	encuestador_id,
	candidato_preferido,
	client_id,
	created_at,
	home_maps_url,
	polling_place_url,
	comentarios
)
SELECT
	nombre,
	telefono,
	fecha,
	x,
	y,
	zona,
	id,
	candidate,
	encuestador,
	encuestador_id,
	candidato_preferido,
	client_id,
	created_at,
	home_maps_url,
	polling_place_url,
	comentarios
FROM dblink(
	:'neon_dsn',
	' SELECT nombre, telefono, fecha, x, y, zona, id, candidate, encuestador, encuestador_id, candidato_preferido, client_id, created_at, home_maps_url, polling_place_url, comentarios FROM public.forms '
) AS src(
	nombre text,
	telefono text,
	fecha timestamptz,
	x double precision,
	y double precision,
	zona text,
	id uuid,
	candidate text,
	encuestador text,
	encuestador_id text,
	candidato_preferido text,
	client_id text,
	created_at timestamptz,
	home_maps_url text,
	polling_place_url text,
	comentarios text
)
ON CONFLICT (id) DO NOTHING;

SELECT COUNT(*)::int AS forms_count FROM public.forms;
SQL

echo "[forms-sync] sync completado"
