#!/usr/bin/env bash

set -euo pipefail

if [[ -f "/srv/app/.env" ]]; then
	# shellcheck disable=SC1091
	source /srv/app/.env
elif [[ -f ".env" ]]; then
	# shellcheck disable=SC1091
	source .env
else
	echo "[backup-verify] no se encontro .env" >&2
	exit 1
fi

PROJECT_DIR="${PROJECT_DIR:-/srv/app}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups}"
POSTGRES_DB="${POSTGRES_DB:?POSTGRES_DB es requerido}"
POSTGRES_USER="${POSTGRES_USER:?POSTGRES_USER es requerido}"
MIN_BYTES="${BACKUP_MIN_BYTES:-1000000}"

latest_backup="$(
	python3 - "${BACKUP_DIR}" "${POSTGRES_DB}" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
db_name = sys.argv[2]
files = sorted([x for x in p.glob("*.sql.gz") if x.is_file()], key=lambda x: x.stat().st_mtime, reverse=True)
eligible = [x for x in files if x.name.startswith(f"{db_name}_")]
print(eligible[0] if eligible else "")
PY
)"

if [[ -z "${latest_backup}" ]]; then
	echo "[backup-verify] no hay backups en ${BACKUP_DIR}" >&2
	exit 1
fi

size_bytes="$(
	python3 - "${latest_backup}" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
print(p.stat().st_size)
PY
)"

if ((size_bytes < MIN_BYTES)); then
	echo "[backup-verify] backup muy chico: ${size_bytes} bytes (${latest_backup})" >&2
	exit 1
fi

gzip -t "${latest_backup}"

tmp_db="verify_${POSTGRES_DB}_$(date +%Y%m%d_%H%M%S)"

cleanup() {
	docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
		psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS \"${tmp_db}\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE \"${tmp_db}\";" >/dev/null

gunzip -c "${latest_backup}" | docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	psql -U "${POSTGRES_USER}" -d "${tmp_db}" >/dev/null

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	psql -U "${POSTGRES_USER}" -d "${tmp_db}" -c "SELECT now() AS restored_at;" >/dev/null

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	psql -U "${POSTGRES_USER}" -d "${tmp_db}" -c "SELECT COUNT(*) AS forms_rows FROM forms;" >/dev/null

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	psql -U "${POSTGRES_USER}" -d "${tmp_db}" -c "SELECT COUNT(*) AS live_rows FROM agent_locations_live;" >/dev/null

echo "[backup-verify] OK backup=${latest_backup} size=${size_bytes}"
