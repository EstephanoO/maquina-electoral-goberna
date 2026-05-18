# Fase 2 — Editorial Bold Redesign + 4-Act Structure

**Fecha**: 2026-05-18  
**Status**: Aprobado por el cliente ("dale con todo")  
**Versión anterior**: `2026-05-14-fase2-deck-redesign.md` (primera iteración — queda como referencia)

---

## 1. Problema

El deck actual de Fase 2 se ve genérico — "muy IA". Los datos están presentes pero sin peso narrativo:
- Títulos descriptivos en lugar de afirmaciones impactantes
- Cards de estadísticas intercambiables entre slides
- Sin mapa del territorio (el dato más territorial del candidato no tiene representación visual)
- Sin arco narrativo claro — las slides coexisten pero no cuentan una historia
- Paleta uniforme amber/navy en todas las slides — sin diferenciación por etapa

---

## 2. Objetivo

Un deck Fase 2 que se ve como un **briefing de war room** editorializado:
- Cada slide tiene una **afirmación** como headline, no un título genérico
- El territorio del candidato tiene un **mapa real** (polígono PostGIS)
- El GAP electoral es visible y urgente (números, zona de votos a conquistar)
- Las slides están organizadas en **4 actos** con divisores que marcan el cambio narrativo
- El lenguaje visual es **Editorial Bold**: tipografía enorme, contraste extremo, borde izquierdo amber

---

## 3. Dirección visual — Editorial Bold

### Tokens por acto

| Acto | Tema | Color acento | Uso |
|------|------|-------------|-----|
| I — QUIÉN SOS | amber | `#fbbf24` | Hero, ficha, perfil 5N |
| II — DÓNDE ESTÁS | red | `#ef4444` | Territorio, terreno, conciencia |
| III — CONTRA QUIÉN | blue | `#3b82f6` | Decisión, presencia digital |
| IV — CÓMO GANÁS | green | `#22c55e` | Síntesis, núcleo, cierre |

### Patrón EditorialHeader

Todas las slides de contenido adoptan este patrón para su encabezado:

```
┌─────────────────────────────────────────┐
│ ▌ MICRO-LABEL (acto · contexto)         │  ← 9px uppercase tracking-widest, acento 50%
│ ▌                                       │
│ ▌ Afirmación impactante en             │  ← 28–40px, font-black, white
│ ▌ dos o tres líneas                     │
│ ▌──────────────────                     │  ← línea separadora 40px, color acento
└─────────────────────────────────────────┘
```

- Borde izquierdo: `3px solid [color-acento]`
- Micro-label: `ACTO II · CONCIENCIA ELECTORAL`  
- Headline: afirmación como "Tu distrito tiene 48.230 votos. Hoy controlás 35%."

### Fondo unificado

Todas las slides mantienen el fondo actual de `Fase2F1Deck`: `bg-[#020a1e]` + `<CloudSkyBg />`.

---

## 4. Estructura narrativa — 4 actos

El deck pasa de 18 slides lineales a 4 actos con divisores de capítulo. El `TOTAL_CATALOG` sigue siendo 18 (slides de contenido). Los `SlideChapter` son slides estructurales: siempre visibles, no cuentan en el indicador de progreso.

### Orden del catálogo reorganizado

```
[CHAPTER] ACTO I · "QUIÉN SOS"           → SlideChapter (isChapter: true)
 1. hero            → SlideHero           (full rebuild)
 2. ficha           → SlideFichaTecnica   (+ EditorialHeader)
 3. perfil-5n       → SlidePerfil5N       (+ EditorialHeader)
 4. n1              → SlideN1Identidad    (+ EditorialHeader)
 5. n2              → SlideN2Trayectoria  (+ EditorialHeader)
 6. n3              → SlideN3Riesgo       (+ EditorialHeader, condicional)
 7. n4              → SlideN4Patrimonio   (+ EditorialHeader, condicional)
 8. resumen         → SlideResumenEjecutivo (+ EditorialHeader)

[CHAPTER] ACTO II · "DÓNDE ESTÁS"        → SlideChapter (isChapter: true)
 9. contexto        → SlideContextoTerritorial (full rebuild + SlideMap)
10. terreno         → SlideTerreno        (+ EditorialHeader)
11. estructura      → SlideEstructura     (+ EditorialHeader)
12. conciencia      → SlideConciencia     (full rebuild + GapBar)

[CHAPTER] ACTO III · "CONTRA QUIÉN"      → SlideChapter (isChapter: true)
13. decision        → SlideDecision       (full rebuild — "órdenes de batalla")
14. pentad          → SlidePentaDComparativa (+ EditorialHeader)

[CHAPTER] ACTO IV · "CÓMO GANÁS"         → SlideChapter (isChapter: true)
15. sintesis        → SlideSintesis       (+ EditorialHeader)
16. nucleo          → SlideNucleoGoberna  (full rebuild — propuesta al 80%)
17. herramientas    → SlideHerramientas   (+ EditorialHeader)
18. cierre          → SlideCierre         (full rebuild — countdown + acciones)
```

---

## 5. Nuevos componentes compartidos

Ubicación: `apps/web/app/onboarding/[slug]/fase-2/_components/slides/shared/`

### 5.1 `EditorialHeader.tsx`

Props:
```typescript
interface EditorialHeaderProps {
  microLabel: string;       // "ACTO II · CONCIENCIA ELECTORAL"
  headline: string;         // "Tu distrito tiene 48.230 votos. Hoy controlás 35%."
  accentColor?: string;     // default: "#fbbf24" (amber)
  headlineSize?: "sm" | "md" | "lg"; // controla font-size del headline
}
```

Render: `<div>` con `border-left: 3px solid [accentColor]`, padding-left, micro-label, headline, separator line.  
No lógica, solo presentación. Puede usarse en cualquier slide.

### 5.2 `SlideChapter.tsx`

Slide completa (no componente parcial). Full-bleed con:
- Número de acto enorme como ghost text: `"I"`, `"II"`, `"III"`, `"IV"` (96–120px, opacity 8%)
- Stripes decorativas horizontales en color acento (4 líneas finas)
- Badge: `"ACTO I"` en pill
- Título: `"QUIÉN SOS"` a 48–56px font-black
- Subtítulo: descripción de 1 línea de lo que viene

Props:
```typescript
interface SlideChapterProps {
  actNumber: "I" | "II" | "III" | "IV";
  actTitle: string;
  actSubtitle: string;
  accentColor: string;
}
```

### 5.3 `GapBar.tsx`

Visualización del GAP electoral. Usado en `SlideConciencia`.

Props:
```typescript
interface GapBarProps {
  current: number;      // porcentaje actual (e.g. 35)
  target: number;       // porcentaje objetivo (e.g. 51)
  weeks?: number;       // semanas al cierre electoral
  totalVotes?: number;  // padrón total (para calcular votos concretos)
}
```

Render:
- Número enorme izquierda: `35%` en rojo (`#ef4444`), 56px
- Número enorme derecha: `51%` en verde (`#22c55e`), 56px
- Barra horizontal: zona sólida roja (0→current%), zona punteada amber (current%→target%), zona gris (target%→100%)
- Zona punteada = patrón `repeating-linear-gradient` diagonal — representa votos a conquistar
- Caption: "GAP: 16 puntos · [N] semanas · [X.XXX] votos"
- Si `weeks` presente: mini countdown pill con días

### 5.4 `SlideMap.tsx`

Wrapper de MapLibre para mostrar el polígono de un distrito. `"use client"`.

Props:
```typescript
interface SlideMapProps {
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  centroid: [number, number];   // [lng, lat]
  bbox: [number, number, number, number]; // [w, s, e, n]
  height?: string;              // default: "100%"
  accentColor?: string;         // color del fill/stroke (default amber)
}
```

Implementación:
- Estilo de mapa: CARTO Dark Matter — `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` (mismo que tierra-map)
- `initialViewState`: usar `fitBounds(bbox)` con padding 40px
- `interactive: false` — el mapa de la slide es estático (no hay hover/click)
- Layer `district-fill`: fill amber a 20% opacidad + glow effect (outline blurred)
- Layer `district-outline`: stroke amber 2px
- Referencia arquitectónica: `tierra-map.tsx` — usar mismos patrones de Source/Layer, callbacks con refs, paint objects hoisted

**Nota SSR**: envolver en `dynamic(() => import('./SlideMap'), { ssr: false })` en el slide padre, ya que MapLibre no funciona en SSR.

### 5.5 `RadarFoda.tsx` _(Stretch goal — Acto I)_

Recharts `RadarChart` con dimensiones del perfil 5N o FODA. Si no hay datos suficientes, el componente retorna `null`.

Props:
```typescript
interface RadarFodaProps {
  fortalezas: number; // 0–100
  debilidades: number;
  oportunidades: number;
  amenazas: number;
  arraigo: number;
}
```

---

## 6. Slides con full rebuild

### 6.1 SlideHero

Layout: 2 columnas — foto izquierda (40%), identidad derecha (60%).

- Nombre: 56–64px, font-black, uppercase. Primera palabra `text-white`, apellido `text-amber-400`.
- Cargo: 12px uppercase tracking-widest, `text-white/50`
- Partido: pill con color del partido
- Slogan: entrecomillado `"..."`, 14px italic, `text-white/70`, borde izquierdo amber
- Foto: `object-cover`, sin border-radius (o radius mínimo), sombra derecha hacia el contenido

Eliminado: statsGrid genérico de la versión actual.

### 6.2 SlideContextoTerritorial

Layout: 2 columnas — mapa izquierda (55%), datos derecha (45%).

**Columna izquierda**: `<SlideMap>` con el polígono del distrito. Carga con `fetchDistritoDetail()`.  
**Columna derecha**:
- `<EditorialHeader>` con micro-label "ACTO II · TERRITORIO" y headline data-driven: `"${distrito} tiene ${padrón.toLocaleString()} electores"`
- 1 número MEGA: población total (54px, white)
- Barras de urgencia para los problemas del territorio (de `territorio_ecd.problemas_principales`):
  - Cada problema: label + barra de intensidad 1–5 con color por urgencia (red/amber/yellow)
- Stats en grid 2×2: Área km², PIM 2026, Ranking PIM, Densidad

Fallback: si no hay `DistritoDetail`, usar `simTerritorio(seed)` (mantener comportamiento actual) — pero sin mapa.

### 6.3 SlideConciencia

Layout: full-width, vertical.

- `<EditorialHeader>` con "ACTO II · CONCIENCIA ELECTORAL" + headline: `"Necesitás ${target - current} puntos más. Hay un plan."`
- `<GapBar current={c} target={t} weeks={w} totalVotes={padrón}>` — prominente, altura 80px para la barra
- Grid 3 col debajo: rival principal (nombre + %) | candidato (nombre + %) | índice de competitividad
- Nota editorial: `"Para ganar con [target]% necesitás capturar [votos] votos adicionales de los [padrón] habilitados."`

### 6.4 SlideDecision

"Órdenes de batalla" — tabla de segmentos electorales por tipo de votante.

- `<EditorialHeader>` con "ACTO III · CONTRA QUIÉN" + headline: `"3 segmentos. Cada uno necesita una estrategia diferente."`
- Tabla D5: filas = segmentos, columnas = Tipo | Tamaño | Potencial | Acción prioritaria
- Cada fila con color-coded left border por nivel de prioridad
- Sin gráfico de barras — la tabla es el protagonista

### 6.5 SlideNucleoGoberna

- `<EditorialHeader>` con "ACTO IV · CÓMO GANÁS" + headline: la propuesta central
- La propuesta ocupa el 80% de la slide — card grande con la propuesta principal de `nucleo_goberna`
- Tres sub-propuestas como tags debajo
- Sin distracciones: fondo oscuro, texto centrado, un solo CTA

### 6.6 SlideCierre

- Número de días hasta la elección: 84px, font-black — calculado desde `fecha_eleccion` o valor de `f2`
- Sub-label: "días para la elección"
- 3 acciones inmediatas: color-coded (amber/red/green), numeradas 01/02/03
- CTA: `"War Room activo"` — pill verde con punto parpadeante
- Eliminado: contenido genérico de la versión actual

---

## 7. Modificaciones a `Fase2F1Deck.tsx`

1. **Ampliar el tipo del catálogo** — agregar `isChapter?: boolean` a la entrada inline del `allCatalog`:
   ```typescript
   // El tipo anónimo del array allCatalog necesita: isChapter?: boolean
   { id: "chapter-1", label: "", isChapter: true, visible: true, formSection: null, node: <SlideChapter ...> }
   ```
2. **Importar** `SlideChapter` desde `./slides/shared/SlideChapter`
3. **Reorganizar `allCatalog`** según el orden del §4, con 4 entradas de capítulo intercaladas
4. **`TOTAL_CATALOG` sigue siendo 18** — las 4 slides de capítulo no se cuentan; calcular: `const total = slides.filter(s => !s.isChapter).length`
5. **Filtro de dots en footer**: las entradas con `isChapter: true` se renderizan como `w-1 h-1 rounded-full opacity-40` (más pequeñas, sin animación activo/pasado)
6. **`missing`**: el filtro `s.formSection !== null` ya excluye los capítulos automáticamente — sin cambios

---

## 8. Data flow por slide

| Slide | Fuente de datos | Campos reales |
|-------|----------------|-------------|
| SlideHero | `ctx` + `f2.fase1_rapida` | `ctx.user.full_name`, `f2.fase1_rapida?.candidato?.foto_url`, `f2.fase1_rapida?.branding?.slogan`, `ctx.organizacion_politica?.nombre` |
| SlideFichaTecnica | `ctx` + `f2` | `ctx.jurisdiccion.distrito?.id`, `ctx.cargo.nombre`, `ctx.organizacion_politica?.siglas` |
| SlideContextoTerritorial | `ctx` (snapshot) + `fetchDistritoDetail(id)` | `ctx.geojson`, `ctx.bbox`, `ctx.centroid` para el mapa (ya en el snapshot); `fetchDistritoDetail()` para padrón, PIM, área |
| SlideConciencia | `f2.territorio_ecd` | `c5_intencion_voto.pct_nuestro_candidato` (%), `c5_intencion_voto.candidato_puntero` (rival), `f2.votos_para_ganar.votos_meta`, `f2.fase1_rapida?.postulacion?.fecha_eleccion` |
| SlideDecision | `f2.territorio_ecd` | `d5_matrix[]`: `{segmento_id, mensaje_clave, canal_efectivo, prob_cambio}` |
| SlideNucleoGoberna | `f2.territorio_ecd.nucleo_goberna` | `propuesta_central`, `diferenciador_clave`, `segmentos_prioritarios[].accion_inmediata` |
| SlideCierre | `f2` + `f2.territorio_ecd` | `f2.fase1_rapida?.postulacion?.fecha_eleccion` (countdown), `nucleo_goberna.segmentos_prioritarios[0..2].accion_inmediata` (3 acciones) |

**Nota sobre geojson en SlideContextoTerritorial**: `CandidatoContext` tiene `geojson`, `bbox`, `centroid` directamente cuando viene del snapshot (`getFase2Deck`). Si son `null`, usar `fetchDistritoDetail()` como fallback. Eliminar la llamada redundante a `fetchDistritoDetail()` cuando el snapshot ya los trae.

---

## 9. Stack técnico

| Decisión | Justificación |
|----------|--------------|
| `@vis.gl/react-maplibre` v8 + CARTO Dark Matter | Ya instalado; patrón existente en `/tierra` |
| `recharts` v3 | Ya instalado; `RadarChart` + `ScatterChart` para stretch goals |
| `motion/react` | Ya usado para transiciones de slides; `SlideChapter` usa `motion.div` para entrada dramática |
| `dynamic(..., { ssr: false })` para `SlideMap` | MapLibre requiere `window` — no funciona en SSR |
| CSS `repeating-linear-gradient` para zona punteada de `GapBar` | Sin dependencia extra; coherente con el patrón en `tierra-map.tsx` |

---

## 10. Archivos a crear / modificar

### Crear
```
apps/web/app/onboarding/[slug]/fase-2/_components/slides/shared/
  EditorialHeader.tsx
  SlideChapter.tsx
  GapBar.tsx
  SlideMap.tsx
  RadarFoda.tsx          ← stretch goal
```

### Modificar (full rebuild)
```
apps/web/app/onboarding/[slug]/fase-2/_components/slides/
  SlideHero.tsx
  SlideContextoTerritorial.tsx
  SlideConciencia.tsx
  SlideDecision.tsx
  SlideNucleoGoberna.tsx
  SlideCierre.tsx
```

### Modificar (+ EditorialHeader)
```
  SlideFichaTecnica.tsx
  SlidePerfil5N.tsx
  SlideN1Identidad.tsx
  SlideN2Trayectoria.tsx
  SlideN3Riesgo.tsx
  SlideN4Patrimonio.tsx
  SlideResumenEjecutivo.tsx
  SlideTerreno.tsx
  SlideEstructura.tsx
  SlideSintesis.tsx
  SlidePentaDComparativa.tsx
  SlideHerramientas.tsx
```

### Modificar (orquestador + orden)
```
apps/web/app/onboarding/[slug]/fase-2/_components/Fase2F1Deck.tsx
```

---

## 11. Out of scope

- Modo PDF / impresión por slide (diferido)
- `RadarFoda` como slide independiente (diferido — la data de FODA completa no siempre está)
- `SegmentBubbles` Recharts (diferido — D5 como tabla es suficiente para el MVP)
- MapLibre interactivo en la presentación (hover, drill-down) — el mapa es estático
- Slides que no existen en el catálogo actual (no se agregan slides nuevas, solo se reorganizan)
