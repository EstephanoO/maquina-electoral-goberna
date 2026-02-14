# Error Next.js: URL con credenciales

## Error reportado

`message: "URL is not valid or contains user credentials."`

Este error lo dispara Next.js cuando en frontend intentas usar una URL con credenciales embebidas (`user:pass@host`).

## Causa raiz

- Estas usando una URL de base de datos (por ejemplo `postgresql://user:password@...`) en codigo o variables del frontend.
- `DATABASE_URL` es solo para backend/server, no para cliente.

## Regla obligatoria

- Frontend nunca debe leer ni usar `DATABASE_URL`.
- Frontend solo debe consumir el backend HTTP (`localhost:3002`).

## Configuracion correcta (frontend)

En `nexus-web/.env.local`:

```env
NEXT_PUBLIC_MAP_API_BASE=http://localhost:3002
```

En el codigo del mapa (MapLibre):

```ts
const apiBase = process.env.NEXT_PUBLIC_MAP_API_BASE ?? "http://localhost:3002";

const tiles = [`${apiBase}/api/tiles/{z}/{x}/{y}.vector.pbf`];
```

## Que revisar ahora

Buscar en frontend (`nexus-web`) y eliminar/reemplazar cualquier uso de:

- `DATABASE_URL`
- `postgres://`
- `postgresql://`
- `@ep-` (host Neon dentro de URL de cliente)
- `new URL(...)` construido con valores que incluyan credenciales

## Checklist de verificacion

1. No hay `DATABASE_URL` en variables `NEXT_PUBLIC_*`.
2. Todas las llamadas de mapa van a `http://localhost:3002`.
3. Reiniciaste Next.js despues de cambiar `.env.local`.

## Seguridad

Si una URL con password se expuso en logs/chat:

1. Rotar password del rol en Neon.
2. Actualizar `backend/.env.local`.
3. Reiniciar stack Docker.
