#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$(mktemp)"

cleanup() {
	docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.yml" down -v >/dev/null 2>&1 || true
	rm -f "$ENV_FILE"
}

trap cleanup EXIT

cat >"$ENV_FILE" <<'EOF'
APP_NAME=nexus-ci
VPS_HOST=127.0.0.1
DEPLOY_USER=deploy
PROJECT_DIR=/srv/app
API_DOMAIN=localhost
NGINX_TEMPLATE=default.http.conf.template
TZ=UTC
POSTGRES_DB=appdb
POSTGRES_USER=appuser
POSTGRES_PASSWORD=appsecret_ci_123456789
DATABASE_URL=postgresql://appuser:appsecret_ci_123456789@postgres:5432/appdb
REDIS_PASSWORD=redissecret_ci_123456789
REDIS_URL=redis://:redissecret_ci_123456789@redis:6379
JWT_SECRET=jwtsecret_ci_123456789
BACKUP_DIR=/tmp/backups
BACKUP_RETENTION_DAYS=7
BACKEND_PORT=3000
TEGOLA_MAP=peru
FRONTEND_ORIGIN=http://localhost:3000
FRONTEND_ORIGINS=http://localhost:3000,https://maquina-electoral-goberna-web.vercel.app
REQUEST_TIMEOUT_MS=5000
UPSTREAM_RETRIES=2
LOG_LEVEL=info
BACKEND_CONTEXT=./backend
BACKEND_DOCKERFILE=Dockerfile
EOF

docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.yml" up -d --build --remove-orphans

for _ in $(seq 1 30); do
	if curl -fsS "http://127.0.0.1/api/health" >/dev/null 2>&1; then
		break
	fi
	sleep 2
done

curl -fsS "http://127.0.0.1/api/health" >/dev/null
curl -fsS "http://127.0.0.1/api/config" >/dev/null

client_id="ci-$(date +%s)"
payload="{\"nombre\":\"CI Test\",\"telefono\":\"999000000\",\"fecha\":\"2026-02-14T20:10:00.000Z\",\"x\":279854,\"y\":8661420,\"zona\":\"18S\",\"candidate\":\"Test\",\"encuestador\":\"CI\",\"encuestador_id\":\"ci-device\",\"candidato_preferido\":\"Test\",\"client_id\":\"${client_id}\"}"

first_response="$(curl -fsS -H "Content-Type: application/json" -X POST "http://127.0.0.1/api/forms" --data "$payload")"
second_response="$(curl -fsS -H "Content-Type: application/json" -X POST "http://127.0.0.1/api/forms" --data "$payload")"

python3 - "$first_response" "$second_response" <<'PY'
import json
import sys

first = json.loads(sys.argv[1])
second = json.loads(sys.argv[2])

if not first.get("ok"):
    raise SystemExit("first forms post failed")

if not second.get("ok"):
    raise SystemExit("second forms post failed")

if second.get("deduped", 0) < 1:
    raise SystemExit("dedupe not working")
PY

echo "[smoke] backend contract ok"
