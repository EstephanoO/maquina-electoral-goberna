// validation-overlay.js — overlay de validación, spam warning y cooldown en WA Web.
//
// v2 changes:
//   - Spam warning: ahora incluye countdown visual de cooldown
//   - Spam warning: tiene "Actions" (qué hacer) separado de las advertencias
//   - Critical: bloquea la UI del chat con un overlay semitransparente
//   - Cooldown: barra de progreso que muestra cuándo es seguro reanudar
//   - Source tag: indica si la alerta viene del análisis local o del servidor
//   - Dismiss solo disponible después del cooldown mínimo (no se puede cerrar
//     una alerta crítica en los primeros 30s)

import { WA_ORIGIN } from './bootstrap.js';

let _currentOverlay = null;
let _spamOverlay    = null;
let _spamBlocker    = null;   // semitransparent blocker for critical
let _cooldownTimer  = null;
let _cooldownRemain = 0;

// ── Spam warning overlay ───────────────────────────────────────────────
export function showSpamWarning(data) {
  if (!data || !data.warnings || data.warnings.length === 0) return;
  removeSpamWarning();

  const isCritical = data.risk_level === 'critical';
  const isHigh     = data.risk_level === 'high';
  const isMedium   = data.risk_level === 'medium';

  const bgColor =
    isCritical ? '#7f1d1d' :
    isHigh     ? '#78350f' :
                 '#713f12';

  const borderColor =
    isCritical ? '#dc2626' :
    isHigh     ? '#ea580c' :
                 '#ca8a04';

  const accentColor =
    isCritical ? '#fca5a5' :
    isHigh     ? '#fed7aa' :
                 '#fde68a';

  const cooldownSec = data.cooldown_sec || (isCritical ? 180 : isHigh ? 90 : 30);
  const actions     = data.actions || [];
  const isServer    = data.source === 'server';

  // ── Blocker overlay for critical ──────────────────────────────────
  if (isCritical) {
    _spamBlocker = document.createElement('div');
    _spamBlocker.id = 'wspp-spam-blocker';
    Object.assign(_spamBlocker.style, {
      position:        'fixed',
      inset:           '0',
      zIndex:          '2147483640',  // spamBlocker — below everything
      background:      'rgba(127,29,29,.25)',
      backdropFilter:  'blur(1px)',
      pointerEvents:   'none', // doesn't block clicks — just visual warning
    });
    document.body.appendChild(_spamBlocker);
    setTimeout(() => {
      if (_spamBlocker) { _spamBlocker.remove(); _spamBlocker = null; }
    }, cooldownSec * 1000);
  }

  // ── Main alert card ────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'wspp-spam-warning';
  Object.assign(overlay.style, {
    position:    'fixed',
    top:         '16px',
    left:        '50%',
    transform:   'translateX(-50%)',
    zIndex:      '2147483641',  // spamWarning — above blocker, below sidebar
    background:  bgColor,
    border:      `1px solid ${borderColor}`,
    color:       '#fff',
    padding:     '14px 18px',
    borderRadius:'14px',
    boxShadow:   '0 8px 32px rgba(0,0,0,.5)',
    fontFamily:  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize:    '12px',
    maxWidth:    '480px',
    minWidth:    '300px',
    userSelect:  'none',
    transition:  'opacity .3s, transform .3s',
  });

  // ── Header row ────────────────────────────────────────────────────
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px',
  });

  const icon = document.createElement('div');
  icon.style.cssText = `font-size:22px;line-height:1;flex-shrink:0;`;
  icon.textContent = isCritical ? '🚨' : isHigh ? '⚠️' : '📢';
  header.appendChild(icon);

  const titleWrap = document.createElement('div');
  titleWrap.style.flex = '1';

  const title = document.createElement('div');
  title.style.cssText = `font-weight:800;font-size:14px;letter-spacing:-.3px;`;
  title.textContent =
    isCritical ? 'RIESGO CRÍTICO DE BLOQUEO' :
    isHigh     ? 'RIESGO ALTO — Reducir velocidad' :
                 'Advertencia de spam';
  titleWrap.appendChild(title);

  const meta = document.createElement('div');
  meta.style.cssText = `font-size:10px;opacity:.6;margin-top:2px;`;
  meta.textContent   = `Score ${data.risk_score}/100 · ${data.message_count} msgs · ${isServer ? 'Análisis servidor' : 'Análisis local'}`;
  titleWrap.appendChild(meta);
  header.appendChild(titleWrap);

  // Close button (only after cooldown or for non-critical)
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = `background:none;border:none;color:rgba(255,255,255,.4);font-size:16px;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0;`;
  closeBtn.textContent = '✕';
  if (isCritical) {
    closeBtn.style.opacity = '0.2';
    closeBtn.style.pointerEvents = 'none';
    // Enable after 30s minimum (don't let user dismiss critical immediately)
    setTimeout(() => {
      closeBtn.style.opacity = '0.6';
      closeBtn.style.pointerEvents = 'auto';
    }, 30_000);
  }
  closeBtn.addEventListener('click', removeSpamWarning);
  header.appendChild(closeBtn);

  overlay.appendChild(header);

  // ── Warnings ──────────────────────────────────────────────────────
  for (const w of data.warnings.slice(0, 4)) {
    const line = document.createElement('div');
    line.style.cssText = `
      display:flex;gap:6px;align-items:flex-start;
      padding:5px 8px;margin-bottom:4px;
      background:rgba(255,255,255,.06);border-radius:7px;
      font-size:12px;line-height:1.4;
    `;
    const dot = document.createElement('span');
    dot.style.cssText = `color:${accentColor};margin-top:1px;flex-shrink:0;font-size:11px;`;
    dot.textContent = '●';
    const txt = document.createElement('span');
    txt.style.opacity = '0.85';
    txt.textContent = w;
    line.appendChild(dot);
    line.appendChild(txt);
    overlay.appendChild(line);
  }

  // ── Actions (what to DO) ──────────────────────────────────────────
  if (actions.length > 0) {
    const actHeader = document.createElement('div');
    actHeader.style.cssText = `font-size:10px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:.5px;margin:8px 0 4px;`;
    actHeader.textContent = 'QUÉ HACER:';
    overlay.appendChild(actHeader);

    for (const a of actions.slice(0, 3)) {
      const line = document.createElement('div');
      line.style.cssText = `
        display:flex;gap:6px;align-items:flex-start;
        padding:4px 8px;margin-bottom:3px;
        background:rgba(255,255,255,.04);border-radius:6px;
        font-size:11px;line-height:1.4;color:rgba(255,255,255,.8);
      `;
      line.innerHTML = `<span style="color:${accentColor};flex-shrink:0;">→</span> ${a}`;
      overlay.appendChild(line);
    }
  }

  // ── Cooldown bar ──────────────────────────────────────────────────
  if (cooldownSec > 0) {
    const barWrap = document.createElement('div');
    barWrap.style.cssText = `margin-top:10px;`;

    const barLabel = document.createElement('div');
    barLabel.style.cssText = `display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,.5);margin-bottom:4px;`;

    const barText = document.createElement('span');
    barText.id = 'wspp-spam-cooldown-label';
    barText.textContent = `Cooldown recomendado: ${cooldownSec}s`;
    const barPct = document.createElement('span');
    barPct.id = 'wspp-spam-cooldown-pct';
    barPct.textContent = '100%';
    barLabel.appendChild(barText);
    barLabel.appendChild(barPct);
    barWrap.appendChild(barLabel);

    const barTrack = document.createElement('div');
    barTrack.style.cssText = `background:rgba(255,255,255,.1);border-radius:4px;height:5px;overflow:hidden;`;

    const barFill = document.createElement('div');
    barFill.id = 'wspp-spam-cooldown-bar';
    barFill.style.cssText = `background:${borderColor};width:100%;height:100%;border-radius:4px;transition:width .5s linear;`;
    barTrack.appendChild(barFill);
    barWrap.appendChild(barTrack);

    overlay.appendChild(barWrap);

    // Animate countdown
    _cooldownRemain = cooldownSec;
    clearInterval(_cooldownTimer);
    _cooldownTimer = setInterval(() => {
      _cooldownRemain = Math.max(0, _cooldownRemain - 1);
      const pct = Math.round((_cooldownRemain / cooldownSec) * 100);

      const fillEl  = document.getElementById('wspp-spam-cooldown-bar');
      const labelEl = document.getElementById('wspp-spam-cooldown-label');
      const pctEl   = document.getElementById('wspp-spam-cooldown-pct');

      if (fillEl)  fillEl.style.width  = pct + '%';
      if (pctEl)   pctEl.textContent   = pct + '%';
      if (labelEl) labelEl.textContent = _cooldownRemain > 0
        ? `Cooldown: ${_cooldownRemain}s restantes`
        : '✅ Listo para reanudar';

      if (_cooldownRemain <= 0) {
        clearInterval(_cooldownTimer);
        // For non-critical, auto-dismiss after cooldown
        if (!isCritical) setTimeout(removeSpamWarning, 2000);
      }
    }, 1000);
  }

  document.body.appendChild(overlay);
  _spamOverlay = overlay;

  // Auto-dismiss: critical = never (user must close), high = 2x cooldown, medium = 1x
  if (!isCritical) {
    const autoDismiss = (cooldownSec + (isHigh ? cooldownSec : 0)) * 1000;
    setTimeout(() => removeSpamWarning(), autoDismiss);
  }
}

export function removeSpamWarning() {
  clearInterval(_cooldownTimer);
  _cooldownRemain = 0;
  if (_spamOverlay) { _spamOverlay.remove(); _spamOverlay = null; }
  if (_spamBlocker) { _spamBlocker.remove(); _spamBlocker = null; }
  const existing = document.getElementById('wspp-spam-warning');
  if (existing) existing.remove();
  const blocker = document.getElementById('wspp-spam-blocker');
  if (blocker) blocker.remove();
}

// ── Validation overlay ─────────────────────────────────────────────────
export function showValidationOverlay(data) {
  removeValidationOverlay();

  if (!data || !data.id) return;

  const statusColors = {
    pendiente:  { bg: 'rgba(255,149,0,.12)', text: '#ff9f0a', label: 'PENDIENTE' },
    contactado: { bg: 'rgba(96,165,250,.12)', text: '#60a5fa', label: 'CONTACTADO' },
    respondido: { bg: 'rgba(167,139,250,.12)', text: '#a78bfa', label: 'RESPONDIDO' },
    invalido:   { bg: 'rgba(239,83,80,.12)', text: '#ef5350', label: 'IMPOSIBLE' },
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
    position:    'fixed',
    top:         '72px',
    // Push right when sidebar is open (360px + gap)
    right:       document.getElementById('wspp-sidebar') ? '384px' : '24px',
    zIndex:      '2147483643',  // validationOverlay — above WA, below sidebar
    background:  '#0f1923',
    borderRadius:'12px',
    boxShadow:   '0 4px 24px rgba(0,0,0,.5)',
    border:      '1px solid rgba(255,255,255,.08)',
    padding:     '12px 16px',
    minWidth:    '220px',
    maxWidth:    '300px',
    fontFamily:  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize:    '12px',
    transition:  'opacity .2s, transform .2s',
    opacity:     '0',
    transform:   'translateY(-8px)',
    cursor:      'pointer',
  });

  function el(tag, styles, children) {
    const node = document.createElement(tag);
    if (styles) Object.assign(node.style, styles);
    if (typeof children === 'string') node.textContent = children;
    else if (Array.isArray(children)) children.forEach(c => { if (c) node.appendChild(c); });
    return node;
  }

  const headerRow = el('div', { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }, [
    el('div', { background: displayStatus.bg, color: displayStatus.text, padding: '2px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '10px', letterSpacing: '.5px' }, displayStatus.label),
    el('span', { color: 'rgba(255,255,255,.4)', fontSize: '10px' }, data.zona || ''),
  ]);
  overlay.appendChild(headerRow);

  overlay.appendChild(el('div', { fontWeight: '600', color: '#e9edef', fontSize: '13px', marginBottom: '2px' }, data.nombre || 'Sin nombre'));

  const infoText = (data.telefono || '') + (data.encuestador ? ' | Enc: ' + data.encuestador : '');
  overlay.appendChild(el('div', { color: 'rgba(255,255,255,.55)', fontSize: '11px', marginBottom: '4px' }, infoText));

  if (data.claimed_by_name) {
    overlay.appendChild(el('div', { color: 'rgba(255,255,255,.4)', fontSize: '10px' }, 'Reclamado: ' + data.claimed_by_name));
  }

  const classifyPanel = el('div', { display: 'none', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' });
  classifyPanel.id = 'wspp-classify-panel';
  classifyPanel.appendChild(el('div', { fontSize: '10px', color: 'rgba(255,255,255,.55)', fontWeight: '600', marginBottom: '6px' }, 'CLASIFICAR:'));

  const btnContainer = el('div', { display: 'flex', flexWrap: 'wrap', gap: '4px' });
  const btnConfigs = [
    { vote: 'duro',     bg: 'rgba(52,199,89,.12)', color: '#34c759', border: 'rgba(52,199,89,.3)', label: 'Voto Duro' },
    { vote: 'blando',   bg: 'rgba(253,230,138,.12)', color: '#fde68a', border: 'rgba(253,230,138,.3)', label: 'Voto Blando' },
    { vote: 'flotante', bg: 'rgba(167,139,250,.12)', color: '#a78bfa', border: 'rgba(167,139,250,.3)', label: 'Flotante' },
    { vote: 'invalido', bg: 'rgba(239,83,80,.12)', color: '#ef5350', border: 'rgba(239,83,80,.3)', label: 'Imposible' },
  ];
  for (const cfg of btnConfigs) {
    const btn = el('button', { background: cfg.bg, color: cfg.color, border: '1px solid ' + cfg.border, borderRadius: '6px', padding: '4px 10px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }, cfg.label);
    btn.className = 'wspp-classify-btn';
    btn.setAttribute('data-vote', cfg.vote);
    btnContainer.appendChild(btn);
  }
  classifyPanel.appendChild(btnContainer);
  overlay.appendChild(classifyPanel);

  const toast = el('div', { display: 'none', marginTop: '6px', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600', textAlign: 'center' });
  toast.id = 'wspp-overlay-toast';
  overlay.appendChild(toast);

  overlay.addEventListener('click', (e) => {
    const panel = overlay.querySelector('#wspp-classify-panel');
    if (panel && !e.target.closest('.wspp-classify-btn')) {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  });

  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest('.wspp-classify-btn');
    if (!btn) return;
    e.stopPropagation();
    const vote = btn.getAttribute('data-vote');
    window.postMessage({
      type: 'WSPP_CLASSIFY',
      payload: {
        validation_id:     data.id,
        vote_class:        vote === 'invalido' ? '' : vote,
        status:            vote === 'invalido' ? 'invalido' : 'respondido',
        _phone:            data.telefono || null,
        original_category: data.vote_class || null,
      },
    }, WA_ORIGIN);
    overlay.querySelectorAll('.wspp-classify-btn').forEach(b => {
      b.style.opacity = '0.5';
      b.style.pointerEvents = 'none';
    });
  });

  document.body.appendChild(overlay);
  _currentOverlay = overlay;

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.style.transform = 'translateY(0)';
  });
}

export function removeValidationOverlay() {
  if (_currentOverlay) { _currentOverlay.remove(); _currentOverlay = null; }
  const existing = document.getElementById('wspp-validation-overlay');
  if (existing) existing.remove();
}

export function updateOverlayStatus(data) {
  const overlay = document.getElementById('wspp-validation-overlay');
  if (!overlay || !data) return;
  showValidationOverlay(data);
}

export function showOverlayToast(message, type) {
  const toast = document.getElementById('wspp-overlay-toast');
  if (!toast) return;
  toast.style.display    = 'block';
  toast.style.background = type === 'success' ? 'rgba(52,199,89,.15)' : 'rgba(239,83,80,.15)';
  toast.style.color      = type === 'success' ? '#15803d' : '#dc2626';
  toast.textContent      = message;
  const overlay = document.getElementById('wspp-validation-overlay');
  if (overlay) {
    overlay.querySelectorAll('.wspp-classify-btn').forEach(b => {
      b.style.opacity      = '1';
      b.style.pointerEvents = 'auto';
    });
  }
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ── Message listener ───────────────────────────────────────────────────
window.addEventListener('message', (e) => {
  if (e.source !== window) return;

  if (e.data?.type === 'WSPP_VALIDATION_DATA') {
    showValidationOverlay(e.data.payload);
    return;
  }
  if (e.data?.type === 'WSPP_VALIDATION_CLEAR') {
    removeValidationOverlay();
    return;
  }
  if (e.data?.type === 'WSPP_CLASSIFY_RESULT') {
    if (e.data.ok) {
      updateOverlayStatus(e.data.payload);
      showOverlayToast('Clasificado correctamente', 'success');
    } else {
      showOverlayToast(e.data.error || 'Error al clasificar', 'error');
    }
    return;
  }
  if (e.data?.type === 'WSPP_SPAM_WARNING') {
    showSpamWarning(e.data.payload);
    return;
  }
});
