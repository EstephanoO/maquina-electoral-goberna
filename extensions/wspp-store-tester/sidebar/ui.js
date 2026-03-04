// sidebar/ui.js — Componentes de UI compartidos (nav, campaign bar, SSE bar)
// Depende de: constants.js, store.js, sse.js, utils.js
// Expone: WSPP.navBar, WSPP.wireNav, WSPP.campBar, WSPP.sseBar, WSPP.updateMsgBadge,
//         WSPP.renderBlocked
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  /** Genera el HTML del bar de estado SSE */
  WSPP.sseBar = function sseBar() {
    const labels = {
      off:  'Sin conexión en tiempo real',
      live: 'Tiempo real activo',
      err:  'Reconectando...',
    };
    return `<div class="w-sse-bar"><div class="w-sse-dot ${WSPP.sseStatus}"></div><span>${labels[WSPP.sseStatus]}</span></div>`;
  };

  /** Genera el HTML de la barra de navegación principal */
  WSPP.navBar = function navBar() {
    const { S } = WSPP;
    const v       = S.view;
    const pending = Object.keys(S.pendingMap).length;
    // Solo mensajes entrantes no vistos (los salientes propios no cuentan como unread)
    const unread  = S.messages.filter(m => !m.seen && !m.fromMe).length;
    const on = (views) => views.includes(v) ? 'on' : '';
    return `
      <div class="w-nav">
        <button class="w-nav-btn ${on(['leads','lead-detail'])}" data-nav="leads">Leads</button>
        <button class="w-nav-btn ${on(['messages'])}" data-nav="messages">
          Msgs${pending > 0
            ? `<span class="w-pending-indicator">${pending > 99 ? '99+' : pending}</span>`
            : (unread > 0 ? `<span class="w-badge">${unread > 99 ? '99+' : unread}</span>` : '')}
        </button>
        <button class="w-nav-btn ${on(['metrics'])}" data-nav="metrics">Métricas</button>
      </div>`;
  };

  /** Conecta los listeners de la barra de navegación */
  WSPP.wireNav = function wireNav() {
    const { S, render, loadStats, loadExtMetrics, loadBrigadistaMetrics } = WSPP;
    const panel = document.getElementById('wspp-crm-panel');
    if (!panel) return;
    panel.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nav = btn.dataset.nav;
        if (nav === 'metrics') {
          S.view = 'metrics'; render();
          await Promise.all([loadStats(), loadExtMetrics(), loadBrigadistaMetrics()]);
          if (S.view === 'metrics') render();
        } else if (nav === 'messages') {
          S.view = 'messages';
          S.messages.forEach(m => { m.seen = true; });
          render();
        } else {
          S.view = 'leads'; render();
        }
      });
    });
  };

  /** Genera el HTML del selector de campaña */
  WSPP.campBar = function campBar() {
    const { S, C, esc, CAMPAIGN_LOCK_NUMBERS, CAMPAIGN_LOCK_ID } = WSPP;
    if (!S.campaigns.length) return '';

    // Lock: si el número WA está en la lista, mostrar solo el nombre fijo
    const isLocked = S.waNumber && CAMPAIGN_LOCK_NUMBERS.has(S.waNumber);
    if (isLocked) {
      const lockedCamp = S.campaigns.find(c => c.id === CAMPAIGN_LOCK_ID) || S.campaigns.find(c => c.id === S.activeCampaignId);
      return `<div class="w-camp-bar">
        <span class="w-camp-label">Campaña</span>
        <span style="font-size:12px;color:${C.text};font-weight:600">${esc(lockedCamp?.name || 'César Vásquez')}</span>
        <span style="font-size:9px;color:${C.goldDim};margin-left:4px;font-weight:600">🔒</span>
      </div>`;
    }

    if (S.campaigns.length === 1) {
      return `<div class="w-camp-bar">
        <span class="w-camp-label">Campaña</span>
        <span style="font-size:12px;color:${C.text};font-weight:600">${esc(S.campaigns[0].name)}</span>
      </div>`;
    }
    return `<div class="w-camp-bar">
      <span class="w-camp-label">Campaña</span>
      <select class="w-select" id="w-camp">
        <option value="">— Seleccionar —</option>
        ${S.campaigns.map(c =>
          `<option value="${c.id}" ${c.id === S.activeCampaignId ? 'selected' : ''}>${esc(c.name)}</option>`
        ).join('')}
      </select>
    </div>`;
  };

  /**
   * Renderiza la pantalla de acceso bloqueado.
   * Se muestra cuando el número WA del operador no está en CAMPAIGN_LOCK_NUMBERS.
   * El operador puede hacer logout pero no puede operar.
   */
  WSPP.renderBlocked = function renderBlocked() {
    const { S, C, esc, fmtPhone, doLogout } = WSPP;
    const panel = document.getElementById('wspp-crm-panel');
    const num   = S.waNumber ? fmtPhone(S.waNumber) : '(desconocido)';
    panel.innerHTML = `
      <div class="w-hdr" style="flex-direction:column;align-items:flex-start;gap:3px">
        <div class="w-hdr-logo">GOBERNA</div>
        <div class="w-hdr-sub">Acceso restringido</div>
      </div>
      <div class="w-login" style="gap:16px">
        <div style="text-align:center;font-size:36px;opacity:.7">🔒</div>
        <div class="w-login-title" style="font-size:15px">Sin acceso</div>
        <div style="
          background:rgba(232,83,74,.1);border:1px solid rgba(232,83,74,.3);
          border-radius:10px;padding:14px 16px;font-size:12px;color:${C.textSub};
          text-align:center;line-height:1.6
        ">
          El número <strong style="color:${C.text};font-family:'SF Mono','Fira Code',monospace">${esc(num)}</strong>
          no está autorizado para operar en ninguna campaña.
          <br><br>
          Contactá al administrador para obtener acceso.
        </div>
        <button class="w-btn" id="w-blocked-logout"
          style="background:transparent;border:1px solid ${C.border};color:${C.textSub};font-weight:600">
          Cerrar sesión
        </button>
      </div>`;
    panel.querySelector('#w-blocked-logout').addEventListener('click', doLogout);
  };

  /** Actualiza el badge del botón de mensajes en la nav sin re-renderizar todo */
  WSPP.updateMsgBadge = function updateMsgBadge() {
    const { S } = WSPP;
    const panel = document.getElementById('wspp-crm-panel');
    if (!panel) return;
    const btn = panel.querySelector('.w-nav-btn[data-nav="messages"]');
    if (!btn) return;
    const pending = Object.keys(S.pendingMap).length;
    const unread  = S.messages.filter(m => !m.seen && !m.fromMe).length;
    btn.innerHTML = `Msgs${pending > 0
      ? `<span class="w-pending-indicator">${pending > 99 ? '99+' : pending}</span>`
      : (unread > 0 ? `<span class="w-badge">${unread > 99 ? '99+' : unread}</span>` : '')}`;
  };
})();
