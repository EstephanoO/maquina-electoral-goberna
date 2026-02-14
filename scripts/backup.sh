#!/usr/bin/env bash

set -euo pipefail

if [[ -f "/srv/app/.env" ]]; then
	# shellcheck disable=SC1091
	source /srv/app/.env
elif [[ -f ".env" ]]; then
	# shellcheck disable=SC1091
	source .env
else
	echo "[backup] no se encontro .env" >&2
	exit 1
fi

PROJECT_DIR="${PROJECT_DIR:-/srv/app}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
POSTGRES_DB="${POSTGRES_DB:?POSTGRES_DB es requerido}"
POSTGRES_USER="${POSTGRES_USER:?POSTGRES_USER es requerido}"

mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +%F_%H-%M-%S)"
BACKUP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip >"${BACKUP_FILE}"

find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -delete

echo "[backup] generado: ${BACKUP_FILE}"
