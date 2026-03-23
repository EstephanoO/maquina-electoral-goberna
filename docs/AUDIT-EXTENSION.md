# Prompt de auditoría exhaustiva — Extensión Chrome Goberna

> Copiar este prompt completo y pasárselo a un agente de IA con acceso al codebase.
> Última actualización: 2026-03-19

---

## Contexto del proyecto

Extensión Chrome MV3 para WhatsApp Web. Inyecta código en la página de WA Web para:
- **Blast**: enviar mensajes masivos a contactos de una campaña política (Perú)
- **Audio catalog**: enviar audios PTT pregrabados
- **Validación**: verificar si números tienen WhatsApp
- **Clasificación**: clasificar respuestas entrantes con IA (Gemini)
- **Scoring**: puntuar conversaciones por engagement

La extensión se comunica con un backend Fastify via un bridge de 3 capas:
```
inject (contexto MAIN, accede a window.require de WA) 
  ↕ postMessage
content.js (contexto CONTENT, relay entre inject y background)
  ↕ chrome.runtime.sendMessage  
background (Service Worker, hace fetch al backend API)
```

**Stack**: JavaScript puro (sin TypeScript, sin framework), esbuild IIFE, Chrome MV3.
**Backend**: Fastify + TypeScript + PostgreSQL + Redis, deployado en VPS.
**Restricción crítica**: esbuild IIFE snapshot — `export let` de estado mutable NO funciona, hay que usar getter functions.

---

## Archivos a auditar (9,691 líneas totales)

### Inject (contexto MAIN — accede a WA Web internals)
| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `src/inject/blast-panel.js` | 1,372 | Motor de blast: fetch batch → enviar → mark hablado → checkpoint |
| `src/inject/audio-catalog-panel.js` | 1,135 | Catálogo de audios TTS, envío como PTT, waveform |
| `src/inject/sidebar.js` | 1,017 | Panel lateral: UI completa, delegación de eventos, renderizado |
| `src/inject/wa-validator-panel.js` | 801 | Panel de validación de números WA |
| `src/inject/wa-module-installer.js` | 479 | Instalador de hooks en módulos internos de WA Web |
| `src/inject/validation-overlay.js` | 434 | Overlay visual sobre la lista de chats |
| `src/inject/jid-resolver.js` | 305 | Resolución de JID (WhatsApp ID) desde teléfonos |
| `src/inject/chat-opener.js` | 292 | Abrir chats programáticamente en WA Web |
| `src/inject/template-analyzer.js` | ~200 | Analiza plantillas por riesgo de spam |
| `src/inject/send-hook.js` | ~100 | Hook para interceptar envíos |
| `src/inject/bootstrap.js` | 47 | Constantes: WA_ORIGIN, getOwnNumber |

### Background (Service Worker)
| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `src/background/conversation-scorer.js` | 617 | Scoring de conversaciones por engagement |
| `src/background/blast-handlers.js` | ~170 | Handlers de mensajes del blast (form-contacts, mark-hablado, report) |
| `src/background/spam-detector.js` | 340 | Detector de patrones de spam |
| `src/background/audio-catalog-handlers.js` | 331 | CRUD de audios del catálogo |
| `src/background/received-handler.js` | 310 | Procesa mensajes entrantes (clasificación) |
| `src/background/sent-handler.js` | 204 | Procesa mensajes salientes |
| `src/background/api-client.js` | ~100 | Cliente HTTP para el backend |
| `src/background/classifier.js` | ~100 | Clasificador de mensajes |
| `src/background/classify-handler.js` | ~80 | Handler de clasificación |
| `src/background/message-aggregator.js` | ~80 | Agregador de mensajes para scoring |
| `src/background/gemini-fallback.js` | ~60 | Fallback a Gemini API |
| `src/background/classification-reporter.js` | ~50 | Reporter de clasificaciones al backend |
| `src/background/chat-opened-handler.js` | ~40 | Handler de chat abierto |
| `src/background/scorer-bootstrap.js` | ~30 | Bootstrap del scorer |
| `src/background/validation-client.js` | 47 | Cliente de validación |
| `src/background/wa-validator-handlers.js` | 63 | Handlers de validación WA |

### Bridge
| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `content.js` | 589 | Relay bidireccional inject ↔ background |

---

## Qué auditar — checklist exhaustivo

### 1. MEMORY LEAKS (prioridad máxima — la extensión se cuelga con uso prolongado)

```
□ window.addEventListener('message', ...) que se registran múltiples veces
  - ¿Se registra 1 vez al importar el módulo? ✓ OK
  - ¿Se registra dentro de una función que se llama repetidamente? ✗ LEAK
  
□ setInterval / setTimeout sin cleanup
  - ¿Cada setInterval tiene su clearInterval correspondiente?
  - ¿Los setTimeout dentro de loops crean closures que retienen scope?

□ Backbone event listeners (WA Web usa Backbone.js internamente)
  - ChatCollection.on('change') → NUNCA usar 'change' genérico, solo 'change:active'
  - MsgCollection.on('add') → ¿Se hace .off() cuando ya no se necesita?
  - ¿Los callbacks retienen referencias a Backbone Models innecesariamente?

□ Arrays/Sets/Maps que crecen sin límite
  - _sentThisSession, _sentIds, _habladoIds — ¿tienen trim/cleanup?
  - _trackedMsgs — ¿se limpian los items viejos?
  - _lastResults — ¿tiene cap de longitud?
  - _previewBuffer — ¿se limpia en resetSession?

□ DOM references retenidas
  - ¿Hay variables globales que referencian nodos DOM que se destruyen en re-render?
  - ¿Los closures de event listeners retienen scope de funciones grandes?

□ Blob URLs / AudioContext
  - ¿Se llama URL.revokeObjectURL() al destruir previews de audio?
  - ¿Se llama AudioContext.close() después de usarlo?

□ Promesas pendientes que nunca resuelven
  - ¿Los postMessage con timeout de respuesta limpian el listener al timeout?
  - ¿Los _pendingRequests se limpian correctamente?
```

### 2. PERFORMANCE (prioridad alta — WA Web se lentea)

```
□ innerHTML en hot paths
  - sidebar._renderContent() se llama cada 2s durante el blast
  - ¿Se destruye y recrea todo el DOM cada vez?
  - ¿Se puede hacer actualización selectiva (solo KPIs, timer, log)?

□ Event listener acumulación
  - ¿Se usa delegación de eventos (1 listener en contenedor)?
  - ¿O se registran N listeners en cada re-render? ← CRÍTICO

□ Funciones costosas en cada tick del blast
  - analyzeTemplates() — ¿se cachea?
  - _spamCheck() — ¿se llama por cada contacto o por batch?
  - JSON.stringify en logs — ¿en hot paths?

□ Regex compilación
  - ¿Las regex se crean como constantes de módulo o dentro de funciones?
  - _spinVariants, _applyVars, _previewSpin — ¿compilan regex en cada llamada?

□ DOM queries repetidas
  - document.getElementById / querySelector en handlers de alta frecuencia
  - ¿Se cachean las referencias?

□ WA Web event handlers pesados
  - MsgCollection.on('add') — ¿filtra rápido al inicio (grupo/broadcast)?
  - ChatCollection.on('change:active') — ¿usa el argumento del evento o hace .find()?
```

### 3. ROBUSTEZ (prioridad alta — bugs en producción)

```
□ Race conditions
  - startBlast() doble-click → ¿guard contra _previewLoading?
  - previewConfirm() + startBlast() → ¿se desactiva el botón?
  - _markHablado con await vs fire-and-forget → ¿se espera antes del siguiente batch?
  - Checkpoint polling + while loop → ¿requests duplicadas?

□ Estado inconsistente si un await falla a mitad
  - ¿Qué pasa si _markHablado falla en el await del checkpoint?
  - ¿Qué pasa si _fetchBatch falla durante el preview?
  - ¿Los estados (_running, _loopRunning, _previewLoading) se limpian en catch?

□ try/catch que tragan errores
  - Buscar todos los `catch (_) {}`, `catch {}`, `.catch(() => {})`
  - ¿Al menos logean un console.warn?
  - ¿Ocultan bugs reales?

□ esbuild IIFE gotchas
  - ¿Hay `export let` de estado mutable? → Siempre debe ser getter function
  - ¿Los imports cross-módulo acceden valores al momento del import (snapshot) o al momento de uso?

□ Módulos WA Web
  - ¿Se usa _requireAny con múltiples nombres fallback?
  - ¿Se valida duck-typing en vez de instanceof?
  - ¿Hay hardcoded module names sin fallback?
```

### 4. FLUJO DEL BLAST (prioridad alta — feature principal)

```
□ Flujo completo del envío
  - Start → Preview → Confirm → Loop (5 en 5) → Checkpoint a los 50
  - ¿Cada paso tiene guards contra estado inválido?
  - ¿El preview reemplaza correctamente al marcar/saltear?
  - ¿El checkpoint espera correctamente 50% de respuesta?

□ Dedup robusto
  - ¿_habladoIds se popula en TODOS los paths (enviado, no_wa, sin nombre, skip)?
  - ¿_persistDedup guarda en chrome.storage para sobrevivir recargas?
  - ¿El fetch del batch filtra con _habladoIds ANTES de procesar?
  - ¿El dedup de chrome.storage carga ANTES de que arranque el primer batch?

□ markHablado
  - ¿El UPDATE en el backend NO filtra por cms_status? (debe marcar sin condición)
  - ¿Se espera con await antes de pedir el siguiente batch?
  - ¿El no_wa_ids se manda separado y se marca distinto en DB?

□ Timing del blast
  - ¿delaySec=2 dentro del bulk, 30s entre bulks de 5?
  - ¿prewarmSec=0 para no agregar latencia?
  - ¿La pausa del checkpoint no tiene polling duplicado?
```

### 5. BRIDGE (content.js) — relay de mensajes

```
□ Completitud del bridge
  - ¿Cada tipo de mensaje del inject tiene su relay en content.js?
  - ¿Cada handler del background tiene su listener correspondiente?
  - ¿Los mensajes async usan `return true` en chrome.runtime.onMessage?
  
□ Mensajes sin handler
  - ¿Hay postMessage que se envían pero ningún listener los recibe?
  - ¿Hay handlers en background que responden a tipos que nadie envía?

□ Respuestas perdidas
  - ¿Los callbacks de sendResponse se llaman en TODOS los paths (success + error)?
  - ¿Hay handlers que olvidan llamar sendResponse en algún branch?
```

### 6. CÓDIGO MUERTO

```
□ Funciones exportadas que nadie importa
□ Variables declaradas pero no usadas  
□ Event handlers registrados para tipos de mensaje que no existen
□ Archivos completos que no se importan en inject-entry.js o background-entry.js
□ Condiciones que siempre son true/false
□ Parámetros de función que nunca se pasan
```

### 7. SEGURIDAD

```
□ ¿Se validan todos los inputs que llegan del postMessage?
□ ¿Se sanitiza el HTML antes de innerHTML? (_esc function)
□ ¿Los tokens/cookies se manejan solo en background (no en inject)?
□ ¿Hay datos sensibles (API keys, tokens) hardcodeados?
□ ¿El manifest.json tiene permisos excesivos?
```

---

## Formato de reporte esperado

Para cada problema encontrado:

```
### [ID] Título — Severidad: CRITICAL | HIGH | MEDIUM | LOW

**Archivo:** `nombre.js`, línea N
**Código actual:**
```js
// 3-5 líneas del código problemático
```

**Problema:** Explicación técnica clara de por qué es un problema.

**Fix:**
```js
// Código concreto del fix
```

**Impacto:** Qué mejora al aplicar este fix.
```

---

## Tabla resumen al final

| ID | Severidad | Archivo | Línea | Problema | Fix |
|---|---|---|---|---|---|
| ML-1 | CRITICAL | sidebar.js | 63 | innerHTML cada 2s | Actualización selectiva |
| ... | ... | ... | ... | ... | ... |

**Top 5 fixes de mayor impacto** ordenados por retorno/esfuerzo.

---

## Bugs conocidos ya resueltos (no reportar de nuevo)

Estos ya fueron encontrados y corregidos. Si alguno reaparece, reportar como regresión.

- ~~ChatCollection.on('change') genérico~~ → ya usa solo 'change:active'
- ~~addEventListener que se apila en cada re-render~~ → ya usa delegación de eventos
- ~~_spamCheck por cada contacto~~ → ya es 1x por batch
- ~~Blob URL sin revoke en audio~~ → ya se revoca
- ~~AudioContext sin close~~ → ya se cierra
- ~~Checkpoint polling duplicado~~ → ya eliminado
- ~~_numberHealth mutación local~~ → ya eliminada
- ~~Template literal roto en checkpoint UI (comillas simples vs backticks)~~ → ya corregido
- ~~previewSkip/previewRestore no-ops~~ → ya eliminados
- ~~analyzeTemplates sin cache~~ → ya cacheado
- ~~Botón Confirmar sin disable~~ → ya se desactiva
- ~~try/catch vacíos en blast-panel y wa-module-installer~~ → ya logean warnings
- ~~MsgCollection.on('add') sin filtro de grupo~~ → ya filtra al inicio
- ~~markHablado filtra por cms_status~~ → ya no filtra (marca sin condición)
- ~~updated_at columna inexistente~~ → usa cms_hablado_at
- ~~respondieron excluido del batch~~ → ya excluido
- ~~Auto-registro con hash débil~~ → ya usa primer slot libre
