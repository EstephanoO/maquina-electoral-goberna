// template-analyzer.js — Análisis de riesgo de plantillas pre-envío
// Evalúa cada plantilla y devuelve score + sugerencias para evitar ban.
// Consumido por sidebar.js para mostrar warnings antes de iniciar blast.

// ── Palabras trigger de spam ──────────────────────────────────────────
const SPAM_WORDS = [
  'oferta', 'descuento', 'gratis', 'promo', 'promoción', 'promocion',
  'sorteo', 'regalo', 'gana', 'ganar', 'premios', 'premio',
  'click aquí', 'haz click', 'compra ya', 'aprovecha',
  'último día', 'últimas horas', 'time limited', 'oferta limitada',
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
    score += 30;
    signals.push({ points: 30, signal: 'Tiene URL/link', suggestion: 'Eliminá el link — envialo después de que respondan' });
  }

  // Más de 3 emojis
  const emojiCount = _countEmojis(stripped);
  if (emojiCount > 3) {
    score += 10;
    signals.push({ points: 10, signal: `${emojiCount} emojis (>3)`, suggestion: 'Reducí los emojis a máximo 2-3' });
  }

  // Texto > 300 caracteres (sin separadores)
  const fullText = stripped.replace(/\n---\n/g, ' ');
  if (fullText.length > 300) {
    score += 10;
    signals.push({ points: 10, signal: `Texto largo (${fullText.length} chars)`, suggestion: 'Reducí a menos de 200 caracteres — la gente no lee msgs largos de desconocidos' });
  }

  // No tiene {{nombre}} en ninguna variante
  if (!/\{\{nombre\}\}/i.test(tpl)) {
    score += 20;
    signals.push({ points: 20, signal: 'Sin personalización {{nombre}}', suggestion: 'Agregá {{nombre}} al inicio del saludo — personalización = legitimidad' });
  }

  // Pocas opciones en spintax (< 3 opciones por grupo)
  const minOpts = _minSpintaxOptions(tpl);
  const spintaxGroups = (tpl.match(/\[([^\]]+)\]/g) || []).length;
  if (spintaxGroups > 0 && minOpts < 3) {
    score += 10;
    signals.push({ points: 10, signal: `Spintax con pocas opciones (mín ${minOpts})`, suggestion: 'Agregá más variantes — mínimo 3 opciones por cada [...]' });
  }

  // Palabras trigger de spam
  const lowerText = stripped.toLowerCase();
  const foundSpam = SPAM_WORDS.filter(w => lowerText.includes(w));
  if (foundSpam.length) {
    score += 25;
    signals.push({ points: 25, signal: `Palabras spam: ${foundSpam.join(', ')}`, suggestion: 'Evitá palabras comerciales — WA penaliza "oferta", "descuento", etc.' });
  }

  // Contiene número de teléfono (redirección)
  if (/\b\d{9,}\b/.test(stripped.replace(/\{\{[^}]+\}\}/g, ''))) {
    score += 15;
    signals.push({ points: 15, signal: 'Contiene número de teléfono', suggestion: 'Sacá el número — redirección en primer contacto = sospechoso' });
  }

  // No tiene '---' (un solo mensaje — menos natural)
  if (!tpl.includes('---')) {
    score += 5;
    signals.push({ points: 5, signal: 'Un solo mensaje (sin ---)', suggestion: 'Dividí en 2-3 mensajes con --- para parecer más natural' });
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
    if (maxSimilarity > 0.7) {
      maxScore += 15;
      allSignals.push({ points: 15, signal: `Plantillas muy similares (${Math.round(maxSimilarity * 100)}%)`, suggestion: 'Las plantillas deben ser más diferentes entre sí — variá estructura, largo y tono' });
    }
  }

  // Deduplicar sugerencias
  const seenSuggestions = new Set();
  const suggestions = [];
  for (const s of allSignals) {
    if (!seenSuggestions.has(s.suggestion)) {
      seenSuggestions.add(s.suggestion);
      suggestions.push(s.suggestion);
    }
  }

  // Nivel de riesgo
  let level = 'ok';       // 0-20
  if (maxScore > 40) level = 'danger';  // 41+
  else if (maxScore > 20) level = 'warning'; // 21-40

  return {
    score: maxScore,
    level,
    signals: allSignals,
    suggestions,
    perTemplate: analyses,
  };
}
