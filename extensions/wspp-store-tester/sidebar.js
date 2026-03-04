// sidebar.js — Entry point del CRM Goberna en WhatsApp Web
// world: ISOLATED — corre dentro de web.whatsapp.com
//
// ARQUITECTURA MODULAR (cargada en orden por manifest.json):
//   sidebar/constants.js  → WSPP.C, WSPP.API_BASE, WSPP.PANEL_WIDTH, WSPP.TAG_COLORS
//   sidebar/store.js      → WSPP.S, WSPP.storage
//   sidebar/utils.js      → WSPP.esc, WSPP.cap, WSPP.fmtDate, WSPP.fmtPhone, WSPP.drow, WSPP.showErr
//   sidebar/styles.js     → WSPP.CSS, WSPP.injectStyles()
//   sidebar/api.js        → WSPP.apiFetch, WSPP.loadLeads, WSPP.loadTags, WSPP.loadStats, WSPP.loadExtMetrics
//   sidebar/sse.js        → WSPP.startSSE, WSPP.updateSseBar, WSPP.sseStatus
//   sidebar/ui.js         → WSPP.navBar, WSPP.wireNav, WSPP.campBar, WSPP.sseBar, WSPP.updateMsgBadge
//   sidebar/chat.js       → WSPP.openChat, WSPP.watchComposerForSend, WSPP.composerWatchers
//   sidebar/views/login.js   → WSPP.renderLogin, WSPP.doLogin, WSPP.doLogout
//   sidebar/views/leads.js   → WSPP.renderLeads, WSPP.renderList, WSPP.buildLeadItems, etc.
//   sidebar/views/detail.js  → WSPP.renderDetail, WSPP.buildTagEditor, WSPP.doStatusAction, etc.
//   sidebar/views/metrics.js → WSPP.renderMetrics, WSPP.phoneCard
//   sidebar/views/messages.js → WSPP.renderMessages, WSPP.buildPendingList, WSPP.buildAllMessages
//   sidebar.js (este)    → bootstrapping, render(), WA message listener, init

(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    if (document.getElementById('wspp-crm-panel')) return;

    const { S, storage, PANEL_WIDTH, injectStyles, startSSE, loadLeads, loadTags, loadStats,
            loadExtMetrics, loadWaContacts, renderLogin, renderLeads, renderDetail, renderMetrics,
            renderMessages, renderBlocked, renderList, updateMsgBadge, doLogout, composerWatchers } = WSPP;

    // ── Inyectar estilos ────────────────────────────────────────
    injectStyles();

    // ── Toggle button ───────────────────────────────────────────
    const toggleEl = document.createElement('button');
    toggleEl.id = 'wspp-toggle';
    toggleEl.setAttribute('aria-label', 'Goberna CRM');
    toggleEl.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="none">
      <path d="M8 2L2 7L8 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
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

    const ICON_OPEN  = `<svg width="10" height="14" viewBox="0 0 10 14" fill="none"><path d="M2 2L8 7L2 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    const ICON_CLOSE = `<svg width="10" height="14" viewBox="0 0 10 14" fill="none"><path d="M8 2L2 7L8 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

    toggleEl.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panel.classList.toggle('wspp-hidden', !panelOpen);
      toggleEl.innerHTML = panelOpen ? ICON_OPEN : ICON_CLOSE;
      pushWA(panelOpen);
    });

    // ── Router de vistas ────────────────────────────────────────
    WSPP.render = function render() {
      if (S.view === 'blocked')          renderBlocked();
      else if (S.view === 'login')       renderLogin();
      else if (S.view === 'leads')       renderLeads();
      else if (S.view === 'lead-detail') renderDetail();
      else if (S.view === 'metrics')     renderMetrics();
      else if (S.view === 'messages')    renderMessages();
    };

    // ── Listener de mensajes de WhatsApp (inject.js → sidebar) ──
    window.addEventListener('message', e => {
      const { type, payload } = e.data || {};

      if (type === 'WSPP_NEW_MSG') {
        const msg = payload;
        if (!msg) return;

        // Añadir al log de mensajes
        S.messages.push({ ...msg, seen: S.view === 'messages', fromMe: msg.fromMe || false });
        if (S.messages.length > 200) S.messages.splice(0, S.messages.length - 200);

        // msg.phone = número limpio del contacto (sin @, sin sufijo), ya calculado en inject.js
        const contactPhone = msg.phone || String(msg.from || '').replace(/@.+/, '');
        const { normPhone } = WSPP;

        if (!msg.fromMe) {
          // Entrante: añadir al mapa de pendientes hasta que respondamos
          const np = normPhone(contactPhone);
          if (np) {
            const matchLead = S.leads.find(l => {
              const t = normPhone(l.telefono || l.data?.telefono || '');
              return t && t === np;
            });
            // Nombre: lead del CRM > nombre del chat (msg.name de lidMap) > número
            const contactName = matchLead
              ? (matchLead.nombre || matchLead.data?.nombre || np)
              : (msg.name || np);
            S.pendingMap[np] = {
              from:      np,
              phone:     np,
              body:      msg.body || '',
              timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
              leadId:    matchLead?.id || null,
              leadName:  contactName,
              _realtime: true, // capturado en vivo — no borrar en re-scans
            };
            updateMsgBadge();

            // Notificar al backend: puede auto-transicionar hablado→respondieron
            // y emitir SSE a los otros operadores. Fire-and-forget: no bloquea UI.
            if (S.token && S.activeCampaignId) {
              WSPP.apiFetch('/api/cms/extension-event', {
                method: 'POST',
                body: JSON.stringify({
                  type:        'message_received',
                  phone:       np,
                  preview:     (msg.body || '').slice(0, 200),
                  detected_at: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
                }),
              }).catch(err => {
                // Non-fatal: no interrumpir flujo del operador
                console.warn('[WSPP CRM] extension-event error:', err?.message || err);
              });
            }
          }
        } else {
          // Saliente: respondimos — sacar del mapa de pendientes
          const np2 = normPhone(contactPhone);
          if (np2 && S.pendingMap[np2]) {
            delete S.pendingMap[np2];
            updateMsgBadge();
          }
        }

        if (S.view === 'messages') {
          renderMessages();
        } else if (S.view === 'metrics') {
          renderMetrics(); // actualizar contadores de conversaciones en tiempo real
        } else {
          updateMsgBadge();
        }
        return;
      }

      // ── WSPP_HISTORY: scan autoritativo de pendientes desde WA ──────
      // inject.js escanea ChatCollection completo y emite esta lista.
      // Es la fuente de verdad: reemplazamos el pendingMap con ella
      // (preservando entradas que hayan llegado en tiempo real en esta sesión
      // con timestamp MÁS RECIENTE que el scan, para no perder nada).
      if (type === 'WSPP_HISTORY' && Array.isArray(payload)) {
        const { normPhone } = WSPP;
        // Construir nuevo mapa desde el scan
        const newMap = {};
        for (const msg of payload) {
          const normP = normPhone(msg.phone || '');
          if (!normP) continue;

          const matchLead = S.leads.find(l => {
            const p11 = normPhone(l.telefono || l.data?.telefono || '');
            return p11 && p11 === normP;
          });
          const contactName = matchLead
            ? (matchLead.nombre || matchLead.data?.nombre || normP)
            : (msg.name || normP);

          newMap[normP] = {
            from:      normP,
            phone:     normP,
            body:      msg.body || '',
            timestamp: msg.timestamp || 0,
            leadId:    matchLead?.id || null,
            leadName:  contactName,
            unread:    msg.unread || 0,
          };
        }

        // Preservar entradas en tiempo real que sean MÁS RECIENTES que el scan
        // (llegaron mientras el scan estaba corriendo)
        for (const [k, v] of Object.entries(S.pendingMap)) {
          if (!newMap[k] && v._realtime) {
            newMap[k] = v; // fue capturado en esta sesión, no tirarlo
          }
        }

        const before = Object.keys(S.pendingMap).length;
        S.pendingMap = newMap;
        const after  = Object.keys(S.pendingMap).length;

        console.log(`[WSPP CRM] pendingMap actualizado: ${before} → ${after}`);
        updateMsgBadge();
        if (S.view === 'messages') WSPP.render();
        if (S.view === 'metrics')  WSPP.render();
        return;
      }

      if (type === 'WSPP_ME' && payload) {
        const rawId  = payload.wid || payload.id || '';
        const digits = String(rawId).replace(/[^0-9]/g, '');
        if (digits.length >= 9) {
          S.waNumber = digits;
          storage.set({ wspp_wa_number: digits });

          const isAuthorized = WSPP.CAMPAIGN_LOCK_NUMBERS.has(digits);

          if (!isAuthorized) {
            // Número no autorizado: bloquear independientemente del estado actual
            S.view = 'blocked';
            WSPP.render();
          } else {
            // Número autorizado: forzar campaña César Vásquez
            S.activeCampaignId = WSPP.CAMPAIGN_LOCK_ID;
            storage.set({ wspp_active_campaign: WSPP.CAMPAIGN_LOCK_ID });
            // Si estaba en 'blocked' (ej. número detectado tarde), desbloquear
            if (S.view === 'blocked') {
              S.view = S.token ? 'leads' : 'login';
              WSPP.render();
            }
          }
        }
      }
    });

    // ── Helpers de normalización ──────────────────────────────────
    function normPhone(raw) {
      const d = String(raw || '').replace(/\D/g, '');
      return d.length === 9 ? '51' + d : d;
    }

    // ── Scan de WA: número real + etiquetas + mapa phone→labels ──
    // Ejecuta inject.js WSPP_SCAN y aprovecha el resultado completo.
    // Retorna el número de teléfono o null si WA aún no está listo.
    function doWaScan() {
      return new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), 4000);
        chrome.runtime.sendMessage({ action: 'scan' }, result => {
          clearTimeout(timer);
          if (chrome.runtime.lastError || !result) return resolve(null);

          // ── Número propio ──────────────────────────────────────
          const wid    = result.me?.wid || '';
          const digits = String(wid).replace(/[^0-9]/g, '');
          const phone  = digits.length >= 9 ? digits : null;

          // ── Etiquetas WA disponibles ──────────────────────────
          if (Array.isArray(result.labels) && result.labels.length > 0) {
            S.waLabels = result.labels;
            storage.set({ wspp_wa_labels: JSON.stringify(result.labels) });
          }

          // ── Mapa phone→labels (de los chats con waLabels) ────
          // Solo chats individuales con etiquetas asignadas.
          if (Array.isArray(result.chats)) {
            const map = {};
            for (const chat of result.chats) {
              if (!Array.isArray(chat.waLabels) || !chat.waLabels.length) continue;
              // Solo chats individuales (no grupos/broadcast)
              const chatId = chat.id || '';
              if (chatId.includes('@g.us') || chatId.includes('@broadcast')) continue;
              // Usar chat.phone (ya resuelto desde lidMap en inject.js) si está disponible,
              // si no, extraer del chatId (chats @c.us legacy)
              const rawNum = chat.phone || chatId.replace(/@.+/, '');
              const p = normPhone(rawNum);
              if (p) map[p] = chat.waLabels;
            }
            if (Object.keys(map).length > 0) {
              S.waPhoneLabelMap = map;
              storage.set({ wspp_wa_phone_label_map: JSON.stringify(map) });
            }
          }

          resolve(phone);
        });
      });
    }

    // ── Init: restaurar sesión desde storage ────────────────────
    storage.get([
      'wspp_token', 'wspp_user', 'wspp_campaigns', 'wspp_wa_number', 'wspp_active_campaign',
      'wspp_wa_labels', 'wspp_wa_phone_label_map', 'wspp_wa_contacts', 'wspp_wa_contacts_ts',
    ]).then(async saved => {

      // Restaurar etiquetas y mapa de storage (disponibles offline antes del scan)
      if (saved.wspp_wa_labels) {
        try { S.waLabels = JSON.parse(saved.wspp_wa_labels); } catch(_) {}
      }
      if (saved.wspp_wa_phone_label_map) {
        try { S.waPhoneLabelMap = JSON.parse(saved.wspp_wa_phone_label_map); } catch(_) {}
      }
      // Restaurar contactos WA (si tienen menos de 24h)
      if (saved.wspp_wa_contacts && saved.wspp_wa_contacts_ts) {
        const age = Date.now() - (saved.wspp_wa_contacts_ts || 0);
        if (age < 24 * 3600 * 1000) {
          try {
            S.waContacts       = JSON.parse(saved.wspp_wa_contacts);
            S.waContactsLoaded = true;
          } catch(_) {}
        }
      }

      // Scan en vivo para número real + etiquetas frescas
      const liveNumber = await doWaScan();
      if (liveNumber) {
        S.waNumber = liveNumber;
        storage.set({ wspp_wa_number: liveNumber });
      } else if (saved.wspp_wa_number) {
        S.waNumber = saved.wspp_wa_number;
      }

      // Verificar autorización con el número real
      if (S.waNumber && !WSPP.CAMPAIGN_LOCK_NUMBERS.has(S.waNumber)) {
        S.view = 'blocked';
        WSPP.render();
        return;
      }

      if (saved.wspp_token) {
        S.token     = saved.wspp_token;
        S.user      = JSON.parse(saved.wspp_user     || 'null');
        S.campaigns = JSON.parse(saved.wspp_campaigns || '[]');
        S.view      = 'leads';

        // Número autorizado → siempre forzar a César Vásquez
        S.activeCampaignId = WSPP.CAMPAIGN_LOCK_ID;
        storage.set({ wspp_active_campaign: WSPP.CAMPAIGN_LOCK_ID });

        if (S.activeCampaignId) {
          await Promise.all([loadLeads(), loadTags(), loadStats(), loadExtMetrics()]);
          startSSE();
          // Registrar sesión de dispositivo en el backend + mantener heartbeat
          startDeviceHeartbeat();
          // Cargar contactos WA en background (no bloquea el render)
          loadWaContacts().then(() => {
            // Refrescar lista si hay filtro WA activo o para mostrar etiquetas en cada lead
            if (S.view === 'leads') WSPP.renderList();
          });
        }
      }
      WSPP.render();
    });

    // ── Device heartbeat ─────────────────────────────────────────────
    // Notifica al backend qué operador está usando este número de WA.
    // Se llama al iniciar sesión y cada 5 minutos.
    // El backend usa esto para mostrar "Celular N → operador X" en tiempo real.
    let heartbeatTimer = null;
    function startDeviceHeartbeat() {
      // Limpiar timer previo si existe
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      sendDeviceHeartbeat();
      heartbeatTimer = setInterval(sendDeviceHeartbeat, 5 * 60 * 1000); // cada 5 min
    }

    function sendDeviceHeartbeat() {
      const { S } = WSPP;
      if (!S.token || !S.activeCampaignId || !S.waNumber) return;
      WSPP.apiFetch('/api/cms/device-heartbeat', {
        method: 'POST',
        body: JSON.stringify({ wa_number: S.waNumber }),
      }).catch(err => {
        // Non-fatal: no interrumpir al operador
        console.warn('[WSPP CRM] device-heartbeat error:', err?.message || err);
      });
    }

    // Exponer API pública para debug en consola
    window.__WSPP_CRM__ = { S, render: WSPP.render, loadLeads, startSSE, sendDeviceHeartbeat };
  });
})();
