# Contrato Frontend - Tegola Backend (Peru Administrativo)

## Estado de datos

- `departamentos`: 25
- `provincias`: 196
- `distritos`: 1891

Fuente de tiles: backend `http://localhost:3002` (no conectar frontend directo a Neon ni Tegola interno).

## Endpoints de contrato

- `GET /health`
- `GET /api/config`
- `GET /api/capabilities`
- `GET /api/tiles/{z}/{x}/{y}.vector.pbf`

Base URL local recomendada para Next.js:

```env
NEXT_PUBLIC_MAP_API_BASE=http://localhost:3002
```

## Respuesta `/api/config` (contrato)

```json
{
  "tegolaBaseUrl": "http://tegola:8080",
  "mapName": "peru",
  "tileUrlTemplate": "/api/tiles/{z}/{x}/{y}.vector.pbf",
  "layers": [
    { "id": "departamentos", "sourceLayer": "departamentos", "minZoom": 3, "maxZoom": 20 },
    { "id": "provincias", "sourceLayer": "provincias", "minZoom": 5, "maxZoom": 20 },
    { "id": "distritos", "sourceLayer": "distritos", "minZoom": 8, "maxZoom": 20 }
  ]
}
```

## Source y source-layers (MapLibre)

- Source único tipo `vector` con tiles: `http://localhost:3002/api/tiles/{z}/{x}/{y}.vector.pbf`
- `source-layer` válidos:
  - `departamentos`
  - `provincias`
  - `distritos`

## Atributos disponibles por capa

- `departamentos`:
  - `coddep`, `departamento`, `capital`
- `provincias`:
  - `coddep`, `codprov`, `codprov_full`, `provincia`, `capital`
- `distritos`:
  - `ubigeo`, `coddep`, `codprov`, `codprov_full`, `coddist`, `distrito`, `capital`

## Contrato de interaccion (drill-down)

Estado frontend recomendado:

- `level`: `"country" | "department" | "province"`
- `selectedDep`: `string | null`
- `selectedProvFull`: `string | null` (`coddep + codprov`)

### Nivel 1: country

- Mostrar departamentos.
- Ocultar provincias y distritos.

Filtros:

- departamentos: `true` (sin filtro)
- provincias: `false`
- distritos: `false`

### Click en departamento

Al click en feature `departamentos`:

- `selectedDep = feature.properties.coddep`
- `level = "department"`
- `fitBounds` al geometry del departamento seleccionado.

Filtros:

- departamentos: `['==', ['get', 'coddep'], selectedDep]`
- provincias: `['==', ['get', 'coddep'], selectedDep]`
- distritos: `false`

### Click en provincia

Al click en feature `provincias`:

- `selectedProvFull = feature.properties.codprov_full`
- `level = "province"`
- `fitBounds` al geometry de la provincia.

Filtros:

- departamentos: `['==', ['get', 'coddep'], selectedDep]`
- provincias: `['==', ['get', 'codprov_full'], selectedProvFull]`
- distritos: `['==', ['get', 'codprov_full'], selectedProvFull]`

### Boton volver

- Si `level === "province"`: volver a `department`.
- Si `level === "department"`: volver a `country`.

## Reglas de performance (obligatorias)

- No recrear `map` en cada render; inicializar una sola vez en `useEffect`.
- No recrear source/layers; usar `setFilter` para todo drill-down.
- Debounce para handlers de hover/click intensivos.
- Usar `promoteId` cuando agregues estado de feature (`hover/select`) para evitar repaints globales.
- Mantener payload mínimo en popups (usar solo atributos necesarios).
- No pedir `/api/capabilities` en cada interacción; cachear en memoria.
- Mantener zoom mínimo por capa:
  - departamentos: `>= 3`
  - provincias: `>= 5`
  - distritos: `>= 8`

## Snippet de inicializacion (base)

```ts
const apiBase = process.env.NEXT_PUBLIC_MAP_API_BASE ?? "http://localhost:3002";

const source = {
  type: "vector",
  tiles: [`${apiBase}/api/tiles/{z}/{x}/{y}.vector.pbf`],
  minzoom: 3,
  maxzoom: 20,
};
```

## Seguridad

- Nunca exponer `DATABASE_URL` en frontend.
- Nunca usar `NEXT_PUBLIC_*` con credenciales.
- Frontend solo consume backend `localhost:3002`.
