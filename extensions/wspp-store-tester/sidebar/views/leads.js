// sidebar/views/leads.js — Vista de lista de leads con filtros
// Depende de: constants.js, store.js, ui.js, utils.js, chat.js
// Expone: WSPP.renderLeads, WSPP.renderList, WSPP.buildLeadItems,
//         WSPP.buildTagFilterBar, WSPP.footerText, WSPP.handleListClick
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  /**
   * Retorna las etiquetas WA de un lead cruzando su teléfono con waPhoneLabelMap.
   * Devuelve [] si el lead no tiene número o no tiene etiquetas WA.
   */
  function waLabelsForLead(lead) {
    const { S, normPhone } = WSPP;
    const p11 = normPhone(lead.telefono || lead.data?.telefono || '');
    if (!p11) return [];
    return S.waPhoneLabelMap[p11] || [];
  }
  // Exponer para reutilizar en buildLeadItems
  WSPP._waLabelsForLead = waLabelsForLead;

  /**
   * Genera la barra de filtro por etiquetas de WhatsApp Business.
   * Solo se muestra si hay etiquetas disponibles en S.waLabels.
   */
  WSPP.buildWaLabelFilterBar = function buildWaLabelFilterBar() {
    const { S, C, esc } = WSPP;
    if (!S.waLabels.length) return '';

    const WA_LABEL_COLORS = {
      0: '#06d755', 1: '#fffb0c', 2: '#fd7e14', 3: '#fc424a',
      4: '#0dcaf0', 5: '#6f42c1', 6: '#d63384',
    };

    const pills = S.waLabels.map(lbl => {
      const active = S.waLabelFilter === lbl.name;
      const color  = lbl.color != null
        ? (WA_LABEL_COLORS[lbl.color] || C.gold)
        : C.gold;
      return `<span class="w-tag-pill w-wa-label-pill ${active ? 'on' : ''}"
        data-walabel="${esc(lbl.name)}"
        style="${active ? `background:${color}22;color:${color};border-color:${color}66` : ''}">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:3px;vertical-align:middle;flex-shrink:0"></span>
        ${esc(lbl.name)}
      </span>`;
    }).join('');

    return `
      <div class="w-wa-label-bar">
        <span style="font-size:9px;color:${C.textMuted};text-transform:uppercase;letter-spacing:.5px;margin-right:4px">WA</span>
        <span class="w-tag-pill w-wa-label-pill ${!S.waLabelFilter ? 'on' : ''}" data-walabel="">Todos</span>
        ${pills}
      </div>`;
  };

  /**
   * Genera el HTML del filtro de tags.
   * Si hay más de 6 tags, muestra un input de búsqueda inline en lugar de pills.
   * Si hay ≤ 6, muestra pills directamente.
   */
  WSPP.buildTagFilterBar = function buildTagFilterBar() {
    const { S, C, esc } = WSPP;
    if (!S.availableTags.length) return '';

    if (S.availableTags.length > 6) {
      // Modo buscador de tags
      const activeName = S.tagFilter;
      const activeTag  = S.availableTags.find(t => (typeof t === 'object' ? t.name : t) === activeName);
      const activeColor = activeTag && typeof activeTag === 'object' ? (activeTag.color || C.gold) : C.gold;
      return `<div class="w-tag-filter-wrap" id="w-tag-filter-wrap">
        <div style="position:relative;display:flex;align-items:center">
          <span style="position:absolute;left:9px;font-size:11px;opacity:.4;pointer-events:none">🏷</span>
          <input class="w-search w-tag-filter-inp" id="w-tag-filter-inp"
            placeholder="Filtrar por etiqueta..."
            value="${activeName ? esc(activeName) : ''}"
            autocomplete="off"
            style="${activeName ? `border-color:${activeColor};` : ''}" />
          ${activeName ? `<button class="w-tag-filter-clear" id="w-tag-filter-clear" title="Quitar filtro">×</button>` : ''}
        </div>
        <div class="w-tag-dropdown w-tag-filter-dropdown" id="w-tag-filter-dropdown" style="display:none;position:absolute;z-index:9999;left:0;right:0;top:calc(100% + 2px)"></div>
      </div>`;
    }

    // Modo pills (≤ 6 tags)
    return `<div class="w-tag-bar">
      <span class="w-tag-pill ${!S.tagFilter ? 'on' : ''}" data-tag="">Todos</span>
      ${S.availableTags.map(t => {
        const name   = typeof t === 'object' ? t.name  : t;
        const color  = typeof t === 'object' ? (t.color || C.gold) : C.gold;
        const active = name === S.tagFilter;
        return `<span class="w-tag-pill ${active ? 'on' : ''}" data-tag="${esc(name)}"
          style="${active ? `background:${color}22;color:${color};border-color:${color}66` : ''}"
        ><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:3px;vertical-align:middle;flex-shrink:0"></span>${esc(name)}</span>`;
      }).join('')}
    </div>`;
  };

  /** Genera el texto del footer con conteo y filtros activos */
  WSPP.footerText = function footerText() {
    const { S } = WSPP;
    const parts = [`${S.leads.length} de ${S.totalLeads}`];
    if (S.status !== 'todos') parts.push(S.status);
    if (S.tagFilter) parts.push('#' + S.tagFilter);
    return parts.join(' · ');
  };

  /** Genera los items HTML de la lista de leads */
  WSPP.buildLeadItems = function buildLeadItems() {
    const { S, C, esc, _waLabelsForLead } = WSPP;
    if (!S.activeCampaignId) return `<div class="w-empty"><div class="w-empty-icon">📋</div><div>Selecciona una campaña</div></div>`;
    if (!S.leads.length)     return `<div class="w-empty"><div class="w-empty-icon">🔍</div><div>Sin leads con este filtro</div></div>`;

    // Filtro client-side por etiqueta WA (el backend no conoce etiquetas de WA)
    let leads = S.leads;
    if (S.waLabelFilter) {
      leads = leads.filter(lead => {
        const lbls = _waLabelsForLead(lead);
        return lbls.some(l => l.name === S.waLabelFilter);
      });
    }

    if (!leads.length) return `<div class="w-empty"><div class="w-empty-icon">🏷</div><div>Ningún lead con etiqueta WA "${esc(S.waLabelFilter)}"</div></div>`;

    const WA_LABEL_COLORS = {
      0: '#06d755', 1: '#fffb0c', 2: '#fd7e14', 3: '#fc424a',
      4: '#0dcaf0', 5: '#6f42c1', 6: '#d63384',
    };

    const SOURCE_BADGE = {
      meta:    { label: 'META', color: '#1877F2' },  // Facebook blue
      manual:  { label: 'Manual', color: '#6c757d' },
      // 'territorio' has no badge — it's the default, no visual noise needed
    };

    const items = leads.map(lead => {
      const nombre   = lead.nombre || lead.data?.nombre || 'Sin nombre';
      const tel      = lead.telefono || lead.data?.telefono || '';
      const zona     = lead.zona || lead.data?.zona || lead.data?.distrito || '';
      const status   = lead.cms_status || 'nuevo';
      const tags     = lead.cms_tags || [];
      const hasTel   = tel.replace(/\D/g, '').length >= 9;
      const waLabels = _waLabelsForLead(lead);
      const srcBadge = SOURCE_BADGE[lead.contact_source] || null;

      return `<div class="w-lead" data-id="${lead.id}">
        <div class="w-av">${nombre.charAt(0).toUpperCase()}</div>
        <div class="w-info">
          <div class="w-name">
            ${esc(nombre)}
            ${srcBadge ? `<span style="margin-left:4px;font-size:8px;font-weight:700;color:${srcBadge.color};background:${srcBadge.color}1a;border:1px solid ${srcBadge.color}44;border-radius:3px;padding:1px 4px;vertical-align:middle;letter-spacing:.3px">${srcBadge.label}</span>` : ''}
          </div>
          <div class="w-sub">${tel ? '📱 ' + esc(tel) : 'Sin teléfono'}${zona ? ' · ' + esc(zona) : ''}</div>
          ${tags.length || waLabels.length ? `<div class="w-tags-row">
            ${tags.slice(0, 2).map(t => {
              const name  = typeof t === 'object' ? t.name  : t;
              const color = typeof t === 'object' ? (t.color || C.gold) : C.gold;
              return `<span class="w-tag-sm" style="color:${color};background:${color}1a;border-color:${color}44">
                <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${color};margin-right:3px;vertical-align:middle;flex-shrink:0"></span>${esc(name)}</span>`;
            }).join('')}
            ${waLabels.slice(0, 2).map(l => {
              const color = l.color != null ? (WA_LABEL_COLORS[l.color] || C.green) : C.green;
              return `<span class="w-tag-sm w-wa-lbl" style="color:${color};background:${color}1a;border-color:${color}44"
                title="Etiqueta WhatsApp">
                <span style="font-size:8px;margin-right:2px;opacity:.7">WA</span>${esc(l.name)}</span>`;
            }).join('')}
          </div>` : ''}
        </div>
        <div class="w-meta">
          <div class="w-status-dot ${status}"></div>
          ${hasTel ? `<button class="w-wa-btn" data-phone="${esc(tel)}" data-leadid="${lead.id}">WA</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // El "cargar más" solo aplica cuando no hay filtro WA client-side
    const hasMore = !S.waLabelFilter && S.totalLeads > S.leads.length;
    return items + (hasMore ? `<div class="w-more" id="w-more">▼ Cargar ${S.totalLeads - S.leads.length} más</div>` : '');
  };

  /** Actualiza solo la lista (sin re-renderizar el panel completo) */
  WSPP.renderList = function renderList() {
    const panel = document.getElementById('wspp-crm-panel');
    if (!panel) return;
    const list = panel.querySelector('#w-list');
    if (list) {
      list.innerHTML = WSPP.buildLeadItems();
      list.removeEventListener('click', WSPP.handleListClick);
      list.addEventListener('click', WSPP.handleListClick);
    }
    const footer = panel.querySelector('#w-footer');
    if (footer) footer.textContent = WSPP.footerText();
  };

  /** Handler de clicks en la lista de leads */
  WSPP.handleListClick = function handleListClick(e) {
    const { S, render, openChat } = WSPP;
    const waBtn  = e.target.closest('.w-wa-btn[data-phone]');
    const moreEl = e.target.closest('#w-more');
    const leadEl = e.target.closest('.w-lead[data-id]');
    if (waBtn) {
      e.stopPropagation();
      openChat(waBtn.dataset.phone, waBtn.dataset.leadid);
      return;
    }
    if (moreEl) {
      S.page++;
      WSPP.loadLeads(true).then(WSPP.renderList);
      return;
    }
    if (leadEl) {
      const lead = S.leads.find(l => l.id === leadEl.dataset.id);
      if (lead) { S.activeLead = lead; S.view = 'lead-detail'; render(); }
    }
  };

  /** Renderiza la vista completa de la lista de leads */
  WSPP.renderLeads = function renderLeads() {
    const { S, C, esc, cap, navBar, sseBar, campBar, buildTagFilterBar,
            buildWaLabelFilterBar, buildLeadItems, footerText,
            handleListClick, loadLeads, loadTags, startSSE, render, doLogout } = WSPP;
    const panel    = document.getElementById('wspp-crm-panel');
    const userName  = S.user?.full_name || S.user?.email || '';
    const firstName = userName.split(' ')[0] || '';

    panel.innerHTML = `
      <div class="w-hdr">
        <div style="flex:1"><div class="w-hdr-logo">GOBERNA</div></div>
        ${firstName ? `<span class="w-hdr-user">${esc(firstName)}</span>` : ''}
        <button class="w-hdr-logout" id="w-logout" title="Cerrar sesión">✕</button>
      </div>
      ${navBar()}
      ${sseBar()}
      ${campBar()}
      <div class="w-filters">
        <div class="w-search-wrap">
          <span class="w-search-icon">🔍</span>
          <input class="w-search" id="w-search" placeholder="Nombre, teléfono, zona..." value="${esc(S.search)}" />
        </div>
        <div class="w-tabs">
          ${['nuevo', 'hablado', 'respondieron', 'todos'].map(s =>
            `<button class="w-tab ${S.status === s ? 'on' : ''}" data-s="${s}">${s === 'respondieron' ? 'Resp.' : cap(s)}</button>`
          ).join('')}
        </div>
        ${buildTagFilterBar()}
        ${buildWaLabelFilterBar()}
      </div>
      <div class="w-list" id="w-list">
        ${S.loading ? '<div class="w-spin-wrap"><div class="w-spin"></div></div>' : buildLeadItems()}
      </div>
      <div class="w-footer" id="w-footer">${footerText()}</div>`;

    panel.querySelector('#w-logout')?.addEventListener('click', doLogout);
    WSPP.wireNav();
    // Solo conectar el change de campaña si el usuario NO está lockeado
    if (!WSPP.CAMPAIGN_LOCK_NUMBERS.has(S.waNumber)) {
      panel.querySelector('#w-camp')?.addEventListener('change', async e => {
        S.activeCampaignId = e.target.value;
        WSPP.storage.set({ wspp_active_campaign: e.target.value });
        S.page = 0; S.leads = [];
        await Promise.all([loadLeads(), loadTags()]); startSSE(); render();
      });
    }

    let debT;
    panel.querySelector('#w-search')?.addEventListener('input', e => {
      clearTimeout(debT);
      debT = setTimeout(async () => {
        S.search = e.target.value; S.page = 0; S.leads = [];
        await loadLeads(); WSPP.renderList();
      }, 320);
    });

    panel.querySelectorAll('.w-tab').forEach(el => {
      el.addEventListener('click', async () => {
        S.status = el.dataset.s; S.page = 0; S.leads = [];
        await loadLeads(); render();
      });
    });

    // Pills de tags CRM (modo ≤ 6)
    panel.querySelectorAll('[data-tag]').forEach(el => {
      el.addEventListener('click', async () => {
        S.tagFilter = el.dataset.tag; S.page = 0; S.leads = [];
        await loadLeads(); render();
      });
    });

    // Pills de etiquetas WA (filtro client-side, no recarga del servidor)
    panel.querySelectorAll('[data-walabel]').forEach(el => {
      el.addEventListener('click', () => {
        S.waLabelFilter = el.dataset.walabel;
        WSPP.renderList(); // re-render client-side, sin llamada a API
      });
    });

    // Buscador de tags (modo > 6)
    const tagFilterInp  = panel.querySelector('#w-tag-filter-inp');
    const tagFilterDrop = panel.querySelector('#w-tag-filter-dropdown');
    const tagFilterWrap = panel.querySelector('#w-tag-filter-wrap');

    if (tagFilterInp && tagFilterDrop) {
      const { C, esc } = WSPP;

      function renderTagFilterDrop(q) {
        const query = (q || '').trim().toLowerCase();
        const items = S.availableTags
          .map(t => typeof t === 'object' ? t : { name: t, color: C.gold })
          .filter(t => !query || t.name.toLowerCase().includes(query));

        let html = `<div class="w-tag-dropdown-item" data-filter-tag="" style="font-style:italic;color:${C.textMuted}">
            <span class="t-dot" style="background:${C.textMuted}"></span>
            <span class="t-name">Todos</span>
          </div>`;
        html += items.slice(0, 12).map(t => `
          <div class="w-tag-dropdown-item" data-filter-tag="${esc(t.name)}" data-color="${esc(t.color || C.gold)}">
            <span class="t-dot" style="background:${t.color || C.gold}"></span>
            <span class="t-name">${esc(t.name)}</span>
          </div>`).join('');

        if (!html) html = `<div style="padding:10px;font-size:11px;color:${C.textMuted};text-align:center">Sin etiquetas</div>`;
        tagFilterDrop.innerHTML = html;

        tagFilterDrop.querySelectorAll('[data-filter-tag]').forEach(item => {
          item.addEventListener('mousedown', async (e) => {
            e.preventDefault();
            S.tagFilter     = item.dataset.filterTag;
            tagFilterInp.value = S.tagFilter;
            tagFilterInp.style.borderColor = item.dataset.color || '';
            tagFilterDrop.style.display = 'none';
            S.page = 0; S.leads = [];
            await loadLeads(); render();
          });
        });
      }

      tagFilterInp.addEventListener('focus', () => {
        tagFilterDrop.style.display = 'block';
        renderTagFilterDrop(tagFilterInp.value);
      });
      tagFilterInp.addEventListener('input', () => renderTagFilterDrop(tagFilterInp.value));
      tagFilterInp.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { tagFilterDrop.style.display = 'none'; tagFilterInp.blur(); }
      });
      document.addEventListener('click', function handler(e) {
        if (!tagFilterWrap?.contains(e.target)) {
          tagFilterDrop.style.display = 'none';
          document.removeEventListener('click', handler);
        }
      });

      panel.querySelector('#w-tag-filter-clear')?.addEventListener('click', async () => {
        S.tagFilter = ''; S.page = 0; S.leads = [];
        await loadLeads(); render();
      });
    }

    panel.querySelector('#w-list')?.addEventListener('click', handleListClick);
  };
})();
