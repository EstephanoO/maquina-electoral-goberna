# DevSecOps baseline (VPS + Vercel)

## Objetivo

Tener un flujo confiable para 2 devs: calidad, seguridad, deploy con smoke checks y rollback.

## CI/CD implementado

Archivo: `.github/workflows/deploy.yml`

### Jobs

1. `quality`
   - install deps backend/frontend
   - typecheck backend/frontend
   - build frontend
   - smoke contract de backend: `scripts/ci/smoke_backend_contract.sh`

2. `security`
   - gitleaks (secret scanning)
   - trivy fs scan (HIGH/CRITICAL)

3. `deploy` (solo push a `main`)
   - SSH al VPS
   - `docker compose up -d --build --remove-orphans`
   - smoke checks remotos
   - rollback automatico al commit previo si falla

## Health y readiness

Backend expone:

- `GET /api/health` (liveness)
- `GET /api/ready` (database + tegola)

`/api/ready` debe usarse en validaciones post-deploy.

## Smoke checks minimos obligatorios

- `curl http://127.0.0.1/api/health`
- `curl http://127.0.0.1/api/config`
- `curl http://127.0.0.1/api/ready`
- `POST /api/forms` con payload de prueba

## Observabilidad basica

- logs estructurados backend (winston)
- access logs HTTP (morgan)
- logs de contenedores por `docker compose logs`

Recomendacion inmediata:

1. Alertar si `/api/ready` devuelve 503.
2. Alertar si `5xx` crece sobre baseline.
3. Revisar `docker compose ps` por reinicios inusuales.

## Secretos requeridos en GitHub

- `VPS_HOST`
- `SSH_PRIVATE_KEY`
- `VPS_PORT` (opcional)

## Notas operativas

- No subir `.env` al repo.
- No exponer Postgres ni Redis.
- Mantener rollback simple y rapido.
