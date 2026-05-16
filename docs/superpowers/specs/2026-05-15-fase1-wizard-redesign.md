# Fase 1 Onboarding — Wizard UX Redesign

**Fecha:** 2026-05-15  
**Branch:** `feat/GBELC-14-cuaderno-campo-fase1`  
**Ruta base:** `apps/web/app/onboarding/[slug]/fase-1/`

---

## Objetivo

Reemplazar el accordion de 13 secciones del form Fase 1 por un wizard step-by-step donde cada campo es un paso individual con guidance contextual sobre dónde y cómo encontrar cada dato.

**Modelo progresivo:** el deck Fase 2 existe desde el primer dato cargado (con datos simulados). A medida que el candidato completa más secciones, los slides se enriquecen con datos reales.

---

## Decisiones de diseño

| Decisión | Elección |
|----------|----------|
| Patrón de guidance | Wizard step-by-step (un campo por paso) |
| Feedback de enriquecimiento | Solo botón "Ver mi deck ↗" en top bar — sin feedback explícito en el wizard |
| Scope | Reemplaza todo el accordion (13 secciones, ~70 campos) |
| Guardado | Autosave por debounce (igual que el actual — no save explícito por paso) |
| Secciones futuras | Jumpable libremente (sin bloqueo progresivo) |

---

## Arquitectura de navegación

### Outer nav — 13 secciones

Barra superior con 13 dots numerados:
- Dot completado: gold (#ffc800), clickeable
- Dot actual: amber-400, no clickeable
- Dots futuros: gris/50%, clickeables (saltar libremente)

Al hacer click en cualquier dot, el wizard navega a esa sección (paso 1 de esa sección).

### Inner nav — pasos por sección

Dentro de cada sección, una barra de progreso delgada muestra el progreso:
```
"CANDIDATO · PASO 2 DE 7"
```

Botones de navegación:
- `[← Anterior]` — va al paso anterior (dentro de la sección o a la sección anterior)
- `[Siguiente →]` — guarda el campo actual y avanza
- `[Saltar]` — solo aparece en campos opcionales, avanza sin guardar el campo

### Global fixtures

- **Top left:** Logo Goberna
- **Top right:** `[Ver mi deck ↗]` — abre la Fase 2 en nueva tab
- **Autosave:** el form guarda con debounce 1500ms igual que el sistema actual

---

## Anatomía de un paso

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo Goberna]                          [Ver mi deck ↗]     │
│ ── ── ── ──●── ── ── ── ── ── ── ── (13 section dots)      │
│                                                              │
│ POSTULACIÓN · PASO 2 DE 5                                   │
│ ▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░  40%                         │
│                                                              │
│ ¿Cuántos electores hábiles tiene tu provincia?              │
│ Necesitás este dato para calcular los votos que           │
│ necesitás para ganar.                                        │
│                                                              │
│ [_______________________] votantes                           │
│                                                              │
│ ┌── ¿Dónde lo encontrás? ─────────────────────────────┐   │
│ │ 1. Ingresá a onpe.gob.pe                             │   │
│ │ 2. Sección "Padrón Electoral"                        │   │
│ │ 3. Filtrá por departamento → provincia               │   │
│ │ Ejemplo en Lima Norte: 284,182 votantes              │   │
│ │                               [Abrir ONPE ↗]        │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                              │
│ [← Anterior]              [Saltar]        [Siguiente →]     │
└──────────────────────────────────────────────────────────────┘
```

### Reglas de la guidance card

- **Aparece** cuando el campo requiere buscar datos en fuente externa (ONPE, JNE, INEI, Google, redes)
- **No aparece** para campos de auto-conocimiento (nombre, email, slogan, bio, propuestas propias)
- La guidance card es siempre visible cuando aparece (no colapsable)
- Incluye: pasos numerados + ejemplo real de valor esperado + link directo a la fuente

---

## Manejo de campos complejos

### Tags / selección múltiple (FODA, valores, segmentos)
Nube de opciones pre-sugeridas + campo "Agregar otro" libre. Click para seleccionar/deseleccionar. Opciones sugeridas basadas en contexto del cargo (municipio/región/etc).

### Listas repetibles (competidores, propuestas, hitos electorales)
Patrón "uno por vez":
```
Competidor 1
  Nombre: [_______]
  Partido: [_______]
  Nivel de amenaza: ○ Alta  ○ Media  ○ Baja

[+ Agregar otro competidor]    [Listo con competidores →]
```
Los ítems ya cargados se muestran como pills sobre el formulario. Al hacer "Agregar otro" se limpia el form y muestra "Competidor 2".

### Foto del candidato
Upload con drag-and-drop + botón seleccionar. Botón "Saltar" disponible. El deck usa iniciales + gradiente gold mientras no haya foto.

### Colores de marca
Color picker con 12 sugerencias de colores de partidos peruanos comunes (AP, PPC, Fuerza Popular, etc.) + input hex manual.

### Historial electoral (votos pasados)
Una fila por vez: "Elección 1: ¿qué año? ¿cuántos votos totales? ¿cuántos para tu candidato? ¿resultado?". Mismo patrón que competidores.

---

## Breakdown de secciones y campos

### Sección 1: Candidato (7 campos)
Datos personales. Fuente: el propio candidato / DNI.

| Campo | Guidance | Tipo |
|-------|----------|------|
| Nombre completo | "Tal como aparece en tu DNI y en la lista de candidatos JNE" | Text |
| Foto | "Foto reciente, fondo liso, ropa formal. Tamaño mínimo 400×400px" | Upload |
| Partido político | "Tal como está registrado en JNE" | Text |
| Cargo (pre-llenado) | Readonly, viene de ctx.cargo | Readonly |
| Email | — | Email |
| Teléfono | — | Tel |
| ¿Tenés contraseña? | — | Toggle |

### Sección 2: Postulación (5 campos)
Datos del proceso electoral. Fuentes: JNE, ONPE.

| Campo | Guidance | Tipo |
|-------|----------|------|
| Proceso electoral | "Ej: Elecciones Municipales 2026 · Primera Vuelta" | Text |
| Votantes habilitados | ONPE → Padrón Electoral → departamento/provincia | Number |
| N° candidatos competidores | JNE → Candidatos Inscritos → tu distrito | Number |
| Objetivo de la campaña | — | Select |
| Tipo de victoria esperada | — | Select |

### Sección 3: Estrategia (4 campos)
Decisiones estratégicas. El candidato las conoce. Los 4 campos exactos están en `apps/backend/src/modules/onboarding-fase1/_schemas.ts` — los agentes A4/A5 los leen para no inventar campos que no existen en el schema.

| Campo | Tipo |
|-------|------|
| Meta de votos (%) | Number |
| Objetivo de campaña | Select |
| Tipo de victoria esperada | Select |
| Tipo de campaña | Select (territorial / mediática / mixta) |

### Sección 4: Diagnóstico (FODA + competidores)

- **Fortalezas:** tag cloud (pre-sugeridas por cargo)
- **Debilidades:** tag cloud
- **Oportunidades:** tag cloud
- **Amenazas:** tag cloud
- **Competidores:** lista repetible (nombre + partido + nivel amenaza + fortaleza principal)

### Sección 5: Propuestas (3-6 ítems)
Lista repetible. Por cada propuesta: título + descripción corta + eje temático (tag: salud/educación/infraestructura/etc).

### Sección 6: Branding (3 campos)

| Campo | Guidance | Tipo |
|-------|----------|------|
| Slogan | "15 palabras máx. Tu promesa central en una frase" | Text |
| Color principal | Picker con sugerencias peruanas | Color |
| Color secundario | Picker con sugerencias peruanas | Color |

### Sección 7: Territorio (3 campos)

| Campo | Guidance | Tipo |
|-------|----------|------|
| Población total | INEI → Censos de Población | Number |
| Características del territorio | Tag cloud (rural/urbano/costa/sierra/etc) | Tags |
| Notas del territorio | "Particularidades que afectan la campaña" | Textarea |

### Sección 8: ¿Quién es? (3 campos)

| Campo | Tipo |
|-------|------|
| Bio/texto libre | Textarea (quién soy, mi historia) |
| Trayectoria (hitos) | Lista repetible (año + descripción) |
| Valores | Tag cloud pre-sugeridos |

### Sección 9: Presencia Digital (11 campos)

Por cada canal (web, Facebook, Instagram, TikTok): status check (ok/a revisar/ausente) + URL. Guidance: "Buscá tu nombre completo en Google y verificá qué aparece".

| Campo | Guidance | Tipo |
|-------|----------|------|
| Sitio web | — | URL |
| Facebook — estado | — | Radio (ok/revisar/ausente) |
| Facebook — URL | — | URL |
| Instagram — estado | — | Radio |
| Instagram — URL | — | URL |
| TikTok — estado | — | Radio |
| TikTok — URL | — | URL |
| YouTube — estado | — | Radio |
| YouTube — URL | — | URL |

### Sección 10: Debilidades (fuentes auditadas)

4 checks de fuentes conocidas (prensa, legales, ONPE, social media) + lista libre. Guidance: links a cada fuente con instrucción de búsqueda.

### Sección 11: Votos (aritmética electoral)

| Campo | Guidance | Tipo |
|-------|----------|------|
| Votos propios en elección pasada | ONPE → Resultados Electorales | Number |
| Votos totales emitidos | ONPE → Resultados | Number |
| Meta de votos para ganar | Calculado automáticamente | Readonly |
| Historial electoral (tabla) | Lista repetible | Tabla |

### Sección 12: Segmentación

Segmentos prioritarios: lista repetible. Por cada segmento: nombre + valores + aspiraciones + miedos.
Núcleo Goberna: prioridades entre 7 opciones (tagging).

### Sección 13: Recorrido

- Hitos de campaña: lista repetible (fecha + evento + descripción)
- Fórmula electoral: distribución de peso entre base propia / aliados / votantes nuevos / votantes indecisos (sliders que suman 100%)

---

## Interfaz con el sistema actual

### Props y tipos — sin cambios
`Fase1RapidaClient.tsx` sigue recibiendo `{ ctx: CandidatoContext; initialForm: ConsultorFormFase2 }`. El wizard consume los mismos tipos de `onboarding-api.ts`.

### Autosave — sin cambios
El PATCH existente `apps/web/lib/onboarding-fase1-api.ts` se mantiene. Los campos del wizard llaman `onChange` igual que antes; el debounce maneja el save.

### Estado del wizard
Nuevo: `WizardContext` con `{ currentSection: 0-12, currentStep: number, sectionProgress: boolean[] }`. Persiste en `localStorage` (key: `fase1-wizard-${slug}`).

---

## Lo que no cambia

- Backend: ningún cambio en rutas ni schemas
- Tipos TypeScript: `ConsultorFormFase2`, `CandidatoContext` — sin modificar
- Deck Fase 2: `Fase2F1Deck.tsx` lee los mismos campos — sin cambios
- Deploy: misma Docker image, mismo pipeline

---

## Implementación — División en agentes paralelos

| Agente | Scope |
|--------|-------|
| A1 — Shell | `WizardShell.tsx`: outer nav (13 dots), WizardContext, top bar con "Ver mi deck", progreso persistido en localStorage |
| A2 — StepRenderer | Componente genérico `WizardStep.tsx` + guidance card + tipos de input simple (text, number, email, select, toggle, radio) |
| A3 — ComplexFields | Componentes para campos complejos: `TagCloud.tsx`, `RepeatableList.tsx`, `ColorPicker.tsx`, `SliderWeights.tsx` |
| A4 — Sections 1-7 | Definición de pasos de las 7 secciones rápidas con su guidance content |
| A5 — Sections 8-13 | Definición de pasos de las 6 secciones extendidas con su guidance content |

Los agentes A4 y A5 generan el guidance content (textos de instrucción, ejemplos, links) para cada campo. **Importante:** los agentes A4 y A5 DEBEN leer `apps/backend/src/modules/onboarding-fase1/_schemas.ts` y `apps/web/lib/onboarding-api.ts` para mapear exactamente los campos del schema, sin añadir campos nuevos.

---

## Criterios de éxito

- El candidato puede completar la sección "Candidato" y ver su deck en < 3 minutos
- Los campos con fuentes externas tienen links directos y pasos ≤ 3
- El wizard retoma exactamente donde quedó al recargar la página
- No hay regresiones en el deck Fase 2 (los slides siguen leyendo los mismos campos)
- TypeScript 0 errores
