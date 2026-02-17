# TIERRA v2 — Meets + Tracking + Analytics

> **Fecha:** 2026-02-17
> **Estado:** Pendiente aprobacion
> **Alcance:** Backend (meets) + Web (tierra redesign) + Mobile (GPS foreground + meets)

---

## 1. Objetivo

Transformar la pagina Tierra en un centro de operaciones territorial con:
- **Identidad del candidato** como protagonista visual
- **Sistema de meets** (actividades de campo) creadas desde web con pin en mapa
- **Metricas tipo ArcGIS** con Recharts (logs, comparativas, productividad)
- **Tracking GPS foreground** integrado con meets en mobile
- **Layout condensado** (1 header en vez de 2, minimalista)

---

## 2. Identidad visual GOBERNA

| Elemento | Valor |
|----------|-------|
| Color principal | `#163960` (azul GOBERNA) |
| Color secundario | `#FFC800` (amarillo GOBERNA) |
| Tipografia | Montserrat ExtraBold |
| Color del candidato | `campaign.color_primario` / `campaign.color_secundario` |
| Principio | Legibilidad, contraste, orden. Minimalista. |

La marca del candidato domina: su foto grande, sus colores como acento. GOBERNA es el marco institucional (sidebar de navegacion). Tierra es el territorio del candidato.

---

## 3. Layout redesign

### Problema actual
```
[260px Sidebar GOBERNA] [320px Sidebar Tierra] [Mapa]
         ^                      ^
    navegacion             info candidato
    institucional          + agentes
```
580px de sidebars antes del mapa. Doble barra. Padding de 24px del layout padre causa overflow.

### Solucion: layout tierra fullscreen
```
[260px Sidebar GOBERNA]  [TIERRA FULLSCREEN ─────────────────────────────────────]
                         │                                                        │
                         │  ┌── HEADER BAR (64px) ──────────────────────────────┐ │
                         │  │ [Foto] Candidato · Cargo    [Agentes:5] [Meets:2] │ │
                         │  │ ████████░░ 67% meta datos   [Capas v] [+ Meet]    │ │
                         │  └───────────────────────────────────────────────────┘ │
                         │                                                        │
                         │  ┌── MAPA (flex:1) ──────────────────────────────────┐ │
                         │  │                                                    │ │
                         │  │   Vector tiles Peru                                │ │
                         │  │   + Agentes (circulos con status)                  │ │
                         │  │   + Datos (forms como puntos)                      │ │
                         │  │   + Meets (pins con info)                          │ │
                         │  │   + Click para crear meet (admin/candidato)        │ │
                         │  │                                                    │ │
                         │  │   [Leyenda flotante]                               │ │
                         │  │                                                    │ │
                         │  └────────────────────────────────────────────────────┘ │
                         │                                                        │
                         │  ┌── PANEL INFERIOR (drawer, 0-400px) ───────────────┐ │
                         │  │ [Agentes] [Metricas] [Log] [Meets]    tabs        │ │
                         │  │                                                    │ │
                         │  │ Contenido del tab activo:                          │ │
                         │  │ - Agentes: lista + search + filtros                │ │
                         │  │ - Metricas: Recharts (line, bar, comparativas)     │ │
                         │  │ - Log: timeline de eventos                         │ │
                         │  │ - Meets: lista de meets activos/programados        │ │
                         │  └────────────────────────────────────────────────────┘ │
                         └────────────────────────────────────────────────────────┘
```

### Principios del layout:
1. **Mapa es el protagonista** — ocupa todo el espacio disponible
2. **Header condensado** — 1 barra de 64px con todo: candidato + KPIs + acciones
3. **Panel inferior como drawer** — se puede colapsar (0px), medio (250px), expandir (400px)
4. **Sin sidebar tierra propia** — todo en header + drawer inferior
5. **Tierra es fullscreen** — quitar padding del layout padre para esta ruta

---

## 4. Header condensado (64px)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  [Foto 44px]  Juan Perez                    Agentes    Meets   Datos │
│               Alcalde · Partido X           ● 5 live   ● 2     1247 │
│               ████████████░░░░  67%         [Capas v]  [+ Meet]     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Izquierda:** Foto del candidato (44px redonda), nombre (Montserrat ExtraBold), cargo, barra de progreso mini
- **Derecha:** KPIs compactos (agentes live, meets activos, total datos), botones de accion
- **Colores:** Fondo `campaign.color_primario`, texto blanco
- **Border-bottom:** 3px `campaign.color_secundario`

---

## 5. Panel inferior (drawer con tabs)

### 5.1 Tab: Agentes
Lista de agentes con:
- Status dot (verde/amarillo/gris)
- Nombre, ultimo ping, forms count
- Click → centra mapa en agente
- Filtros: status, busqueda
- Mini sparkline de actividad por agente

### 5.2 Tab: Metricas (Recharts)

**Chart 1: Produccion por agente (BarChart horizontal)**
```
Agente A  ████████████████  45 forms
Agente B  ██████████        28 forms
Agente C  ████████          22 forms
Agente D  ███               8 forms
```

**Chart 2: Actividad temporal (LineChart)**
```
    ^
 15 │         ╱╲
 10 │    ╱╲  ╱  ╲   ╱╲
  5 │╱╲╱  ╲╱    ╲╱╱  ╲
  0 └──────────────────────→
    9am  10am  11am  12pm
    
    — Agente A  — Agente B  — Total
```

**Chart 3: Comparativa de agentes (RadarChart o tabla)**
- Forms/hora
- Cobertura de zona
- Tiempo activo
- Velocidad promedio

**Chart 4: Cobertura territorial (mapa de calor, integrado con mapa)**
- Heatmap overlay en el mapa
- Toggle desde panel de metricas

### 5.3 Tab: Log
Timeline de eventos en tiempo real:
```
12:45  ● Juan envio formulario en Zona 3
12:42  ● Maria se conecto
12:38  ● Pedro salio del meet "Puerta a puerta"
12:30  ● Meet "Zona Sur" iniciado por Admin
```

### 5.4 Tab: Meets
Lista de meets con:
- Status badge (activo/programado/pendiente ubicacion)
- Titulo, fecha, ubicacion
- Participantes (avatares)
- Click → centra mapa en meet pin
- Boton "Terminar" (admin/candidato)

---

## 6. Meets en el mapa

### Crear meet (admin/candidato)
1. Click boton "[+ Meet]" en header
2. Mapa entra en modo "colocar pin" (cursor cambia a crosshair)
3. Click en mapa → pin aparece
4. Modal overlay: titulo, descripcion, fecha/hora
5. Guardar → pin permanente con icono de meet

### Visualizar meets
- Pins con icono de bandera/marcador
- Color: `color_secundario` del candidato
- Tooltip al hover: titulo + participantes + hora
- Click: panel lateral con detalle

### Meet sin ubicacion (creado desde mobile)
- Aparece en lista de meets con badge "Sin ubicacion"
- Admin/candidato puede hacer click → "Asignar ubicacion" → modo pin

---

## 7. Backend: Modulo Meets

### Migracion SQL (007_meets.sql)

```sql
CREATE TABLE meets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  location_name VARCHAR(255),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('pending_location','scheduled','active','completed','cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE meet_participants (
  meet_id UUID NOT NULL REFERENCES meets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (meet_id, user_id)
);

CREATE INDEX idx_meets_campaign_status ON meets(campaign_id, status);
CREATE INDEX idx_meets_starts_at ON meets(starts_at);
CREATE INDEX idx_meet_participants_user ON meet_participants(user_id);
```

### Endpoints

| Metodo | Endpoint | Auth | Quien |
|--------|----------|------|-------|
| POST | /api/meets | JWT | admin, candidato, agente (sin lat/lng) |
| GET | /api/meets/active | JWT + x-campaign-id | todos |
| GET | /api/meets/:id | JWT | todos |
| PUT | /api/meets/:id | JWT | admin, candidato |
| PUT | /api/meets/:id/status | JWT | admin, candidato |
| POST | /api/meets/:id/join | JWT | todos |
| POST | /api/meets/:id/leave | JWT | todos |
| GET | /api/meets/:id/participants | JWT | todos |

### Logica de status
```
Agente crea (sin ubicacion)  → pending_location
Admin crea (con pin en mapa) → scheduled
Admin asigna pin a pending   → scheduled
Hora de inicio llega         → active (o manual)
Admin termina                → completed
Admin cancela                → cancelled
```

---

## 8. Mobile: Tracking GPS Foreground + Meets

### Permiso Android
Solo `ACCESS_FINE_LOCATION` (foreground, "while using the app").
NO background. Google Play lo aprueba sin problema.

### Flujo UX

```
1. Dashboard → banner si hay meet activo
   ┌───────────────────────────────────┐
   │ ● Meet activo: Zona Sur          │
   │   Hoy 9:00-13:00                 │
   │   [ Unirme ] [ Ver en mapa ]     │
   └───────────────────────────────────┘

2. "Unirme" → pide permiso GPS → activa tracking
   Banner verde: "Rastreando · Meet Zona Sur"
   GPS cada 60s, solo con app abierta

3. Abrir formulario sin estar en meet:
   → Chequea meets activos
   → Modal: "Hay un recorrido activo. Unirte?"
   → Si → activa GPS + asocia form al meet

4. "Ver en mapa" → abre Google Maps con pin del meet
   (deep link: google.navigation:q=lat,lng)

5. Tab Reuniones → lista de meets
   → Card con titulo, fecha, lugar, participantes
   → Boton crear meet (sin ubicacion → pending_location)
   → Click → Google Maps
```

### Captura GPS (foreground only)
- `expo-location` con `requestForegroundPermissionsAsync()` solamente
- `watchPositionAsync` con interval 60s, distancia 10m
- Se para cuando:
  - Sale del meet
  - Cierra la app
  - Meet termina
- Cada location incluye `meet_id` en el payload

---

## 9. Orden de implementacion

### Fase 1: Backend meets (prerequisito para todo)
1. Migracion 007_meets.sql
2. Modulo backend: schema, repository, routes
3. Verificar con curl

### Fase 2: Tierra v2 layout
1. Header condensado (identidad candidato grande)
2. Quitar sidebar tierra, fullscreen layout
3. Panel inferior drawer con tabs
4. Tab Agentes (migrar de sidebar actual)

### Fase 3: Metricas Recharts
1. Instalar recharts
2. Tab Metricas con BarChart produccion por agente
3. LineChart actividad temporal
4. Comparativa de agentes

### Fase 4: Meets en mapa
1. Tab Meets en drawer
2. Pins de meets en mapa
3. Modo "crear meet" con click en mapa
4. Modal de creacion
5. Asignar ubicacion a meets pendientes

### Fase 5: Mobile GPS foreground + meets
1. Re-habilitar expo-location (solo foreground)
2. Conectar con meets API
3. Banner de meet activo en dashboard
4. Modal "unirte?" al abrir formulario
5. Tab reuniones con datos reales

---

## 10. Dependencias tecnicas

| Paquete | App | Uso |
|---------|-----|-----|
| `recharts` | web | Charts de metricas |
| `expo-location` | mobile | GPS foreground (re-habilitar) |
| Existentes | - | MapLibre, Tegola, Redis, SSE |

---

## 11. Riesgos

| Riesgo | Mitigacion |
|--------|-----------|
| Recharts bundle size | Tree-shake, import solo componentes usados |
| GPS en foreground = gaps | Aceptable, es tracking operativo no de seguridad |
| Meets sin uso | MVP minimo: crear, listar, unirse. Sin notificaciones push por ahora |
| Google Play review | Solo FINE_LOCATION foreground, sin background |
