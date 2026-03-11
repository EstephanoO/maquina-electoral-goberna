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

// PERF v7.1.0: Pre-compiled regex patterns at module scope (was inside classifyMessage — re-created per call)
const _rxDinero = /yape|plin|nequi|transferencia|deposito|cuenta.?(bancaria|ahorro|corriente|bcp|bbva|interbank|scotiabank)|numero.?de.?(yape|cuenta|plin|celular.*yape)|apoyo.?(economico|monetario|dinero|plata|financier)|ayuda.?(economica|monetaria|financier)|envi(?:ar|e|o|ame).?(?:dinero|plata|soles|dolares)|necesit(?:o|amos).*(?:dinero|plata|comprar|pagar|economic)|granito.?de.?arena|su.?voluntad|su.?buena.?voluntad|lo.?que.?pueda|alguito|algito|cualquier.?(?:cosita|ayudita|apoyito|aporte)|colaboracion.*(?:economic|monetari|dinero|plata)|aport(?:e|ar|ecito).*(?:economic|monetari|voluntari)|pasando.?(?:por|un).?momento.?(?:dificil|critico|complicado)|bajos?.?recursos|situacion.?(?:dificil|critica|precaria|economica)|\d{2,}\.?\d*\s*soles|\d{1,}\s*mil\s*soles|s\/\.?\s*\d{2,}|medicamentos?.*(?:hospital|clinica|salud|enferm)|examenes?.*(?:hospital|clinica|medic|laboratorio)|operacion.*(?:necesit|urgen|ayud|plata|dinero)|tratamiento.*(?:necesit|costoso|caro|ayud|plata)|(?:mama|papa|hijo|hija|esposo|esposa|abuel).*(?:enferm|hospital|operar|necesita)/;
const _rxTrabajo = /busc(?:o|ando|amos).*(?:trabajo|empleo|chamba|ocupacion)|necesit(?:o|amos).*(?:trabajo|empleo|chamba)|algun.?tipo.?de.?trabajo|oferta.?(?:laboral|de.?trabajo|de.?empleo)|oportunidad.?(?:laboral|de.?trabajo|de.?empleo)|pued(?:e|o|en).*(?:dar|ofrecer|conseguir).*(?:trabajo|empleo|chamba)|desempleado|sin.?trabajo|sin.?empleo|no.?(?:tengo|consigo|encuentro).*(?:trabajo|empleo|chamba)|trabaj(?:o|ar).*(?:campana).*despu(?:e|é)s|puesto.?de.?trabajo|(?:requiero|solicito).*(?:empleo|trabajo|chamba)|colocacion.?laboral/;
const _rxPublicidad = /publicidad.*(?:pag|programa|difusion|campana|redes|radio|tv)|programa.?(?:radial|de.?radio|televisivo)|comunicador.?social|paginas?.?(?:en.?redes|de.?facebook|de.?instagram|de.?tiktok)|seguidores.*(?:vend|ofrec|paquete|precio|mil)|\d+\s*mil\s*seguidores|precio.*(?:publicidad|difusion|campana)|cotizacion.*(?:publicidad|medios|difusion)|tari(?:f|ff)a.*(?:publicidad|radio|tv|difusion)|paquete.*(?:publicidad|redes|difusion|seguidores)|(?:radio|tv|canal|programa).*(?:cob|cost|prec|tari|pag).*(?:sol|dolar|\d{3,})|\d{3,}\s*soles.*(?:publicidad|difusion|campana)|manejo.?de.?redes.*(?:social|digital|precio|cot)/;
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
const _rxApoyoGenerico = /(?:apoy|respald|sumarse|cuent(?:e|a).?con|vot(?:o|ar|amos)|confian)/;
const _rxMerch = /necesit(?:o|amos).*(?:afiches|paneles|volantes|calendarios|banderolas|polos|gorr)|envi(?:ar|en|e).*(?:afiches|paneles|volantes|calendarios|banderolas|material)|material.?(?:publicitario|de.?campana|de.?propaganda|de.?difusion)|afiches.*(?:repartir|pegar|distribuir|campana)|volantes.*(?:repartir|entregar|distribuir|campana)|calendarios.*(?:repartir|entregar|distribuir|campana)|paneles?.*(?:coloc|instal|poner|ubicar)|banderolas?.*(?:coloc|instal|poner|ubicar)|material.*(?:repartir|distribuir|entregar|zona|distrito|barrio)|pedir(?:le|les)?.*(?:afiches|paneles|volantes|calendarios|material)|nos?.?falta.*(?:afiches|paneles|volantes|calendarios|material)|mandar(?:nos|me)?.*(?:afiches|paneles|volantes|calendarios|material)/;
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
const _rxDuroExtra = /companeros?.*(?:hospital|sector|zona|distrito|barrio)|dispuestos?.?a.?apoyar|confiamos.?en.?su.?trabajo|grupos?.?de.?apoyo|fuerza.*(?:doctor|cesar|ingeniero|candidato)/;
const _rxBlando = /apoy(?:ar|o|e|emos).*(?:focos|cableado|indumentaria|materiales|implementos)|(?:campo|cancha|losa).*(?:deportiv|futbol|campeonato)|campeonato.*(?:apoy|ayud|patroci)|copa.?(?:peru|distrital|provincial|regional)|no.?contamos.?con.?(?:los|recursos|materiales)|club.?deportivo|mejorar.?(?:nuestro|el|la).?(?:campo|cancha|local|losa)|brind(?:ar|arle).*(?:nuestro|su).?apoyo.*apoy(?:ar|o)|queremos.*(?:brindarle|darle|ofrecerle).*(?:apoyo|respaldo).*apoy|premio.*(?:campeonato|torneo|copa|deport)|(?:trofeo|medalla|premio).*(?:campeonato|torneo|copa)|uniforme.*(?:equipo|deport|futbol|club)|camiseta.*(?:equipo|deport|futbol|club)|implementos?.?(?:deportiv|para.?el.?equipo)|iluminacion.*(?:cancha|campo|losa|parque)|techado.*(?:cancha|campo|losa|coliseo)|infraestructura.*(?:deport|comunal|barri)/;
const _rxFlotante = /felicit(?:ar|o|arlo|aciones).*(?:trabajo|gestion|labor)|reconoc(?:er|iendo|emos).*(?:trabajo|labor|gestion)|consult(?:ar|arle|a).*(?:sobre|acerca|respecto)|quisiera.?saber|propuestas.*(?:para|del|sobre)|respecto.?a|que.?piensa.?(?:de|sobre)|que.?propone|buenas?.?(?:tardes|noches|dias|mananas).*(?:doctor|ingeniero|cesar).*inform|me.?gustaria.?(?:saber|conocer|que.?me.?diga)/;

function classifyMessage(text) {
  if (!text || text.length < 15) return null; // Mensaje muy corto, no clasificable

  // Normalización: lowercase + strip acentos + fix ortografía peruana
  const stripped = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lower = normalizePeruvianText(stripped);

  // S-5: Combined regex patterns — single-pass per category instead of 130+ individual .test() calls.
  // PERF v7.1.0: All regex now pre-compiled at module scope.

  // ── Regla 1: IMPOSIBLE — piden dinero / Yape / transferencia ──────
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
  let saludScore = 0;
  for (const p of _rxSaludParts) { if (p.test(lower)) saludScore++; }

  const apoyoGenerico = _rxApoyoGenerico.test(lower);
  if (saludScore >= 1 && apoyoGenerico) {
    return {
      vote_class: 'duro',
      status: 'respondido',
      confidence: 0.9,
      category: 'sector_salud',
      reason: 'Trabajador/a de salud que apoya activamente',
    };
  }

  // ── Regla 5: VOTO DURO — piden material de campana (merch) ────────
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
  let coordScore = 0;
  for (const p of _rxCoordParts) { if (p.test(lower)) coordScore++; }

  // ── Regla 7: VOTO DURO — apoyo genuino, militantes, organizados ───
  let duroScore = coordScore;
  for (const p of _rxDuroParts) { if (p.test(lower)) duroScore++; }
  // Senales adicionales de organizacion
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

  // ── Regla 10: FLOTANTE — senales ambiguas ─────────────────────────
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
    return classifyWithGeminiFallback(phone, text, fromJid);
  }

  // Buffer key: use phone if available, fall back to JID for @lid contacts
  const bufferKey = phone || fromJid;
  if (!bufferKey) return classifyWithGeminiFallback(phone, text, fromJid);

  const aggregated = await bufferMessage(bufferKey, text);
  // M-5: check for sentinel (superseded by newer message from same contact)
  if (aggregated === MSG_BUFFER_SUPERSEDED) return MSG_BUFFER_SUPERSEDED;
  if (!aggregated) return null;
  return classifyWithGeminiFallback(phone, aggregated, fromJid);
}

// ═══════════════════════════════════════════════════════════════════════
// GEMINI FALLBACK — Only calls AI when regex is ambiguous.
// Token-saving: regex classifies first (free). Gemini only for:
//   1. regex returns null (no pattern match)
//   2. regex confidence < 0.85 (ambiguous)
// Conversation context: last 3 messages from the same phone.
// ═══════════════════════════════════════════════════════════════════════

// Conversation history for context (per phone, last 3 messages)
const _conversationHistory = new Map(); // phone → [{text, ts, direction}]
const CONV_HISTORY_MAX_PER_PHONE = 5;
const CONV_HISTORY_MAX_PHONES = 300;
const GEMINI_CONFIDENCE_THRESHOLD = 0.85; // Below this, ask Gemini

function recordConversation(phone, text, direction) {
  if (!phone || !text) return;
  const key = phone;
  if (!_conversationHistory.has(key)) {
    // Evict oldest phone if at capacity
    if (_conversationHistory.size >= CONV_HISTORY_MAX_PHONES) {
      const oldest = _conversationHistory.keys().next().value;
      _conversationHistory.delete(oldest);
    }
    _conversationHistory.set(key, []);
  }
  const history = _conversationHistory.get(key);
  history.push({ text: text.slice(0, 300), ts: Date.now(), direction });
  if (history.length > CONV_HISTORY_MAX_PER_PHONE) history.shift();
}

function getConversationContext(phone) {
  if (!phone) return '';
  const history = _conversationHistory.get(phone);
  if (!history || history.length === 0) return '';
  return history
    .map(h => `[${h.direction === 'in' ? 'Votante' : 'Operador'}]: ${h.text}`)
    .join('\n');
}

/**
 * Two-tier classification: regex first, Gemini fallback for ambiguous cases.
 * Applies adaptive scoring adjustments from correction history.
 */
async function classifyWithGeminiFallback(phone, text, fromJid) {
  const regexResult = classifyMessage(text);

  // Apply adaptive scoring adjustments
  const adjusted = applyAdaptiveScoring(regexResult);

  // If regex is confident enough, use it directly
  if (adjusted && adjusted.confidence >= GEMINI_CONFIDENCE_THRESHOLD) {
    if (adjusted._boosted) {
      console.log('[WSPP AI] Regex confident (%.0f%%, boosted) — skipping Gemini', adjusted.confidence * 100);
    }
    return adjusted;
  }

  // Try Gemini for ambiguous or null cases
  // Only if message is substantial enough to be worth an API call
  if (text.length < 15) return adjusted; // Too short for AI

  try {
    const context = getConversationContext(phone || fromJid);
    const geminiResult = await apiFetch('/api/ai/classify', {
      method: 'POST',
      body: JSON.stringify({
        text: text.slice(0, 2000),
        conversation_context: context || undefined,
      }),
    });

    if (geminiResult.ok && geminiResult.classification) {
      const ai = geminiResult.classification;
      console.log(
        '%c  🤖 GEMINI → %c' + ai.category + '%c conf: ' + Math.round(ai.confidence * 100) + '%' +
        (geminiResult.cached ? ' (cached)' : ''),
        'color:#a855f7;font-weight:700', 'color:#FFC800;font-weight:900', 'color:#7a95aa',
      );

      // If both regex and Gemini classified, use higher confidence
      if (adjusted && adjusted.confidence >= 0.5) {
        // Merge: prefer Gemini if it's confident, otherwise blend
        if (ai.confidence > adjusted.confidence) {
          ai.reason = `AI: ${ai.reason} (regex: ${adjusted.category} @ ${Math.round(adjusted.confidence * 100)}%)`;
          ai.category = `ai_${ai.category}`;
          return ai;
        }
        // Regex was better — boost it slightly since Gemini agreed or was weaker
        if (adjusted.vote_class === ai.vote_class) {
          adjusted.confidence = Math.min(0.95, adjusted.confidence + 0.1);
          adjusted.reason += ` [AI confirms: ${ai.category}]`;
        }
        return adjusted;
      }

      // Regex had nothing — use Gemini result if confident
      if (ai.confidence >= 0.5 && ai.vote_class) {
        ai.category = `ai_${ai.category}`;
        return ai;
      }
    }
  } catch (err) {
    console.warn('[WSPP AI] Gemini fallback error:', err.message || err);
    // Fail silently — regex result (even if weak) is better than nothing
  }

  return adjusted;
}

// ═══════════════════════════════════════════════════════════════════════
// ADAPTIVE SCORING — learns from operator corrections to adjust
// confidence for specific categories. Persisted in chrome.storage.
// When operators correct a classification, the category's weight is
// adjusted so future regex hits get boosted or penalized.
// ═══════════════════════════════════════════════════════════════════════

// In-memory cache of adjustments: category → { boost: -0.2..+0.2, corrections: N }
let _adaptiveWeights = {};
const ADAPTIVE_STORAGE_KEY = 'wspp_adaptive_weights';
const ADAPTIVE_MAX_BOOST = 0.15;    // Max ±15% adjustment
const ADAPTIVE_DECAY_RATE = 0.02;   // Each correction moves weight by this much

// Load from storage on startup
chrome.storage.local.get([ADAPTIVE_STORAGE_KEY], (data) => {
  _adaptiveWeights = data[ADAPTIVE_STORAGE_KEY] || {};
  const count = Object.keys(_adaptiveWeights).length;
  if (count > 0) console.log('[WSPP ADAPTIVE] Loaded', count, 'category weights');
});

/**
 * Record a correction: the operator overrode a classification.
 * @param {string} originalCategory — what regex/AI classified as
 * @param {string} correctedVoteClass — what the operator said it actually is
 * @param {boolean} wasCorrect — was the original classification right?
 */
function recordCorrection(originalCategory, correctedVoteClass, wasCorrect) {
  if (!originalCategory) return;
  const w = _adaptiveWeights[originalCategory] || { boost: 0, corrections: 0, correct: 0, wrong: 0 };
  w.corrections++;
  if (wasCorrect) {
    w.correct++;
    w.boost = Math.min(ADAPTIVE_MAX_BOOST, w.boost + ADAPTIVE_DECAY_RATE);
  } else {
    w.wrong++;
    w.boost = Math.max(-ADAPTIVE_MAX_BOOST, w.boost - ADAPTIVE_DECAY_RATE);
  }
  _adaptiveWeights[originalCategory] = w;
  chrome.storage.local.set({ [ADAPTIVE_STORAGE_KEY]: _adaptiveWeights });
  console.log('[WSPP ADAPTIVE] Updated', originalCategory, '→ boost:', w.boost.toFixed(3),
    '(correct:', w.correct, 'wrong:', w.wrong, ')');
}

/**
 * Apply adaptive scoring: adjusts confidence based on historical accuracy.
 */
function applyAdaptiveScoring(classification) {
  if (!classification || !classification.category) return classification;
  const w = _adaptiveWeights[classification.category];
  if (!w || w.corrections < 3) return classification; // Need minimum data
  const adjusted = { ...classification };
  adjusted.confidence = Math.max(0.1, Math.min(0.98, adjusted.confidence + w.boost));
  if (w.boost !== 0) adjusted._boosted = true;
  return adjusted;
}

// ═══════════════════════════════════════════════════════════════════════
// SPAM / REPETITION DETECTOR — monitors outgoing messages to detect
// patterns that could trigger WhatsApp anti-spam and get numbers banned.
// Runs locally in the extension (no network calls). Shows warnings.
// ═══════════════════════════════════════════════════════════════════════

const _outgoingLog = []; // {text, timestamp, to_phone, own_number}
const SPAM_LOG_MAX = 200;
const SPAM_CHECK_INTERVAL_MS = 60000;    // check every 60s
const SPAM_REPORT_INTERVAL_MS = 300000;  // report to backend every 5 min

// Thresholds
const SPAM_MAX_BURST_PER_MIN = 25;
const SPAM_REPETITION_WARN = 0.5;  // 50% same messages → warning
const SPAM_REPETITION_CRIT = 0.8;  // 80% → critical
const SPAM_MIN_INTERVAL_SEC = 2;

/**
 * Record an outgoing message for spam analysis.
 */
function recordOutgoing(text, timestamp, toPhone, ownNumber) {
  if (!text) return;
  _outgoingLog.push({
    text: text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500),
    timestamp,
    to_phone: toPhone || null,
    own_number: ownNumber || null,
  });
  // Trim old entries (keep last 200)
  while (_outgoingLog.length > SPAM_LOG_MAX) _outgoingLog.shift();
}

/**
 * Analyze recent outgoing messages for spam patterns.
 * Returns { risk_level, warnings } or null if not enough data.
 */
function localSpamCheck() {
  // Only check last 10 minutes
  const cutoff = Math.floor(Date.now() / 1000) - 600;
  const recent = _outgoingLog.filter(m => m.timestamp >= cutoff);
  if (recent.length < 5) return null;

  const warnings = [];
  let riskScore = 0;

  // Repetition check
  const texts = recent.map(m => m.text);
  const unique = new Set(texts).size;
  const repetitionRate = 1 - unique / texts.length;

  if (repetitionRate >= SPAM_REPETITION_CRIT) {
    riskScore += 40;
    warnings.push(`⚠️ ${Math.round(repetitionRate * 100)}% mensajes idénticos en últimos 10 min. Alto riesgo de bloqueo.`);
  } else if (repetitionRate >= SPAM_REPETITION_WARN) {
    riskScore += 20;
    warnings.push(`${Math.round(repetitionRate * 100)}% mensajes repetidos. Variá el contenido.`);
  }

  // Burst check (messages in last 60s)
  const lastMinute = recent.filter(m => m.timestamp >= Math.floor(Date.now() / 1000) - 60);
  if (lastMinute.length > SPAM_MAX_BURST_PER_MIN) {
    riskScore += 35;
    warnings.push(`⚠️ ${lastMinute.length} mensajes en el último minuto. DETENER envíos.`);
  } else if (lastMinute.length > 15) {
    riskScore += 15;
    warnings.push(`${lastMinute.length} msg/min. Reducir velocidad.`);
  }

  // Interval check
  if (recent.length >= 3) {
    const sorted = [...recent].sort((a, b) => a.timestamp - b.timestamp);
    let tooFast = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].timestamp - sorted[i - 1].timestamp < SPAM_MIN_INTERVAL_SEC) tooFast++;
    }
    if (tooFast > sorted.length * 0.5) {
      riskScore += 15;
      warnings.push('Enviando muy rápido. Esperar 3-5s entre mensajes.');
    }
  }

  // Same text to many different contacts
  const textToContacts = new Map();
  for (const m of recent) {
    if (!m.to_phone) continue;
    if (!textToContacts.has(m.text)) textToContacts.set(m.text, new Set());
    textToContacts.get(m.text).add(m.to_phone);
  }
  let maxBroadcast = 0;
  for (const [, contacts] of textToContacts) {
    if (contacts.size > maxBroadcast) maxBroadcast = contacts.size;
  }
  if (maxBroadcast > 15) {
    riskScore += 25;
    warnings.push(`Mismo mensaje a ${maxBroadcast} contactos. Personalizar cada mensaje.`);
  }

  riskScore = Math.min(100, riskScore);
  const risk_level = riskScore >= 70 ? 'critical' : riskScore >= 45 ? 'high' : riskScore >= 25 ? 'medium' : 'low';

  return { risk_level, risk_score: riskScore, warnings, message_count: recent.length };
}

// Periodic spam check — notifies all WA tabs with a content script message
let _lastSpamAlert = 0;
setInterval(() => {
  const result = localSpamCheck();
  if (!result || result.risk_level === 'low') return;

  // Don't spam alerts — max once per 3 minutes for medium, immediately for high/critical
  const now = Date.now();
  const minInterval = result.risk_level === 'critical' ? 30000 : result.risk_level === 'high' ? 60000 : 180000;
  if (now - _lastSpamAlert < minInterval) return;
  _lastSpamAlert = now;

  console.warn('[WSPP SPAM]', result.risk_level.toUpperCase(), '| Score:', result.risk_score,
    '| Warnings:', result.warnings.join(' | '));

  // Notify WA tabs to show warning overlay
  chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'WSPP_SPAM_WARNING',
          payload: result,
        }).catch(() => {}); // Tab might not have content script
      }
    }
  });
}, SPAM_CHECK_INTERVAL_MS);

// Periodic backend report (every 5 min, only if there's data)
setInterval(() => {
  if (_outgoingLog.length < 5) return;
  const cutoff = Math.floor(Date.now() / 1000) - 300; // last 5 min
  const recent = _outgoingLog.filter(m => m.timestamp >= cutoff);
  if (recent.length < 3) return;

  apiFetch('/api/ai/spam-check', {
    method: 'POST',
    body: JSON.stringify({
      own_number: recent[0]?.own_number || undefined,
      messages: recent.map(m => ({ text: m.text, timestamp: m.timestamp, to_phone: m.to_phone || undefined })),
    }),
  }).then(res => {
    if (res.ok && res.risk_level !== 'low') {
      console.warn('[WSPP SPAM-SERVER]', res.risk_level.toUpperCase(),
        '| Score:', res.risk_score, '| Warnings:', (res.warnings || []).join(' | '));
    }
  }).catch(() => {});
}, SPAM_REPORT_INTERVAL_MS);

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
      if (!data.wspp_token) {
        // S-10: Try auto-refresh if session token is gone but refresh token exists
        if (!_isRetry) {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            resolve(await apiFetch(path, options, true));
            return;
          }
        }
        resolve({ ok: false, error: 'No auth' });
        return;
      }
      // campaign_id missing: still attempt the call — backend will reject with
      // a descriptive error (MISSING_CAMPAIGN) rather than silently failing here.
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

  // Record conversation for AI context
  recordConversation(phone || from_jid, preview, 'in');

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

    // Report to conversations module (uses from_jid as primary identifier)
    reportConversation(from_jid, own_number, 'in', preview, phone, contact_name);

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

  const { validation_id, vote_class, status, original_category } = msg.payload;

  (async () => {
    try {
      // Claim primero
      await claimValidation(validation_id);

      // Fetch current state before updating (for adaptive scoring)
      const currentValidation = await getCachedValidation(msg.payload._phone);

      // Actualizar status
      const res = await updateValidationStatus(validation_id, status, vote_class, '[MANUAL] Clasificado desde extensión WA');
      if (res.ok && res.item) {
        // Invalidar cache para este teléfono
        invalidateCache(res.item.telefono);

        // Adaptive scoring: learn from operator correction
        if (original_category || (currentValidation && currentValidation.vote_class)) {
          const prevCategory = original_category || currentValidation?.vote_class || '';
          const wasCorrect = prevCategory === vote_class;
          recordCorrection(prevCategory, vote_class, wasCorrect);
        }

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
// AUDIO CATALOG — pre-generated audio messages (v7.2.0)
// Replaces per-message ElevenLabs TTS with a reusable catalog.
// ═══════════════════════════════════════════════════════════════════════

// In-memory cache of catalog metadata (refreshed every 5 minutes)
let _audioCatalogCache = null;
let _audioCatalogCacheTs = 0;
const CATALOG_CACHE_TTL = 5 * 60 * 1000; // 5 min

// Audio blob cache — keeps fetched audio base64 to avoid re-fetching
const _audioDataCache = new Map(); // id → { audioBase64, mimeType }
const AUDIO_DATA_CACHE_MAX = 20;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'FETCH_AUDIO_CATALOG') return;

  (async () => {
    try {
      const now = Date.now();
      if (_audioCatalogCache && (now - _audioCatalogCacheTs) < CATALOG_CACHE_TTL) {
        sendResponse({ ok: true, items: _audioCatalogCache });
        return;
      }

      const result = await apiFetch('/api/audio-catalog');
      if (!result.ok) {
        const errDetail = result.error || result.message || 'Failed to fetch catalog';
        console.error('[WSPP CATALOG] apiFetch failed:', errDetail, '| status:', result.status);
        sendResponse({ ok: false, error: errDetail });
        return;
      }

      _audioCatalogCache = result.items || [];
      _audioCatalogCacheTs = now;
      console.log('[WSPP CATALOG] Fetched', _audioCatalogCache.length, 'items');
      sendResponse({ ok: true, items: _audioCatalogCache });
    } catch (err) {
      console.error('[WSPP CATALOG] Fetch error:', err);
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'GET_CATALOG_AUDIO') return;

  const audioId = msg.id;
  if (!audioId) {
    sendResponse({ ok: false, error: 'Missing audio id' });
    return true;
  }

  (async () => {
    try {
      // Check cache first
      const cached = _audioDataCache.get(audioId);
      if (cached) {
        console.log('[WSPP CATALOG] Audio from cache:', audioId);
        sendResponse({ ok: true, ...cached });
        return;
      }

      const result = await apiFetch(`/api/audio-catalog/${audioId}`);
      if (!result.ok || !result.item?.audioBase64) {
        const errDetail = result.error || result.message || 'Audio not available';
        console.error('[WSPP CATALOG] audio fetch failed:', audioId, errDetail, '| status:', result.status);
        sendResponse({ ok: false, error: errDetail });
        return;
      }

      const data = {
        audioBase64: result.item.audioBase64,
        mimeType: result.item.mimeType || 'audio/ogg; codecs=opus',
        label: result.item.label,
        category: result.item.category,
      };

      // Cache it
      if (_audioDataCache.size >= AUDIO_DATA_CACHE_MAX) {
        const oldest = _audioDataCache.keys().next().value;
        _audioDataCache.delete(oldest);
      }
      _audioDataCache.set(audioId, data);

      console.log('[WSPP CATALOG] Audio fetched:', audioId, data.label);
      sendResponse({ ok: true, ...data });
    } catch (err) {
      console.error('[WSPP CATALOG] Get audio error:', err);
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});

// GENERATE_CATALOG_AUDIO — calls backend to regenerate audio for an item
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'GENERATE_CATALOG_AUDIO') return;
  const itemId = msg.id;
  if (!itemId) { sendResponse({ ok: false, error: 'Missing id' }); return true; }

  (async () => {
    try {
      const result = await apiFetch(`/api/audio-catalog/${itemId}/generate`, { method: 'POST' });
      if (!result.ok) {
        sendResponse({ ok: false, error: result.message || result.error || 'Generation failed' });
        return;
      }
      // Bust audio cache for this item so next fetch gets fresh data
      _audioDataCache.delete(itemId);
      // Also bust metadata cache so duration/size refresh
      _audioCatalogCache = null;
      _audioCatalogCacheTs = 0;
      sendResponse({ ok: true, id: itemId, audioSize: result.audioSize, durationMs: result.durationMs });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});

// UPDATE_CATALOG_SCRIPT — updates the script_text of a catalog item
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'UPDATE_CATALOG_SCRIPT') return;
  const { id: itemId, script_text } = msg;
  if (!itemId || !script_text) { sendResponse({ ok: false, error: 'Missing id or script_text' }); return true; }

  (async () => {
    try {
      const result = await apiFetch(`/api/audio-catalog/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ script_text }),
      });
      if (!result.ok) {
        sendResponse({ ok: false, error: result.message || result.error || 'Update failed' });
        return;
      }
      // Bust all caches — metadata changed
      _audioDataCache.delete(itemId);
      _audioCatalogCache = null;
      _audioCatalogCacheTs = 0;
      sendResponse({ ok: true, id: itemId, script_text });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});

// BUST_AUDIO_CACHE / BUST_CATALOG_CACHE — cache invalidation from inject
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'BUST_AUDIO_CACHE' && msg.id) {
    _audioDataCache.delete(msg.id);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'BUST_CATALOG_CACHE') {
    _audioCatalogCache = null;
    _audioCatalogCacheTs = 0;
    sendResponse({ ok: true });
    return true;
  }
});

// DELETE_CATALOG_ITEM — deletes a catalog item from the backend
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'DELETE_CATALOG_ITEM') return;
  const itemId = msg.id;
  if (!itemId) { sendResponse({ ok: false, error: 'Missing id' }); return true; }

  (async () => {
    try {
      const result = await apiFetch(`/api/audio-catalog/${itemId}`, { method: 'DELETE' });
      if (!result.ok) {
        sendResponse({ ok: false, error: result.message || result.error || 'Delete failed' });
        return;
      }
      // Bust all caches
      _audioDataCache.delete(itemId);
      _audioCatalogCache = null;
      _audioCatalogCacheTs = 0;
      sendResponse({ ok: true, id: itemId });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});

// CREATE_CATALOG_ITEM — creates a new catalog item in the backend
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'CREATE_CATALOG_ITEM') return;
  const { data } = msg;
  if (!data?.label || !data?.script_text) {
    sendResponse({ ok: false, error: 'Missing required fields (label, script_text)' });
    return true;
  }

  (async () => {
    try {
      const result = await apiFetch('/api/audio-catalog', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!result.ok) {
        sendResponse({ ok: false, error: result.message || result.error || 'Create failed' });
        return;
      }
      // Bust catalog metadata cache so next list fetch is fresh
      _audioCatalogCache = null;
      _audioCatalogCacheTs = 0;
      sendResponse({ ok: true, item: result.item ?? result });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
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
 * Report a message to the conversations module.
 * Fire-and-forget — does not block the main handler flow.
 * Requires a JID (from_jid for inbound, to_jid for outbound).
 * If no JID is available (DOM-only WSPP_SENT), silently skips.
 */
function reportConversation(jid, ownNumber, direction, text, phone, contactName) {
  if (!jid || !ownNumber) return;
  const body = {
    jid,
    own_number: ownNumber,
    direction,
    text: (text || '').slice(0, 2000),
    phone: phone || undefined,
    contact_name: contactName || undefined,
    timestamp: Date.now(),
  };
  apiFetch('/api/conversations/message', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(j => {
    if (j.ok) {
      console.log(`[CONV] ✓ ${direction} → conv #${j.conversation_id}`,
        j.is_new ? '(nueva)' : `(msg #${j.message_count})`,
        j.auto_classified ? '🤖 clasificada' : '');
    } else {
      console.warn('[CONV] ✗', j.error || j.message || j.code);
    }
  }).catch(err => {
    console.warn('[CONV] error:', err?.message || err);
  });
}

/**
 * Core logic: increment counter + report to backend.
 * Shared by both WSPP_SENT and WSPP_SENT_RICH handlers.
 */
function processSentEvent(payload, source) {
  const { phone, own_number, contact_name, timestamp, body: msgBody } = payload;
  const messageText = msgBody || '';

  // 1. Increment local counter
  chrome.storage.local.get(['wspp_count'], (data) => {
    const next = (parseInt(data.wspp_count, 10) || 0) + 1;
    chrome.storage.local.set({ wspp_count: next });
  });

  // 2. Record for spam detection + conversation context
  // BUG FIX v7.1.0: pass actual message text instead of contact_name
  recordOutgoing(messageText || phone || '?', timestamp || Math.floor(Date.now() / 1000), phone, own_number);
  recordConversation(phone, messageText || '(sent)', 'out');

  // 3. Report to backend if there's something to report
  if (phone || contact_name) {
    const eventBody = {
      type:         'message_sent',
      phone:        phone || undefined,
      contact_name: contact_name || undefined,
      own_number:   own_number || undefined,
      detected_at:  (timestamp || Math.floor(Date.now() / 1000)) * 1000,
    };
    console.log(`[WSPP] → sent event (${source}):`, JSON.stringify(eventBody));
    apiFetch('/api/cms/extension-event', {
      method: 'POST',
      body:   JSON.stringify(eventBody),
    }).then(j => {
      if (j.ok) console.log('[WSPP backend] ✓', j.matched ? 'matched' : (j.filtered ? 'filtered' : 'ok'));
      else      console.warn('[WSPP backend] ✗', j.error || j.message || j.code);
    });
  }

  // 4. Report to conversations module (requires to_jid from WSPP_SENT_RICH)
  // BUG FIX v7.1.0: pass actual message text instead of placeholder
  const toJid = payload.to_jid;
  if (toJid) {
    reportConversation(toJid, own_number, 'out', messageText || '(mensaje enviado)', phone, contact_name);
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

  // Acknowledge immediately — actual counter increment happens in processSentEvent
  // Return current count (will update asynchronously once processed)
  chrome.storage.local.get(['wspp_count'], (data) => {
    sendResponse({ ok: true, count: data.wspp_count ?? 0 });
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
