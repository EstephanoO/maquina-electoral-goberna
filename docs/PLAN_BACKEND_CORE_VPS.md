# Plan backend core en VPS

## Estado actual

- Sync Neon -> VPS desactivado (cron removido).
- Fuente principal de formularios ahora: PostgreSQL del VPS.
- Endpoint activo para mobile: `POST /api/forms`.
- Health activo: `GET /api/health`.

## Flujo recomendado desde hoy

1. La app movil apunta a `http://161.132.39.165/api` (temporal).
2. Cada push a `main` dispara deploy al VPS (workflow actual).
3. Se monitorea que `forms` siga recibiendo datos sin perdida.

## Fastify + Drizzle listo para migracion gradual

Se agrego nuevo backend en `apps/backend` con:

- Fastify
- Drizzle ORM
- PostgreSQL (`DATABASE_URL`)
- Endpoints base:
  - `GET /health`
  - `GET /api/health`
  - `POST /api/forms`

## Como activar Fastify sin big-bang

En `/srv/app/.env` cambiar:

```env
BACKEND_CONTEXT=./apps/backend
BACKEND_DOCKERFILE=Dockerfile
```

Luego deploy:

```bash
cd /srv/app
docker compose up -d --build backend nginx
```

Para volver al backend actual (rollback rapido):

```env
BACKEND_CONTEXT=./backend
BACKEND_DOCKERFILE=Dockerfile
```

Y redeploy igual.

## Checklist de corte seguro

- `curl http://IP/api/health` responde 200.
- POST de formulario real responde 200.
- Dedupe por `client_id` funcionando (reintento no duplica).
- `docker compose logs backend` sin errores de DB.
- Conteo en `public.forms` sube con trafico real.
