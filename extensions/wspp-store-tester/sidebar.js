// sidebar.js — ISOLATED world, panel lateral CRM en WhatsApp Web
(function () {
  'use strict';

  console.log('[WSPP CRM] sidebar.js iniciando...');

  // ── Storage helpers ──────────────────────────────────────────────
  function storageGet(keys) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(keys, resolve);
      } else resolve({});
    });
  }
  function storageSet(obj) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) chrome.storage.local.set(obj);
  }
  function storageRemove(keys) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) chrome.storage.local.remove(keys);
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    if (document.getElementById('wspp-crm-panel')) return;

    const API_BASE    = 'https://api.goberna.us';
    const PANEL_WIDTH = 380;

    // ── Estado ──────────────────────────────────────────────────────
    const S = {
      token:            null,
      user:             null,
      campaigns:        [],
      activeCampaignId: null,
      leads:            [],
      totalLeads:       0,
      page:             0,
      status:           'nuevo',
      search:           '',
      tagFilter:        '',
      availableTags:    [],
      loading:          false,
      view:             'login',   // login | leads | lead-detail | metrics | messages
      activeLead:       null,
      stats:            null,
      messages:         [],        // mensajes entrantes recientes
      wasSent:          0,         // mensajes WA enviados esta sesión
      sseSource:        null,
    };

    // ── CSS ─────────────────────────────────────────────────────────
    const css = `
      #wspp-toggle {
        position:fixed; right:0; top:50%; transform:translateY(-50%);
        z-index:2147483647; width:26px; height:60px;
        background:#00a884; border:none; border-radius:8px 0 0 8px;
        color:#fff; font-size:14px; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        box-shadow:-2px 0 8px rgba(0,0,0,.4);
      }
      #wspp-toggle:hover { background:#008f72; }

      #wspp-crm-panel {
        position:fixed; right:0; top:0; height:100vh; width:${PANEL_WIDTH}px;
        z-index:2147483646; background:#111b21; color:#e9edef;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:13px; display:flex; flex-direction:column;
        border-left:1px solid #2a3942;
        box-shadow:-4px 0 20px rgba(0,0,0,.5);
        transition:transform .2s;
      }
      #wspp-crm-panel.wspp-hidden { transform:translateX(100%); }

      .wp-hdr {
        background:#1f2c34; padding:10px 14px;
        display:flex; align-items:center; gap:8px;
        border-bottom:1px solid #2a3942; flex-shrink:0;
      }
      .wp-hdr-title { font-weight:700; font-size:14px; flex:1; }
      .wp-chip {
        font-size:10px; color:#00a884; background:#0d2e24;
        padding:2px 8px; border-radius:99px;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80px;
      }

      /* Nav tabs */
      .wp-nav {
        background:#1a2530; display:flex; border-bottom:1px solid #2a3942;
        flex-shrink:0;
      }
      .wp-nav-btn {
        flex:1; padding:8px 4px; border:none; background:none;
        color:#8696a0; font-size:10px; font-weight:700; cursor:pointer;
        text-transform:uppercase; border-bottom:2px solid transparent;
        transition:all .15s;
      }
      .wp-nav-btn.on { color:#00a884; border-bottom-color:#00a884; }
      .wp-nav-btn .wp-badge {
        display:inline-block; background:#ef5350; color:#fff;
        border-radius:99px; font-size:9px; padding:1px 4px;
        margin-left:3px; vertical-align:middle;
      }

      /* Filtros */
      .wp-filters {
        background:#1f2c34; padding:8px 10px;
        display:flex; flex-direction:column; gap:5px;
        border-bottom:1px solid #2a3942; flex-shrink:0;
      }
      .wp-search {
        width:100%; padding:7px 10px; border-radius:8px;
        background:#2a3942; border:none; color:#e9edef; font-size:12px; outline:none;
        box-sizing:border-box;
      }
      .wp-search::placeholder { color:#8696a0; }
      .wp-tabs { display:flex; gap:3px; }
      .wp-tab {
        flex:1; padding:5px 2px; border-radius:6px; border:none;
        background:#2a3942; color:#8696a0; font-size:10px; font-weight:700;
        cursor:pointer; text-transform:uppercase;
      }
      .wp-tab.on { background:#00a884; color:#fff; }
      .wp-select {
        width:100%; padding:7px 10px; border-radius:8px;
        background:#2a3942; border:1px solid #3a4a52;
        color:#e9edef; font-size:12px; outline:none;
        box-sizing:border-box;
      }

      /* Tags filter */
      .wp-tag-bar { display:flex; gap:4px; flex-wrap:wrap; }
      .wp-tag-pill {
        padding:2px 8px; border-radius:99px; font-size:10px; font-weight:600;
        border:1px solid #3a4a52; background:#2a3942; color:#8696a0; cursor:pointer;
      }
      .wp-tag-pill.on { background:#00a884; color:#fff; border-color:#00a884; }

      /* Lista */
      .wp-list { flex:1; overflow-y:auto; }
      .wp-list::-webkit-scrollbar { width:3px; }
      .wp-list::-webkit-scrollbar-thumb { background:#2a3942; }

      .wp-lead {
        padding:9px 12px; border-bottom:1px solid #1f2c34;
        cursor:pointer; display:flex; align-items:flex-start; gap:10px;
      }
      .wp-lead:hover { background:#1a2830; }
      .wp-av {
        width:36px; height:36px; border-radius:50%; flex-shrink:0;
        background:#2a3942; display:flex; align-items:center;
        justify-content:center; font-weight:700; font-size:14px; color:#8696a0;
      }
      .wp-info { flex:1; min-width:0; }
      .wp-name {
        font-weight:600; font-size:13px;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      .wp-sub {
        font-size:11px; color:#8696a0; margin-top:1px;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      .wp-tags-row { display:flex; gap:3px; flex-wrap:wrap; margin-top:3px; }
      .wp-tag-sm {
        font-size:9px; padding:1px 5px; border-radius:99px;
        background:#0d2e24; color:#00a884; border:1px solid #1a4a36;
      }
      .wp-meta { display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0; }
      .wp-dot { width:8px; height:8px; border-radius:50%; }
      .wp-dot.nuevo { background:#8696a0; }
      .wp-dot.hablado { background:#ffa726; }
      .wp-dot.respondieron { background:#00a884; }
      .wp-dot.archivado { background:#ef5350; }
      .wp-wa {
        background:#00a884; border:none; border-radius:5px;
        color:#fff; font-size:10px; font-weight:700; padding:3px 7px; cursor:pointer;
      }
      .wp-wa:hover { background:#008f72; }

      .wp-empty {
        padding:40px 20px; text-align:center; color:#8696a0;
        display:flex; flex-direction:column; align-items:center; gap:10px;
      }
      .wp-empty-icon { font-size:36px; opacity:.4; }
      .wp-more {
        padding:10px; text-align:center; color:#00a884;
        font-size:12px; cursor:pointer;
      }
      .wp-more:hover { text-decoration:underline; }
      .wp-spin-wrap { display:flex; align-items:center; justify-content:center; padding:40px; }
      .wp-spin {
        width:26px; height:26px; border:3px solid #2a3942;
        border-top-color:#00a884; border-radius:50%;
        animation:wpspin .8s linear infinite;
      }
      @keyframes wpspin { to { transform:rotate(360deg); } }

      .wp-footer {
        background:#1f2c34; padding:4px 12px;
        font-size:10px; color:#8696a0; text-align:center;
        border-top:1px solid #2a3942; flex-shrink:0;
      }

      /* Login */
      .wp-login {
        flex:1; display:flex; flex-direction:column;
        padding:24px 16px; gap:12px; justify-content:center;
      }
      .wp-login-title { font-size:16px; font-weight:700; text-align:center; }
      .wp-login-sub   { font-size:12px; color:#8696a0; text-align:center; }
      .wp-inp {
        width:100%; padding:10px 12px; border-radius:8px;
        background:#1f2c34; border:1px solid #2a3942;
        color:#e9edef; font-size:13px; outline:none; box-sizing:border-box;
      }
      .wp-inp:focus { border-color:#00a884; }
      .wp-btn {
        width:100%; padding:11px; border-radius:8px; border:none;
        background:#00a884; color:#fff; font-size:13px; font-weight:700; cursor:pointer;
      }
      .wp-btn:hover { background:#008f72; }
      .wp-btn:disabled { opacity:.5; cursor:default; }
      .wp-err {
        background:#3b0d0d; color:#ef5350;
        padding:8px 10px; border-radius:6px; font-size:11px; display:none;
      }

      /* Detail */
      .wp-detail { flex:1; overflow-y:auto; padding:12px; }
      .wp-back {
        background:none; border:none; color:#00a884;
        cursor:pointer; font-size:18px; line-height:1; padding:0;
      }
      .wp-drow {
        display:flex; justify-content:space-between;
        padding:7px 0; border-bottom:1px solid #1f2c34; font-size:12px;
      }
      .wp-dlabel { color:#8696a0; }
      .wp-dval { font-weight:600; text-align:right; max-width:58%; word-break:break-all; }
      .wp-open-btn {
        width:100%; margin-top:12px; padding:11px; border-radius:10px;
        border:none; background:#00a884; color:#fff;
        font-size:14px; font-weight:700; cursor:pointer;
      }
      .wp-open-btn:hover { background:#008f72; }
      .wp-open-btn:disabled { opacity:.4; cursor:default; }
      .wp-note {
        width:100%; margin-top:8px; padding:8px 10px;
        background:#1f2c34; border:1px solid #2a3942; border-radius:8px;
        color:#e9edef; font-size:12px; resize:none; outline:none; min-height:60px;
        box-sizing:border-box;
      }
      .wp-note:focus { border-color:#00a884; }

      /* Tags en detalle */
      .wp-tags-editor { margin-top:10px; }
      .wp-tags-editor-title { font-size:11px; color:#8696a0; margin-bottom:5px; }
      .wp-tags-list { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }
      .wp-tag-editable {
        display:flex; align-items:center; gap:3px;
        padding:2px 8px; border-radius:99px; font-size:11px; font-weight:600;
        background:#0d2e24; color:#00a884; border:1px solid #1a4a36; cursor:default;
      }
      .wp-tag-remove {
        background:none; border:none; color:#ef5350; cursor:pointer;
        font-size:12px; line-height:1; padding:0;
      }
      .wp-tag-input-row { display:flex; gap:5px; }
      .wp-tag-inp {
        flex:1; padding:5px 8px; border-radius:6px;
        background:#2a3942; border:1px solid #3a4a52;
        color:#e9edef; font-size:11px; outline:none;
      }
      .wp-tag-inp:focus { border-color:#00a884; }
      .wp-tag-add-btn {
        padding:5px 10px; border-radius:6px; border:none;
        background:#00a884; color:#fff; font-size:11px; font-weight:700; cursor:pointer;
      }
      .wp-tag-suggestions { display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; }
      .wp-tag-sugg {
        padding:2px 6px; border-radius:99px; font-size:10px;
        background:#2a3942; color:#8696a0; cursor:pointer; border:1px solid #3a4a52;
      }
      .wp-tag-sugg:hover { background:#3a4a52; color:#e9edef; }

      /* Métricas */
      .wp-metrics { flex:1; overflow-y:auto; padding:12px; }
      .wp-metric-card {
        background:#1f2c34; border-radius:10px; padding:12px 14px;
        margin-bottom:10px; border:1px solid #2a3942;
      }
      .wp-metric-card-title { font-size:11px; color:#8696a0; margin-bottom:8px; text-transform:uppercase; font-weight:700; }
      .wp-metric-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .wp-metric-item { display:flex; flex-direction:column; gap:2px; }
      .wp-metric-val { font-size:22px; font-weight:700; color:#e9edef; }
      .wp-metric-lbl { font-size:10px; color:#8696a0; }
      .wp-metric-val.green { color:#00a884; }
      .wp-metric-val.orange { color:#ffa726; }
      .wp-metric-val.red { color:#ef5350; }
      .wp-progress-bar {
        height:4px; background:#2a3942; border-radius:99px; overflow:hidden; margin-top:6px;
      }
      .wp-progress-fill { height:100%; background:#00a884; border-radius:99px; transition:width .4s; }

      /* Mensajes */
      .wp-msgs { flex:1; overflow-y:auto; }
      .wp-msg-item {
        padding:10px 12px; border-bottom:1px solid #1f2c34;
        display:flex; flex-direction:column; gap:3px;
      }
      .wp-msg-item.incoming { border-left:3px solid #00a884; }
      .wp-msg-item.outgoing { border-left:3px solid #ffa726; }
      .wp-msg-name { font-weight:600; font-size:12px; }
      .wp-msg-body { font-size:12px; color:#8696a0; }
      .wp-msg-time { font-size:10px; color:#556370; }
      .wp-msg-badge {
        display:inline-block; font-size:9px; padding:1px 5px;
        border-radius:99px; font-weight:700; margin-left:5px;
      }
      .wp-msg-badge.in { background:#0d2e24; color:#00a884; }
      .wp-msg-badge.out { background:#2e2400; color:#ffa726; }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // ── Toggle ───────────────────────────────────────────────────────
    const toggleEl = document.createElement('button');
    toggleEl.id = 'wspp-toggle';
    toggleEl.textContent = '◀';
    document.body.appendChild(toggleEl);

    const panel = document.createElement('div');
    panel.id = 'wspp-crm-panel';
    document.body.appendChild(panel);

    function pushWA(open) {
      const app = document.getElementById('app');
      if (app) app.style.marginRight = open ? PANEL_WIDTH + 'px' : '0';
    }

    let panelOpen = true;
    pushWA(true);

    toggleEl.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panel.classList.toggle('wspp-hidden', !panelOpen);
      toggleEl.textContent = panelOpen ? '▶' : '◀';
      pushWA(panelOpen);
    });

    // ── Render principal ─────────────────────────────────────────────
    function render() {
      if (S.view === 'login')       return renderLogin();
      if (S.view === 'leads')       return renderLeads();
      if (S.view === 'lead-detail') return renderDetail();
      if (S.view === 'metrics')     return renderMetrics();
      if (S.view === 'messages')    return renderMessages();
    }

    // ── Nav bar (común para vistas autenticadas) ─────────────────────
    function navBar() {
      const unread = S.messages.filter(m => !m.seen).length;
      return `
        <div class="wp-nav">
          <button class="wp-nav-btn ${S.view==='leads'||S.view==='lead-detail'?'on':''}" data-nav="leads">Leads</button>
          <button class="wp-nav-btn ${S.view==='messages'?'on':''}" data-nav="messages">
            Mensajes${unread ? `<span class="wp-badge">${unread}</span>` : ''}
          </button>
          <button class="wp-nav-btn ${S.view==='metrics'?'on':''}" data-nav="metrics">Métricas</button>
        </div>`;
    }

    function wireNav() {
      panel.querySelectorAll('[data-nav]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const nav = btn.dataset.nav;
          if (nav === 'metrics') {
            S.view = 'metrics';
            await loadStats();
            render();
          } else if (nav === 'messages') {
            S.view = 'messages';
            S.messages.forEach(m => { m.seen = true; });
            render();
          } else {
            S.view = 'leads';
            render();
          }
        });
      });
    }

    // ── LOGIN ────────────────────────────────────────────────────────
    function renderLogin() {
      panel.innerHTML = `
        <div class="wp-hdr">
          <span style="font-size:18px">📋</span>
          <span class="wp-hdr-title">Goberna CRM</span>
        </div>
        <div class="wp-login">
          <div class="wp-login-title">Iniciar sesión</div>
          <div class="wp-login-sub">Accede con tu cuenta Goberna</div>
          <input class="wp-inp" id="wp-email" type="email" placeholder="email@goberna.pe" />
          <input class="wp-inp" id="wp-pass"  type="password" placeholder="Contraseña" />
          <div class="wp-err" id="wp-err"></div>
          <button class="wp-btn" id="wp-login-btn">Entrar</button>
        </div>`;

      panel.querySelector('#wp-login-btn').addEventListener('click', doLogin);
      panel.querySelector('#wp-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    }

    async function doLogin() {
      const email = panel.querySelector('#wp-email').value.trim();
      const pass  = panel.querySelector('#wp-pass').value;
      const btn   = panel.querySelector('#wp-login-btn');
      const err   = panel.querySelector('#wp-err');

      if (!email || !pass) { err.textContent = 'Completa email y contraseña'; err.style.display = 'block'; return; }

      btn.disabled = true; btn.textContent = 'Entrando...'; err.style.display = 'none';

      try {
        const res  = await apiFetch('/api/auth/login', { method: 'POST', body: { identifier: email, password: pass } });
        S.token     = res.access_token;
        S.user      = res.user;
        S.campaigns = res.campaigns || [];
        S.view      = 'leads';

        storageSet({ wspp_token: S.token, wspp_user: JSON.stringify(S.user), wspp_campaigns: JSON.stringify(S.campaigns) });

        if (S.campaigns.length === 1) {
          S.activeCampaignId = S.campaigns[0].id;
          await Promise.all([loadLeads(), loadTags(), loadStats()]);
          startSSE();
        }
        render();
      } catch (e) {
        err.textContent = e.message; err.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    }

    // ── LEADS LIST ───────────────────────────────────────────────────
    function renderLeads() {
      const userName = S.user?.full_name || S.user?.email || '';

      panel.innerHTML = `
        <div class="wp-hdr">
          <span style="font-size:15px">📋</span>
          <span class="wp-hdr-title">Goberna CRM</span>
          <span class="wp-chip">${escHtml(userName.split(' ')[0] || '')}</span>
          <button style="background:none;border:none;color:#8696a0;cursor:pointer;font-size:11px" id="wp-logout">Salir</button>
        </div>
        ${navBar()}
        <div class="wp-filters">
          ${S.campaigns.length > 1 ? `
            <select class="wp-select" id="wp-camp">
              <option value="">— Selecciona campaña —</option>
              ${S.campaigns.map(c => `<option value="${c.id}" ${c.id===S.activeCampaignId?'selected':''}>${escHtml(c.name)}</option>`).join('')}
            </select>` : `<div style="font-size:11px;color:#8696a0">${escHtml(S.campaigns[0]?.name||'')}</div>`}
          <input class="wp-search" id="wp-search" placeholder="Buscar nombre, teléfono, zona..." value="${escHtml(S.search)}" />
          <div class="wp-tabs">
            ${['nuevo','hablado','respondieron','todos'].map(s =>
              `<button class="wp-tab ${S.status===s?'on':''}" data-s="${s}">${s==='respondieron'?'Resp.':cap(s)}</button>`
            ).join('')}
          </div>
          ${S.availableTags.length ? `
            <div class="wp-tag-bar">
              <span class="wp-tag-pill ${!S.tagFilter?'on':''}" data-tag="">Todos</span>
              ${S.availableTags.slice(0,8).map(t =>
                `<span class="wp-tag-pill ${S.tagFilter===t?'on':''}" data-tag="${escHtml(t)}">${escHtml(t)}</span>`
              ).join('')}
            </div>` : ''}
        </div>
        <div class="wp-list" id="wp-list">
          ${S.loading ? '<div class="wp-spin-wrap"><div class="wp-spin"></div></div>' : buildLeadItems()}
        </div>
        <div class="wp-footer">${S.leads.length} de ${S.totalLeads} · ${S.status}${S.tagFilter?' · #'+S.tagFilter:''}</div>`;

      // Eventos
      panel.querySelector('#wp-logout')?.addEventListener('click', doLogout);
      wireNav();

      panel.querySelector('#wp-camp')?.addEventListener('change', async e => {
        S.activeCampaignId = e.target.value; S.page = 0; S.leads = [];
        await Promise.all([loadLeads(), loadTags()]);
        startSSE();
        render();
      });

      let t;
      panel.querySelector('#wp-search')?.addEventListener('input', e => {
        clearTimeout(t);
        t = setTimeout(async () => { S.search = e.target.value; S.page = 0; S.leads = []; await loadLeads(); renderList(); }, 350);
      });

      panel.querySelectorAll('.wp-tab').forEach(el => {
        el.addEventListener('click', async () => { S.status = el.dataset.s; S.page = 0; S.leads = []; await loadLeads(); render(); });
      });

      panel.querySelectorAll('[data-tag]').forEach(el => {
        el.addEventListener('click', async () => { S.tagFilter = el.dataset.tag; S.page = 0; S.leads = []; await loadLeads(); render(); });
      });

      panel.querySelector('#wp-list')?.addEventListener('click', handleListClick);
    }

    function renderList() {
      const list = panel.querySelector('#wp-list');
      if (list) {
        list.innerHTML = buildLeadItems();
        list.removeEventListener('click', handleListClick);
        list.addEventListener('click', handleListClick);
      }
      const footer = panel.querySelector('.wp-footer');
      if (footer) footer.textContent = `${S.leads.length} de ${S.totalLeads} · ${S.status}${S.tagFilter?' · #'+S.tagFilter:''}`;
    }

    function handleListClick(e) {
      const waBtn  = e.target.closest('.wp-wa[data-phone]');
      const leadEl = e.target.closest('.wp-lead[data-id]');
      const moreEl = e.target.closest('#wp-more');

      if (waBtn) {
        e.stopPropagation();
        const leadId = e.target.closest('.wp-lead[data-id]')?.dataset.id;
        openChat(waBtn.dataset.phone, leadId);
        return;
      }
      if (moreEl) { S.page++; loadLeads(true).then(renderList); return; }
      if (leadEl) {
        const lead = S.leads.find(l => l.id === leadEl.dataset.id);
        if (lead) { S.activeLead = lead; S.view = 'lead-detail'; render(); }
      }
    }

    function buildLeadItems() {
      if (!S.activeCampaignId) return `<div class="wp-empty"><div class="wp-empty-icon">📋</div><div>Selecciona una campaña</div></div>`;
      if (!S.leads.length)     return `<div class="wp-empty"><div class="wp-empty-icon">🔍</div><div>Sin leads con este filtro</div></div>`;

      const items = S.leads.map(lead => {
        const nombre = lead.nombre || lead.data?.nombre || 'Sin nombre';
        const tel    = lead.telefono || lead.data?.telefono || '';
        const zona   = lead.zona || lead.data?.zona || lead.data?.distrito || '';
        const status = lead.cms_status || 'nuevo';
        const tags   = lead.cms_tags || [];
        const hasTel = tel.replace(/\D/g, '').length >= 9;

        return `<div class="wp-lead" data-id="${lead.id}">
          <div class="wp-av">${nombre.charAt(0).toUpperCase()}</div>
          <div class="wp-info">
            <div class="wp-name">${escHtml(nombre)}</div>
            <div class="wp-sub">${tel?'📱 '+escHtml(tel):'Sin teléfono'}${zona?' · '+escHtml(zona):''}</div>
            ${tags.length ? `<div class="wp-tags-row">${tags.slice(0,3).map(t=>`<span class="wp-tag-sm">${escHtml(t)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="wp-meta">
            <div class="wp-dot ${status}"></div>
            ${hasTel ? `<button class="wp-wa" data-phone="${escHtml(tel)}">WA</button>` : ''}
          </div>
        </div>`;
      }).join('');

      const hasMore = S.totalLeads > S.leads.length;
      return items + (hasMore ? `<div class="wp-more" id="wp-more">Cargar más (${S.totalLeads - S.leads.length} restantes)</div>` : '');
    }

    // ── LEAD DETAIL ──────────────────────────────────────────────────
    function renderDetail() {
      const L = S.activeLead;
      if (!L) { S.view = 'leads'; return render(); }

      const nombre = L.nombre || L.data?.nombre || 'Sin nombre';
      const tel    = (L.telefono || L.data?.telefono || '').replace(/\D/g, '');
      const zona   = L.zona || L.data?.zona || '—';
      const dist   = L.distrito || L.data?.distrito || '—';
      const enc    = L.encuestador || L.data?.encuestador || '—';
      const cand   = L.candidato_preferido || L.data?.candidato_preferido || '—';
      const status = L.cms_status || 'nuevo';
      const notas  = L.cms_operator_notes?.comentarios || '';
      const tags   = L.cms_tags || [];
      const waNum  = tel.length === 9 ? '51'+tel : tel;
      const hasTel = waNum.length >= 11;

      const tagSuggs = S.availableTags.filter(t => !tags.includes(t));

      panel.innerHTML = `
        <div class="wp-hdr">
          <button class="wp-back" id="wp-back">←</button>
          <span class="wp-hdr-title" style="font-size:12px">${escHtml(nombre)}</span>
          <span class="wp-dot ${status}" style="width:9px;height:9px;flex-shrink:0"></span>
        </div>
        ${navBar()}
        <div class="wp-detail">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <div class="wp-av" style="width:44px;height:44px;font-size:17px">${nombre.charAt(0).toUpperCase()}</div>
            <div>
              <div style="font-weight:700;font-size:14px">${escHtml(nombre)}</div>
              <div style="font-size:11px;color:#8696a0">${status}</div>
            </div>
          </div>

          ${drow('📱 Teléfono', tel||'—')}
          ${drow('📍 Zona', zona)}
          ${drow('🏘 Distrito', dist)}
          ${drow('👤 Encuestador', enc)}
          ${drow('🗳 Candidato pref.', cand)}
          ${L.cms_hablado_at     ? drow('✅ Hablado el',    fmtDate(L.cms_hablado_at))     : ''}
          ${L.cms_respondieron_at ? drow('💬 Respondió el', fmtDate(L.cms_respondieron_at)) : ''}

          <button class="wp-open-btn" id="wp-open" ${!hasTel?'disabled':''}>
            💬 Abrir chat en WhatsApp
          </button>

          <!-- Tags editor -->
          <div class="wp-tags-editor">
            <div class="wp-tags-editor-title">Etiquetas</div>
            <div class="wp-tags-list" id="wp-tags-list">
              ${tags.map(t => `
                <span class="wp-tag-editable">
                  ${escHtml(t)}
                  <button class="wp-tag-remove" data-tag="${escHtml(t)}">×</button>
                </span>`).join('')}
            </div>
            <div class="wp-tag-input-row">
              <input class="wp-tag-inp" id="wp-tag-inp" placeholder="Nueva etiqueta..." maxlength="32" />
              <button class="wp-tag-add-btn" id="wp-tag-add">+</button>
            </div>
            ${tagSuggs.length ? `
              <div class="wp-tag-suggestions">
                ${tagSuggs.slice(0,6).map(t => `<span class="wp-tag-sugg" data-sugg="${escHtml(t)}">${escHtml(t)}</span>`).join('')}
              </div>` : ''}
          </div>

          <div style="margin-top:12px;font-size:11px;color:#8696a0;margin-bottom:4px">Notas del operador</div>
          <textarea class="wp-note" id="wp-note" placeholder="Escribe notas...">${escHtml(notas)}</textarea>
          <button class="wp-btn" id="wp-save-note" style="margin-top:6px;padding:7px">Guardar notas</button>
        </div>`;

      wireNav();
      panel.querySelector('#wp-back').addEventListener('click', () => { S.view = 'leads'; render(); });
      panel.querySelector('#wp-open')?.addEventListener('click', () => openChat(tel, L.id));

      // Tags
      panel.querySelectorAll('.wp-tag-remove').forEach(btn => {
        btn.addEventListener('click', async () => {
          const newTags = tags.filter(t => t !== btn.dataset.tag);
          await saveTags(L.id, newTags);
        });
      });
      panel.querySelectorAll('.wp-tag-sugg').forEach(el => {
        el.addEventListener('click', async () => {
          const newTags = [...new Set([...tags, el.dataset.sugg])];
          await saveTags(L.id, newTags);
        });
      });
      panel.querySelector('#wp-tag-add')?.addEventListener('click', async () => {
        const inp = panel.querySelector('#wp-tag-inp');
        const val = inp?.value.trim().toLowerCase();
        if (!val) return;
        const newTags = [...new Set([...tags, val])];
        await saveTags(L.id, newTags);
        inp.value = '';
      });
      panel.querySelector('#wp-tag-inp')?.addEventListener('keydown', async e => {
        if (e.key !== 'Enter') return;
        const val = e.target.value.trim().toLowerCase();
        if (!val) return;
        const newTags = [...new Set([...tags, val])];
        await saveTags(L.id, newTags);
        e.target.value = '';
      });

      // Notas
      panel.querySelector('#wp-save-note')?.addEventListener('click', async () => {
        const nota = panel.querySelector('#wp-note')?.value || '';
        await saveNote(L.id, nota);
      });
    }

    async function saveTags(id, tags) {
      try {
        const res = await apiFetch(`/api/cms/contacts/${id}/tags`, {
          method: 'PUT',
          body: { tags },
        });
        if (res.ok !== false) {
          S.activeLead.cms_tags = tags;
          const lead = S.leads.find(l => l.id === id);
          if (lead) lead.cms_tags = tags;
          // Actualizar sugerencias
          tags.forEach(t => { if (!S.availableTags.includes(t)) S.availableTags.push(t); });
          render();
        }
      } catch(e) { console.warn('[WSPP CRM] saveTags error:', e); }
    }

    async function saveNote(id, comentarios) {
      const btn = panel.querySelector('#wp-save-note');
      if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
      try {
        await apiFetch(`/api/cms/contacts/${id}/notes`, {
          method: 'PUT',
          body: { comentarios },
        });
        if (btn) { btn.disabled = false; btn.textContent = '✓ Guardado'; setTimeout(() => { if(btn) btn.textContent = 'Guardar notas'; }, 1500); }
      } catch(e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Error al guardar'; }
      }
    }

    // ── MÉTRICAS ─────────────────────────────────────────────────────
    function renderMetrics() {
      const st = S.stats;

      panel.innerHTML = `
        <div class="wp-hdr">
          <span style="font-size:15px">📊</span>
          <span class="wp-hdr-title">Métricas</span>
          <span class="wp-chip">${escHtml(S.campaigns.find(c=>c.id===S.activeCampaignId)?.name||'')}</span>
        </div>
        ${navBar()}
        <div class="wp-metrics">
          ${!st ? '<div class="wp-spin-wrap"><div class="wp-spin"></div></div>' : `

          <!-- Stats generales -->
          <div class="wp-metric-card">
            <div class="wp-metric-card-title">Pipeline de contactos</div>
            <div class="wp-metric-grid">
              <div class="wp-metric-item">
                <span class="wp-metric-val">${st.total||0}</span>
                <span class="wp-metric-lbl">Total leads</span>
              </div>
              <div class="wp-metric-item">
                <span class="wp-metric-val orange">${st.nuevos||0}</span>
                <span class="wp-metric-lbl">Pendientes</span>
              </div>
              <div class="wp-metric-item">
                <span class="wp-metric-val green">${st.hablados||0}</span>
                <span class="wp-metric-lbl">Contactados</span>
              </div>
              <div class="wp-metric-item">
                <span class="wp-metric-val green">${st.respondieron||0}</span>
                <span class="wp-metric-lbl">Respondieron</span>
              </div>
            </div>
            <div class="wp-progress-bar" style="margin-top:10px">
              <div class="wp-progress-fill" style="width:${st.total?Math.round(((st.hablados+st.respondieron)/st.total)*100):0}%"></div>
            </div>
            <div style="font-size:10px;color:#8696a0;margin-top:4px;text-align:right">
              ${st.total?Math.round(((st.hablados+st.respondieron)/st.total)*100):0}% contactado
            </div>
          </div>

          <!-- Tasa de respuesta -->
          <div class="wp-metric-card">
            <div class="wp-metric-card-title">Eficiencia</div>
            <div class="wp-metric-grid">
              <div class="wp-metric-item">
                <span class="wp-metric-val green">${st.hablados+st.respondieron>0?Math.round((st.respondieron/(st.hablados+st.respondieron))*100):0}%</span>
                <span class="wp-metric-lbl">Tasa respuesta</span>
              </div>
              <div class="wp-metric-item">
                <span class="wp-metric-val">${S.wasSent}</span>
                <span class="wp-metric-lbl">WA enviados (sesión)</span>
              </div>
              <div class="wp-metric-item">
                <span class="wp-metric-val orange">${st.archivados||0}</span>
                <span class="wp-metric-lbl">Archivados</span>
              </div>
              <div class="wp-metric-item">
                <span class="wp-metric-val">${S.messages.length}</span>
                <span class="wp-metric-lbl">Msgs recibidos</span>
              </div>
            </div>
          </div>

          <!-- Mensajes de esta sesión -->
          <div class="wp-metric-card">
            <div class="wp-metric-card-title">Esta sesión</div>
            <div style="font-size:12px;color:#8696a0">
              ${S.messages.length === 0
                ? 'Sin mensajes recibidos aún'
                : `${S.messages.filter(m=>!m.fromMe).length} entrantes · ${S.messages.filter(m=>m.fromMe).length} salientes detectados`
              }
            </div>
          </div>
          `}
        </div>`;

      wireNav();

      // Refrescar stats
      loadStats().then(() => {
        if (S.view === 'metrics') render();
      });
    }

    // ── MENSAJES ─────────────────────────────────────────────────────
    function renderMessages() {
      panel.innerHTML = `
        <div class="wp-hdr">
          <span style="font-size:15px">💬</span>
          <span class="wp-hdr-title">Mensajes recientes</span>
        </div>
        ${navBar()}
        <div class="wp-msgs" id="wp-msgs">
          ${S.messages.length === 0
            ? `<div class="wp-empty"><div class="wp-empty-icon">💬</div><div>Sin mensajes aún. Se registran cuando recibes WA de leads.</div></div>`
            : [...S.messages].reverse().map(m => `
              <div class="wp-msg-item ${m.fromMe?'outgoing':'incoming'}">
                <div class="wp-msg-name">
                  ${escHtml(m.from||'Desconocido')}
                  <span class="wp-msg-badge ${m.fromMe?'out':'in'}">${m.fromMe?'Enviado':'Entrante'}</span>
                </div>
                <div class="wp-msg-body">${escHtml((m.body||'').slice(0,120))}</div>
                <div class="wp-msg-time">${fmtDate(m.timestamp*1000||Date.now())}</div>
              </div>`).join('')
          }
        </div>`;

      wireNav();
    }

    // ── ABRIR CHAT ───────────────────────────────────────────────────
    async function openChat(phone, leadId) {
      let digits = String(phone).replace(/\D/g, '');
      if (digits.length === 9) digits = '51' + digits;

      // Marcar como hablado via background (sin CORS)
      if (S.token && leadId) {
        try {
          await chrome.runtime.sendMessage({
            type: 'WSPP_API_FETCH',
            payload: {
              url: `${API_BASE}/api/cms/contacts/${leadId}/hablado`,
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${S.token}`, 'x-campaign-id': S.activeCampaignId, 'Content-Type': 'application/json' },
            },
          });
          const lead = S.leads.find(l => l.id === leadId);
          if (lead) { lead.cms_status = 'hablado'; lead.cms_hablado_at = new Date().toISOString(); }
          if (S.activeLead?.id === leadId) { S.activeLead.cms_status = 'hablado'; S.activeLead.cms_hablado_at = new Date().toISOString(); }
        } catch(e) { console.warn('[WSPP CRM] hablado error:', e); }
      }

      // Nombre para el saludo
      const lead = S.leads.find(l => l.id === leadId) || S.activeLead;
      const nombre = (lead?.nombre || lead?.data?.nombre || '').split(' ')[0];
      const greeting = nombre ? `Hola ${nombre}` : 'Hola';

      // Abrir via CDP
      chrome.runtime.sendMessage({ type: 'WSPP_TYPE_PHONE', payload: { phone: digits, greeting } });

      // Contar enviados
      S.wasSent++;
    }

    // ── LOGOUT ───────────────────────────────────────────────────────
    function doLogout() {
      S.token = null; S.user = null; S.campaigns = []; S.activeCampaignId = null;
      S.leads = []; S.stats = null; S.messages = []; S.wasSent = 0;
      if (S.sseSource) { S.sseSource.close(); S.sseSource = null; }
      storageRemove(['wspp_token','wspp_user','wspp_campaigns']);
      S.view = 'login'; render();
    }

    // ── API ──────────────────────────────────────────────────────────
    async function apiFetch(path, opts = {}) {
      const { method = 'GET', body, headers = {} } = opts;
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(S.token ? { 'Authorization': `Bearer ${S.token}` } : {}),
          ...(S.activeCampaignId ? { 'x-campaign-id': S.activeCampaignId } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json();
      if (res.status === 401) { doLogout(); throw new Error('Sesión expirada'); }
      if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`);
      return data;
    }

    async function loadLeads(append = false) {
      if (!S.token || !S.activeCampaignId) return;
      S.loading = true;
      const limit = 50;
      const params = new URLSearchParams({ limit, offset: S.page * limit, status: S.status });
      if (S.search) params.set('search', S.search);
      if (S.tagFilter) params.set('tag', S.tagFilter);
      try {
        const data = await apiFetch(`/api/cms/contacts?${params}`);
        if (data.ok !== false) {
          S.leads      = append ? [...S.leads, ...(data.contacts||[])] : (data.contacts||[]);
          S.totalLeads = data.total || 0;
        }
      } catch(e) { console.error('[WSPP CRM] loadLeads:', e); }
      S.loading = false;
    }

    async function loadTags() {
      if (!S.token || !S.activeCampaignId) return;
      try {
        const data = await apiFetch('/api/cms/tags');
        S.availableTags = data.tags || [];
      } catch(e) {}
    }

    async function loadStats() {
      if (!S.token || !S.activeCampaignId) return;
      try {
        const data = await apiFetch('/api/cms/stats');
        S.stats = data.stats || null;
      } catch(e) {}
    }

    // ── SSE ──────────────────────────────────────────────────────────
    function startSSE() {
      if (!S.token || !S.activeCampaignId) return;
      if (S.sseSource) S.sseSource.close();

      const url = `${API_BASE}/api/cms/stream`;
      const es  = new EventSource(url, { headers: { 'Authorization': `Bearer ${S.token}`, 'x-campaign-id': S.activeCampaignId } });

      // EventSource no soporta headers custom nativamente — usar URL params como fallback
      S.sseSource = es;

      es.addEventListener('contact.updated', e => {
        try {
          const d = JSON.parse(e.data);
          const lead = S.leads.find(l => l.id === d.id);
          if (lead) { Object.assign(lead, d); if (S.view === 'leads') renderList(); }
        } catch(_) {}
      });

      es.addEventListener('contact.tags_updated', e => {
        try {
          const d = JSON.parse(e.data);
          const lead = S.leads.find(l => l.id === d.id);
          if (lead) { lead.cms_tags = d.cms_tags; if (S.view === 'leads') renderList(); }
        } catch(_) {}
      });

      es.onerror = () => {
        es.close();
        setTimeout(() => startSSE(), 5000);
      };
    }

    // ── Mensajes de WA (via inject.js) ──────────────────────────────
    window.addEventListener('message', e => {
      if (e.data?.type === 'WSPP_NEW_MSG') {
        const msg = e.data.payload;
        S.messages.push({ ...msg, seen: S.view === 'messages', fromMe: msg.fromMe || false });
        if (S.messages.length > 100) S.messages.shift();
        // Badge en nav
        if (S.view !== 'messages') {
          const badge = panel.querySelector('.wp-nav-btn[data-nav="messages"] .wp-badge');
          const unread = S.messages.filter(m => !m.seen).length;
          if (badge) badge.textContent = unread;
          else {
            const btn = panel.querySelector('.wp-nav-btn[data-nav="messages"]');
            if (btn && unread) btn.innerHTML = `Mensajes<span class="wp-badge">${unread}</span>`;
          }
        }
      }
    });

    // ── Utils ────────────────────────────────────────────────────────
    function escHtml(s) {
      return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function fmtDate(iso) {
      if (!iso) return '—';
      const d = typeof iso === 'number' ? new Date(iso) : new Date(iso);
      return d.toLocaleDateString('es', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    }
    function drow(label, val) {
      return `<div class="wp-drow"><span class="wp-dlabel">${label}</span><span class="wp-dval">${escHtml(String(val))}</span></div>`;
    }

    // ── Init ─────────────────────────────────────────────────────────
    storageGet(['wspp_token','wspp_user','wspp_campaigns']).then(async saved => {
      if (saved.wspp_token) {
        S.token     = saved.wspp_token;
        S.user      = JSON.parse(saved.wspp_user || 'null');
        S.campaigns = JSON.parse(saved.wspp_campaigns || '[]');
        S.view      = 'leads';
        if (S.campaigns.length === 1) {
          S.activeCampaignId = S.campaigns[0].id;
          await Promise.all([loadLeads(), loadTags(), loadStats()]);
          startSSE();
        }
      }
      render();
    });

    window.__WSPP_CRM__ = { S, render, loadLeads };
  });
})();
