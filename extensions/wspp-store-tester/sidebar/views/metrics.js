// sidebar/views/metrics.js — Vista de métricas y estadísticas
// Depende de: constants.js, store.js, ui.js, utils.js
// Expone: WSPP.renderMetrics, WSPP.phoneCard, WSPP.rankingSection
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  /** Genera el HTML de una tarjeta de celular con sus estadísticas */
  WSPP.phoneCard = function phoneCard(p) {
    const { S, C, esc, fmtPhone, WA_PHONE_ALIASES } = WSPP;
    const isMe      = S.waNumber && p.wa_number === S.waNumber;
    const contacted = p.hablados + p.respondieron;
    const pct       = p.total_interactions > 0 ? Math.round((contacted / p.total_interactions) * 100) : 0;
    const alias     = WA_PHONE_ALIASES?.[p.wa_number];
    return `
      <div class="w-phone-card ${isMe ? 'is-me' : ''}">
        <div class="w-phone-icon">📱</div>
        <div class="w-phone-info">
          <div class="w-phone-num">
            ${alias ? `<span style="font-family:inherit;font-size:13px;font-weight:800;color:${C.text}">${esc(alias)}</span>` : ''}
            <span style="font-size:10px;color:${C.textMuted};font-family:'SF Mono','Fira Code',monospace;font-weight:400">${esc(fmtPhone(p.wa_number))}</span>
            ${isMe ? '<span class="w-phone-me-badge">Este celular</span>' : ''}
          </div>
          <div class="w-phone-stats">
            <div class="w-phone-stat"><span class="w-phone-stat-val orange">${p.hablados}</span><span class="w-phone-stat-lbl">Hablados</span></div>
            <div class="w-phone-stat"><span class="w-phone-stat-val green">${p.respondieron}</span><span class="w-phone-stat-lbl">Respond.</span></div>
            <div class="w-phone-stat"><span class="w-phone-stat-val red">${p.archivados}</span><span class="w-phone-stat-lbl">Archiv.</span></div>
            <div class="w-phone-stat"><span class="w-phone-stat-val">${pct}%</span><span class="w-phone-stat-lbl">Contac.</span></div>
          </div>
          <div class="w-phone-bar"><div class="w-phone-bar-fill" style="width:${pct}%"></div></div>
        </div>
      </div>`;
  };

  /**
   * Genera las filas del ranking de agentes digitales (brigadistas).
   * Sin título — el título lo pone renderMetrics.
   * Ordena por hablados+respondieron desc.
   * Barra relativa al líder.
   * Postgres devuelve los números como strings → parseInt().
   */
  WSPP.rankingSection = function rankingSection() {
    const { S, C, esc } = WSPP;
    const raw = S.brigadistaMetrics || [];
    if (raw.length === 0) return '';

    // Normalise numbers (Postgres returns them as strings)
    const list = raw.map(b => ({
      ...b,
      total_captures: parseInt(b.total_captures,  10) || 0,
      nuevos:         parseInt(b.nuevos,          10) || 0,
      hablados:       parseInt(b.hablados,         10) || 0,
      respondieron:   parseInt(b.respondieron,     10) || 0,
      archivados:     parseInt(b.archivados,        10) || 0,
    }));

    // Sort by hablados + respondieron desc
    list.sort((a, b) => (b.hablados + b.respondieron) - (a.hablados + a.respondieron));

    const maxScore = Math.max(...list.map(b => b.hablados + b.respondieron), 1);
    const myId     = S.user?.id;

    const posClass = (i) => i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
    const posLabel = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);

    return list.map((b, i) => {
      const isMe   = myId && b.brigadista_id === myId;
      const score  = b.hablados + b.respondieron;
      const barPct = Math.round((score / maxScore) * 100);
      const displayName = esc(b.full_name || b.email?.split('@')[0] || 'Operador');
      return `
        <div class="w-rank-row ${isMe ? 'is-me' : ''}">
          <div class="w-rank-pos ${posClass(i)}">${posLabel(i)}</div>
          <div class="w-rank-info">
            <div class="w-rank-name">
              ${displayName}
              ${isMe ? '<span class="w-rank-me-badge">Tú</span>' : ''}
            </div>
            <div class="w-rank-sub">
              <span><b style="color:${C.orange}">${b.hablados}</b> habl.</span>
              <span><b style="color:${C.green}">${b.respondieron}</b> resp.</span>
              <span style="color:${C.textMuted}">${b.archivados} arch.</span>
            </div>
            <div class="w-rank-bar-wrap"><div class="w-rank-bar-fill" style="width:${barPct}%"></div></div>
          </div>
          <div class="w-rank-total">
            <div class="w-rank-total-val">${b.total_captures}</div>
            <div class="w-rank-total-lbl">capturas</div>
          </div>
        </div>`;
    }).join('');
  };

  /** Genera el HTML de la sección "Por Celular" */
  function phonesSection(phones, C, phoneCard) {
    const header = `
      <div style="border-top:1px solid ${C.border};margin:14px 0 10px"></div>
      <div class="w-ranking-title">
        Por celular
        <span>${phones.length} dispositivo${phones.length !== 1 ? 's' : ''}</span>
      </div>`;

    if (phones.length === 0) {
      return header + `<div class="w-rank-empty">Sin datos aún.<br>Se registran al usar el botón WA.</div>`;
    }

    return header + phones.map(p => phoneCard(p)).join('');
  }

  /**
   * Calcula las métricas de conversaciones en tiempo real desde S.messages y S.pendingMap.
   *
   * Definiciones:
   *   pendientes    = contactos que nos escribieron y NO hemos respondido (pendingMap)
   *   activas       = conversaciones con al menos 1 msg enviado Y 1 recibido en las últimas 24h
   *   respondidas   = contactos únicos a los que enviamos al menos 1 msg (saliente) hoy
   *   inbound_hoy   = contactos únicos que nos escribieron hoy
   *   total_wa      = contactos WA conocidos (waContacts)
   */
  function calcConvMetrics() {
    const { S } = WSPP;
    const now24  = Math.floor(Date.now() / 1000) - 86400;
    const todayStart = (() => {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      return Math.floor(d.getTime() / 1000);
    })();

    // Índices por teléfono para las últimas 24h
    const sentTo     = new Set(); // phones a los que mandamos algo (24h)
    const receivedFrom = new Set(); // phones que nos escribieron (24h)
    const sentToday  = new Set(); // phones a los que mandamos algo hoy
    const rcvdToday  = new Set(); // phones que nos escribieron hoy

    for (const m of S.messages) {
      const ts = m.timestamp || 0;
      const p  = m.phone || '';
      if (!p) continue;
      if (ts >= now24) {
        if (m.fromMe) sentTo.add(p);
        else receivedFrom.add(p);
      }
      if (ts >= todayStart) {
        if (m.fromMe) sentToday.add(p);
        else rcvdToday.add(p);
      }
    }

    // Activas = tienen mensajes en ambas direcciones en las últimas 24h
    const activas = [...sentTo].filter(p => receivedFrom.has(p)).length;

    // Respondidas hoy = enviamos algo hoy
    const respondidaHoy = sentToday.size;

    // Recibidas hoy = nos escribieron hoy
    const recibidasHoy = rcvdToday.size;

    // Pendientes = pendingMap
    const pendientes = Object.keys(S.pendingMap).length;

    // Total contactos en WA (conocidos por la extensión)
    const totalWA = S.waContacts.length;

    // Sin responder HOY (nos escribieron hoy y no les hemos mandado nada hoy)
    const sinRespHoy = [...rcvdToday].filter(p => !sentToday.has(p)).length;

    return { pendientes, activas, respondidaHoy, recibidasHoy, sinRespHoy, totalWA };
  }

  /** Renderiza la vista de métricas */
  WSPP.renderMetrics = function renderMetrics() {
    const { S, C, esc, fmtPhone, navBar, sseBar, phoneCard, rankingSection, wireNav } = WSPP;
    const panel  = document.getElementById('wspp-crm-panel');
    const st     = S.stats;
    const phones = S.extMetrics?.phones || [];
    const totalContacted = (st?.hablados || 0) + (st?.respondieron || 0);
    const contactPct     = st?.total ? Math.round((totalContacted / st.total) * 100) : 0;
    const responsePct    = totalContacted > 0 ? Math.round(((st?.respondieron || 0) / totalContacted) * 100) : 0;

    const cv = calcConvMetrics();
    const pendingList = Object.values(S.pendingMap).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    panel.innerHTML = `
      <div class="w-hdr">
        <div style="flex:1">
          <div class="w-hdr-logo">GOBERNA</div>
          <div class="w-hdr-sub">${esc(S.campaigns.find(c => c.id === S.activeCampaignId)?.name || '')}</div>
        </div>
      </div>
      ${navBar()} ${sseBar()}
      <div class="w-metrics">

        ${!st ? '<div class="w-spin-wrap"><div class="w-spin"></div></div>' : `

        <!-- ── Banner global (CRM) ── -->
        <div class="w-global-banner">
          <div class="w-global-title">CRM — toda la campaña</div>
          <div class="w-global-nums">
            <div class="w-global-item"><span class="w-global-val gold">${st.total || 0}</span><span class="w-global-lbl">Total</span></div>
            <div class="w-global-item"><span class="w-global-val orange">${st.hablados || 0}</span><span class="w-global-lbl">Hablados</span></div>
            <div class="w-global-item"><span class="w-global-val green">${st.respondieron || 0}</span><span class="w-global-lbl">Respond.</span></div>
            <div class="w-global-item"><span class="w-global-val">${contactPct}%</span><span class="w-global-lbl">Contactado</span></div>
          </div>
          <div class="w-progress"><div class="w-progress-fill" style="width:${contactPct}%"></div></div>
          <div style="font-size:10px;color:${C.textSub};margin-top:5px;display:flex;justify-content:space-between">
            <span>Tasa respuesta <strong style="color:${C.green}">${responsePct}%</strong></span>
            <span>${st.archivados || 0} archivados</span>
          </div>
        </div>

        <!-- ── Conversaciones WhatsApp (tiempo real) ── -->
        <div style="border-top:1px solid ${C.border};margin:14px 0 10px"></div>
        <div class="w-ranking-title">
          Conversaciones WA
          <span class="w-conv-live-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${C.green};box-shadow:0 0 5px ${C.green}99;animation:wspp-pulse 2s ease infinite;margin-left:4px;vertical-align:middle"></span>
        </div>

        <div class="w-conv-grid">

          <div class="w-conv-card ${cv.pendientes > 0 ? 'alert' : 'ok'}">
            <div class="w-conv-val ${cv.pendientes > 0 ? 'orange' : 'muted'}">${cv.pendientes}</div>
            <div class="w-conv-lbl">Sin responder</div>
            <div class="w-conv-hint">te escribieron, esperan</div>
          </div>

          <div class="w-conv-card">
            <div class="w-conv-val green">${cv.activas}</div>
            <div class="w-conv-lbl">Activas (24h)</div>
            <div class="w-conv-hint">intercambio mutuo</div>
          </div>

          <div class="w-conv-card">
            <div class="w-conv-val gold">${cv.respondidaHoy}</div>
            <div class="w-conv-lbl">Respondiste hoy</div>
            <div class="w-conv-hint">contactos únicos</div>
          </div>

          <div class="w-conv-card">
            <div class="w-conv-val">${cv.recibidasHoy}</div>
            <div class="w-conv-lbl">Te escribieron hoy</div>
            <div class="w-conv-hint">contactos únicos</div>
          </div>

        </div>

        ${cv.recibidasHoy > 0 ? (() => {
          const rPct = Math.round((cv.respondidaHoy / cv.recibidasHoy) * 100);
          return `
            <div class="w-conv-bar-wrap">
              <div class="w-conv-bar-labels">
                <span>Tasa respuesta hoy</span>
                <span style="font-weight:700;color:${rPct >= 80 ? C.green : rPct >= 50 ? C.orange : C.red}">${rPct}%</span>
              </div>
              <div class="w-progress" style="margin-top:4px">
                <div class="w-progress-fill" style="width:${rPct}%;background:${rPct >= 80 ? C.green : rPct >= 50 ? C.orange : C.red}"></div>
              </div>
            </div>`;
        })() : ''}

        ${cv.pendientes > 0 ? `
          <div class="w-conv-pending-wrap">
            <div class="w-conv-pending-hdr">
              <span>⚠ Esperando respuesta</span>
              <button class="w-conv-ver-btn" id="w-ver-pendientes">Ver todos →</button>
            </div>
            ${pendingList.slice(0, 3).map(p => {
              const name = p.leadName || p.phone || '?';
              const secs = Math.floor(Date.now() / 1000) - (p.timestamp || 0);
              const ago  = secs < 60 ? 'ahora' : secs < 3600 ? `${Math.floor(secs/60)}m` : `${Math.floor(secs/3600)}h`;
              const body = (p.body || '').slice(0, 42) || '(sin texto)';
              return `
                <div class="w-conv-pending-row">
                  <div class="w-conv-pending-dot"></div>
                  <div class="w-conv-pending-name">${esc(name)}</div>
                  <div class="w-conv-pending-ago">${ago}</div>
                  <div class="w-conv-pending-body">${esc(body)}</div>
                </div>`;
            }).join('')}
            ${cv.pendientes > 3 ? `<div class="w-conv-pending-more">+${cv.pendientes - 3} más sin responder</div>` : ''}
          </div>` : ''}

        ${cv.totalWA > 0 ? `
          <div class="w-conv-total-wa">
            <span>Contactos en WA</span>
            <span style="font-weight:700;color:${C.text}">${cv.totalWA.toLocaleString()}</span>
          </div>` : ''}

        <!-- ── Esta sesión ── -->
        <div style="border-top:1px solid ${C.border};margin:14px 0 10px"></div>
        <div class="w-card">
          <div class="w-card-title">Esta sesión</div>
          <div class="w-card-grid">
            <div class="w-card-item"><span class="w-card-val orange">${S.wasSent}</span><span class="w-card-lbl">WA abiertos</span></div>
            <div class="w-card-item"><span class="w-card-val">${S.messages.filter(m => !m.fromMe).length}</span><span class="w-card-lbl">Msgs recibidos</span></div>
            <div class="w-card-item"><span class="w-card-val">${S.messages.filter(m => m.fromMe).length}</span><span class="w-card-lbl">Msgs enviados</span></div>
            <div class="w-card-item"><span class="w-card-val gold" style="font-size:11px">${S.waNumber ? fmtPhone(S.waNumber) : '—'}</span><span class="w-card-lbl">Mi número</span></div>
          </div>
        </div>

        <!-- ── Por Celular ── -->
        ${phonesSection(phones, C, phoneCard)}

        `}
      </div>`;

    wireNav();

    // Botón "Ver todos" de pendientes → navegar a pestaña Mensajes
    panel.querySelector('#w-ver-pendientes')?.addEventListener('click', () => {
      S.view = 'messages';
      WSPP.msgSubTab = 'pending';
      WSPP.render();
    });
  };
})();
