// template-analyzer.js — Análisis de riesgo de plantillas pre-envío
// VERSIÓN PERMISIVA — solo flags informativos, no bloquea el envío.
// Umbrales: 0-60 OK / 61-90 warning / 91+ danger

// ── Palabras trigger de spam (suavizado) ─────────────────────────
const SPAM_WORDS = [
  'oferta', 'descuento', 'gratis', 'sorteo', 'premio',
  'click aquí', 'haz click', 'compra ya',
];

// ── Levenshtein distance (normalizada 0-1) ────────────────────────────
function _levenshteinNorm(a, b) {
  if (!a.length || !b.length) return 1;
  const maxLen = Math.max(a.length, b.length);
  const matrix = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) { matrix[i][j] = j; continue; }
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
      );
    }
  }
  return 1 - (matrix[a.length][b.length] / maxLen);
}

// ── Strip spintax para análisis del texto base ────────────────────────
function _stripSpintax(tpl) {
  return tpl.replace(/\[([^\]]+)\]/g, (_, inner) => inner.split('|')[0]).trim();
}

// ── Count emoji en un texto ───────────────────────────────────────────
function _countEmojis(text) {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu;
  const matches = text.match(emojiRegex);
  return matches ? matches.length : 0;
}

// ── Count variantes spintax ───────────────────────────────────────────
function _minSpintaxOptions(tpl) {
  const matches = tpl.match(/\[([^\]]+)\]/g);
  if (!matches || !matches.length) return 0;
  return Math.min(...matches.map(m => m.slice(1, -1).split('|').length));
}

// ══════════════════════════════════════════════════════════════════════
// ANÁLISIS DE UNA PLANTILLA INDIVIDUAL
// ══════════════════════════════════════════════════════════════════════
function _analyzeOneTemplate(tpl) {
  const stripped = _stripSpintax(tpl);
  const signals = [];
  let score = 0;

  // URL/link detection
  if (/https?:\/\/|www\.|\.com\b|\.pe\b|bit\.ly|goo\.gl/i.test(stripped)) {
    score += 15;
    signals.push({ points: 15, signal: 'Contiene link', suggestion: 'Si es largo, considerá quitarlo' });
  }

  // Más de 5 emojis
  const emojiCount = _countEmojis(stripped);
  if (emojiCount > 5) {
    score += 5;
    signals.push({ points: 5, signal: `${emojiCount} emojis (>5)`, suggestion: 'Considerá reducir a 3-4 emojis' });
  }

  // Texto > 500 caracteres (sin separadores)
  const fullText = stripped.replace(/\n---\n/g, ' ');
  if (fullText.length > 500) {
    score += 5;
    signals.push({ points: 5, signal: `Texto largo (${fullText.length} chars)`, suggestion: 'Considerá hacerlo más conciso' });
  }

  // No tiene {{nombre}} en ninguna variante
  if (!/\{\{nombre\}\}/i.test(tpl)) {
    score += 10;
    signals.push({ points: 10, signal: 'Sin {{nombre}}', suggestion: 'Agregar {{nombre}} mejora personalización' });
  }

  // Pocas opciones en spintax (< 3 opciones por grupo)
  const minOpts = _minSpintaxOptions(tpl);
  const spintaxGroups = (tpl.match(/\[([^\]]+)\]/g) || []).length;
  if (spintaxGroups > 0 && minOpts < 3) {
    score += 5;
    signals.push({ points: 5, signal: `Spintax con pocas opciones`, suggestion: 'Idealmente 3+ opciones por grupo' });
  }

  // Palabras trigger de spam
  const lowerText = stripped.toLowerCase();
  const foundSpam = SPAM_WORDS.filter(w => lowerText.includes(w));
  if (foundSpam.length) {
    score += 10;
    signals.push({ points: 10, signal: `Spam: ${foundSpam.join(', ')}`, suggestion: 'Palabras comerciales que WA puede marcar' });
  }

  // Contiene número de teléfono (redirección)
  if (/\b\d{9,}\b/.test(stripped.replace(/\{\{[^}]+\}\}/g, ''))) {
    score += 5;
    signals.push({ points: 5, signal: 'Contiene número de teléfono', suggestion: 'Número de teléfono puede activar filtros' });
  }

  return { score, signals };
}

// ══════════════════════════════════════════════════════════════════════
// ANÁLISIS COMPLETO DE TODAS LAS PLANTILLAS
// ══════════════════════════════════════════════════════════════════════
export function analyzeTemplates(templates) {
  if (!templates || !templates.length) {
    return { score: 0, level: 'ok', signals: [], suggestions: [] };
  }

  // Analizar cada plantilla individual
  const analyses = templates.map(t => _analyzeOneTemplate(t));

  // Score máximo de las plantillas individuales
  let maxScore = Math.max(...analyses.map(a => a.score));

  // Señal global: similitud entre plantillas (si hay más de 1)
  const allSignals = analyses.flatMap(a => a.signals);
  if (templates.length > 1) {
    const stripped = templates.map(_stripSpintax);
    let maxSimilarity = 0;
    for (let i = 0; i < stripped.length; i++) {
      for (let j = i + 1; j < stripped.length; j++) {
        const sim = _levenshteinNorm(stripped[i], stripped[j]);
        maxSimilarity = Math.max(maxSimilarity, sim);
      }
    }
    if (maxSimilarity > 0.85) {
      maxScore += 5;
      allSignals.push({ points: 5, signal: `Plantillas similares (${Math.round(maxSimilarity * 100)}%)`, suggestion: 'Variá estructura o tono entre plantillas' });
    }
  }

  // Deduplicar sugerencias
  const seenSuggestions = new Set();
  const suggestions = [];
  for (const s of allSignals) {
    if (!seenSuggestions.has(s.suggestion)) {
      seenSuggestions.add(s.suggestion);
      suggestions.push(s);
    }
  }

  // Nivel de riesgo (UMBRALES PERMISIVOS)
  let level = 'ok';       // 0-60
  if (maxScore > 90) level = 'danger';  // 91+
  else if (maxScore > 60) level = 'warning'; // 61-90

  return {
    score: maxScore,
    level,
    signals: allSignals,
    suggestions,
    perTemplate: analyses,
  };
}
