// sidebar/views/login.js — Vista de login
// Depende de: constants.js, store.js, api.js, utils.js
// Expone: WSPP.renderLogin, WSPP.doLogin, WSPP.doLogout
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  /** Renderiza la pantalla de login */
  WSPP.renderLogin = function renderLogin() {
    const panel = document.getElementById('wspp-crm-panel');
    panel.innerHTML = `
      <div class="w-hdr" style="flex-direction:column;align-items:flex-start;gap:3px">
        <div class="w-hdr-logo">GOBERNA</div>
        <div class="w-hdr-sub">CRM Territorial</div>
      </div>
      <div class="w-login">
        <div class="w-login-logo">◆ GOBERNA</div>
        <div class="w-login-title">Iniciar sesión</div>
        <div class="w-login-sub">Accede con tu cuenta Goberna</div>
        <input class="w-inp" id="w-email" type="email" placeholder="email@goberna.pe" autocomplete="username" />
        <input class="w-inp" id="w-pass"  type="password" placeholder="Contraseña" autocomplete="current-password" />
        <div class="w-err" id="w-err"></div>
        <button class="w-btn" id="w-login-btn">Entrar</button>
      </div>`;
    panel.querySelector('#w-login-btn').addEventListener('click', WSPP.doLogin);
    panel.querySelector('#w-pass').addEventListener('keydown', e => { if (e.key === 'Enter') WSPP.doLogin(); });
    panel.querySelector('#w-email').addEventListener('keydown', e => { if (e.key === 'Enter') panel.querySelector('#w-pass').focus(); });
  };

  /** Obtiene el número WA real en este momento vía scan (igual que en el init) */
  async function getLiveWaNumber() {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 3000);
      chrome.runtime.sendMessage({ action: 'scan' }, result => {
        clearTimeout(timer);
        if (chrome.runtime.lastError || !result) return resolve(null);
        const wid    = result.me?.wid || '';
        const digits = String(wid).replace(/[^0-9]/g, '');
        resolve(digits.length >= 9 ? digits : null);
      });
    });
  }

  /** Maneja el submit del formulario de login */
  WSPP.doLogin = async function doLogin() {
    const { S, storage, apiFetch, loadLeads, loadTags, loadStats, loadExtMetrics, startSSE, render, showErr,
            CAMPAIGN_LOCK_NUMBERS, CAMPAIGN_LOCK_ID } = WSPP;
    const panel = document.getElementById('wspp-crm-panel');
    const email = panel.querySelector('#w-email').value.trim();
    const pass  = panel.querySelector('#w-pass').value;
    const btn   = panel.querySelector('#w-login-btn');
    const err   = panel.querySelector('#w-err');
    if (!email || !pass) { showErr(err, 'Completa email y contraseña'); return; }
    btn.disabled = true; btn.textContent = 'Verificando...'; err.style.display = 'none';

    // Obtener número real de WA antes de autenticar contra el servidor
    // No confiar en S.waNumber (puede ser null o de sesión anterior)
    const liveNumber = await getLiveWaNumber();
    if (liveNumber) {
      S.waNumber = liveNumber;
      storage.set({ wspp_wa_number: liveNumber });
    }

    // Verificar autorización antes de siquiera intentar el login
    // Si no hay número aún (WA cargando lento) dejar pasar — WSPP_ME bloqueará después
    if (S.waNumber && !CAMPAIGN_LOCK_NUMBERS.has(S.waNumber)) {
      S.view = 'blocked';
      render();
      return;
    }

    btn.textContent = 'Entrando...';
    try {
      const res  = await apiFetch('/api/auth/login', { method: 'POST', body: { identifier: email, password: pass } });
      S.token     = res.access_token;
      S.user      = res.user;
      S.campaigns = res.campaigns || [];
      storage.set({ wspp_token: S.token, wspp_user: JSON.stringify(S.user), wspp_campaigns: JSON.stringify(S.campaigns) });

      // Doble check post-login (por si WSPP_ME llegó mientras esperábamos respuesta)
      if (S.waNumber && !CAMPAIGN_LOCK_NUMBERS.has(S.waNumber)) {
        S.view = 'blocked';
        render();
        return;
      }

      S.activeCampaignId = CAMPAIGN_LOCK_ID;
      storage.set({ wspp_active_campaign: CAMPAIGN_LOCK_ID });
      S.view = 'leads';

      await Promise.all([loadLeads(), loadTags(), loadStats(), loadExtMetrics()]);
      startSSE();
      render();
    } catch (e) {
      showErr(err, e.message);
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  };

  /** Cierra la sesión y limpia todo el estado */
  WSPP.doLogout = function doLogout() {
    const { S, storage, composerWatchers, render } = WSPP;
    S.token = null; S.user = null; S.campaigns = []; S.activeCampaignId = null;
    S.leads = []; S.stats = null; S.extMetrics = null; S.brigadistaMetrics = [];
    S.messages = []; S.pendingMap = {}; S.wasSent = 0; S.waNumber = null;
    WSPP.sseStatus = 'off';
    // Cancelar SSE (fetch+AbortController, ya no EventSource)
    if (S.sseAbort) { try { S.sseAbort.abort(); } catch (_) {} S.sseAbort = null; }
    S.sseSource = null;
    composerWatchers.forEach(fn => { fn(); });
    composerWatchers.clear();
    storage.del(['wspp_token', 'wspp_user', 'wspp_campaigns', 'wspp_wa_number', 'wspp_active_campaign']);
    S.view = 'login'; render();
  };
})();
