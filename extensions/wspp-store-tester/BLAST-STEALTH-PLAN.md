# Plan: Blast Stealth Mode + Robustez

> Estado actual: 1,126 hablados / 26,361 pendientes / 48% tasa de respuesta
> Objetivo: llegar a 26k contactos sin baneo, con máxima tasa de respuesta
> Fecha: 2026-03-17

---

## Estado actual vs lo que falta

| Qué tenemos | Qué falta |
|---|---|
| Spintax `[var1\|var2]` + separador `---` | Análisis pre-envío de las plantillas (detectar patrones de spam ANTES de enviar) |
| 3 plantillas que rotan 1→2→3 | Variación de estructura (no solo texto: también largo, puntuación, emojis) |
| Delay 15s entre contactos | Delay gaussiano (no uniforme) + typing indicator antes de cada msg |
| Spam detector local + server (Gemini) | El detector no evalúa las plantillas — solo mensajes ya enviados |
| USyncQuery pre-check | No se usa el resultado `out` vs `invalid` para analytics |
| Dedup local `_sentThisSession` | Sin persistencia — si recargás la página se pierde |
| `blast_log` vacío (bug del `updated_at`) | Ya arreglado pero sin datos históricos |
| 1 número WA enviando | Sin rotación de números / cooldown por número |
| Horario libre (24h) | Sin ventana horaria (enviar de madrugada = ban) |

---

## Fase 1 — Stealth: comportamiento humano real (extensión)

### 1.1 Typing indicator antes de cada mensaje
**Archivo:** `blast-panel.js` → `_sendToChat()`

Antes de llamar `addAndSendMsgToChat`, enviar `sendChatStateComposing(chat.id)` y esperar un delay proporcional al largo del texto (30ms por carácter, mín 800ms, máx 4s). Después enviar el mensaje. Esto hace que el destinatario vea "escribiendo..." antes de recibir, exactamente como un humano.

```
composing → delay(largo_texto * 30ms) → send → paused
```

### 1.2 Delay gaussiano (no uniforme)
**Archivo:** `blast-panel.js` → delays del loop

El delay actual es `delaySec ± 30%` uniforme. Un humano real no tiene distribución uniforme — tiene picos y valles. Reemplazar por distribución gaussiana (Box-Muller) con:
- Media: `delaySec` (configurable, default 15s)
- Desviación: `delaySec * 0.4`
- Clamp: mínimo 5s, máximo `delaySec * 3`

Además, cada 3-7 mensajes (aleatorio), agregar un "micro-descanso" de 30-90s que simula que el humano se distrajo, tomó agua, leyó otro chat.

### 1.3 Ventana horaria
**Archivo:** `blast-panel.js` → `startBlast()`

No enviar fuera de horario. Reglas:
- Lunes a Viernes: 8:00 - 20:00 (hora Perú, UTC-5)
- Sábado: 9:00 - 14:00
- Domingo: NO enviar
- Si el blast está corriendo y llega la hora límite → pausa automática con toast

### 1.4 Warm-up gradual para números nuevos
**Archivo:** `blast-panel.js` → `startBlast()`

Si el número WA (celular) tiene menos de 3 días de uso en blast:
- Día 1: máximo 30 contactos/día
- Día 2: máximo 80 contactos/día
- Día 3+: máximo 200 contactos/día (con pausas)

El backend ya sabe cuántos envió cada número — agregar endpoint `GET /api/blast/number-health` que devuelve la edad y volumen del número.

---

## Fase 2 — Análisis de plantillas pre-envío

### 2.1 Detector de plantillas riesgosas (local)
**Archivo nuevo:** `src/inject/template-analyzer.js`

Antes de iniciar el blast, analizar cada plantilla y devolver score de riesgo:

| Señal de riesgo | Puntos | Explicación |
|---|---|---|
| Tiene URL/link | +30 | WA penaliza links en mensajes masivos |
| Tiene más de 3 emojis | +10 | Parece promotional |
| Texto > 300 caracteres | +10 | Mensajes largos de desconocidos = spam |
| No tiene `{{nombre}}` en ninguna variante | +20 | Sin personalización = broadcast |
| Todas las variantes `[x\|y]` tienen < 3 opciones | +10 | Poca variación real |
| Contiene "oferta", "descuento", "gratis", "promo" | +25 | Palabras trigger de spam |
| Contiene número de teléfono | +15 | Redirección = spam |
| Las 3 plantillas son muy similares entre sí (Levenshtein > 0.7) | +15 | Variación insuficiente |
| No tiene `---` (un solo mensaje) | +5 | Menos natural que multi-mensaje |

**Score:**
- 0-20: OK
- 21-40: Advertencia amarilla (sidebar muestra warning)
- 41+: Rojo — no deja iniciar el blast sin confirmación

### 2.2 Sugerencias automáticas
Si el score es > 20, mostrar sugerencias concretas:
- "Agregá `{{nombre}}` al inicio del saludo"
- "Agregá más variantes — mínimo 3 opciones por cada `[...]`"
- "Reducí el largo del mensaje a menos de 200 caracteres"
- "Eliminá el link — envialo en un segundo mensaje después de que respondan"

### 2.3 Análisis server-side (Gemini) antes de arrancar
**Endpoint:** `POST /api/ai/analyze-templates`

Enviar las 3 plantillas al backend. Gemini las analiza y devuelve:
- Score de riesgo global
- Sugerencias de mejora
- Variantes alternativas sugeridas (que el usuario puede aceptar con 1 click)

---

## Fase 3 — Rotación y cooldown de números

### 3.1 Cooldown por número
**Archivo:** `blast-panel.js` + backend `blast/repository.ts`

Cada número WA tiene un límite de envíos por hora y por día:
- Por hora: máximo 50 mensajes
- Por día: máximo 200 mensajes
- Si se acerca al límite → pausar ese número y avisar

Backend endpoint: `GET /api/blast/number-health?wa_number=51977655953`
```json
{
  "ok": true,
  "sent_last_hour": 23,
  "sent_today": 89,
  "hourly_limit": 50,
  "daily_limit": 200,
  "age_days": 5,
  "warm_up_limit": 200,
  "risk_level": "low",
  "can_send": true,
  "next_available_at": null
}
```

### 3.2 Rotación automática (futuro — 6 celulares)
Cuando haya 6 celulares activos:
- El backend asigna segmentos de contactos a cada número
- Cada número tiene su propio cooldown
- Si un número llega al límite, los contactos pendientes se redistribuyen
- El sidebar muestra qué número está enviando y cuántos le quedan

---

## Fase 4 — Métricas y dashboard en el sidebar

### 4.1 Stats en tiempo real (sidebar)
Agregar al sidebar:

```
╔══════════════════════════════════╗
║  Sesión actual                    ║
║  Enviados: 47 / 100              ║
║  Entregados: 43 (91%)            ║
║  Leídos: 28 (60%)               ║
║  Sin WA: 6                       ║
║  Velocidad: 3.2 msg/min          ║
║  Tiempo restante: ~17 min        ║
║  Plantilla actual: #2 de 3       ║
║                                   ║
║  ⚡ Riesgo: BAJO                 ║
║  📊 Repetición: 8%              ║
║  ⏱️ Delay promedio: 18s         ║
╚══════════════════════════════════╝
```

### 4.2 Historial persistente (backend)
**Endpoint:** `GET /api/blast/stats`

```json
{
  "total_sent": 1126,
  "total_delivered": 1024,
  "total_read": 892,
  "total_responded": 1028,
  "total_no_wa": 234,
  "total_pending": 26361,
  "response_rate": 0.48,
  "avg_delivery_rate": 0.91,
  "today": {
    "sent": 101,
    "responded": 12
  },
  "by_number": {
    "51977655953": { "sent": 1126, "today": 101 }
  }
}
```

---

## Fase 5 — Detección de respuestas + auto-exclusión

### 5.1 Si alguien responde → sacarlo del blast
**Ya parcialmente implementado** via `MsgCollection.on('add')` para msgs entrantes.

Agregar: si un contacto que está en la cola del blast envía un mensaje, marcarlo como `respondieron` en el backend inmediatamente y sacarlo de la cola para que no le lleguen más mensajes masivos.

### 5.2 Si alguien bloquea / reporta
WA no notifica directamente cuando te bloquean, pero sí se puede detectar:
- `ack` nunca pasa de 1 (sent) → después de 24h, marcar como "posible bloqueo"
- Si el número tenía `ack: 2` (delivered) antes y ahora no → sospechoso

---

## Prioridad de implementación

| Prioridad | Fase | Impacto | Esfuerzo |
|---|---|---|---|
| **P0** | 1.1 Typing indicator | Alto — reduce detección de bot significativamente | 30 min |
| **P0** | 1.2 Delay gaussiano + micro-descansos | Alto — patrón más humano | 45 min |
| **P0** | 1.3 Ventana horaria | Alto — evita envíos de madrugada = ban inmediato | 30 min |
| **P1** | 2.1 Análisis de plantillas local | Medio — previene plantillas riesgosas | 1h |
| **P1** | 4.1 Stats en tiempo real en sidebar | Medio — visibilidad operacional | 1h |
| **P1** | 3.1 Cooldown por número | Medio — protección contra sobre-uso | 1.5h |
| **P2** | 1.4 Warm-up gradual | Medio — protección para números nuevos | 1h |
| **P2** | 2.2 Sugerencias automáticas | Bajo — nice-to-have | 45 min |
| **P2** | 5.1 Auto-exclusión por respuesta | Medio — evita molestar a quien ya respondió | 1h |
| **P3** | 2.3 Análisis Gemini de plantillas | Bajo — el local ya cubre bastante | 2h |
| **P3** | 3.2 Rotación de 6 números | Alto pero requiere 6 celulares activos | 3h |
| **P3** | 5.2 Detección de bloqueo | Bajo — señal indirecta | 1h |

---

## Archivos afectados por fase

### Fase 1 (P0 — hacer YA)
- `src/inject/blast-panel.js` — typing, delay gaussiano, ventana horaria
- `src/inject/sidebar.js` — mostrar ventana horaria activa + risk indicator

### Fase 2 (P1)
- `src/inject/template-analyzer.js` — **nuevo** archivo
- `src/inject/sidebar.js` — warning de plantillas antes de iniciar

### Fase 3 (P1)
- `apps/backend/src/modules/blast/routes.ts` — endpoint `number-health`
- `apps/backend/src/modules/blast/repository.ts` — query de conteo por número
- `src/inject/blast-panel.js` — check number-health antes de cada sesión

### Fase 4 (P1)
- `src/inject/sidebar.js` — panel de stats expandido
- `apps/backend/src/modules/blast/routes.ts` — endpoint `stats` mejorado

### Fase 5 (P2)
- `src/inject/wa-module-installer.js` — hook de msgs entrantes
- `src/inject/blast-panel.js` — check si contacto respondió antes de enviar

---

## Qué NO hacer (anti-patterns de blast)

1. **No enviar links en el primer mensaje** — WA penaliza links de desconocidos
2. **No enviar el mismo texto a más de 10 personas** — broadcast = ban
3. **No enviar más de 50 msgs/hora por número** — umbral de WA
4. **No enviar de madrugada** — 0-7am = sospechoso
5. **No enviar los 7 días de la semana** — un humano descansa
6. **No enviar sin `{{nombre}}`** — personalización = legitimidad
7. **No usar caracteres especiales/unicode decorativo** — parece spam
8. **No enviar mensajes de más de 300 caracteres** — la gente no lee
9. **No ignorar las respuestas** — si responden, sacarlos de la cola
10. **No usar un solo número para todo** — distribuir la carga
