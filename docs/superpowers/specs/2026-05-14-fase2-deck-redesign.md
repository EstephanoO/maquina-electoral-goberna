# Fase 2 deck — rediseño visual + estructura narrativa

**Fecha**: 2026-05-14
**Autores**: estephano + Claude (brainstorming)
**Referencia visual**: `ROBERTO SANCHEZ - SEGUNDA VUELTA.pptx-3.pdf` (27 slides)

## 1. Problema

El deck actual de `/onboarding/[slug]/fase-2` tiene 8 slides genéricas con visual neutro. El formulario captura mucho más (perfil 5N, territorio ECD, debilidades, segmentación, presencia digital con status, partidos top, propuestas, recorrido estratégico, fórmula electoral, votos para ganar) que hoy no se renderiza o se renderiza tibio.

El PDF de Roberto Sánchez muestra un lenguaje visual y una composición narrativa que:
- Hace los datos impactantes (stamps de RIESGO CRÍTICO, tags amarillos tilteados, headers navy con underline amber)
- Cuenta una historia clara: diagnóstico → análisis territorial → estrategia → herramientas → cierre
- Mantiene legibilidad pareja entre slides cinematic y slides de datos

## 2. Objetivo

Que el deck Fase 2 entregado al cliente:
- Use el lenguaje visual del PDF (navy + amber + cloudy bg + tags + stamps)
- Tenga 14 slides organizadas siguiendo la narrativa del PDF
- Se llene automáticamente con los datos que el consultor ya carga en el form
- Sea adaptativo: slides sin datos se saltan, no aparecen vacías
- Pase verificación visual con Playwright contra el PDF de referencia

## 3. Camino elegido

**C — Híbrido**: reskin de las 8 slides actuales + 6 slides nuevas data-driven. Sin integrations externas (ONPE en vivo, Meta ads spend) en esta fase — esos slides quedan diferidos.

Descartados:
- A (port completo) — requiere endpoints externos que no tenemos. Slides ONPE/Meta quedarían placeholders.
- B (solo reskin) — desaprovecha datos que el form ya captura.

## 4. Sistema visual

### Paleta
```
navy        #0a1f4a   // primario, headers, fondos data
navy-deep   #020a1e   // backgrounds cinematic
amber       #f6c11a   // accent, tags, underlines, highlights
amber-soft  #fde68a   // highlight backgrounds
white       #ffffff   // texto sobre navy
risk-red    #dc2626   // stamps de RIESGO CRÍTICO
risk-orange #f97316   // RIESGO ALTO
risk-yellow #facc15   // RIESGO MEDIO
risk-green  #22c55e   // RIESGO BAJO / OK
```

### Tipografía
- H1 slides: Montserrat 900, uppercase, tracking-tight
- H2: Montserrat 800, uppercase
- Body: Montserrat 400/500
- Stamps: Montserrat 900 con rotate(-12deg)

### Componentes chrome (en `_components/chrome/`)

| Componente | Propósito |
|---|---|
| `<SlideChromeCinematic />` | Fondo cielo nublado navy + amber strip inferior + slot para tags |
| `<SlideChromeData />` | Header navy con título + thin amber underline + cuerpo blanco |
| `<TagTilt label rotation />` | Etiqueta amarilla tilteada con sombra (RUMBO, PASO 1, etc.) |
| `<RiesgoStamp level="critico\|alto\|medio\|bajo" />` | Stamp rotado bordes punteados |
| `<DataTable />` | Tabla con header row amber + cuerpo blanco/gris |
| `<CheckList items={[]} />` | Lista con check-circles amarillos |

## 5. Inventario de slides (14)

| # | Slide | Tipo | Visible si | Componente |
|---|---|---|---|---|
| 1 | **Carta** (mapa + identity card con progress) | cinematic | siempre | `SlideCarta` (ya existe) |
| 2 | **Hero candidato** | cinematic | siempre | `SlideHero` (consolida cover+hero del PDF) |
| 3 | **¿Quién es?** (narrativa) | data | `quien_es.texto_libre` o `perfil_candidato.n2_trayectoria` no vacío | `SlideQuienEs` |
| 4 | **Presencia digital** (4-up: Google · FB · IG · WhatsApp) | data | algún canal en `redes_sociales.candidato` o `presencia_digital.*` poblado | `SlidePresenciaDigital` |
| 5 | **Debilidades / Riesgos** | data | `debilidades.fuentes[].estado !== 'ok'` o `lista_libre[].length > 0` | `SlideDebilidades` |
| 6 | **Ficha técnica** | data | siempre (snapshot mínimo) | `SlideFichaTecnica` |
| 7 | **FODA** | data | algún array (fortalezas/debilidades/oportunidades/amenazas) no vacío | `SlideFoda` (reskin) |
| 8 | **Propuestas** | data | `fase1_rapida.propuestas[].length > 0` | `SlidePropuestas` (reskin) |
| 9 | **Segmentación del voto** | data | `territorio_ecd.c2_segmentos[].length > 0` | `SlideSegmentos` |
| 10 | **% de votos necesarios** | data | `votos_para_ganar.padron_actual` o `.votos_meta` no vacío | `SlideVotosNecesarios` |
| 11 | **Cómo reorganizar el voto** (3 pasos) | data | `recorrido_estrategico.hitos[].length >= 1` | `SlideReorganizar` |
| 12 | **Arquitectura META + Estrategia** | data | `formula_electoral.*` o `fase1_rapida.estrategia.*` poblado | `SlideArquitectura` |
| 13 | **Herramientas Goberna** | data | siempre (static) | `SlideHerramientas` |
| 14 | **Cierre / War Room CTA** | cinematic | siempre | `SlideCierre` (reskin) |

Slides nuevas: 3, 4, 5, 9, 10, 11, 12, 13. Slides reskinneadas: 2, 6, 7, 8, 14. Slide mantenida: 1.

## 6. Data wiring

Detalle por slide nueva (las reskinneadas conservan el wiring actual):

### Slide 3 — `SlideQuienEs`
- **Lee**: `consultor_form.quien_es.{texto_libre, trayectoria, valores}`, `perfil_candidato.n1.bio_corta`, `n2_trayectoria.{logros_principales, formacion, historial_laboral}`
- **Layout**: header "¿QUIÉN ES <NOMBRE>?" + dos columnas (narrativa + bullets de trayectoria/logros)
- **Tag**: opcional "Trayectoria" en amber tilteado

### Slide 4 — `SlidePresenciaDigital`
- **Lee**: `presencia_digital.{web_oficial, google_results, redes_verificadas, info_clave, notas}` + `redes_sociales.candidato.{facebook, instagram, tiktok, twitter, youtube, web_oficial, whatsapp}`
- **Layout**: header "¿QUIÉN ES? — PRESENCIA DIGITAL" + grid 2×2 (Google · Facebook · Instagram · WhatsApp), cada celda con icon de canal + handle/url + status + `<RiesgoStamp>` (status `ok` → BAJO verde · `review` → MEDIO amarillo · `flag` → CRÍTICO rojo)
- **Footer**: `presencia_digital.notas` como caption

### Slide 5 — `SlideDebilidades`
- **Lee**: `debilidades.fuentes[]` (denuncias/google/reputacion/jne con estado y hallazgos) + `lista_libre[]` (titulo + severidad)
- **Layout**: header "DEBILIDADES" + tabla left (fuentes con stamps) + lista right (lista_libre ordenada por severidad alta→baja)
- **Stamp global**: `nivel_riesgo_global` (de `perfil_candidato.n3_riesgo`) si existe → stamp grande arriba derecha

### Slide 9 — `SlideSegmentos`
- **Lee**: `territorio_ecd.c2_segmentos[]` (id, nombre, pct_aprox, valores, aspiraciones, temores, problema_principal) + `nucleo_goberna.segmentos_prioritarios[]`
- **Layout**: header "DIVISIÓN DE LOS VOTOS" + tabla 3 cols (Segmento · Características clave · Objetivo estratégico) — característica = `valores.join(' · ')` + `problema_principal`; objetivo = mensaje_central del núcleo si está mapeado, sino vacío
- **Footer**: texto fijo "La victoria no depende solo de fortalecer la base..."

### Slide 10 — `SlideVotosNecesarios`
- **Lee**: `votos_para_ganar.{padron_actual, votos_meta, votos_ganador_anterior, fuente}` + `historial.entries[]` (para mini-tabla histórica de % obtenidos)
- **Layout**: header "PORCENTAJE DE VOTOS NECESARIOS" + dos tablas verticales (% válidos ganador anterior vs % válidos meta) + flecha amber descendente entre ellas
- **Si hay historial**: tabla izquierda con histórico de elecciones del candidato

### Slide 11 — `SlideReorganizar`
- **Lee**: `recorrido_estrategico.hitos[0..2]` (toma los primeros 3; si hay menos, renderiza solo los que hay)
- **Layout**: header "¿CÓMO REORGANIZAR EL VOTO?" + 3 cards amarillas grandes con `<TagTilt label="PASO N" />` afuera + titulo del hito + descripcion abajo
- Si hay menos de 1 hito, slide se skipea

### Slide 12 — `SlideArquitectura`
- **Lee**: `formula_electoral.{presupuesto_total, peso_aire, peso_mar, peso_tierra, justificacion}` + `fase1_rapida.estrategia.{frente_principal, eje_emocional, tipo_campana}`
- **Layout**: header "HERRAMIENTA — PAUTAS DE META" + tag amber "PAUTAS DE META" + tabla "ARQUITECTURA" con 3 filas (Captación · Persuasión · Conversión); cada fila tiene Objetivo / Público / Tipo contenido / Rol que se DERIVA de `frente_principal` + pesos
  - **Mapeo**: Captación = AIRE (visibilidad), Persuasión = TIERRA (propuesta), Conversión = MAR (decisión). Es una interpretación; debate aparte si no convence.

### Slide 13 — `SlideHerramientas`
- **Lee**: nada (static)
- **Layout**: header "HERRAMIENTAS DE CAMPAÑA ESTRATÉGICA" + 3 cards (Social Listening · CRM · Plataforma Territorio) con imagen + label debajo

## 7. Cambios de schema

Una sola adición:

```ts
// apps/web/lib/onboarding-api.ts
// apps/backend/src/modules/decks/fase2-form.ts
export type SocialHandles = {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  twitter?: string;
  youtube?: string;
  web_oficial?: string;
  whatsapp?: string;   // ← nuevo
};
```

Sin migración SQL (`decks.consultor_form` es JSONB).

Si la UI de edición del form Fase 2 ya tiene inputs por handle, agregar el campo `whatsapp` ahí también. Si edita por JSON crudo, no hay nada que tocar.

## 8. Render adaptativo

`Fase2F1Deck.tsx` cambia a:

```ts
const visibleSlides = useMemo(() => {
  return ALL_SLIDES
    .map((s) => ({ ...s, visible: s.isVisible(ctx, f2) }))
    .filter((s) => s.visible);
}, [ctx, f2]);
```

Indicador footer: "Mostrando N / 14 — completá el form para desbloquear más slides", con link a `/onboarding/<slug>/fase-2/form` (o donde sea el form).

## 9. Estructura de archivos

```
apps/web/app/onboarding/[slug]/fase-2/_components/
├── Fase2SlugClient.tsx          (sin cambios — pasa ctx al deck)
├── Fase2F1Deck.tsx              (refactor: slides adaptativas + indicador)
├── chrome/
│   ├── SlideChromeCinematic.tsx (nuevo)
│   ├── SlideChromeData.tsx      (nuevo)
│   ├── TagTilt.tsx              (nuevo)
│   ├── RiesgoStamp.tsx          (nuevo)
│   ├── DataTable.tsx            (nuevo)
│   └── CheckList.tsx            (nuevo)
└── slides/
    ├── SlideCarta.tsx           (ya existe — mapa)
    ├── SlideHero.tsx            (nuevo — consolida cover/hero del PDF)
    ├── SlideQuienEs.tsx         (nuevo)
    ├── SlidePresenciaDigital.tsx (nuevo, 4-up)
    ├── SlideDebilidades.tsx     (nuevo)
    ├── SlideFichaTecnica.tsx    (reskin de SlideFichaBasica)
    ├── SlideFoda.tsx            (reskin SlideF1Foda)
    ├── SlidePropuestas.tsx      (reskin SlideF1Propuestas)
    ├── SlideSegmentos.tsx       (nuevo)
    ├── SlideVotosNecesarios.tsx (nuevo)
    ├── SlideReorganizar.tsx     (nuevo)
    ├── SlideArquitectura.tsx    (nuevo, consolida formula+estrategia)
    ├── SlideHerramientas.tsx    (nuevo, static)
    └── SlideCierre.tsx          (reskin SlideF1Cierre)
```

Los archivos antiguos (`SlideF1Hero`, `SlideF1Foda`, etc.) se renombran o se borran según corresponda — no se duplica.

## 10. Verificación con Playwright

Usar la skill `example-skills:webapp-testing` para:

1. **Levantar dev server local**: `bun run dev` en `apps/web` + backend en `apps/backend`.
2. **Seed de datos**: ejecutar un script que llene un candidato de prueba con datos completos en cada sección del form (para que las 14 slides estén visibles).
3. **Capturar screenshot por slide**: navegar `/onboarding/<slug>/fase-2`, avanzar slide por slide con la flecha derecha, capturar PNG de cada slide. Output: `_onboarding-preview-docs/fase2-redesign/<slug>/slide-N.png`.
4. **Verificar slide vacío**: crear segundo candidato con form mínimo (solo identidad), confirmar que el deck muestra ~3 slides (Carta, Hero, Ficha, Cierre) en vez de 14.
5. **Comparación side-by-side**: armar HTML local con screenshot del PDF al lado de screenshot del deck nuevo, slide por slide. Output: `_onboarding-preview-docs/fase2-redesign/compare.html`.

Sin assertions automáticas de pixel-diff — la comparación es visual humana.

## 11. Criterios de aceptación

- [ ] Las 14 slides existen como componentes en `_components/slides/`
- [ ] `Fase2F1Deck` renderiza solo slides visibles según data
- [ ] Paleta cerrada: ningún color hardcoded fuera de la lista del §4
- [ ] Tipografía consistente: solo Montserrat en weights 400/500/700/800/900
- [ ] Type-check pasa en backend y web (`bunx tsc --noEmit`)
- [ ] Build pasa (`bun run build` en `apps/web`)
- [ ] Screenshots Playwright generados para los 2 candidatos (full + mínimo) — output committeable en `_onboarding-preview-docs/`
- [ ] Slide 4 (Presencia digital) renderiza stamps RIESGO dinámicos según `presencia_digital.*` status
- [ ] Slide 5 (Debilidades) ordena lista por severidad alta→baja
- [ ] Slide 11 (Reorganizar) renderiza 1, 2 o 3 pasos según length de `hitos`
- [ ] Footer del deck muestra contador "Mostrando N / 14"

## 12. Out-of-scope (defered)

- Ingest de resultados ONPE en vivo (slide 2 del PDF "Resultados al 96.735%")
- Ingest de inversión Meta Ads (slide 9 del PDF "Inversión en META — S/2.6k")
- Mapas comparativos 2da/1ra vuelta con coropleta animada
- Slide "Condiciones de Contratación" / "Gracias" (comercial — fuera del deck Fase 2)
- Modo edit-inline para los slides nuevos (puede llegar después, copia el patrón `EditableT` existente)
- PDF export del deck rediseñado (deck rendering existente lo soporta vía pintura de HTML estático)

## 13. Open questions

- **¿El indicador "Mostrando N / 14" debe linkear a un form interno o al wizard de fase-2?** — Asumo form interno; confirmar.
- **Stamps de RIESGO ¿solo en presencia digital o también en debilidades por severidad?** — Asumo ambos; en debilidades el size del stamp escala con severidad.
- **Mapeo Captación/Persuasión/Conversión ↔ Aire/Mar/Tierra** — interpretación mía; el cliente puede querer otro mapping. Si dudoso, mejor exponer las 3 etiquetas como editable_text.
