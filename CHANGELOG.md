# Changelog — Goberna Platform

---

## 2026-02-19 — CMS Redesign + Tierra Map UX + Role Fix

### CMS: Rediseno completo a tabla profesional

**Antes:** Layout de cards simple con 2 tabs (Nuevos / Mis Hablados).
**Ahora:** Tabla profesional con contexto enriquecido, 5 tabs, busqueda y plantilla WhatsApp.

#### Tabla con contexto por fila

Cada contacto ahora muestra de donde viene y cuando fue procesado:

| Columna | Que muestra |
|---------|-------------|
| **FECHA / ORIGEN** | Timestamp dinamico + origen del contacto |
| **CIUDADANO** | Nombre + candidato preferido (si existe) |
| **TELEFONO** | Link directo a WhatsApp con icono verde |
| **ESTADO** | Badge de color + indicador de notas |
| **ACCIONES** | Botones contextuales segun estado |

**Origen del contacto:**
- Si viene de formulario de campo: `Campo: [nombre_agente] · [zona/distrito]` con icono de persona verde
- Si viene de contacto directo (celular): `Contacto de celular` con icono de telefono morado
- Si tiene zona/distrito en los datos, se muestra como contexto geografico

**Timestamps dinamicos:**
- Estado `nuevo`: Muestra "Agregado 14:30 19/02" (fecha de creacion)
- Estado `claimed`: Muestra "En curso 15:00 19/02" (fecha de claim)
- Estado `hablado`/`contesto`: Muestra "Hablado 15:10 19/02" (fecha real de llamada)
- La fecha cambia automaticamente al transicionar de estado

#### 5 Tabs con contadores

```
NO HABLADOS · 45  |  HABLADOS · 12  |  CONTESTO · 8  |  ARCHIVADOS · 3  |  TODOS · 68
```

- **NO HABLADOS**: Contactos nuevos + en curso (claimed por otros aparecen bloqueados)
- **HABLADOS**: Contactos con los que ya se hablo
- **CONTESTO**: Contactos que respondieron al WhatsApp (nuevo estado)
- **ARCHIVADOS**: Contactos descartados o finalizados (nuevo estado)
- **TODOS**: Vista completa sin filtro

#### Buscador

Busca por nombre, telefono, entrevistador, zona o distrito. Filtro en tiempo real.

#### Plantilla WhatsApp colapsable

Seccion desplegable con mensaje plantilla para copiar:
> "Hola [NOMBRE], le habla [TU_NOMBRE] del equipo de [CANDIDATO]. Queriamos saber si podemos contar con su apoyo..."

Al hacer clic en WSP se abre WhatsApp con "Hola [nombre]" automaticamente.

#### Panel de notas enriquecido

Al abrir el panel lateral de un contacto, ahora muestra:

1. **Tarjeta de contexto** (arriba, fondo azul):
   - Entrevistador que recogio el dato
   - Zona / Ubicacion
   - Candidato preferido
   - Fecha de agregado
   - Fecha de llamada (si aplica)

2. **Campos editables** (abajo):
   - Local de Votacion
   - Domicilio
   - Comentarios

3. En contactos archivados, el panel es de solo lectura.

#### Nuevos endpoints backend

| Endpoint | Descripcion |
|----------|-------------|
| `PUT /api/cms/contacts/:id/respondieron` | Marca como "contesto" |
| `PUT /api/cms/contacts/:id/archive` | Archiva el contacto |
| `GET /api/cms/contacts?search=texto` | Busqueda por nombre/telefono/zona |
| `GET /api/cms/metrics` | Metricas por campana y por operador |

#### Migraciones

- **020**: Expande CHECK constraint de `cms_status` para incluir `respondieron` y `archivado`
- **021**: Agrega columna `cms_hablado_at` (timestamp de cuando se hablo) con indice

```sql
-- Correr en produccion:
cd /srv/app && docker compose exec backend bun run migrate
```

---

### Tierra Map: Fixes de UX + Rediseno de controles

#### Tooltips y zoom

- Los tooltips se ocultan durante zoom/pan (antes causaban lag)
- Tooltips de zonas tienen delay de 120ms para evitar parpadeo
- Limpieza inmediata al mover mouse fuera de una zona

#### Controles de capas (mutuamente exclusivos)

**Antes:** 3 toggles independientes (Datos, Agentes, Densidad) podian activarse todos a la vez.
**Ahora:** Solo 1 capa activa a la vez — tipo radio button.

- Se removio titulo "CAPAS"
- "Tabla" renombrado a "Ver tabla" con icono
- Al seleccionar un agente en cualquier lista, se activa automaticamente la capa Agentes

#### Metricas rediseñadas

Nuevo layout con:
- 4 KPIs en grid 2x2 con iconos SVG y tendencias
- Grafico de actividad 24h
- Ranking de agentes por color de estado
- Banner de contexto cuando hay agentes seleccionados
- Filtrado de datos y metricas segun seleccion de agentes

#### Crossfade de zoom en capas del mapa

Transiciones suaves de opacidad al hacer zoom entre niveles administrativos:
- Departamentos se desvanecen al entrar en provincias
- Provincias se desvanecen al entrar en distritos
- Labels de texto aparecen/desaparecen segun nivel de zoom

---

### Backend: Fix de rol "candidato" (500 error)

**Problema:** Al cambiar el rol de un miembro del equipo a "candidato" desde `/equipo`, el backend retornaba 500 porque PostgreSQL tiene un CHECK constraint que solo permite `('admin', 'consultor', 'jefe_campana', 'brigadista_zonal', 'agente_campo')`.

**Causa raiz:** `"candidato"` es un alias de autorizacion para `"jefe_campana"` definido en `authorize.ts`, pero el frontend lo enviaba como rol real.

**Solucion:** Funcion `toDbRole()` en `apps/backend/src/modules/campaigns/routes.ts` que mapea `"candidato" -> "jefe_campana"` antes de escribir a la DB. Aplicado en:
- `addUserToCampaign` (agregar miembro)
- `updateMemberRole` (cambiar rol)

---

### CMS Metrics Dashboard (nueva pagina)

Nueva pagina `/cms-metrics` con:

- **KPIs globales**: Total contactos, tasa de contacto, tasa de respuesta
- **Tabla por campana**: Total, nuevos, hablados, respondieron, archivados, tasas
- **Tabla por operador**: Rendimiento individual (hablados, respondieron, en curso)
- Acceso scoped por rol: admin ve todo, candidato/consultor ve solo sus campanas

---

### Archivos modificados

#### Backend
```
apps/backend/migrations/020_cms_expanded_statuses.sql     (nuevo)
apps/backend/migrations/021_cms_hablado_at.sql            (nuevo)
apps/backend/src/modules/cms/repository.ts                (reescrito)
apps/backend/src/modules/cms/routes.ts                    (3 endpoints nuevos)
apps/backend/src/modules/campaigns/routes.ts              (toDbRole fix)
```

#### Frontend
```
apps/web/lib/services/cms.ts                              (tipos + API calls nuevos)
apps/web/app/(dashboard)/cms/page.tsx                     (reescrito: tabla)
apps/web/app/(dashboard)/cms/_components/contact-table-row.tsx   (nuevo)
apps/web/app/(dashboard)/cms/_components/contact-notes-panel.tsx (enriquecido)
apps/web/app/(dashboard)/cms/_components/index.ts         (exports)
apps/web/app/(dashboard)/cms-metrics/page.tsx             (nuevo)
apps/web/app/(dashboard)/layout.tsx                       (sidebar nav)
apps/web/app/(dashboard)/candidatos/[slug]/tierra/page.tsx           (layers)
apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/tierra-map.tsx      (tooltips + crossfade)
apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/map-controls.tsx    (mutuamente exclusivos)
apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/activity-charts.tsx (rediseno)
apps/web/app/(dashboard)/candidatos/[slug]/tierra/_components/index.ts           (export)
```

---

### Post-deploy checklist

- [ ] Correr migraciones 020 + 021 en produccion
- [ ] Verificar `/api/health` y `/api/ready` retornan 200
- [ ] Probar flujo CMS completo: nuevo -> claim -> WSP -> hablado -> contesto -> archivar
- [ ] Verificar busqueda de contactos funciona
- [ ] Verificar panel de notas muestra contexto del contacto
- [ ] Verificar tierra map: tooltips no aparecen durante zoom
- [ ] Verificar cambio de rol en `/equipo` no da 500
