// adaptive-scoring.js — aprende de correcciones para ajustar confidence.

const ADAPTIVE_STORAGE_KEY = 'wspp_adaptive_weights';
const ADAPTIVE_MAX_BOOST = 0.15;
const ADAPTIVE_DECAY_RATE = 0.02;

let _adaptiveWeights = {};

// Load from storage on startup
chrome.storage.local.get([ADAPTIVE_STORAGE_KEY], (data) => {
  _adaptiveWeights = data[ADAPTIVE_STORAGE_KEY] || {};
  const count = Object.keys(_adaptiveWeights).length;
  if (count > 0) console.log('[WSPP ADAPTIVE] Loaded', count, 'category weights');
});

/**
 * Record a correction: the operator overrode a classification.
 */
export function recordCorrection(originalCategory, correctedVoteClass, wasCorrect) {
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
export function applyAdaptiveScoring(classification) {
  if (!classification || !classification.category) return classification;
  const w = _adaptiveWeights[classification.category];
  if (!w || w.corrections < 3) return classification;
  const adjusted = { ...classification };
  adjusted.confidence = Math.max(0.1, Math.min(0.98, adjusted.confidence + w.boost));
  if (w.boost !== 0) adjusted._boosted = true;
  return adjusted;
}
