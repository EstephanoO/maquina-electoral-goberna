#!/usr/bin/env bash

set -euo pipefail

if [[ -f "/srv/app/.env" ]]; then
	# shellcheck disable=SC1091
	source /srv/app/.env
elif [[ -f ".env" ]]; then
	# shellcheck disable=SC1091
	source .env
else
	echo "[restore-test] no se encontro .env" >&2
	exit 1
fi

PROJECT_DIR="${PROJECT_DIR:-/srv/app}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups}"
POSTGRES_USER="${POSTGRES_USER:?POSTGRES_USER es requerido}"
POSTGRES_DB="${POSTGRES_DB:?POSTGRES_DB es requerido}"
TMP_DB="${POSTGRES_DB}_restore_test"

LATEST_BACKUP="$(ls -1t "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | head -n 1 || true)"

if [[ -z "${LATEST_BACKUP}" ]]; then
	echo "[restore-test] no hay backups en ${BACKUP_DIR}" >&2
	exit 1
fi

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${TMP_DB};"

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE ${TMP_DB};"

gzip -dc "${LATEST_BACKUP}" | docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	psql -U "${POSTGRES_USER}" -d "${TMP_DB}" >/dev/null

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	psql -U "${POSTGRES_USER}" -d "${TMP_DB}" -c "SELECT now();" >/dev/null

docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
	psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${TMP_DB};"

echo "[restore-test] restore smoke test OK con: ${LATEST_BACKUP}"
