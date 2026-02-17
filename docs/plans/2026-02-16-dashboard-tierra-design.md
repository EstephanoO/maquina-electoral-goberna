# Dashboard Tierra - Design Document

> **Fecha:** 2026-02-16  
> **Estado:** Aprobado  
> **Alcance:** Backend + Web

---

## 1. Objetivo

Crear un dashboard de operacion territorial para candidatos que muestre:
- KPIs de campana (formularios recolectados vs metas)
- Mapa con agentes en tiempo real
- Estado de agentes de campo
- Log operativo de eventos
- Graficos de progreso por agente

---

## 2. Ruta

```
/candidatos/[slug]/tierra
```

Estructura futura:
```
/candidatos                     -> Lista de candidatos/campanas
/candidatos/[slug]              -> Redirect a tierra
/candidatos/[slug]/tierra       -> Dashboard operativo (este doc)
/candidatos/[slug]/digital      -> Dashboard digital (futuro)
/candidatos/[slug]/equipo       -> Gestion de agentes (futuro)
/candidatos/[slug]/config       -> Configuracion (futuro)
```

---

## 3. Layout

```
+-------------------------------------------------------------------------+
| HEADER                                                                   |
| [Logo] CANDIDATO NAME | Cargo | Partido #Numero                         |
|                                                                          |
| +---------------+ +---------------+                                      |
| | META DATOS    | | META VOTOS    |    [Tracking] [Datos] [Ver inboxs]  |
| | 1/300,000     | | 0/100,000     |                                      |
| +---------------+ +---------------+                                      |
+-------------------------------------------------------------------------+
|                                                                          |
|  +----------------------------------+  +-----------------------------+   |
|  |                                  |  | TOP AGENTES DE CAMPO        |   |
|  |                                  |  | 1. Cesar Vasquez ######## 15|   |
|  |           MAPA                   |  | 2. Juan Perez    #####    8 |   |
|  |      (MapLibre + Tegola)         |  | 3. Maria Garcia  ###      5 |   |
|  |                                  |  +-----------------------------+   |
|  |                                  |  | AGENTES DE CAMPO            |   |
|  |                                  |  | * Conectado (3)             |   |
|  |                                  |  | * Sin movimiento (1)        |   |
|  |                                  |  | * Inactivo (2)              |   |
|  |                                  |  +-----------------------------+   |
|  |                                  |  | LOG OPERATIVO               |   |
|  |                                  |  | * Juan envio registro       |   |
|  |                                  |  | * Maria se conecto          |   |
|  |                                  |  | * Pedro se desconecto       |   |
|  +----------------------------------+  +-----------------------------+   |
|                                                                          |
+-------------------------------------------------------------------------+
| PROGRESO POR AGENTE DE CAMPO                          [Dia] [Semana]    |
| +-------------------------------------------------------------------+   |
| |  Grafico de barras: formularios por agente                        |   |
| +-------------------------------------------------------------------+   |
+-------------------------------------------------------------------------+
```

---

## 4. Componentes

### 4.1 Header Candidato
- Logo/foto del candidato
- Nombre, cargo, partido, numero
- Metas con progress bars (datos y votos)
- Tabs: Tracking | Datos | Ver inboxs

### 4.2 Mapa
- Reutiliza MapLibre + Tegola del `/map` actual
- Muestra marcadores de agentes conectados
- Filtra por campaign_id

### 4.3 Panel Derecho

**Top Agentes:**
- Top 5-10 agentes por cantidad de formularios
- Barra de progreso relativa al maximo

**Estado Agentes:**
- Conectado (azul): ubicacion < 2 min
- Sin movimiento (amarillo): ubicacion 2-10 min, mismas coords
- Inactivo (gris): sin ubicacion > 10 min

**Log Operativo:**
- Ultimos 20 eventos
- Tipos: form_submitted, agent_connected, agent_disconnected
- Scroll con max-height

### 4.4 Grafico Inferior
- Barras horizontales o verticales
- X: agentes, Y: cantidad de formularios
- Toggle: Dia (ultimas 24h) / Semana (ultimos 7 dias)

---

## 5. Backend - Nuevo Endpoint

### GET /api/campaigns/:slug/stats

**Auth:** JWT Bearer (usuario debe pertenecer a la campana)

**Response:**
```typescript
{
  ok: true,
  campaign: {
    id: string,
    name: string,
    slug: string,
    cargo: string | null,
    numero: number | null,
    partido: string | null,
    foto_url: string | null,
    color_primario: string,
    color_secundario: string
  },
  metas: {
    datos: number,      // desde campaign.config.meta_datos
    votos: number       // desde campaign.config.meta_votos
  },
  totals: {
    forms_count: number,
    forms_today: number,
    forms_week: number
  },
  top_agents: [{
    id: string,
    name: string,
    forms_count: number,
    forms_today: number
  }],
  agents_status: {
    connected: number,
    idle: number,
    inactive: number,
    total: number
  },
  recent_events: [{
    type: "form_submitted" | "agent_connected" | "agent_disconnected",
    agent_id: string,
    agent_name: string,
    timestamp: string,
    message: string
  }]
}
```

### Queries necesarias

**Total forms por campana:**
```sql
SELECT COUNT(*) FROM forms WHERE campaign_id = $1;
```

**Forms hoy:**
```sql
SELECT COUNT(*) FROM forms 
WHERE campaign_id = $1 AND created_at >= CURRENT_DATE;
```

**Top agentes:**
```sql
SELECT 
  encuestador_id AS id,
  encuestador AS name,
  COUNT(*) AS forms_count,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS forms_today
FROM forms
WHERE campaign_id = $1
GROUP BY encuestador_id, encuestador
ORDER BY forms_count DESC
LIMIT 10;
```

**Datos para grafico (dia/semana):**
```sql
-- Dia
SELECT encuestador_id, encuestador, COUNT(*) AS count
FROM forms
WHERE campaign_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY encuestador_id, encuestador
ORDER BY count DESC;

-- Semana
SELECT encuestador_id, encuestador, COUNT(*) AS count
FROM forms
WHERE campaign_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY encuestador_id, encuestador
ORDER BY count DESC;
```

---

## 6. Cambios en DB

### Agregar metas a campaigns.config

```sql
UPDATE campaigns SET config = config || '{
  "meta_datos": 300000,
  "meta_votos": 100000
}'::jsonb WHERE slug = 'cesar-vasquez';
```

### Event log (opcional, puede ser in-memory por ahora)

Para MVP: mantener ultimos N eventos en memoria del backend.
Futuro: tabla `campaign_events` si necesitamos persistencia.

---

## 7. Archivos a Crear/Modificar

### Backend
- `apps/backend/src/modules/campaigns/routes.ts` - Agregar GET /:slug/stats
- `apps/backend/src/modules/campaigns/repository.ts` - Queries de stats

### Web
- `apps/web/app/(dashboard)/candidatos/page.tsx` - Lista de candidatos
- `apps/web/app/(dashboard)/candidatos/[slug]/page.tsx` - Redirect a tierra
- `apps/web/app/(dashboard)/candidatos/[slug]/tierra/page.tsx` - Dashboard
- `apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/` - Componentes:
  - `candidate-header.tsx`
  - `metas-display.tsx`
  - `agents-map.tsx` (reutiliza logica de /map)
  - `top-agents-panel.tsx`
  - `agents-status-panel.tsx`
  - `event-log.tsx`
  - `progress-chart.tsx`

---

## 8. Estados de Agentes - Logica

```typescript
const TWO_MINUTES = 2 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

function getAgentStatus(agent: AgentLive, now: number): 'connected' | 'idle' | 'inactive' {
  const lastSeenMs = new Date(agent.ts).getTime();
  const age = now - lastSeenMs;
  
  if (age < TWO_MINUTES) {
    return 'connected';
  }
  
  if (age < TEN_MINUTES) {
    // Podriamos verificar si se movio, pero simplificamos para MVP
    return 'idle';
  }
  
  return 'inactive';
}
```

---

## 9. Event Log - Implementacion

### Opcion MVP: In-memory circular buffer

```typescript
// Backend: mantener ultimos 100 eventos en memoria por campaign
const eventBuffers = new Map<string, CircularBuffer<CampaignEvent>>();

// Emitir eventos desde:
// - forms/routes.ts -> form_submitted
// - agents/routes.ts -> agent_connected, agent_disconnected
```

### Integracion con SSE existente

Reutilizar el broadcast de `/api/agents/stream` para emitir eventos:
```typescript
broadcast("event", { 
  type: "form_submitted", 
  agent_name: "Juan", 
  timestamp: new Date().toISOString() 
});
```

---

## 10. Dependencias

- MapLibre GL JS (ya instalado)
- Chart.js o similar para graficos (a instalar)
- Reutilizar estilos de `/map` para consistencia

---

## 11. Definition of Done

- [ ] Backend: GET /api/campaigns/:slug/stats funciona
- [ ] Backend: Queries de stats son eficientes (indices OK)
- [ ] Web: Ruta /candidatos/[slug]/tierra renderiza
- [ ] Web: Header muestra info del candidato
- [ ] Web: Metas muestran progreso
- [ ] Web: Mapa muestra agentes
- [ ] Web: Panel derecho muestra top agentes, status, log
- [ ] Web: Grafico muestra formularios por agente
- [ ] Web: Toggle dia/semana funciona
- [ ] `bun run build` en verde

---

## 12. Notas de Implementacion

1. **Reutilizar codigo del /map actual** - No duplicar logica de MapLibre/SSE
2. **Colores del candidato** - Usar `color_primario` y `color_secundario` de la campana
3. **Responsive** - Panel derecho colapsa en mobile
4. **Performance** - Stats endpoint debe ser rapido, considerar cache si es lento
