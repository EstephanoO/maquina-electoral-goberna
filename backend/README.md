# backend

Backend Node/Express ejecutando con Bun para exponer tiles de Tegola.

Optimizaciones aplicadas:

- Compresion HTTP (`compression`)
- Cabeceras de seguridad (`helmet`)
- Rate limiting para `/api`
- Reintentos y timeout al upstream Tegola
- Logging estructurado JSON (`winston`)
- Access logs HTTP (`morgan`)
- Keep-alive del servidor ajustado
- Graceful shutdown para deploys

## Configuracion

1. Copia `.env.example` a `.env.local`.
2. Ajusta `TEGOLA_BASE_URL`, `TEGOLA_MAP`, `FRONTEND_ORIGIN` y `REDIS_PASSWORD`.
3. Ajusta `LOG_LEVEL` si necesitas mas o menos verbosidad.

## Ejecutar

```bash
bun run dev
```

## Endpoints

- `GET /health`
- `GET /health/upstream`
- `GET /api/config`
- `GET /api/capabilities`
- `GET /api/tiles/:z/:x/:y.vector.pbf`
