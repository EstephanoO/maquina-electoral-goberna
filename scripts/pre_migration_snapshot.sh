#!/usr/bin/env bash

set -euo pipefail

if [[ -f "/srv/app/.env" ]]; then
	# shellcheck disable=SC1091
	source /srv/app/.env
elif [[ -f ".env" ]]; then
	# shellcheck disable=SC1091
	source .env
else
	echo "[pre-migration] no se encontro .env" >&2
	exit 1
fi

PROJECT_DIR="${PROJECT_DIR:-/srv/app}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups}"
POSTGRES_DB="${POSTGRES_DB:?POSTGRES_DB es requerido}"
POSTGRES_USER="${POSTGRES_USER:?POSTGRES_USER es requerido}"

mkdir -p "${BACKUP_DIR}"

TS="$(date +%F_%H-%M-%S)"
BASE="${BACKUP_DIR}/pre_migration_${POSTGRES_DB}_${TS}"

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip >"${BASE}.full.sql.gz"

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	pg_dump -U "${POSTGRES_USER}" --schema-only "${POSTGRES_DB}" | gzip >"${BASE}.schema.sql.gz"

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	pg_dumpall -U "${POSTGRES_USER}" --globals-only | gzip >"${BASE}.globals.sql.gz"

python3 - "${BASE}.full.sql.gz" "${BASE}.schema.sql.gz" "${BASE}.globals.sql.gz" >"${BASE}.sha256" <<'PY'
from pathlib import Path
import hashlib
import sys

for item in sys.argv[1:]:
    p = Path(item)
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    print(f"{digest}  {p.name}")
PY

echo "[pre-migration] snapshot listo: ${BASE}.*"
