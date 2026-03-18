# Cómo funciona el sistema de Blast — Goberna
> Última actualización: 2026-03-18  
> Estado real de la campaña César Vásquez: **14,180 contactos | 385 hablados | 12 respondieron | 13,777 pendientes**

---

## 1. Arquitectura general

El sistema tiene tres partes que trabajan juntas:

```
┌─────────────────────────────────────────────────────────────┐
│  6 CELULARES FÍSICOS (WhatsApp Web + Extensión Chrome)       │
│                                                             │
│  Cel 1 (segmento 0) ──┐                                     │
│  Cel 2 (segmento 1) ──┤                                     │
│  Cel 3 (segmento 2) ──┼──► Backend API ──► PostgreSQL DB    │
│  Cel 4 (segmento 3) ──┤         ▲                           │
│  Cel 5 (segmento 4) ──┤         │                           │
│  Cel 6 (segmento 5) ──┘    Dashboard Web                    │
└─────────────────────────────────────────────────────────────┘
```

Cada celular trabaja de forma **totalmente independiente** — no se comunican entre sí. Cada uno tiene su propia porción de la lista que nunca se solapa con la del otro.

---

## 2. Segmentación — cómo se divide la lista entre celulares

Cuando la extensión pide contactos al servidor, este calcula a qué celular corresponde cada persona usando una fórmula:

```
segmento_del_contacto = hash(teléfono) % 6
```

Esto significa que cada teléfono siempre cae en el mismo segmento (0-5). No es aleatorio — es determinístico. Un contacto que le corresponde al celular 3 **nunca** va a aparecer en la lista del celular 1.

**Estado actual de los 6 celulares:**

| Celular | Número | Segmento | Días de vida | Límite diario hoy |
|---|---|---|---|---|
| Cel 1 — César Vásquez | 51901938157 | 0 | 0 días | 30 msg |
| Cel 2 — César Vásquez | 51930700661 | 1 | 0 días | 30 msg |
| Cel 3 — César Vásquez | 51977655953 | 2 | 0 días | 30 msg |
| Cel 4 — César Vásquez | 51906175778 | 3 | 0 días | 30 msg |
| Cel 5 — César Vásquez | 51977540848 | 4 | 0 días | 30 msg |
| Cel 6 — César Vásquez | 51906218514 | 5 | 0 días | 30 msg |

> **Nota:** Todos están en día 0 (registrados hoy). Los límites suben automáticamente con los días de uso.

---

## 3. Curva de calentamiento — límites por día de vida

El sistema sube los límites automáticamente conforme el número tiene más días de historial limpio:

| Día de vida | Límite diario base | Límite horario |
|---|---|---|
| Día 1 (≤1 día) | 30 mensajes | 20/hora |
| Día 2 | 80 mensajes | 20/hora |
| Día 3-4 | 150 mensajes | 30/hora |
| Día 5-9 | 200 mensajes | 40/hora |
| Día 10-14 | 250 mensajes | 50/hora |
| Día 15+ | 300 mensajes | 60/hora |

**Quality bonus:** Si el `response_rate ≥ 40%`, el límite diario sube **+20% automáticamente**.  
**Quality penalidad:** Si el `response_rate < 25%`, el límite baja **-20% automáticamente**.

Con los 6 celulares juntos en pleno calentamiento (día 15+):
- `300 × 1.20 (quality bonus) × 6 celulares = 2,160 mensajes/día`

---

## 4. Sistema de bloques — cómo se envían los mensajes

El sistema no envía de corrido. Usa una estructura en bloques para parecer humano:

```
┌──────────────────────────────────────────────────────────┐
│  BLOQUE (12 mensajes)                                    │
│  └─ delay 5-8s random entre cada mensaje (gaussiano)    │
│  └─ ≈ 90-100 segundos para completar el bloque          │
└──────────────────────────────────────────────────────────┘
          ↓
┌──────────────────────────────────────────────────────────┐
│  PAUSA CORTA entre bloques: 2-3 minutos random           │
└──────────────────────────────────────────────────────────┘
          ↓  (después de 4 bloques = 48 mensajes)
┌──────────────────────────────────────────────────────────┐
│  MACRO PAUSA cada hora: 10-15 minutos random             │
│  Rompe el patrón de frecuencia que detecta WhatsApp     │
└──────────────────────────────────────────────────────────┘
```

**Ritmo resultante:** ~48-60 mensajes/hora por celular, distribuidos naturalmente.

Adicionalmente hay **micro-descansos aleatorios** (10-90 segundos) que simulan que el operador se distrajo con algo.

---

## 5. Ciclo completo de un mensaje

Esto es exactamente lo que pasa cada vez que se envía un mensaje:

```
1. PEDIR BATCH
   └─ La extensión pide al servidor los próximos N contactos pendientes
   └─ El servidor filtra por: segmento del celular + cms_status='nuevo' + no en blast_log
   └─ Los ordena por: calientes primero → nunca contactados → recientes

2. PRE-FILTRO LOCAL
   └─ Descarta contactos ya enviados en esta sesión (dedup en memoria)
   └─ Espera que el dedup de chrome.storage haya cargado antes de arrancar

3. VERIFICAR NOMBRE
   └─ Si nombre + apellidos están vacíos → skip, marcar hablado, continuar

4. PREWARM (30 segundos)
   └─ Abre el chat en WhatsApp Web, espera sin hacer nada
   └─ Simula que el humano está leyendo el perfil antes de escribir

5. VERIFICAR WHATSAPP
   └─ Comprueba si el número tiene WhatsApp activo
   └─ Si NO tiene → marca como 'no_wa' (reintentable mañana), continúa
   └─ Si SÍ tiene → continúa

6. CONSTRUIR MENSAJE
   └─ Selecciona la plantilla (rota entre 4: formal/variación/compacta/brigadista)
   └─ Reemplaza variables: {{nombre}}, {{departamento}}, {{brigadista}}, {{distrito}}
   └─ Aplica spintax: [opción1|opción2|opción3] → elige 1 al azar
   └─ Departamento normalizado a Title Case (ej: "LA LIBERTAD" → "La Libertad")

7. SPAM CHECK
   └─ Verifica si el texto tiene palabras peligrosas o patrones repetitivos
   └─ Si el score es alto → pausa automática

8. ENVIAR
   └─ Llama a la API interna de WhatsApp Web directamente
   └─ Captura el msgModel para rastrear el ACK (pendiente/enviado/entregado/leído)

9. DELAYS (sistema de bloques)
   └─ Cada mensaje: delay 5-8s gaussiano
   └─ Cada 12 mensajes: pausa 2-3 min
   └─ Cada 48 mensajes: macro pausa 10-15 min
   └─ Cada 100 mensajes: verificar response_rate

10. MARK HABLADO (al final del batch, con await)
    └─ Enviados exitosos → cms_status='hablado' en DB
    └─ Sin WhatsApp → cms_status='no_wa' en DB
    └─ ESPERA confirmación del servidor antes de pedir el siguiente batch
    └─ Esto evita que el servidor devuelva el mismo contacto dos veces

11. LOG
    └─ Guarda en blast_log: teléfono, nombre, mensaje, status, wa_number, contact_id
    └─ Esto alimenta las métricas del dashboard
```

---

## 6. Control de quality rating — freno automático

Cada 100 mensajes enviados en la sesión, el sistema consulta el `response_rate` global:

| Response rate | Acción automática |
|---|---|
| ≥ 40% | Continúa normal (zona verde) |
| 35-40% | Continúa con leve precaución |
| 25-35% | Pausa extra de 5 minutos |
| < 25% | **PARA 1 HORA** — muestra alerta en el sidebar |

**Dashboard `/blast` — qué muestra en tiempo real:**
- 🟢 Verde: response_rate ≥ 40% → "Puedes escalar +20%/día"
- 🟡 Amarillo: 25-40% → "Mantén el ritmo actual"
- 🔴 Rojo: < 25% → "Reduce volumen inmediato"
- `¿Escalar? SÍ/NO` — basado en las 3 condiciones de oro simultáneamente

---

## 7. Heat scoring — orden de la cola

Los contactos no se envían en orden de entrada. El servidor los prioriza:

```
1. CALIENTES   — alguna vez respondieron en esta campaña (heat_score=2)
   └─ Van primero — mayor probabilidad de respuesta → mejora response_rate

2. NORMALES    — nunca contactados, sin historial (heat_score=1)
   └─ Van segundo — el grueso de la lista

3. FRÍOS       — marcados no_wa en el pasado y reseteados (heat_score=0)
   └─ Van al final — menor probabilidad de tener WA activo
```

Dentro de cada grupo, los más antiguos en la lista van primero (`created_at ASC`).

---

## 8. Retry de sin-WhatsApp (no_wa)

Antes, los sin WhatsApp se marcaban como `hablado` y desaparecían para siempre. Ahora:

1. Se marcan `cms_status='no_wa'` — distinto de `hablado`
2. No vuelven a aparecer durante el día actual
3. Al día siguiente, al arrancar el blast → el sistema llama `POST /api/blast/retry-no-wa`
4. Todos los `no_wa` de más de 24 horas se resetean a `nuevo`
5. Vuelven a la cola al final (heat_score=0)

Esto es útil porque muchos números peruanos tienen WA intermitente.

---

## 9. Estado actual de la campaña (2026-03-18)

```
Total contactos:    14,180
├─ Pendientes:      13,777  (97.2%)
├─ Hablados:           385  (2.7%)  ← todos marcados manualmente hoy por fix de DB
├─ Respondieron:        12  (0.08%) → response_rate actual: ~3% (muy bajo, pocos datos aún)
└─ Sin WhatsApp:          0
```

> El `response_rate` va a subir en cuanto el blast funcione correctamente con el fix de `cms_hablado_at` deployado hoy. Los 385 "hablados" fueron marcados manualmente — no tienen un mensaje real detrás.

**Capacidad total del sistema (6 celulares en día 15+, quality verde):**
- Por celular: 300 × 1.20 = 360/día
- Total: 360 × 6 = **2,160 mensajes/día**
- Con la curva de escalado (+20%/día): llegas ahí en ~2 semanas de uso continuo limpio

---

## 10. Qué NO hace el sistema (límites claros)

| Lo que no hace | Por qué |
|---|---|
| No envía en paralelo (5 a la vez) | Firma de automatización inmediata — ban en días |
| No usa un solo número para todo | 1 número → 300/día máx; 6 números → 1,800/día |
| No sube el volumen de golpe | +20%/día máximo — WhatsApp detecta saltos bruscos |
| No envía fuera del horario configurado | Ventana horaria configurable en el sidebar |
| No envía a números sin nombre | Skip automático — calidad del mensaje > cantidad |

---

## 11. Archivos clave del sistema

| Qué | Dónde |
|---|---|
| Motor del blast (loop, timing, dedup) | `extensions/.../src/inject/blast-panel.js` |
| Sistema de bloques, freno response_rate | `blast-panel.js` líneas 1095-1140 |
| Endpoints del backend | `apps/backend/src/modules/blast/routes.ts` |
| Lógica de segmentación y heat scoring | `apps/backend/src/modules/blast/repository.ts` |
| Dashboard en tiempo real | `apps/web/app/(dashboard)/blast/page.tsx` |
| Documentación de mensajes extensión | `docs/EXTENSION-MESSAGES.md` |
