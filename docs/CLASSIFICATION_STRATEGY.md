# Classification Strategy — programmatic vs Gemini

> **Principio rector**: Gemini es el último recurso, no el primero. Cada llamada
> cuesta tokens, latencia y un riesgo de respuesta inestable. El código
> programático corre siempre y resuelve el 60-70% de los casos. Gemini solo
> se invoca cuando el programático no puede decidir y el lead está en una
> etapa donde la clasificación importa.

## División por capa

### Capa 1 — Programmatic (siempre, sub-ms, gratis)

Corre en cada inbound, no requiere red, devuelve tags duras (alta confianza,
nunca inventa). Si no matchea, es honesto: devuelve vacío.

| Función | Input | Output | Implementación |
|---|---|---|---|
| `normalizePhone` | `+51 986 394 450` | `986394450` | `lib/country.ts` (existing) |
| `detectCountry` | phone | `Perú` / `Ecuador` / ... | `bot/classifier.ts:detectCountry` |
| `sanitizeContactName` | `"💕 Mi Amor"` | `""` (junk) | `backend/db.ts` (just added) |
| `keywordMatch(PRODUCT_RULES)` | text | `["Oratoria"]` | `bot/classifier.ts:classifyMessage` |
| `keywordMatch(KEYWORD_TAGS)` | text | `["voluntario", "sector_salud"]` | `electoral/voter-classifier.ts:KEYWORD_TAGS` |
| `detectIntent` (regex) | text | `greeting` \| `inquiry` \| `payment` \| `complaint` \| `unknown` | INTENT_RE existente |
| `detectMessageKind` | msg | `text` \| `image` \| `audio` \| `reaction` \| `group` | tipo de baileys.message |
| `detectLanguage` (heurístico) | text | `es` \| `pt` \| `en` \| `unknown` | char frequency / common words |
| `spamPatternCheck` | recent_messages | `low` \| `medium` \| `high` | `electoral/ai/routes.ts:analyzeSpamPatterns` |
| `engagementTransition` | direction + state | new state | `voter-profiles/repository.ts:applyEngagementTransition` |

**Tags emitidas por programmatic** llevan prefijos predecibles:
- `país:peru`, `país:ecuador`, …
- `idioma:es`, …
- `interés:oratoria`, `interés:gestion-parlamentaria`, … (slug del PRODUCT_RULE)
- `sector:salud`, `sector:educacion`, …
- `tipo:audio`, `tipo:imagen`, `tipo:reaction`, `tipo:grupo`
- `pide:dinero`, `pide:trabajo`, `pide:publicidad`
- `intent:greeting`, `intent:inquiry`, `intent:payment`

Si removemos un PRODUCT_RULE, los tags viejos persisten pero ya no se asignan
nuevos.

### Capa 2 — Rule-based (síncrono, gratis)

State machine + reglas duras. Determinista. Corren después del programmatic.

| Regla | Trigger | Acción |
|---|---|---|
| Engagement state machine | inbound/outbound + estado actual | transición a `comparte` / `responde` / `fidelizado` |
| Stage promotion | inbound nuevo + stage=`new` + intent=`inquiry` | stage → `interested` |
| Stage promotion | mención de "yape", "transferí", "comprar" + stage in (`interested`,`contacted`) | stage → `payment_pending` |
| Priority bump | urgency keywords ("urgente", "ya mismo", "necesito hoy") | priority → `high` |
| Auto-archive | inbound no_relevant (spam, broadcast forward, sticker only) | tag `archivado:auto`, no notifica |
| Operator assignment | nuevo lead + ruleset por línea/región | asignación round-robin |

### Capa 3 — Gemini Flash Lite (async, ~$0.0003/llamada, gateado)

**Solo se invoca si TODAS las condiciones se cumplen**:

```ts
function shouldUseGemini(input: { text, lead, programmatic_result }) {
  // 1. Mensaje significativo
  if (input.text.length < 15) return false;
  if (!/[a-záéíóúñ]/i.test(input.text)) return false; // sin letras
  if (programmatic_result.intent === 'greeting') return false;
  if (programmatic_result.intent === 'spam') return false;

  // 2. El programmatic no logró clasificar bien
  if (programmatic_result.confidence >= 0.8) return false; // claro
  if (programmatic_result.tags.length >= 3 && programmatic_result.has_course) return false;

  // 3. Etapa donde la clasificación importa
  const STAGES_WORTH_AI = ['new', 'contacted', 'interested', 'recontact', 'follow_up'];
  if (!STAGES_WORTH_AI.includes(input.lead.stage)) return false;

  // 4. No clasificamos al mismo lead 2x en 5 min (cache LRU del classifier)
  // (esto lo gestiona el cache mismo; doble check acá por defensa)

  // 5. Rate limit: no más de N llamadas a Gemini por minuto por bot
  // (Gemini Flash Lite tiene quota generosa pero igual)

  return true;
}
```

**Output esperado de Gemini** (JSON estructurado, `responseMimeType: application/json`):

```json
{
  "intent": "enrollment | question | payment_intent | complaint | spam | other",
  "course": "Gestión Parlamentaria | null",
  "sector": "salud | educación | gobierno | privado | null",
  "urgency": "alta | media | baja",
  "sentiment": "positivo | neutral | negativo | frustrado",
  "language": "es-PE | es-AR | pt-BR | en | …",
  "red_flags": ["asks_refund", "asks_personal_info", "threatens"],
  "confidence": 0.0-1.0,
  "reason": "1 frase explicativa"
}
```

**Tags emitidas por Gemini** llevan prefijo `ai:` para distinguirlas de las
duras:
- `ai:intent:enrollment`
- `ai:urgencia:alta`
- `ai:sentiment:positivo`
- `ai:lang:es-pe`
- `ai:red_flag:asks_refund`

Esto deja claro al operador: **`interés:oratoria`** (regex, casi nunca falla)
vs **`ai:intent:enrollment`** (Gemini, puede equivocarse).

### Capa 4 — Auto-reply suggestion (Gemini, opt-in, no auto-envío)

**No hay auto-reply automática.** En lugar de eso, cuando un lead nuevo o de
alto valor manda un inbound, Gemini genera una respuesta sugerida que el
operador ve como "💡 Sugerencia IA" en el chat. Un tap → enviar. Edit y enviar.
Discard.

Gates:
- Solo si `lead.stage in (new, interested)`.
- Solo si hay un PRODUCT_RULE matched (sabemos qué curso ofrecerle).
- Cooldown 30 min por lead (no spammear sugerencias si el operador no la usó).

## Pipeline visual

```
Inbound message
    │
    ▼
┌─────────────────────────────────┐
│ 1. PROGRAMMATIC (always)        │
│    • normalize phone, country   │
│    • sanitize name              │
│    • PRODUCT_RULES → courses    │
│    • KEYWORD_TAGS → tags duras  │
│    • INTENT_RE → intent base    │
│    • spamPatternCheck           │
│    • engagementTransition       │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ 2. RULE-BASED (always)          │
│    • stage transitions          │
│    • priority bumps             │
│    • operator assignment        │
└────────────┬────────────────────┘
             │
             ▼ confidence >= 0.8?
        ┌────┴────┐
        │   YES   │ → DONE (no Gemini call)
        └─────────┘
             │
        ┌────┴────┐
        │   NO    │
        └────┬────┘
             ▼ shouldUseGemini()?
        ┌────┴────┐
        │   NO    │ → DONE (acepta clasificación parcial)
        └─────────┘
             │
        ┌────┴────┐
        │   YES   │
        └────┬────┘
             ▼
┌─────────────────────────────────┐
│ 3. GEMINI Flash Lite (async)    │
│    • ~300 tokens/call           │
│    • LRU cache 5 min            │
│    • timeout 8s                 │
│    • output JSON estructurado   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ 4. MERGE                        │
│    hard tags + ai: tags         │
│    AI gana en intent ambiguo;   │
│    regex gana en course exacto  │
└────────────┬────────────────────┘
             │
             ▼
        voter_profile.ai_classification
        + tags merge
        + ai_classification.confidence
```

## Costos esperados (sandbox + escuela)

Volumen actual visible: ~10 inbounds/hora × 24 × 30 = ~7,200/mes.

| Concepto | % | Calls/mes | Tokens/call | Costo Gemini Flash Lite |
|---|---|---|---|---|
| Skipped por programmatic ≥0.8 | ~40% | 0 | 0 | $0 |
| Skipped por shouldUseGemini gate | ~30% | 0 | 0 | $0 |
| Cache hit (mismo texto en 5 min) | ~10% | 0 | 0 | $0 |
| **Llamadas reales a Gemini** | **~20%** | **~1,440** | 400 in + 100 out | **~$0.10/mes** |

Auto-reply suggestions (capa 4) son opt-in, ~50/mes con gates, costo ~$0.05/mes.

**Total estimado**: $0.15-0.30/mes. Trivial. El cuello no es costo, es calidad
del output. Por eso Gemini solo en casos donde aporte valor.

## Decisiones tomadas

1. **Tags hard vs soft**: prefix `interés:`/`país:`/`tipo:` para hard,
   `ai:` para soft. El operador sabe a primera vista cuál es regla y cuál
   es IA.
2. **Course nunca lo decide Gemini si regex matchea**: regex es lossy pero
   nunca inventa. Si "Gestión Parlamentaria" matchea, esa es la course.
   Gemini solo opina cuando regex devuelve nada.
3. **AI auto-reply nunca envía solo**: siempre revisión humana. Reduce risk
   de mensajes raros + permite al operador aprender de las sugerencias.
4. **Cache LRU 5 min** evita llamadas repetidas en blast/forward (ej: el
   mismo "¡Hola! Deseo inscribirme al Diploma…" desde 2 phones distintos
   en pocos segundos = 1 llamada, no 2).
5. **No se almacena el raw_payload de Gemini en la DB** salvo en `ai_classification.reason` (1 frase). El JSON entero se mantiene en logs para auditoría.

## Lo que NO hace Gemini (a propósito)

- **Decidir el `assigned_to`** (qué operador maneja el lead): es regla de negocio del cliente, no problema de IA.
- **Auto-archivar**: la decisión de archivar la tomamos con reglas (spam check + criterios duros).
- **Modificar el `stage`**: la state machine es la única que toca el stage. Gemini puede sugerir pero no escribe.
- **Llamadas a APIs externas**: Gemini no orquesta; es solo classifier de texto.
- **Generar contenido masivo**: bulk send es plantillas + merge fields; no IA.

## Cómo se monitorea

Métricas a exponer en un dashboard interno (futuro):
- `classifier.calls.programmatic_only` — cuántos casos resueltos sin Gemini
- `classifier.calls.gemini_invoked` — cuántas llamadas reales
- `classifier.gemini.cache_hit_rate` — efectividad del LRU
- `classifier.gemini.confidence_avg` — calidad de las respuestas
- `classifier.gemini.timeout_rate` — issues de red
- `classifier.tags.coverage` — % de leads que reciben al menos 1 tag

Si `gemini_invoked > 30%`: revisar gates, agregar más PRODUCT_RULES.
Si `confidence_avg < 0.6`: el prompt necesita mejor calibración.
