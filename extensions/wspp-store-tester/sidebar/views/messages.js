// sidebar/views/messages.js — Vista de mensajes y no contestados
// Depende de: constants.js, store.js, ui.js, utils.js, chat.js
// Expone: WSPP.renderMessages, WSPP.buildPendingList, WSPP.buildAllMessages
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  WSPP.msgSubTab = 'pending'; // 'pending' | 'all'

  // ── Helpers ────────────────────────────────────────────────────

  /** Formatea timestamp relativo: "hace 5m", "hace 2h", etc. */
  function relativeTime(ts) {
    const secs = Math.floor((Date.now() / 1000) - ts);
    if (secs < 60)    return 'ahora';
    if (secs < 3600)  return `hace ${Math.floor(secs / 60)}m`;
    if (secs < 86400) return `hace ${Math.floor(secs / 3600)}h`;
    return `hace ${Math.floor(secs / 86400)}d`;
  }

  /** Preview truncado del mensaje */
  function preview(body, max = 60) {
    const t = (body || '').trim();
    return t.length > max ? t.slice(0, max) + '…' : t || '(sin texto)';
  }

  // ── Pendientes (no contestados) ────────────────────────────────

  /**
   * "No contestados" = contactos a los que hablamos (abrimos chat)
   * pero que nos escribieron de vuelta y aún no respondimos.
   * Viven en S.pendingMap: phone → { body, timestamp, leadId, leadName, from }
   */
  WSPP.buildPendingList = function buildPendingList(pendingList) {
    const { C, esc, fmtPhone } = WSPP;

    if (!pendingList.length) {
      return `
        <div class="w-empty">
          <div class="w-empty-icon">✅</div>
          <div style="font-weight:700;font-size:13px">Todo respondido</div>
          <div style="font-size:11px;color:${C.textSub};margin-top:4px">
            Cuando un contacto te escriba aparecerá aquí
          </div>
        </div>`;
    }

    return pendingList.map(p => {
      const name       = p.leadName || p.from || 'Desconocido';
      const phone      = p.phone || p.from || '';
      const initLetter = name.charAt(0).toUpperCase();
      const ts         = p.timestamp || 0;
      const ago        = relativeTime(ts);
      const msg        = preview(p.body);
      const unread     = p.unread || 0;

      // Urgencia visual: rojo si lleva >1h sin responder
      const secs    = Math.floor(Date.now() / 1000) - ts;
      const isUrgent = secs > 3600;

      return `
        <div class="w-pending-card ${isUrgent ? 'urgent' : ''}" data-phone="${esc(phone)}">
          <div class="w-pending-av">${initLetter}</div>
          <div class="w-pending-info">
            <div class="w-pending-row1">
              <span class="w-pending-name">${esc(name)}</span>
              <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
                ${unread > 0
                  ? `<span class="w-unread-badge">${unread > 99 ? '99+' : unread}</span>`
                  : ''}
                <span class="w-pending-ago ${isUrgent ? 'urgent' : ''}">${ago}</span>
              </div>
            </div>
            <div class="w-pending-phone">${esc(fmtPhone(phone))}</div>
            <div class="w-pending-body">${esc(msg)}</div>
          </div>
          <div class="w-pending-actions">
            <button class="w-reply-btn" data-phone="${esc(phone)}" data-leadid="${esc(p.leadId || '')}" title="Abrir chat y responder">
              💬
            </button>
            ${p.leadId ? `
              <button class="w-view-lead-btn" data-leadid="${esc(p.leadId)}" title="Ver ficha del lead">
                👤
              </button>` : ''}
          </div>
        </div>`;
    }).join('');
  };

  // ── Log de todos los mensajes ──────────────────────────────────

  WSPP.buildAllMessages = function buildAllMessages() {
    const { S, C, esc } = WSPP;

    if (!S.messages.length) {
      return `
        <div class="w-empty">
          <div class="w-empty-icon">💬</div>
          <div style="font-size:13px;font-weight:700">Sin mensajes aún</div>
          <div style="font-size:11px;color:${C.textSub};margin-top:4px">
            Los mensajes de esta sesión aparecerán aquí
          </div>
        </div>`;
    }

    return [...S.messages].reverse().map(m => {
      // msg.phone = número limpio del contacto, calculado en inject.js
      // Fallback: para entrantes 'from', para salientes 'to'
      const phone  = m.phone
        || (m.fromMe
          ? String(m.to   || m.chatId || '').replace(/@.+/, '')
          : String(m.from || '').replace(/@.+/, ''));
      // Intentar encontrar el nombre del lead por número
      const digits = phone.replace(/\D/g, '');
      const lead   = digits ? S.leads.find(l => {
        const t = ((l.telefono || l.data?.telefono || '')).replace(/\D/g, '');
        return t && (digits.endsWith(t) || t.endsWith(digits));
      }) : null;
      // Nombre: lead del CRM > nombre del chat (m.name de lidMap) > número > fallback
      const name    = lead
        ? (lead.nombre || lead.data?.nombre || phone)
        : (m.name || phone || 'Desconocido');
      const initLet = name.charAt(0).toUpperCase();
      const ago     = relativeTime(m.timestamp || 0);
      const msg     = preview(m.body, 120);

      return `
        <div class="w-msg-item ${m.fromMe ? 'outgoing' : 'incoming'}">
          <div class="w-msg-av ${m.fromMe ? 'me' : ''}">${m.fromMe ? 'Yo' : initLet}</div>
          <div class="w-msg-bubble">
            <div class="w-msg-meta">
              <span class="w-msg-sender">${m.fromMe ? 'Tú' : esc(name)}</span>
              <span class="w-msg-badge ${m.fromMe ? 'out' : 'in'}">${m.fromMe ? '↑ Enviado' : '↓ Recibido'}</span>
              <span class="w-msg-ago">${ago}</span>
            </div>
            <div class="w-msg-body">${esc(msg)}</div>
            ${!m.fromMe && lead ? `
              <button class="w-msg-lead-btn" data-leadid="${esc(lead.id)}" type="button">Ver ficha →</button>` : ''}
          </div>
        </div>`;
    }).join('');
  };

  // ── Render ─────────────────────────────────────────────────────

  WSPP.renderMessages = function renderMessages() {
    const { S, C, esc, navBar, sseBar, buildPendingList, buildAllMessages, openChat, render, wireNav } = WSPP;
    const panel       = document.getElementById('wspp-crm-panel');
    // Ordenar: primero los que tienen más no-leídos, luego por timestamp desc
    const pendingList = Object.values(S.pendingMap).sort((a, b) => {
      const ua = a.unread || 0, ub = b.unread || 0;
      if (ub !== ua) return ub - ua;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
    const pending     = pendingList.length;
    const total       = S.messages.length;

    panel.innerHTML = `
      <div class="w-hdr">
        <div style="flex:1">
          <div class="w-hdr-logo">GOBERNA</div>
          <div class="w-hdr-sub" style="color:${pending > 0 ? C.orange : C.textSub}">
            ${pending > 0
              ? `⚠ ${pending} sin responder`
              : 'Bandeja al día ✓'}
          </div>
        </div>
      </div>
      ${navBar()}
      ${sseBar()}
      <div class="w-msg-subtabs">
        <button class="w-msg-stab ${WSPP.msgSubTab === 'pending' ? 'on' : ''}" data-stab="pending">
          No contestados
          ${pending > 0
            ? `<span class="w-pending-indicator">${pending > 99 ? '99+' : pending}</span>`
            : ''}
        </button>
        <button class="w-msg-stab ${WSPP.msgSubTab === 'all' ? 'on' : ''}" data-stab="all">
          Log
          ${total > 0 ? `<span class="w-badge">${total > 99 ? '99+' : total}</span>` : ''}
        </button>
      </div>
      <div class="w-msgs" id="w-msgs">
        ${WSPP.msgSubTab === 'pending' ? buildPendingList(pendingList) : buildAllMessages()}
      </div>`;

    wireNav();

    panel.querySelectorAll('[data-stab]').forEach(btn => {
      btn.addEventListener('click', () => {
        WSPP.msgSubTab = btn.dataset.stab;
        if (WSPP.msgSubTab === 'all') {
          S.messages.forEach(m => { m.seen = true; });
        }
        WSPP.renderMessages();
      });
    });

    // Botones de respuesta
    panel.querySelectorAll('.w-reply-btn[data-phone]').forEach(btn => {
      btn.addEventListener('click', () => {
        openChat(btn.dataset.phone, btn.dataset.leadid || null);
      });
    });

    // Botones "Ver lead" en pending cards
    panel.querySelectorAll('.w-view-lead-btn[data-leadid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const lead = S.leads.find(l => l.id === btn.dataset.leadid);
        if (lead) { S.activeLead = lead; S.view = 'lead-detail'; render(); }
      });
    });

    // Botones "Ver ficha" en mensajes del log
    panel.querySelectorAll('.w-msg-lead-btn[data-leadid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const lead = S.leads.find(l => l.id === btn.dataset.leadid);
        if (lead) { S.activeLead = lead; S.view = 'lead-detail'; render(); }
      });
    });
  };
})();
