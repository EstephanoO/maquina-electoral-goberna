'use strict';

const API = 'https://api.goberna.us';

// S-9: Extension version header for backend observability
const EXT_VERSION = chrome.runtime.getManifest?.()?.version ?? 'unknown';

// S-10: Use chrome.storage.session for access_token (more secure — cleared on browser close).
// Refresh token stays in chrome.storage.local for persistence across restarts.
// On SW wake-up, if session token is gone, auto-refresh from local refresh token.
if (chrome.storage.session?.setAccessLevel) {
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
}

// ── ElevenLabs TTS ─────────────────────────────────────────────────────
// C-1 FIX: API key moved to backend proxy. Extension calls /api/tts/generate.
const ELEVENLABS_VOICE_ID = 'iaSdolcffUuIlEi5pdbj';  // César Vásquez — voz clonada

// ═══════════════════════════════════════════════════════════════════════
// MESSAGE CLASSIFIER — reglas keyword para auto-clasificar mensajes
// ═══════════════════════════════════════════════════════════════════════

/**
 * Normalizador de texto peruano coloquial.
 * Corrige errores ortográficos frecuentes en mensajes de WhatsApp
 * de personas con nivel educativo variado en Perú.
 *
 * IMPORTANTE: Se aplica DESPUÉS de toLowerCase() + strip acentos.
 * No corrige todo, solo los patrones más frecuentes que afectan clasificación.
 */
function normalizePeruvianText(text) {
  return text
    // Errores de ortografía comunes en Perú
    .replace(/\bnesecit/g, 'necesit')        // nesecitamos → necesitamos
    .replace(/\bnececit/g, 'necesit')        // nececitamos → necesitamos
    .replace(/\bnesesit/g, 'necesit')        // nesesitamos → necesitamos
    .replace(/\btrbajo/g, 'trabajo')         // trbajo → trabajo
    .replace(/\btravajo/g, 'trabajo')        // travajo → trabajo
    .replace(/\bcanpana/g, 'campana')        // canpaña → campaña (post-NFD: campana)
    // L-1: removed no-op .replace(/\bcampana\b/g, 'campana')
    .replace(/\bjente/g, 'gente')            // jente → gente
    .replace(/\bboto\b/g, 'voto')            // boto → voto
    .replace(/\bbotar\b/g, 'votar')          // botar → votar (en contexto electoral)
    .replace(/\bbotamos\b/g, 'votamos')
    .replace(/\bapolla/g, 'apoya')           // apolla → apoya
    .replace(/\bapollar/g, 'apoyar')
    .replace(/\baser\b/g, 'hacer')           // aser → hacer
    .replace(/\basemos/g, 'hacemos')
    .replace(/\basiendo/g, 'haciendo')
    .replace(/\breconosid/g, 'reconocid')    // reconosido → reconocido
    .replace(/\bconosid/g, 'conocid')        // conosido → conocido
    .replace(/\bconoser/g, 'conocer')
    .replace(/\bdotor\b/g, 'doctor')         // dotor → doctor
    // L-1: removed no-op .replace(/\bdoctor\b/g, 'doctor')
    .replace(/\bingenero\b/g, 'ingeniero')   // ingenero → ingeniero
    .replace(/\bdiputao\b/g, 'diputado')
    .replace(/\bcandidao\b/g, 'candidato')
    .replace(/\bgovierno/g, 'gobierno')      // govierno → gobierno
    .replace(/\bgobieno/g, 'gobierno')
    .replace(/\bdesempleo/g, 'desempleo')
    .replace(/\bdesocupad/g, 'desocupad')
    .replace(/\bboluntari/g, 'voluntari')    // boluntarios → voluntarios
    .replace(/\bbrigadist/g, 'brigadist')
    .replace(/\bmilitant/g, 'militant')
    .replace(/\bcordinad/g, 'coordinad')     // cordinador → coordinador
    .replace(/\bcordinar/g, 'coordinar')
    // L-1: removed no-op .replace(/\bcoordinar/g, 'coordinar')
    .replace(/\bcolavorar/g, 'colaborar')    // colavorar → colaborar
    .replace(/\bcolaborasion/g, 'colaboracion')
    // L-1: removed no-op .replace(/\bcolaboracion\b/g, 'colaboracion')
    .replace(/\bprovincia/g, 'provincia')
    .replace(/\bdistrito/g, 'distrito')
    .replace(/\benfermeria/g, 'enfermeria')
    .replace(/\benfermera/g, 'enfermera')
    .replace(/\bospital/g, 'hospital')       // ospital → hospital
    .replace(/\bpubli[cs]idad/g, 'publicidad');
}

/**
 * Clasificador de mensajes entrantes por patrones de keywords.
 *
 * Categorías detectadas (orden de evaluación = prioridad):
 *   1. imposible: piden dinero, yape, publicidad pagada, piden trabajo
 *   2. voto_duro: apoyo genuino, militantes, organizados, sector salud,
 *                 coordinadores, piden material de campaña (merch)
 *   3. voto_blando: piden apoyo material condicionado (deportes, infraestructura)
 *   4. voto_flotante: consultas generales, indecisos
 *   5. null: no se puede clasificar con confianza
 *
 * Retorna: { vote_class, status, confidence, category, reason }
 */
function classifyMessage(text) {
  if (!text || text.length < 15) return null; // Mensaje muy corto, no clasificable

  // Normalización: lowercase + strip acentos + fix ortografía peruana
  const stripped = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lower = normalizePeruvianText(stripped);

  // S-5: Combined regex patterns — single-pass per category instead of 130+ individual .test() calls.
  // Each category uses one precompiled RegExp with alternation for O(n) scan of the text.

  // ── Regla 1: IMPOSIBLE — piden dinero / Yape / transferencia ──────
  const _rxDinero = /yape|plin|nequi|transferencia|deposito|cuenta.?(bancaria|ahorro|corriente|bcp|bbva|interbank|scotiabank)|numero.?de.?(yape|cuenta|plin|celular.*yape)|apoyo.?(economico|monetario|dinero|plata|financier)|ayuda.?(economica|monetaria|financier)|envi(?:ar|e|o|ame).?(?:dinero|plata|soles|dolares)|necesit(?:o|amos).*(?:dinero|plata|comprar|pagar|economic)|granito.?de.?arena|su.?voluntad|su.?buena.?voluntad|lo.?que.?pueda|alguito|algito|cualquier.?(?:cosita|ayudita|apoyito|aporte)|colaboracion.*(?:economic|monetari|dinero|plata)|aport(?:e|ar|ecito).*(?:economic|monetari|voluntari)|pasando.?(?:por|un).?momento.?(?:dificil|critico|complicado)|bajos?.?recursos|situacion.?(?:dificil|critica|precaria|economica)|\d{2,}\.?\d*\s*soles|\d{1,}\s*mil\s*soles|s\/\.?\s*\d{2,}|medicamentos?.*(?:hospital|clinica|salud|enferm)|examenes?.*(?:hospital|clinica|medic|laboratorio)|operacion.*(?:necesit|urgen|ayud|plata|dinero)|tratamiento.*(?:necesit|costoso|caro|ayud|plata)|(?:mama|papa|hijo|hija|esposo|esposa|abuel).*(?:enferm|hospital|operar|necesita)/;
  if (_rxDinero.test(lower)) {
    return {
      vote_class: '',
      status: 'invalido',
      confidence: 0.9,
      category: 'pide_dinero',
      reason: 'Solicita apoyo economico directo / Yape / transferencia',
    };
  }

  // ── Regla 2: IMPOSIBLE — piden trabajo ────────────────────────────
  const _rxTrabajo = /busc(?:o|ando|amos).*(?:trabajo|empleo|chamba|ocupacion)|necesit(?:o|amos).*(?:trabajo|empleo|chamba)|algun.?tipo.?de.?trabajo|oferta.?(?:laboral|de.?trabajo|de.?empleo)|oportunidad.?(?:laboral|de.?trabajo|de.?empleo)|pued(?:e|o|en).*(?:dar|ofrecer|conseguir).*(?:trabajo|empleo|chamba)|desempleado|sin.?trabajo|sin.?empleo|no.?(?:tengo|consigo|encuentro).*(?:trabajo|empleo|chamba)|trabaj(?:o|ar).*(?:campana).*despu(?:e|é)s|puesto.?de.?trabajo|(?:requiero|solicito).*(?:empleo|trabajo|chamba)|colocacion.?laboral/;
  if (_rxTrabajo.test(lower)) {
    return {
      vote_class: '',
      status: 'invalido',
      confidence: 0.85,
      category: 'pide_trabajo',
      reason: 'Solicita empleo/trabajo a cambio de apoyo',
    };
  }

  // ── Regla 3: IMPOSIBLE — publicidad pagada / medios ───────────────
  const _rxPublicidad = /publicidad.*(?:pag|programa|difusion|campana|redes|radio|tv)|programa.?(?:radial|de.?radio|televisivo)|comunicador.?social|paginas?.?(?:en.?redes|de.?facebook|de.?instagram|de.?tiktok)|seguidores.*(?:vend|ofrec|paquete|precio|mil)|\d+\s*mil\s*seguidores|precio.*(?:publicidad|difusion|campana)|cotizacion.*(?:publicidad|medios|difusion)|tari(?:f|ff)a.*(?:publicidad|radio|tv|difusion)|paquete.*(?:publicidad|redes|difusion|seguidores)|(?:radio|tv|canal|programa).*(?:cob|cost|prec|tari|pag).*(?:sol|dolar|\d{3,})|\d{3,}\s*soles.*(?:publicidad|difusion|campana)|manejo.?de.?redes.*(?:social|digital|precio|cot)/;
  if (_rxPublicidad.test(lower)) {
    return {
      vote_class: '',
      status: 'invalido',
      confidence: 0.85,
      category: 'publicidad_pagada',
      reason: 'Ofrece publicidad/medios a cambio de pago',
    };
  }

  // ── Regla 4: VOTO DURO — sector salud apoyando ───────────────────
  // S-5: Combined into single regex per category + helper for score counting
  const _rxSaludParts = [
    /trabajador(?:a|es)?.?de.?(?:salud|hospital)/,
    /personal.?de.?(?:salud|hospital|posta)/,
    /tecnico.?(?:en)?.?enfermeria/,
    /enfermero|enfermera|enfermeria/,
    /ministro.?de.?salud/,
    /sector.?salud/,
    /hospital.*(?:apoy|respald|trabaj|sum)/,
    /(?:medico|doctor|enfermera).*(?:apoy|respald|vot|confian)/,
    /companer(?:o|a)s?.?del?.?hospital/,
    /colegio.?(?:medico|de.?enfermeros|de.?obstetri)/,
  ];
  let saludScore = 0;
  for (const p of _rxSaludParts) { if (p.test(lower)) saludScore++; }

  const apoyoGenerico = /(?:apoy|respald|sumarse|cuent(?:e|a).?con|vot(?:o|ar|amos)|confian)/.test(lower);
  if (saludScore >= 1 && apoyoGenerico) {
    return {
      vote_class: 'duro',
      status: 'respondido',
      confidence: 0.9,
      category: 'sector_salud',
      reason: 'Trabajador/a de salud que apoya activamente',
    };
  }

  // ── Regla 5: VOTO DURO — piden material de campaña (merch) ────────
  const _rxMerch = /necesit(?:o|amos).*(?:afiches|paneles|volantes|calendarios|banderolas|polos|gorr)|envi(?:ar|en|e).*(?:afiches|paneles|volantes|calendarios|banderolas|material)|material.?(?:publicitario|de.?campana|de.?propaganda|de.?difusion)|afiches.*(?:repartir|pegar|distribuir|campana)|volantes.*(?:repartir|entregar|distribuir|campana)|calendarios.*(?:repartir|entregar|distribuir|campana)|paneles?.*(?:coloc|instal|poner|ubicar)|banderolas?.*(?:coloc|instal|poner|ubicar)|material.*(?:repartir|distribuir|entregar|zona|distrito|barrio)|pedir(?:le|les)?.*(?:afiches|paneles|volantes|calendarios|material)|nos?.?falta.*(?:afiches|paneles|volantes|calendarios|material)|mandar(?:nos|me)?.*(?:afiches|paneles|volantes|calendarios|material)/;
  if (_rxMerch.test(lower)) {
    return {
      vote_class: 'duro',
      status: 'respondido',
      confidence: 0.85,
      category: 'pide_merch',
      reason: 'Solicita material de campana para distribuir (militante activo)',
    };
  }

  // ── Regla 6: VOTO DURO — coordinadores / voluntarios ──────────────
  const _rxCoordParts = [
    /coordinador(?:a|es)?.*(?:zona|distrito|region|sector|campana|provincial)/,
    /soy.?(?:el|la)?.?coordinador/,
    /voluntari(?:o|a|os|as).*(?:sum|organ|inscri|registr|apoy)/,
    /organiz(?:ar|ando|amos).*(?:grupo|comite|base|equipo|gente|voluntari)/,
    /coordinando.*(?:zona|distrito|region|sector|campana)/,
    /representante.*(?:zona|distrito|region|sector|partido)/,
    /responsable.*(?:zona|distrito|region|sector)/,
    /lider(?:esa)?.*(?:zona|barrio|comunidad|distrito)/,
    /dirigente.*(?:barri|comun|distrit|vecin|zona)/,
    /base.?partidaria/,
    /armar(?:emos|ando)?.*(?:equipo|grupo|comite|estructura)/,
  ];
  let coordScore = 0;
  for (const p of _rxCoordParts) { if (p.test(lower)) coordScore++; }

  // ── Regla 7: VOTO DURO — apoyo genuino, militantes, organizados ───
  const _rxDuroParts = [
    /cuent(?:e|a|en).?con.?(?:nuestro|mi|todo|el).?(?:respaldo|apoyo|voto)/,
    /estamos.?(?:listos|dispuestos|organizados|firmes).*(?:apoy|trabaj|sum)/,
    /(?:grupo|equipo|comite).?de.?apoyo/,
    /militante|militando|militancia/,
    /repartiendo.?(?:calendarios|volantes|material|afiches)/,
    /canal.?de.?whatsapp/,
    /fortalec(?:er|iendo).*(?:campana|partido|movimiento)/,
    /sumando.?esfuerzos/,
    /app.?3|alianza.?para.?el.?progreso/,
    /con.?fuerza.?(?:doctor|ingeniero|hermano|cesar|candidato)/,
    /seguir.?(?:sumando|apoyando|trabajando).*(?:campana|partido)/,
    /nuestr(?:o|a)s?.?famili(?:a|as).*(?:apoy|respald|vot)/,
    /formar.*(?:grupo|comite|base|estructura).*(?:apoyo|campana|distrito)/,
    /trabajar.?coordinadamente/,
    /todo(?:s)?.?(?:el|la|los|las)?.?(?:barrio|distrito|zona|comunidad).*(?:apoy|respald|vot)/,
    /vamos.?(?:con|por|a.?ganar|a.?apoyar|arriba)/,
    /a.?ganar.?(?:estas|las)?.?elecciones/,
    /compromet(?:ido|ida|idos|idas).*(?:campana|partido|candidatura|doctor)/,
    /incondicional(?:es)?.*(?:apoy|respald)/,
    /adelante.*(?:doctor|ingeniero|cesar|candidato|hermano)/,
    /ya.?somos.*(?:grupo|equipo|comite|personas|\d+)/,
  ];
  let duroScore = coordScore;
  for (const p of _rxDuroParts) { if (p.test(lower)) duroScore++; }
  // Señales adicionales de organización
  const _rxDuroExtra = /companeros?.*(?:hospital|sector|zona|distrito|barrio)|dispuestos?.?a.?apoyar|confiamos.?en.?su.?trabajo|grupos?.?de.?apoyo|fuerza.*(?:doctor|cesar|ingeniero|candidato)/;
  const extraMatch = lower.match(new RegExp(_rxDuroExtra.source, 'g'));
  if (extraMatch) duroScore += extraMatch.length;

  if (duroScore >= 2) {
    const cat = coordScore > 0 ? 'coordinador' : 'apoyo_genuino';
    return {
      vote_class: 'duro',
      status: 'respondido',
      confidence: Math.min(0.7 + duroScore * 0.1, 0.95),
      category: cat,
      reason: `Apoyo organizado/militante (${duroScore} senales)`,
    };
  }

  // ── Regla 8: VOTO BLANDO — piden algo material a cambio ───────────
  const _rxBlando = /apoy(?:ar|o|e|emos).*(?:focos|cableado|indumentaria|materiales|implementos)|(?:campo|cancha|losa).*(?:deportiv|futbol|campeonato)|campeonato.*(?:apoy|ayud|patroci)|copa.?(?:peru|distrital|provincial|regional)|no.?contamos.?con.?(?:los|recursos|materiales)|club.?deportivo|mejorar.?(?:nuestro|el|la).?(?:campo|cancha|local|losa)|brind(?:ar|arle).*(?:nuestro|su).?apoyo.*apoy(?:ar|o)|queremos.*(?:brindarle|darle|ofrecerle).*(?:apoyo|respaldo).*apoy|premio.*(?:campeonato|torneo|copa|deport)|(?:trofeo|medalla|premio).*(?:campeonato|torneo|copa)|uniforme.*(?:equipo|deport|futbol|club)|camiseta.*(?:equipo|deport|futbol|club)|implementos?.?(?:deportiv|para.?el.?equipo)|iluminacion.*(?:cancha|campo|losa|parque)|techado.*(?:cancha|campo|losa|coliseo)|infraestructura.*(?:deport|comunal|barri)/;
  if (_rxBlando.test(lower)) {
    return {
      vote_class: 'blando',
      status: 'respondido',
      confidence: 0.8,
      category: 'apoyo_condicional',
      reason: 'Pide apoyo material a cambio de respaldo/votos',
    };
  }

  // ── Regla 9: VOTO DURO (score bajo pero presente) ─────────────────
  if (duroScore === 1) {
    return {
      vote_class: 'duro',
      status: 'respondido',
      confidence: 0.6,
      category: coordScore > 0 ? 'coordinador' : 'apoyo_probable',
      reason: 'Senal de apoyo detectada (confianza moderada)',
    };
  }

  // ── Regla 10: FLOTANTE — señales ambiguas ─────────────────────────
  const _rxFlotante = /felicit(?:ar|o|arlo|aciones).*(?:trabajo|gestion|labor)|reconoc(?:er|iendo|emos).*(?:trabajo|labor|gestion)|consult(?:ar|arle|a).*(?:sobre|acerca|respecto)|quisiera.?saber|propuestas.*(?:para|del|sobre)|respecto.?a|que.?piensa.?(?:de|sobre)|que.?propone|buenas?.?(?:tardes|noches|dias|mananas).*(?:doctor|ingeniero|cesar).*inform|me.?gustaria.?(?:saber|conocer|que.?me.?diga)/;
  if (_rxFlotante.test(lower)) {
    return {
      vote_class: 'flotante',
      status: 'respondido',
      confidence: 0.5,
      category: 'indeciso',
      reason: 'Interes sin compromiso claro',
    };
  }

  // ── Regla 11: Sector salud sin señal de apoyo clara ───────────────
  if (saludScore >= 1) {
    return {
      vote_class: 'flotante',
      status: 'respondido',
      confidence: 0.5,
      category: 'sector_salud_indeciso',
      reason: 'Persona del sector salud, sin senal clara de apoyo',
    };
  }

  // ── No clasificable con confianza ─────────────────────────────────
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// MESSAGE AGGREGATION BUFFER — agrupa mensajes fragmentados del mismo
// remitente antes de clasificar (WA: múltiples mensajes cortos seguidos)
// ═══════════════════════════════════════════════════════════════════════

const _msgBuffer = new Map(); // phone → { texts: string[], timer: number, resolve: fn }
const MSG_BUFFER_WINDOW_MS = 12000; // H-2: reduced from 45s to 12s
const MSG_BUFFER_MAX_ENTRIES = 200; // H-2: prevent unbounded growth
const MSG_BUFFER_MAX_TEXTS = 20;   // S-8: max messages aggregated per phone (cap texts[] array)
const MSG_BUFFER_SUPERSEDED = Object.freeze({ __superseded: true }); // M-5: sentinel value

/**
 * Agrega un mensaje al buffer de un teléfono.
 * Si no llegan más mensajes en MSG_BUFFER_WINDOW_MS, dispara la clasificación
 * con todos los textos concatenados.
 *
 * Retorna una Promise that resolves with the aggregated text when the window closes,
 * or MSG_BUFFER_SUPERSEDED sentinel if this message was replaced by a newer one.
 */
function bufferMessage(phone, text) {
  // H-2: evict oldest entries if buffer is too large
  if (_msgBuffer.size >= MSG_BUFFER_MAX_ENTRIES && !_msgBuffer.has(phone)) {
    const oldestKey = _msgBuffer.keys().next().value;
    const oldest = _msgBuffer.get(oldestKey);
    if (oldest) {
      clearTimeout(oldest.timer);
      const aggregated = oldest.texts.join(' ');
      _msgBuffer.delete(oldestKey);
      if (oldest.resolve) oldest.resolve(aggregated);
    }
  }

  return new Promise((resolve) => {
    const existing = _msgBuffer.get(phone);

    if (existing) {
      // Ya hay un buffer activo — agregar texto y resetear timer
      // S-8: Cap per-phone texts to prevent unbounded growth from rapid-fire senders
      if (existing.texts.length < MSG_BUFFER_MAX_TEXTS) {
        existing.texts.push(text);
      }
      clearTimeout(existing.timer);
      // M-5: resolve previous promise with sentinel (not null)
      if (existing.resolve) existing.resolve(MSG_BUFFER_SUPERSEDED);
      existing.resolve = resolve;
      existing.timer = setTimeout(() => {
        const aggregated = existing.texts.join(' ');
        _msgBuffer.delete(phone);
        resolve(aggregated);
      }, MSG_BUFFER_WINDOW_MS);
    } else {
      // Primer mensaje — crear buffer
      const entry = {
        texts: [text],
        resolve,
        timer: setTimeout(() => {
          _msgBuffer.delete(phone);
          resolve(text); // Solo un mensaje, devolver tal cual
        }, MSG_BUFFER_WINDOW_MS),
      };
      _msgBuffer.set(phone, entry);
    }
  });
}

/**
 * Clasificación con agregación: usa el buffer si el mensaje es corto.
 * Mensajes largos (>80 chars) se clasifican inmediatamente.
 * Mensajes cortos se agregan con otros del mismo remitente.
 *
 * @param {string|null} phone — phone number (may be null for @lid JIDs)
 * @param {string} text — message text
 * @param {string|null} fromJid — raw JID, used as fallback buffer key when phone is null
 */
async function classifyWithAggregation(phone, text, fromJid) {
  if (!text) return null;

  // Mensajes largos → clasificar inmediatamente (ya tienen contexto suficiente)
  if (text.length > 80) {
    return classifyMessage(text);
  }

  // Buffer key: use phone if available, fall back to JID for @lid contacts
  const bufferKey = phone || fromJid;
  if (!bufferKey) return classifyMessage(text); // No key to aggregate by

  const aggregated = await bufferMessage(bufferKey, text);
  // M-5: check for sentinel (superseded by newer message from same contact)
  if (aggregated === MSG_BUFFER_SUPERSEDED) return MSG_BUFFER_SUPERSEDED;
  if (!aggregated) return null;
  return classifyMessage(aggregated);
}

// ═══════════════════════════════════════════════════════════════════════
// S-4: OFFLINE QUEUE — persiste API calls fallidos y los reintenta
// cuando hay conectividad. Principio #1 del platform: offline-first.
// ═══════════════════════════════════════════════════════════════════════

const OFFLINE_QUEUE_KEY = 'wspp_offline_queue';
const OFFLINE_QUEUE_MAX = 500;        // max events queued
const OFFLINE_FLUSH_INTERVAL = 30000; // 30s between flush attempts

/**
 * Encola un evento para retry posterior.
 * @param {string} path — API path (e.g. '/api/cms/extension-event')
 * @param {object} options — fetch options (method, body, headers extra)
 */
function enqueueOffline(path, options) {
  chrome.storage.local.get([OFFLINE_QUEUE_KEY], (data) => {
    const queue = data[OFFLINE_QUEUE_KEY] || [];
    if (queue.length >= OFFLINE_QUEUE_MAX) {
      // Drop oldest to prevent unbounded growth
      queue.shift();
      console.warn('[WSPP OFFLINE] Queue full — dropped oldest event');
    }
    queue.push({ path, options, ts: Date.now() });
    chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: queue });
    console.log('[WSPP OFFLINE] Enqueued:', path, '| queue size:', queue.length);
  });
}

/**
 * Intenta flushear la cola offline. Procesa de a uno para no saturar.
 * Eventos que fallan de nuevo se re-encolan. Eventos > 24h se descartan.
 */
let _offlineFlushing = false;
async function flushOfflineQueue() {
  if (_offlineFlushing) return;
  _offlineFlushing = true;
  try {
    const data = await new Promise(r => chrome.storage.local.get([OFFLINE_QUEUE_KEY], r));
    const queue = data[OFFLINE_QUEUE_KEY] || [];
    if (queue.length === 0) return;

    console.log('[WSPP OFFLINE] Flushing', queue.length, 'queued events...');
    const remaining = [];
    const maxAge = 24 * 60 * 60 * 1000; // 24h

    for (const item of queue) {
      // Discard events older than 24h
      if (Date.now() - item.ts > maxAge) {
        console.log('[WSPP OFFLINE] Discarded stale event from', new Date(item.ts).toISOString());
        continue;
      }
      const result = await apiFetch(item.path, item.options);
      if (result.ok || result.status === 400 || result.status === 403) {
        // Success or permanent error — don't retry
        console.log('[WSPP OFFLINE] Flushed:', item.path, result.ok ? 'OK' : 'permanent error');
      } else {
        // Transient error — re-queue
        remaining.push(item);
        console.warn('[WSPP OFFLINE] Still failing:', item.path, '— re-queued');
        break; // Stop flushing on first transient failure (probably offline)
      }
    }

    chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: remaining });
    if (remaining.length === 0) console.log('[WSPP OFFLINE] Queue drained');
  } finally {
    _offlineFlushing = false;
  }
}

// Periodic flush attempt
setInterval(flushOfflineQueue, OFFLINE_FLUSH_INTERVAL);
// Also flush when SW wakes up
setTimeout(flushOfflineQueue, 5000);

// ═══════════════════════════════════════════════════════════════════════
// API HELPERS — llamadas al backend con auth
// ═══════════════════════════════════════════════════════════════════════

// H-1: Track if we're already refreshing to avoid multiple simultaneous refreshes
let _refreshPromise = null;

/** H-1: Try to refresh the access token using stored refresh_token */
async function tryRefreshToken() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const data = await new Promise(r => chrome.storage.local.get(['wspp_refresh_token'], r));
      if (!data.wspp_refresh_token) return false;
      const res = await fetch(`${API}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: data.wspp_refresh_token }),
      });
      if (!res.ok) return false;
      const json = await res.json();
      if (json.access_token) {
        // S-10: Store access token in session (preferred) + local (fallback)
        const tokenData = { wspp_token: json.access_token };
        const refreshData = { wspp_refresh_token: json.refresh_token || data.wspp_refresh_token, wspp_token: json.access_token };
        if (chrome.storage.session) {
          await new Promise(r => chrome.storage.session.set(tokenData, r));
        }
        await new Promise(r => chrome.storage.local.set(refreshData, r));
        console.log('[WSPP AUTH] ✓ Token refreshed');
        return true;
      }
      return false;
    } catch (err) {
      console.error('[WSPP AUTH] Refresh failed:', err.message);
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

/** H-1: Force re-login by clearing stored credentials */
function forceReLogin() {
  chrome.storage.local.remove(['wspp_token', 'wspp_refresh_token', 'wspp_user', 'wspp_campaign_id']);
  console.warn('[WSPP AUTH] Session expired — user must re-login');
}

/**
 * S-10: Read access token from session storage (preferred) or local storage (fallback).
 * Also reads campaign_id from local (always persisted).
 */
function _getToken(callback) {
  chrome.storage.local.get(['wspp_campaign_id', 'wspp_token'], (localData) => {
    if (chrome.storage.session) {
      chrome.storage.session.get(['wspp_token'], (sessionData) => {
        const token = sessionData?.wspp_token || localData.wspp_token || null;
        callback({ wspp_token: token, wspp_campaign_id: localData.wspp_campaign_id });
      });
    } else {
      callback(localData);
    }
  });
}

/**
 * Fetch wrapper con auth headers.
 * H-1: On 401, attempts token refresh once, then retries the request.
 * L-3: Surfaces HTTP error status codes in the response.
 */
async function apiFetch(path, options = {}, _isRetry = false) {
  return new Promise((resolve) => {
    // S-10: Read token from session storage first, fall back to local
    _getToken(async (data) => {
      if (!data.wspp_token || !data.wspp_campaign_id) {
        // S-10: Try auto-refresh if session token is gone but refresh token exists
        if (!data.wspp_token && !_isRetry) {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            resolve(await apiFetch(path, options, true));
            return;
          }
        }
        resolve({ ok: false, error: 'No auth' });
        return;
      }
      try {
        const res = await fetch(`${API}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.wspp_token}`,
            'x-campaign-id': data.wspp_campaign_id,
            'X-Extension-Version': EXT_VERSION, // S-9: version tracking
            ...(options.headers || {}),
          },
        });

        // H-1: Handle 401 — attempt token refresh once
        if (res.status === 401 && !_isRetry) {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            resolve(await apiFetch(path, options, true));
            return;
          }
          forceReLogin();
          resolve({ ok: false, error: 'Session expired', status: 401 });
          return;
        }

        const json = await res.json();
        // L-3: Include HTTP status in response for error handling
        if (!res.ok && !json.status) json.status = res.status;
        resolve(json);
      } catch (err) {
        console.error('[WSPP API]', path, err.message);
        // S-4: On network error for POST/PUT, queue for offline retry
        const method = (options.method || 'GET').toUpperCase();
        if ((method === 'POST' || method === 'PUT') && !_isRetry) {
          enqueueOffline(path, options);
        }
        resolve({ ok: false, error: err.message, offline: true });
      }
    });
  });
}

/** Buscar validación por teléfono */
async function lookupValidation(phone) {
  if (!phone) return null;
  const res = await apiFetch(`/api/validacion/lookup?phone=${encodeURIComponent(phone)}`);
  if (res.ok && res.item) return res.item;
  return null;
}

/** Actualizar status de validación */
async function updateValidationStatus(id, status, vote_class, notes) {
  const body = { status, vote_class: vote_class || undefined, notes: notes || undefined };
  const res = await apiFetch(`/api/validacion/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res;
}

/** Claim de validación */
async function claimValidation(id) {
  return apiFetch(`/api/validacion/${id}/claim`, { method: 'PUT' });
}

// ═══════════════════════════════════════════════════════════════════════
// CACHE local de validaciones por teléfono (evitar lookups repetidos)
// ═══════════════════════════════════════════════════════════════════════

const _validationCache = new Map(); // phone → { item, ts }
const CACHE_TTL = 5 * 60 * 1000;   // 5 minutos

async function getCachedValidation(phone) {
  if (!phone) return null;
  const cached = _validationCache.get(phone);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return cached.item;
  }
  const item = await lookupValidation(phone);
  if (item) {
    _validationCache.set(phone, { item, ts: Date.now() });
  } else {
    // M-3: Cache negativo corto (15s) para no spamear el backend — reduced from 60s
    _validationCache.set(phone, { item: null, ts: Date.now() - CACHE_TTL + 15000 });
  }
  return item;
}

function invalidateCache(phone) {
  if (phone) _validationCache.delete(phone);
}

// ═══════════════════════════════════════════════════════════════════════
// CLASSIFICATION EVENT REPORTER — persiste clasificaciones en el backend
// para el dashboard de monitoreo, métricas de accuracy, y correcciones
// ═══════════════════════════════════════════════════════════════════════

/**
 * Reporta un evento de clasificación al backend (fire-and-forget).
 * No bloquea el flujo principal — errores se loguean pero se ignoran.
 */
function reportClassificationEvent(data) {
  apiFetch('/api/validacion/classification-event', {
    method: 'POST',
    body: JSON.stringify(data),
  }).then(res => {
    if (res.ok) {
      console.log('[WSPP CLASSIFY-EVENT] ✓ Reportado:', data.source, data.category);
    } else {
      console.warn('[WSPP CLASSIFY-EVENT] Error:', res.message || res.error);
    }
  }).catch(err => {
    console.warn('[WSPP CLASSIFY-EVENT] Fetch error:', err.message);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// M-2: Per-phone classification queue — prevents concurrent race conditions
// Two messages from the same phone arriving simultaneously both reading
// cache and both trying to classify/update would cause conflicts.
// ═══════════════════════════════════════════════════════════════════════
const _phoneQueue = new Map(); // phone → Promise chain

function enqueueForPhone(phone, fn) {
  const key = phone || '__unknown__';
  const prev = _phoneQueue.get(key) || Promise.resolve();
  const next = prev.then(fn).catch(fn); // run even if previous errored
  _phoneQueue.set(key, next);
  // Clean up after completion to avoid memory leak
  next.finally(() => {
    if (_phoneQueue.get(key) === next) _phoneQueue.delete(key);
  });
  return next;
}

// ═══════════════════════════════════════════════════════════════════════
// INCOMING MESSAGE HANDLER (WSPP_RECEIVED)
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'WSPP_RECEIVED') return;

  const { phone, contact_name, preview, own_number, msg_type, timestamp, from_jid } = msg.payload;

  const _who = contact_name || phone || (from_jid ? `@lid:${from_jid.split('@')[0]?.slice(-6)}` : '???');
  const _previewShort = (preview || '').slice(0, 80);

  console.log(
    '\n%c ══════════ MENSAJE ENTRANTE ══════════ ',
    'background:#0e2640;color:#FFC800;font-weight:900;padding:4px 12px;border-radius:4px;font-size:13px',
  );
  console.log(
    '%c De: %c' + _who + '%c  |  Tipo: ' + msg_type,
    'color:#7a95aa', 'color:#e9eef3;font-weight:700', 'color:#7a95aa',
  );
  if (_previewShort) {
    console.log('%c  📩 "' + _previewShort + (preview && preview.length > 80 ? '…"' : '"'), 'color:#5a8aaa;font-style:italic');
  }

  // M-2: Enqueue per-phone to prevent race conditions on concurrent messages
  enqueueForPhone(phone || from_jid, async () => {
    // H-5: Step 1 — fire-and-forget CMS event (non-blocking)
    const eventBody = {
      type: 'message_received',
      phone: phone || undefined,
      contact_name: contact_name || undefined,
      own_number: own_number || undefined,
      preview: preview || undefined,
      detected_at: (timestamp || Math.floor(Date.now() / 1000)) * 1000,
    };

    apiFetch('/api/cms/extension-event', {
      method: 'POST',
      body: JSON.stringify(eventBody),
    }).then(j => {
      if (j.filtered) {
        console.log('%c  📡 CMS: filtrado (own_number no registrado)', 'color:#555');
      } else if (j.matched) {
        console.log('%c  📡 CMS: match con contacto ' + j.contact_id, 'color:#3b82f6');
      }
    });

    // H-5: Step 2 — Incrementar contador (non-blocking)
    chrome.storage.local.get(['wspp_received_count'], (data) => {
      chrome.storage.local.set({ wspp_received_count: (data.wspp_received_count ?? 0) + 1 });
    });

    // H-5: Step 3 — Clasificar (may buffer short messages)
    const classification = await classifyWithAggregation(phone, preview, from_jid);

    // M-5: Check for superseded sentinel — this message was replaced by a newer aggregate
    if (classification === MSG_BUFFER_SUPERSEDED) {
      console.log('%c  ⏭️  Mensaje superseded por agregación — esperando buffer completo', 'color:#7a95aa');
      sendResponse({ validation: null, superseded: true });
      return;
    }

    if (classification) {
      const confPct = Math.round(classification.confidence * 100);
      const confColor = confPct >= 85 ? '#22c55e' : confPct >= 70 ? '#f59e0b' : '#ef5350';
      console.log(
        '%c  🧠 CLASIFICADO → %c' + classification.category +
        '%c  |  vote: %c' + (classification.vote_class || 'invalido') +
        '%c  |  status: %c' + classification.status +
        '%c  |  conf: %c' + confPct + '%',
        'color:#06b6d4;font-weight:700',
        'color:#FFC800;font-weight:900',
        'color:#555',
        'color:' + (classification.vote_class === 'duro' ? '#22c55e' : classification.vote_class === 'blando' ? '#f59e0b' : classification.vote_class === 'flotante' ? '#a855f7' : '#ef5350') + ';font-weight:900',
        'color:#555',
        'color:#3b82f6;font-weight:700',
        'color:#555',
        'color:' + confColor + ';font-weight:900',
      );
      console.log('%c     Razón: ' + classification.reason, 'color:#7a95aa');
    } else {
      console.log('%c  🧠 Sin clasificación (mensaje muy corto o sin patrones)', 'color:#555');
    }

    // 4. Buscar validación por teléfono
    const validation = await getCachedValidation(phone);

    if (validation) {
      console.log(
        '%c  🔍 MATCH VALIDACIÓN → %c' + validation.nombre +
        '%c  |  tel: ' + validation.telefono +
        '  |  estado: %c' + validation.status +
        '%c  |  vote: %c' + (validation.vote_class || '—'),
        'color:#22c55e;font-weight:700',
        'color:#e9eef3;font-weight:900',
        'color:#555',
        'color:#3b82f6;font-weight:700',
        'color:#555',
        'color:#FFC800;font-weight:700',
      );
    } else {
      console.log('%c  🔍 Sin match en validación' + (phone ? ' (tel: ' + phone + ')' : ' (sin teléfono)'), 'color:#555');
    }

    let result = { validation: null };

    if (validation) {
      // 5. Auto-clasificar si el item está en estado contactado/respondido y hay clasificación
      const canAutoClassify =
        classification &&
        classification.confidence >= 0.7 &&
        (validation.status === 'contactado' || validation.status === 'respondido' || validation.status === 'pendiente');

      // Solo auto-transicionar si el item no tiene ya una clasificación de voto
      const hasVoteClass = validation.vote_class && validation.vote_class !== '';
      const shouldClassify = canAutoClassify && (!hasVoteClass || classification.status === 'invalido');

      if (shouldClassify) {
        // Claim primero si no está reclamado
        if (!validation.claimed_by) {
          await claimValidation(validation.id);
        }

        // Auto-transicionar pendiente → contactado primero si es necesario
        if (validation.status === 'pendiente') {
          await updateValidationStatus(validation.id, 'contactado', '', null);
        }

        // Aplicar clasificación
        const autoNote = `[AUTO] ${classification.category}: ${classification.reason} (conf: ${classification.confidence})`;
        const updateRes = await updateValidationStatus(
          validation.id,
          classification.status,
          classification.vote_class,
          autoNote,
        );

        if (updateRes.ok && updateRes.item) {
          invalidateCache(phone);
          result.validation = updateRes.item;
          result.classified = true;
          result.classification = classification;

          console.log(
            '%c  ✅ AUTO-CLASIFICADO en backend → %c' + classification.vote_class + ' / ' + classification.status,
            'background:#0e2640;color:#22c55e;font-weight:900;padding:2px 8px;border-radius:3px',
            'color:#FFC800;font-weight:900',
          );

          // Reportar evento de clasificación al backend (fire-and-forget)
          reportClassificationEvent({
            phone: phone || undefined,
            contact_name: contact_name || undefined,
            message_text: (preview || '').slice(0, 2000),
            validation_id: validation.id,
            source: 'auto',
            category: classification.category,
            vote_class: classification.vote_class,
            status: classification.status,
            confidence: classification.confidence,
            reason: classification.reason,
          });
        } else {
          result.validation = validation;
          console.log('%c  ❌ Error aplicando clasificación: ' + (updateRes.error || updateRes.message), 'color:#ef5350;font-weight:700');
        }
      } else {
        // Si ya tiene clasificación o no hay match, solo auto-transicionar contactado→respondido
        if (validation.status === 'contactado' && !classification) {
          await updateValidationStatus(validation.id, 'respondido', '', null);
          invalidateCache(phone);
          const updated = await getCachedValidation(phone);
          result.validation = updated || validation;
          console.log('%c  ↗️  Auto-transición: contactado → respondido (sin clasificar)', 'color:#3b82f6');
        } else {
          result.validation = validation;
          if (hasVoteClass) {
            console.log('%c  ⏭️  Ya clasificado como: ' + validation.vote_class + ' — no se sobreescribe', 'color:#7a95aa');
          } else if (classification && classification.confidence < 0.7) {
            console.log('%c  ⏭️  Confianza baja (' + Math.round(classification.confidence * 100) + '%) — no auto-clasifica', 'color:#f59e0b');
          }
        }
        result.classified = false;
      }
    } else if (classification) {
      result.classification = classification;

      // Reportar evento aunque no haya match de validación
      reportClassificationEvent({
        phone: phone || undefined,
        contact_name: contact_name || undefined,
        message_text: (preview || '').slice(0, 2000),
        source: 'auto',
        category: classification.category,
        vote_class: classification.vote_class,
        status: classification.status,
        confidence: classification.confidence,
        reason: classification.reason,
      });
    }

    console.log(
      '%c ════════════════════════════════════════ \n',
      'background:#0e2640;color:#334d63;padding:2px 12px;border-radius:4px',
    );

    sendResponse(result);
  }); // end enqueueForPhone

  return true; // keep sendResponse alive for async
});

// ═══════════════════════════════════════════════════════════════════════
// CHAT OPENED HANDLER (WSPP_CHAT_OPENED)
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'WSPP_CHAT_OPENED') return;

  const { phone, contact_name } = msg.payload;

  (async () => {
    const validation = await getCachedValidation(phone);
    sendResponse({ validation: validation || null });
  })();

  return true;
});

// ═══════════════════════════════════════════════════════════════════════
// CLASSIFY HANDLER (WSPP_CLASSIFY — operador clasifica manualmente)
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'WSPP_CLASSIFY') return;

  const { validation_id, vote_class, status } = msg.payload;

  (async () => {
    try {
      // Claim primero
      await claimValidation(validation_id);

      // Actualizar status
      const res = await updateValidationStatus(validation_id, status, vote_class, '[MANUAL] Clasificado desde extensión WA');
      if (res.ok && res.item) {
        // Invalidar cache para este teléfono
        invalidateCache(res.item.telefono);

        // Reportar evento de clasificación manual
        reportClassificationEvent({
          phone: res.item.telefono || undefined,
          contact_name: res.item.nombre || undefined,
          validation_id: validation_id,
          source: 'manual',
          category: 'manual_override',
          vote_class: vote_class,
          status: status,
          confidence: 1.0,
          reason: 'Clasificación manual desde extensión WA',
        });

        sendResponse({ ok: true, item: res.item });
      } else {
        sendResponse({ ok: false, error: res.message || 'Error al clasificar' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});

// ═══════════════════════════════════════════════════════════════════════
// GENERATE_VOICE: text → ElevenLabs → base64 OGG → content script
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'GENERATE_VOICE') return;

  const text = (msg.text || '').trim();
  if (!text) {
    sendResponse({ ok: false, error: 'Texto vacío' });
    return true;
  }

  console.log('[WSPP TTS] Generando voz para:', text.slice(0, 80));

  // C-1 FIX: Route TTS through backend proxy instead of calling ElevenLabs directly.
  // The API key is now stored server-side only.
  (async () => {
    try {
      // Use apiFetch to go through backend proxy (has auth + campaign headers)
      const result = await apiFetch('/api/tts/generate', {
        method: 'POST',
        body: JSON.stringify({
          text,
          voice_id: ELEVENLABS_VOICE_ID,
        }),
      });

      if (!result.ok || !result.audioBase64) {
        console.error('[WSPP TTS] Backend proxy error:', result.error || result.message);
        sendResponse({ ok: false, error: result.error || result.message || 'TTS generation failed' });
        return;
      }

      console.log('[WSPP TTS] Audio generado via backend proxy');
      sendResponse({ ok: true, audioBase64: result.audioBase64, mimeType: result.mimeType || 'audio/ogg; codecs=opus' });
    } catch (err) {
      console.error('[WSPP TTS] Error:', err);
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true; // keep sendResponse alive for async
});

// ═══════════════════════════════════════════════════════════════════════
// SENT EVENT DEDUP — WSPP_SENT (DOM) vs WSPP_SENT_RICH (MsgCollection)
// Both fire for the same outgoing message. WSPP_SENT_RICH has better
// phone resolution (from JID + resolvePhoneFromLid). Strategy:
//   - WSPP_SENT buffers for DEDUP_WINDOW_MS before processing
//   - If WSPP_SENT_RICH arrives within the window, it supersedes WSPP_SENT
//   - If only WSPP_SENT arrives, it processes normally after the window
//   - WSPP_SENT_RICH also marks a key so late WSPP_SENT is dropped
// Key: own_number + Math.floor(timestamp / 2) — groups events within 2s
// ═══════════════════════════════════════════════════════════════════════

const DEDUP_WINDOW_MS = 600;
const _sentDedup = new Map(); // dedupKey → { timer, processed }
const SENT_DEDUP_MAX = 100;   // prevent unbounded growth

function makeSentDedupKey(own_number, timestamp) {
  // Group by 2-second buckets to handle slight timestamp differences
  return (own_number || 'unk') + ':' + Math.floor((timestamp || 0) / 2);
}

/**
 * Core logic: increment counter + report to backend.
 * Shared by both WSPP_SENT and WSPP_SENT_RICH handlers.
 */
function processSentEvent(payload, source) {
  const { phone, own_number, contact_name, timestamp } = payload;

  // 1. Increment local counter
  chrome.storage.local.get(['wspp_count'], (data) => {
    const next = (data.wspp_count ?? 0) + 1;
    chrome.storage.local.set({ wspp_count: next });
  });

  // 2. Report to backend if there's something to report
  if (phone || contact_name) {
    const body = {
      type:         'message_sent',
      phone:        phone || undefined,
      contact_name: contact_name || undefined,
      own_number:   own_number || undefined,
      detected_at:  (timestamp || Math.floor(Date.now() / 1000)) * 1000,
    };
    console.log(`[WSPP] → sent event (${source}):`, JSON.stringify(body));
    apiFetch('/api/cms/extension-event', {
      method: 'POST',
      body:   JSON.stringify(body),
    }).then(j => {
      if (j.ok) console.log('[WSPP backend] ✓', j.matched ? 'matched' : (j.filtered ? 'filtered' : 'ok'));
      else      console.warn('[WSPP backend] ✗', j.error || j.message || j.code);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// WSPP_SENT — DOM-based (click/Enter). Buffers briefly to allow
// WSPP_SENT_RICH to supersede with better phone data.
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'WSPP_SENT') return;

  const { phone, own_number, contact_name, timestamp } = msg.payload;
  const dedupKey = makeSentDedupKey(own_number, timestamp);

  // Check if WSPP_SENT_RICH already processed this event
  const existing = _sentDedup.get(dedupKey);
  if (existing?.processed) {
    console.log('[WSPP DEDUP] WSPP_SENT dropped — already processed by WSPP_SENT_RICH');
    sendResponse({ ok: true, deduped: true });
    return;
  }

  // Buffer: wait DEDUP_WINDOW_MS for a potential WSPP_SENT_RICH
  // Evict oldest if at capacity
  if (_sentDedup.size >= SENT_DEDUP_MAX && !_sentDedup.has(dedupKey)) {
    const oldestKey = _sentDedup.keys().next().value;
    const oldest = _sentDedup.get(oldestKey);
    if (oldest?.timer) clearTimeout(oldest.timer);
    _sentDedup.delete(oldestKey);
  }

  const entry = {
    payload: msg.payload,
    processed: false,
    timer: setTimeout(() => {
      // Window closed without WSPP_SENT_RICH — process DOM-based event
      const e = _sentDedup.get(dedupKey);
      if (e && !e.processed) {
        e.processed = true;
        processSentEvent(e.payload, 'DOM');
        // Clean up after a bit
        setTimeout(() => _sentDedup.delete(dedupKey), 2000);
      }
    }, DEDUP_WINDOW_MS),
  };
  _sentDedup.set(dedupKey, entry);

  // Acknowledge immediately (counter incremented when actually processed)
  // We increment eagerly here so popup count stays responsive
  chrome.storage.local.get(['wspp_count'], (data) => {
    sendResponse({ ok: true, count: (data.wspp_count ?? 0) + 1 });
  });

  return true; // keep sendResponse alive for async storage callback
});

// ═══════════════════════════════════════════════════════════════════════
// WSPP_SENT_RICH — MsgCollection-based (higher fidelity phone resolution)
// Supersedes any buffered WSPP_SENT for the same message.
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'WSPP_SENT_RICH') return;

  const { phone, own_number, contact_name, to_jid, timestamp } = msg.payload;
  const dedupKey = makeSentDedupKey(own_number, timestamp);

  // Check if WSPP_SENT already fully processed (rare — would mean DOM was faster + window closed)
  const existing = _sentDedup.get(dedupKey);
  if (existing?.processed) {
    console.log('[WSPP DEDUP] WSPP_SENT_RICH arrived late — DOM event already processed');
    // Still worth sending if RICH has a phone and DOM didn't
    if (phone && !existing.payload?.phone) {
      console.log('[WSPP DEDUP] RICH has phone, DOM didn\'t — sending supplemental event');
      processSentEvent(msg.payload, 'RICH-supplement');
    }
    sendResponse({ ok: true, deduped: true });
    return;
  }

  // Cancel the buffered WSPP_SENT timer — RICH supersedes it
  if (existing?.timer) {
    clearTimeout(existing.timer);
    console.log('[WSPP DEDUP] WSPP_SENT_RICH supersedes buffered WSPP_SENT',
      '| DOM phone:', existing.payload?.phone ?? 'null',
      '| RICH phone:', phone ?? 'null');
  }

  // Mark as processed and fire
  _sentDedup.set(dedupKey, { processed: true, payload: msg.payload });
  processSentEvent(msg.payload, 'RICH');

  // Clean up after 3s
  setTimeout(() => _sentDedup.delete(dedupKey), 3000);

  sendResponse({ ok: true, source: 'rich' });
  return true;
});

// ═══════════════════════════════════════════════════════════════════════
// TAB DETECTION — detectar si WA está abierto
// ═══════════════════════════════════════════════════════════════════════

chrome.tabs.onUpdated?.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.url?.includes('web.whatsapp.com')) {
    chrome.storage.local.set({ wspp_wa_active: true });
  }
});
chrome.tabs.onRemoved?.addListener(() => {
  chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (tabs) => {
    chrome.storage.local.set({ wspp_wa_active: tabs.length > 0 });
  });
});
