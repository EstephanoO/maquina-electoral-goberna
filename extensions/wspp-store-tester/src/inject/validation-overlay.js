// validation-overlay.js — overlay de validación y spam warning en el chat activo.

import { WA_ORIGIN } from './bootstrap.js';

let _currentOverlay = null;
let _spamOverlay = null;

// ── Spam warning overlay ──────────────────────────────────────────
export function showSpamWarning(data) {
  if (!data || !data.warnings || data.warnings.length === 0) return;
  removeSpamWarning();

  const overlay = document.createElement('div');
  overlay.id = 'wspp-spam-warning';
  const isCritical = data.risk_level === 'critical';
  const isHigh = data.risk_level === 'high';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '99999',
    background: isCritical ? '#dc2626' : isHigh ? '#ea580c' : '#ca8a04',
    color: '#fff',
    padding: '12px 20px',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,.3)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    maxWidth: '500px',
    cursor: 'pointer',
    transition: 'opacity .3s',
  });

  const title = document.createElement('div');
  title.style.fontWeight = '800';
  title.style.marginBottom = '4px';
  title.style.fontSize = '14px';
  title.textContent = isCritical
    ? 'RIESGO CRITICO DE BLOQUEO'
    : isHigh ? 'RIESGO ALTO — Reducir velocidad' : 'Advertencia de spam';
  overlay.appendChild(title);

  for (const w of data.warnings.slice(0, 3)) {
    const line = document.createElement('div');
    line.style.fontSize = '12px';
    line.style.opacity = '0.9';
    line.textContent = w;
    overlay.appendChild(line);
  }

  const score = document.createElement('div');
  score.style.fontSize = '10px';
  score.style.opacity = '0.7';
  score.style.marginTop = '4px';
  score.textContent = `Score: ${data.risk_score}/100 | ${data.message_count} msgs recientes`;
  overlay.appendChild(score);

  overlay.addEventListener('click', () => removeSpamWarning());
  document.body.appendChild(overlay);
  _spamOverlay = overlay;

  // Auto-dismiss: 30s for critical, 15s for high, 8s for medium
  const dismissMs = isCritical ? 30000 : isHigh ? 15000 : 8000;
  setTimeout(() => removeSpamWarning(), dismissMs);
}

export function removeSpamWarning() {
  if (_spamOverlay) { _spamOverlay.remove(); _spamOverlay = null; }
  const existing = document.getElementById('wspp-spam-warning');
  if (existing) existing.remove();
}

/**
 * Muestra un badge/overlay de validación sobre el header del chat activo.
 */
export function showValidationOverlay(data) {
  removeValidationOverlay();

  if (!data || !data.id) return;

  const statusColors = {
    pendiente:  { bg: '#f1f5f9', text: '#64748b', label: 'PENDIENTE' },
    contactado: { bg: '#dbeafe', text: '#2563eb', label: 'CONTACTADO' },
    respondido: { bg: '#e0f2fe', text: '#0891b2', label: 'RESPONDIDO' },
    invalido:   { bg: '#fee2e2', text: '#dc2626', label: 'IMPOSIBLE' },
  };

  const voteColors = {
    duro:     { bg: '#dcfce7', text: '#15803d', label: 'VOTO DURO' },
    blando:   { bg: '#fef9c3', text: '#ca8a04', label: 'VOTO BLANDO' },
    flotante: { bg: '#ede9fe', text: '#7c3aed', label: 'FLOTANTE' },
  };

  const st = statusColors[data.status] || statusColors.pendiente;
  const vc = data.vote_class ? voteColors[data.vote_class] : null;
  const displayStatus = vc || st;

  const overlay = document.createElement('div');
  overlay.id = 'wspp-validation-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '72px',
    right: '24px',
    zIndex: '99998',
    background: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,.15)',
    border: '1px solid #e2e8f0',
    padding: '12px 16px',
    minWidth: '220px',
    maxWidth: '300px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '12px',
    transition: 'opacity .2s, transform .2s',
    opacity: '0',
    transform: 'translateY(-8px)',
    cursor: 'pointer',
  });

  // M-1 FIX: Use DOM builder instead of innerHTML to prevent XSS from unsanitized backend data.
  function el(tag, styles, children) {
    const node = document.createElement(tag);
    if (styles) Object.assign(node.style, styles);
    if (typeof children === 'string') node.textContent = children;
    else if (Array.isArray(children)) children.forEach(c => { if (c) node.appendChild(c); });
    return node;
  }

  // Header row: status badge + zona
  const headerRow = el('div', { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }, [
    el('div', { background: displayStatus.bg, color: displayStatus.text, padding: '2px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '10px', letterSpacing: '.5px' }, displayStatus.label),
    el('span', { color: '#94a3b8', fontSize: '10px' }, data.zona || ''),
  ]);
  overlay.appendChild(headerRow);

  // Name
  overlay.appendChild(el('div', { fontWeight: '600', color: '#1e293b', fontSize: '13px', marginBottom: '2px' }, data.nombre || 'Sin nombre'));

  // Phone + encuestador
  const infoText = (data.telefono || '') + (data.encuestador ? ' | Enc: ' + data.encuestador : '');
  overlay.appendChild(el('div', { color: '#64748b', fontSize: '11px', marginBottom: '4px' }, infoText));

  // Claimed by
  if (data.claimed_by_name) {
    overlay.appendChild(el('div', { color: '#94a3b8', fontSize: '10px' }, 'Reclamado: ' + data.claimed_by_name));
  }

  // Classify panel
  const classifyPanel = el('div', { display: 'none', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' });
  classifyPanel.id = 'wspp-classify-panel';
  classifyPanel.appendChild(el('div', { fontSize: '10px', color: '#64748b', fontWeight: '600', marginBottom: '6px' }, 'CLASIFICAR:'));

  const btnContainer = el('div', { display: 'flex', flexWrap: 'wrap', gap: '4px' });
  const btnConfigs = [
    { vote: 'duro', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0', label: 'Voto Duro' },
    { vote: 'blando', bg: '#fef9c3', color: '#ca8a04', border: '#fde68a', label: 'Voto Blando' },
    { vote: 'flotante', bg: '#ede9fe', color: '#7c3aed', border: '#ddd6fe', label: 'Flotante' },
    { vote: 'invalido', bg: '#fee2e2', color: '#dc2626', border: '#fecaca', label: 'Imposible' },
  ];
  for (const cfg of btnConfigs) {
    const btn = el('button', { background: cfg.bg, color: cfg.color, border: '1px solid ' + cfg.border, borderRadius: '6px', padding: '4px 10px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }, cfg.label);
    btn.className = 'wspp-classify-btn';
    btn.setAttribute('data-vote', cfg.vote);
    btnContainer.appendChild(btn);
  }
  classifyPanel.appendChild(btnContainer);
  overlay.appendChild(classifyPanel);

  // Toast
  const toast = el('div', { display: 'none', marginTop: '6px', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600', textAlign: 'center' });
  toast.id = 'wspp-overlay-toast';
  overlay.appendChild(toast);

  // Toggle classify panel on click
  overlay.addEventListener('click', (e) => {
    const panel = overlay.querySelector('#wspp-classify-panel');
    if (panel && !e.target.closest('.wspp-classify-btn')) {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  });

  // Classify button handlers
  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest('.wspp-classify-btn');
    if (!btn) return;
    e.stopPropagation();
    const vote = btn.getAttribute('data-vote');
    // H-3: Use specific origin instead of '*'
    // BUG FIX v7.1.0: include _phone and original_category for adaptive scoring
    window.postMessage({
      type: 'WSPP_CLASSIFY',
      payload: {
        validation_id: data.id,
        vote_class: vote === 'invalido' ? '' : vote,
        status: vote === 'invalido' ? 'invalido' : 'respondido',
        _phone: data.telefono || null,
        original_category: data.vote_class || null,
      },
    }, WA_ORIGIN);
    // Disable buttons while processing
    overlay.querySelectorAll('.wspp-classify-btn').forEach(b => {
      b.style.opacity = '0.5';
      b.style.pointerEvents = 'none';
    });
  });

  document.body.appendChild(overlay);
  _currentOverlay = overlay;

  // Animate in
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.style.transform = 'translateY(0)';
  });
}

export function removeValidationOverlay() {
  if (_currentOverlay) {
    _currentOverlay.remove();
    _currentOverlay = null;
  }
  const existing = document.getElementById('wspp-validation-overlay');
  if (existing) existing.remove();
}

export function updateOverlayStatus(data) {
  const overlay = document.getElementById('wspp-validation-overlay');
  if (!overlay || !data) return;
  // Re-render with new data
  showValidationOverlay(data);
}

export function showOverlayToast(message, type) {
  const toast = document.getElementById('wspp-overlay-toast');
  if (!toast) return;
  toast.style.display = 'block';
  toast.style.background = type === 'success' ? '#dcfce7' : '#fee2e2';
  toast.style.color = type === 'success' ? '#15803d' : '#dc2626';
  toast.textContent = message;
  // Re-enable buttons
  const overlay = document.getElementById('wspp-validation-overlay');
  if (overlay) {
    overlay.querySelectorAll('.wspp-classify-btn').forEach(b => {
      b.style.opacity = '1';
      b.style.pointerEvents = 'auto';
    });
  }
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ── Message listener for overlay events (WSPP_VALIDATION_DATA, etc.) ──────
window.addEventListener('message', (e) => {
  if (e.source !== window) return;

  // Datos de validación para el chat activo
  if (e.data?.type === 'WSPP_VALIDATION_DATA') {
    const data = e.data.payload;
    showValidationOverlay(data);
    return;
  }

  // Limpiar overlay cuando no hay match
  if (e.data?.type === 'WSPP_VALIDATION_CLEAR') {
    removeValidationOverlay();
    return;
  }

  // Confirmación de clasificación exitosa
  if (e.data?.type === 'WSPP_CLASSIFY_RESULT') {
    if (e.data.ok) {
      updateOverlayStatus(e.data.payload);
      showOverlayToast('Clasificado correctamente', 'success');
    } else {
      showOverlayToast(e.data.error || 'Error al clasificar', 'error');
    }
    return;
  }

  // Spam/repetition warning from background
  if (e.data?.type === 'WSPP_SPAM_WARNING') {
    showSpamWarning(e.data.payload);
    return;
  }
});
