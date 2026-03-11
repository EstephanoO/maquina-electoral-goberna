// gemini-fallback.js — clasificación con fallback a Gemini AI.

import { classifyMessage } from './classifier.js';
import { applyAdaptiveScoring } from './adaptive-scoring.js';
import { apiFetch } from './api-client.js';
import { getConversationScore } from './conversation-scorer.js';

const _conversationHistory = new Map(); // phone → [{text, ts, direction}]
const CONV_HISTORY_MAX_PER_PHONE = 5;
const CONV_HISTORY_MAX_PHONES = 300;
const GEMINI_CONFIDENCE_THRESHOLD = 0.85;

export function recordConversation(phone, text, direction) {
  if (!phone || !text) return;
  const key = phone;
  if (!_conversationHistory.has(key)) {
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

export function getConversationContext(phone) {
  if (!phone) return '';
  const history = _conversationHistory.get(phone);
  if (!history || history.length === 0) return '';
  return history
    .map(h => `[${h.direction === 'in' ? 'Votante' : 'Operador'}]: ${h.text}`)
    .join('\n');
}

/**
 * Construye el bloque de contexto conversacional acumulado para enriquecer
 * el prompt de Gemini. Incluye:
 *   - Score numérico actual (positivo, negativo, neto)
 *   - Clasificación conversacional estable si existe
 *   - Historial de últimos mensajes
 *
 * Gemini usa este prior para no clasificar un mensaje ambiguo en vacío:
 * si el contacto ya tiene score=3.2 duro, un mensaje neutro no debería
 * romper esa clasificación.
 *
 * @param {string} phone
 * @returns {string}
 */
function buildGeminiContext(phone) {
  const parts = [];

  // ── 1. Score conversacional acumulado ──
  const convScore = getConversationScore(phone);
  if (convScore) {
    const voteLabel = convScore.vote_class
      ? `${convScore.vote_class} (${convScore.status})`
      : `invalido`;
    parts.push(
      `[HISTORIAL ACUMULADO] Clasificación estable del contacto: ${voteLabel} | ` +
      `score neto: ${convScore.score.toFixed(2)} | conf: ${Math.round(convScore.confidence * 100)}%` +
      (convScore.reason ? ` | ${convScore.reason}` : '')
    );
  }

  // ── 2. Historial de mensajes recientes ──
  const context = getConversationContext(phone);
  if (context) {
    parts.push(context);
  }

  return parts.join('\n');
}

/**
 * Two-tier classification: regex first, Gemini fallback for ambiguous cases.
 * Applies adaptive scoring adjustments from correction history.
 */
export async function classifyWithGeminiFallback(phone, text, fromJid) {
  const regexResult = classifyMessage(text);

  const adjusted = applyAdaptiveScoring(regexResult);

  if (adjusted && adjusted.confidence >= GEMINI_CONFIDENCE_THRESHOLD) {
    if (adjusted._boosted) {
      console.log('[WSPP AI] Regex confident (%.0f%%, boosted) — skipping Gemini', adjusted.confidence * 100);
    }
    return adjusted;
  }

  if (text.length < 15) return adjusted;

  try {
    // Usar el contexto enriquecido: score conversacional acumulado + historial de mensajes.
    // Gemini tiene el prior del contacto y no clasifica el mensaje en el vacío.
    const context = buildGeminiContext(phone || fromJid);
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

      if (adjusted && adjusted.confidence >= 0.5) {
        if (ai.confidence > adjusted.confidence) {
          ai.reason = `AI: ${ai.reason} (regex: ${adjusted.category} @ ${Math.round(adjusted.confidence * 100)}%)`;
          ai.category = `ai_${ai.category}`;
          return ai;
        }
        if (adjusted.vote_class === ai.vote_class) {
          adjusted.confidence = Math.min(0.95, adjusted.confidence + 0.1);
          adjusted.reason += ` [AI confirms: ${ai.category}]`;
        }
        return adjusted;
      }

      if (ai.confidence >= 0.5 && ai.vote_class) {
        ai.category = `ai_${ai.category}`;
        return ai;
      }
    }
  } catch (err) {
    console.warn('[WSPP AI] Gemini fallback error:', err.message || err);
  }

  return adjusted;
}
