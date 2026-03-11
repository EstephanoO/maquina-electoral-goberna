// conversation-scorer.js — scoring conversacional acumulado por teléfono.
//
// PROBLEMA QUE RESUELVE:
//   El clasificador anterior procesaba cada mensaje de forma aislada.
//   Un contacto "duro" podía volverse "invalido" con un solo mensaje ambiguo.
//   Este módulo acumula signals de toda la conversación y produce una
//   clasificación estable resistente al ruido de mensajes individuales.
//
// DISEÑO:
//   - Mantiene un historial de signals en memoria (Map) + chrome.storage para
//     persistencia entre recargas del service worker.
//   - Cada signal tiene un peso basado en: categoría, confianza y tiempo (decay).
//   - La clasificación final es el resultado de la suma ponderada de signals.
//   - "invalido" tiene protección especial: no se revierte con un solo mensaje
//     positivo, pero sí con suficiente evidencia contraria acumulada.

const SCORER_STORAGE_KEY = 'wspp_conv_scores';
const SCORER_CONFIG_KEY = 'wspp_scorer_config';
const SIGNAL_MAX_PER_PHONE = 20;     // máximo de signals retenidos por teléfono
const PHONE_MAX_ENTRIES = 500;       // máximo de teléfonos en memoria

// ── DEFAULTS (se pueden overridear con setScorerConfig desde scorer-bootstrap) ──
// IMPORTANTE: Estos valores son los mismos que en
// apps/backend/src/modules/validacion/repository.ts (fuente de verdad del backend).
// Si cambiás defaults aquí, cambialos también allá, y viceversa.
// Sin embargo, la campaña puede tener overrides que llegan via GET /api/validacion/scorer-config.

const DEFAULT_DECAY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

const DEFAULT_CATEGORY_WEIGHTS = {
  // ── Invalido (negativos) ──
  pide_dinero:        -3.0,
  pide_trabajo:       -2.5,
  publicidad_pagada:  -2.0,
  // ── Duro (positivos altos) ──
  sector_salud:        2.5,
  coordinador:         3.0,
  apoyo_genuino:       2.0,
  apoyo_probable:      1.0,
  pide_merch:          2.5,
  // ── Blando (positivos bajos) ──
  apoyo_condicional:   1.2,
  // ── Flotante (neutros bajos) ──
  indeciso:            0.3,
  sector_salud_indeciso: 0.5,
  // ── AI-prefixed (misma lógica) ──
  ai_sector_salud:     2.5,
  ai_coordinador:      3.0,
  ai_apoyo_genuino:    2.0,
  ai_apoyo_condicional: 1.2,
  ai_indeciso:         0.3,
  ai_pide_dinero:     -3.0,
  ai_pide_trabajo:    -2.5,
  ai_publicidad_pagada: -2.0,
};

const DEFAULT_THRESHOLDS = {
  duro:     2.5,
  blando:   0.8,
  flotante: 0.1,
};

const DEFAULT_INVALIDO_LOCK_THRESHOLD = 2.5;
const DEFAULT_INVALIDO_REVERSAL_THRESHOLD = 3.0;

// ── Estado activo de configuración (mergeado con overrides de campaña) ──
// Estas variables son las que realmente se usan en todos los cálculos.
// Se inicializan con defaults y se actualizan con setScorerConfig().
let CATEGORY_WEIGHTS = { ...DEFAULT_CATEGORY_WEIGHTS };
let THRESHOLDS = { ...DEFAULT_THRESHOLDS };
let DECAY_HALF_LIFE_MS = DEFAULT_DECAY_HALF_LIFE_MS;
let INVALIDO_LOCK_THRESHOLD = DEFAULT_INVALIDO_LOCK_THRESHOLD;
let INVALIDO_REVERSAL_THRESHOLD = DEFAULT_INVALIDO_REVERSAL_THRESHOLD;

/**
 * Aplica config de campaña al scorer. Llamado por scorer-bootstrap al arrancar.
 * Los valores null/undefined se ignoran — se mantiene el default.
 *
 * @param {object} config — shape de ResolvedScorerConfig del backend
 */
export function setScorerConfig(config) {
  if (!config || typeof config !== 'object') return;

  if (config.category_weights && typeof config.category_weights === 'object') {
    CATEGORY_WEIGHTS = { ...DEFAULT_CATEGORY_WEIGHTS, ...config.category_weights };
  }
  if (typeof config.threshold_duro === 'number') THRESHOLDS.duro = config.threshold_duro;
  if (typeof config.threshold_blando === 'number') THRESHOLDS.blando = config.threshold_blando;
  if (typeof config.threshold_flotante === 'number') THRESHOLDS.flotante = config.threshold_flotante;
  if (typeof config.invalido_lock_threshold === 'number') INVALIDO_LOCK_THRESHOLD = config.invalido_lock_threshold;
  if (typeof config.invalido_reversal_threshold === 'number') INVALIDO_REVERSAL_THRESHOLD = config.invalido_reversal_threshold;
  if (typeof config.decay_half_life_ms === 'number' && config.decay_half_life_ms > 0) {
    DECAY_HALF_LIFE_MS = config.decay_half_life_ms;
  }

  // Persistir config para que esté disponible inmediatamente en futuros wake-ups del SW
  // antes de que el bootstrap haga la request HTTP.
  chrome.storage.local.set({ [SCORER_CONFIG_KEY]: config });

  console.log('[SCORER] Config aplicada — umbrales:', THRESHOLDS, '| lock:', INVALIDO_LOCK_THRESHOLD, '| reversal:', INVALIDO_REVERSAL_THRESHOLD);
}

// Cargar config persistida al iniciar el SW (antes del bootstrap HTTP)
chrome.storage.local.get([SCORER_CONFIG_KEY], (data) => {
  const stored = data[SCORER_CONFIG_KEY];
  if (stored && typeof stored === 'object') {
    setScorerConfig(stored);
    console.log('[SCORER] Config restaurada desde storage');
  }
});

// ── Estado en memoria ──
// phone → { signals: Signal[] }
const _state = new Map();

// ── Timer de debounce para _persist() ──
let _persistTimer = null;

/**
 * @typedef Signal
 * @property {string} category
 * @property {number} weight     — peso base de la categoría (puede ser negativo)
 * @property {number} confidence — 0.0-1.0 del clasificador
 * @property {number} ts         — Date.now() cuando se registró
 */

// Carga persistida al iniciar el service worker
chrome.storage.local.get([SCORER_STORAGE_KEY], (data) => {
  const stored = data[SCORER_STORAGE_KEY];
  if (!stored || typeof stored !== 'object') return;
  let loaded = 0;
  for (const [phone, entry] of Object.entries(stored)) {
    if (entry && Array.isArray(entry.signals)) {
      _state.set(phone, {
        signals: entry.signals,
      });
      loaded++;
    }
  }
  if (loaded > 0) console.log(`[SCORER] Cargados ${loaded} teléfonos desde storage`);
});

// ── Persistencia ──

/**
 * Escribe el estado en chrome.storage.local inmediatamente (sin debounce).
 * Usar en operaciones críticas: reset y seed.
 */
function _persistImmediate() {
  if (_persistTimer !== null) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
  const obj = {};
  for (const [phone, entry] of _state.entries()) {
    obj[phone] = { signals: entry.signals };
  }
  chrome.storage.local.set({ [SCORER_STORAGE_KEY]: obj });
}

/**
 * Escribe el estado en chrome.storage.local con debounce de 500ms.
 * Una ráfaga de signals causa un único write al final del burst.
 * Usar en recordSignal() — no en reset/seed.
 */
function _persist() {
  if (_persistTimer !== null) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    const obj = {};
    for (const [phone, entry] of _state.entries()) {
      obj[phone] = { signals: entry.signals };
    }
    chrome.storage.local.set({ [SCORER_STORAGE_KEY]: obj });
  }, 500);
}

// ── Decay temporal ──

/**
 * Retorna el factor de decay para una señal de edad `ageMs`.
 * Usa decaimiento exponencial con half-life de 7 días.
 * Signals nuevas tienen factor ~1.0; de hace 7 días tienen factor ~0.5.
 */
function decayFactor(ageMs) {
  return Math.pow(0.5, ageMs / DECAY_HALF_LIFE_MS);
}

// ── Normalización de claves de teléfono ──

/**
 * Normaliza una clave de teléfono para evitar historiales duplicados del mismo contacto.
 *
 * Casos que maneja:
 *   "51987654321@s.whatsapp.net" → "987654321"   (JID con código de país)
 *   "987654321"                  → "987654321"   (ya normalizado)
 *   "51987654321"                → "987654321"   (con código de país, sin @)
 *   "lid:abc123@lid"             → "lid:abc123@lid"  (JID no numérico → sin tocar)
 *
 * Reglas:
 *   1. Si contiene "@", extrae la parte antes del "@"
 *   2. Toma los últimos 9 dígitos del resultado
 *   3. Si quedan menos de 7 dígitos → retorna el key original (JID no numérico)
 *
 * @param {string} key
 * @returns {string}
 */
function _normalizePhoneKey(key) {
  if (!key) return key;
  let normalized = key;

  // Extraer la parte antes del "@" si es un JID
  if (normalized.includes('@')) {
    normalized = normalized.split('@')[0];
  }

  // Quedarnos solo con dígitos
  const digits = normalized.replace(/\D/g, '');

  // Si quedan menos de 7 dígitos, el JID era no numérico (lid, etc.) → sin tocar
  if (digits.length < 7) return key;

  // Últimos 9 dígitos = número móvil peruano sin código de país
  return digits.slice(-9);
}

// ── API pública ──

/**
 * Agrega una clasificación de mensaje al historial del teléfono.
 * No retorna nada — modificar el score requiere llamar getConversationScore().
 *
 * @param {string} phone
 * @param {{ category: string, vote_class: string, status: string, confidence: number }} classification
 */
export function recordSignal(phone, classification) {
  if (!phone || !classification) return;

  const key = _normalizePhoneKey(phone);

  // LRU eviction si superamos el máximo de teléfonos
  if (!_state.has(key) && _state.size >= PHONE_MAX_ENTRIES) {
    const oldest = _state.keys().next().value;
    _state.delete(oldest);
  }

  if (!_state.has(key)) {
    _state.set(key, { signals: [] });
  }

  const entry = _state.get(key);
  const baseWeight = CATEGORY_WEIGHTS[classification.category] ?? 0;

  // Solo guardamos signals que tienen peso conocido (no ruido puro)
  if (baseWeight === 0 && classification.confidence < 0.5) return;

  /** @type {Signal} */
  const signal = {
    category: classification.category,
    weight: baseWeight,
    confidence: classification.confidence,
    ts: Date.now(),
  };

  // Agregar signal
  entry.signals.push(signal);

  // Trim FIFO
  if (entry.signals.length > SIGNAL_MAX_PER_PHONE) {
    entry.signals.shift();
  }

  _persist();
}

/**
 * Computa el score conversacional acumulado para un teléfono y retorna
 * la clasificación final estable.
 *
 * Retorna null si no hay suficientes signals o el score es muy bajo.
 *
 * @param {string} phone
 * @returns {{ vote_class: string, status: string, confidence: number, score: number, reason: string } | null}
 */
export function getConversationScore(phone) {
  if (!phone) return null;
  const entry = _state.get(_normalizePhoneKey(phone));
  if (!entry || entry.signals.length === 0) return null;

  const now = Date.now();

  let positiveScore = 0;
  let negativeScore = 0;

  for (const sig of entry.signals) {
    const age = now - sig.ts;
    const decay = decayFactor(age);
    const effectiveWeight = sig.weight * sig.confidence * decay;

    if (effectiveWeight > 0) {
      positiveScore += effectiveWeight;
    } else {
      negativeScore += Math.abs(effectiveWeight);
    }
  }

  const netScore = positiveScore - negativeScore;

  // ── Caso invalido bloqueado ──
  // El lock se calcula dinámicamente sobre los signals con decay aplicado:
  // no hay campo acumulado, por lo que el FIFO y el decay son siempre consistentes.
  const lockedInvalido = negativeScore >= INVALIDO_LOCK_THRESHOLD;
  if (lockedInvalido) {
    if (positiveScore >= INVALIDO_REVERSAL_THRESHOLD) {
      // Suficiente evidencia positiva → lock roto, continúa a clasificación normal
    } else {
      return {
        vote_class: '',
        status: 'invalido',
        confidence: Math.min(0.95, 0.7 + negativeScore * 0.05),
        score: netScore,
        reason: `Invalido bloqueado (neg: ${negativeScore.toFixed(2)}, pos: ${positiveScore.toFixed(2)})`,
      };
    }
  }

  // ── Sin lock de invalido: clasificar por score neto ──

  // Si predominan negativos (aunque no bloqueado todavía)
  if (netScore < -0.5 && negativeScore > positiveScore) {
    return {
      vote_class: '',
      status: 'invalido',
      confidence: Math.min(0.9, 0.5 + negativeScore * 0.05),
      score: netScore,
      reason: `Score negativo (neg: ${negativeScore.toFixed(2)}, pos: ${positiveScore.toFixed(2)})`,
    };
  }

  // Score positivo → determinar categoría
  if (netScore >= THRESHOLDS.duro) {
    // Determinar subcategoría: preferir la categoría positiva más fuerte
    const topCategory = _getTopCategory(entry.signals, now, 'positive');
    return {
      vote_class: 'duro',
      status: 'respondido',
      confidence: Math.min(0.95, 0.7 + netScore * 0.04),
      score: netScore,
      reason: `Score conversacional duro (${netScore.toFixed(2)}) — top: ${topCategory}`,
    };
  }

  if (netScore >= THRESHOLDS.blando) {
    const topCategory = _getTopCategory(entry.signals, now, 'positive');
    return {
      vote_class: 'blando',
      status: 'respondido',
      confidence: Math.min(0.85, 0.55 + netScore * 0.05),
      score: netScore,
      reason: `Score conversacional blando (${netScore.toFixed(2)}) — top: ${topCategory}`,
    };
  }

  if (netScore >= THRESHOLDS.flotante) {
    return {
      vote_class: 'flotante',
      status: 'respondido',
      confidence: Math.min(0.7, 0.4 + netScore * 0.1),
      score: netScore,
      reason: `Score conversacional flotante (${netScore.toFixed(2)})`,
    };
  }

  // Score demasiado bajo para clasificar
  return null;
}

/**
 * Combina la clasificación del mensaje actual con el score conversacional.
 * Este es el punto de entrada principal desde received-handler.
 *
 * Reglas de fusión:
 * 1. Si hay score conversacional → el scorer manda (estabilidad)
 * 2. Si el scorer no tiene suficiente historia → usar clasificación del mensaje
 * 3. Si hay lock invalido, el scorer manda aunque la clasificación del mensaje sea positiva
 * 4. La confidence final es el máximo de ambas (o promedio si coinciden)
 *
 * @param {string} phone
 * @param {{ vote_class: string, status: string, confidence: number, category: string, reason: string } | null} msgClassification
 * @returns {{ vote_class: string, status: string, confidence: number, category: string, reason: string } | null}
 */
export function mergeWithConversationScore(phone, msgClassification) {
  if (!phone) return msgClassification;

  // Normalizar la clave una sola vez para toda la función
  const key = _normalizePhoneKey(phone);

  // Registrar el signal del mensaje actual antes de leer el score
  if (msgClassification) {
    recordSignal(key, msgClassification);
  }

  const conversationResult = getConversationScore(key);

  // Sin historial suficiente → usar clasificación del mensaje directamente
  if (!conversationResult) return msgClassification;

  // Sin clasificación del mensaje → usar el score conversacional,
  // pero marcar que es puramente histórico (no hay mensaje nuevo que lo dispare).
  // received-handler usa este flag para evitar escrituras innecesarias al backend.
  if (!msgClassification) return { ...conversationResult, _fromConversationHistory: true };

  // Ambos disponibles → el score conversacional es más confiable
  // pero si el mensaje tiene confidence muy alta y misma categoría, reforzar
  const sameClass = msgClassification.vote_class === conversationResult.vote_class ||
    (msgClassification.status === 'invalido' && conversationResult.status === 'invalido');

  if (sameClass) {
    // Coinciden → subir confianza ligeramente
    return {
      ...conversationResult,
      confidence: Math.min(0.97, Math.max(conversationResult.confidence, msgClassification.confidence) + 0.03),
      reason: `[CONV] ${conversationResult.reason}`,
      category: msgClassification.category,
    };
  }

  // No coinciden → el scorer gana (es más estable)
  // Pero anotamos el conflicto en la razón para trazabilidad
  return {
    ...conversationResult,
    reason: `[CONV] ${conversationResult.reason} ← msg: ${msgClassification.category}`,
    category: msgClassification.category,
  };
}

/**
 * Resetea el historial de un teléfono.
 * Útil cuando una corrección manual indica que el historial acumulado es incorrecto.
 *
 * @param {string} phone
 */
export function resetConversationScore(phone) {
  if (!phone) return;
  _state.delete(_normalizePhoneKey(phone));
  _persistImmediate();
}

/**
 * Retorna el estado interno del scorer para un teléfono (debug/diagnóstico).
 *
 * @param {string} phone
 */
export function getConversationDebug(phone) {
  if (!phone) return null;
  const key = _normalizePhoneKey(phone);
  const entry = _state.get(key);
  if (!entry) return { signals: [], lockedInvalido: false, negativeScore: 0, score: null };

  // Calcular scores con decay para reflejar el estado real (igual que getConversationScore)
  const now = Date.now();
  let _positiveScore = 0;
  let _negativeScore = 0;
  for (const sig of entry.signals) {
    const ew = sig.weight * sig.confidence * decayFactor(now - sig.ts);
    if (ew > 0) _positiveScore += ew; else _negativeScore += Math.abs(ew);
  }
  const lockedInvalido = _negativeScore >= INVALIDO_LOCK_THRESHOLD;

  return {
    signals: entry.signals.map(s => ({
      ...s,
      age_hours: Math.round((now - s.ts) / 3600000 * 10) / 10,
      effective_weight: s.weight * s.confidence * decayFactor(now - s.ts),
    })),
    lockedInvalido,          // calculado dinámicamente, no leído de estado
    negativeScore: _negativeScore,
    positiveScore: _positiveScore,
    thresholds: { ...THRESHOLDS, invalido_lock: INVALIDO_LOCK_THRESHOLD, invalido_reversal: INVALIDO_REVERSAL_THRESHOLD },
    score: getConversationScore(key),
  };
}

/**
 * Siembra el historial de un teléfono con una clasificación conocida y confiable.
 * Usar después de una corrección manual del operador, en lugar de resetear.
 * Pone 2 signals sintéticos de alta confianza (conf=1.0) con la categoría correcta,
 * usando el timestamp actual. Cualquier historial previo se descarta.
 *
 * @param {string} phone
 * @param {string} voteClass — 'duro' | 'blando' | 'flotante' | '' (invalido)
 * @param {string} status — 'respondido' | 'invalido'
 */
export function seedConversationScore(phone, voteClass, status) {
  if (!phone) return;

  const key = _normalizePhoneKey(phone);

  // Determinar la categoría sintética y peso base para el seed
  let seedCategory;
  if (status === 'invalido') {
    seedCategory = 'pide_dinero'; // el negativo más fuerte — representa "operador confirmó invalido"
  } else if (voteClass === 'duro') {
    seedCategory = 'apoyo_genuino';
  } else if (voteClass === 'blando') {
    seedCategory = 'apoyo_condicional';
  } else if (voteClass === 'flotante') {
    seedCategory = 'indeciso';
  } else {
    seedCategory = 'indeciso'; // fallback
  }

  const baseWeight = CATEGORY_WEIGHTS[seedCategory] ?? 0;

  // Reemplazar historial con 2 signals sintéticos de alta confianza
  // Dos signals en lugar de uno para que el scorer tenga suficiente masa
  // y no sea fácilmente revertido por un solo mensaje posterior
  const now = Date.now();
  const signals = [
    { category: seedCategory, weight: baseWeight, confidence: 1.0, ts: now - 1000 },
    { category: seedCategory, weight: baseWeight, confidence: 1.0, ts: now },
  ];

  // LRU eviction si es necesario
  if (!_state.has(key) && _state.size >= PHONE_MAX_ENTRIES) {
    const oldest = _state.keys().next().value;
    _state.delete(oldest);
  }

  _state.set(key, { signals });
  _persistImmediate();
}

// ── API de bootstrap (usada solo por scorer-bootstrap.js) ──

/**
 * Inyecta un signal histórico con timestamp arbitrario (pasado).
 * A diferencia de recordSignal(), NO llama a _persist() — el caller
 * debe llamar flushScorerStorage() al terminar la ráfaga de bootstrap.
 *
 * Retorna true si el signal fue inyectado, false si el teléfono ya tenía
 * signals en memoria (no se mezcla historial nuevo con estado caliente).
 *
 * @param {string} phone
 * @param {string} category
 * @param {number} confidence
 * @param {number} ts — epoch ms del evento original
 * @returns {boolean}
 */
export function recordSignalRaw(phone, category, confidence, ts) {
  if (!phone || !category) return false;

  const key = _normalizePhoneKey(phone);

  // INVARIANTE CRÍTICA: si el teléfono ya tiene signals en memoria
  // (el SW estaba caliente), no mezclamos historial del backend.
  // El scorer ya tiene el estado más reciente; el historial del backend
  // podría tener events anteriores al último _persistImmediate().
  if (_state.has(key)) return false;

  const baseWeight = CATEGORY_WEIGHTS[category] ?? 0;
  if (baseWeight === 0) return false;

  // LRU eviction si superamos el máximo de teléfonos
  if (_state.size >= PHONE_MAX_ENTRIES) {
    const oldest = _state.keys().next().value;
    _state.delete(oldest);
  }

  if (!_state.has(key)) {
    _state.set(key, { signals: [] });
  }

  const entry = _state.get(key);

  /** @type {Signal} */
  const signal = {
    category,
    weight: baseWeight,
    confidence,
    ts, // timestamp original — decay calculado contra Date.now() al leer
  };

  entry.signals.push(signal);

  // Trim FIFO (igual que recordSignal)
  if (entry.signals.length > SIGNAL_MAX_PER_PHONE) {
    entry.signals.shift();
  }

  // NO llamar _persist() aquí — el caller llama flushScorerStorage() al terminar
  return true;
}

/**
 * Persiste el estado completo del scorer en chrome.storage de forma inmediata.
 * Llamar una vez al terminar una ráfaga de recordSignalRaw() (bootstrap).
 */
export function flushScorerStorage() {
  _persistImmediate();
}

// ── Helpers privados ──

function _getTopCategory(signals, now, sign) {
  let best = null;
  let bestW = 0;
  for (const sig of signals) {
    const w = sig.weight * sig.confidence * decayFactor(now - sig.ts);
    const relevant = sign === 'positive' ? w > 0 : w < 0;
    if (relevant && Math.abs(w) > Math.abs(bestW)) {
      bestW = w;
      best = sig.category;
    }
  }
  return best || 'desconocido';
}
