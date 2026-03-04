// sidebar/sse.js — Conexión SSE con fetch+ReadableStream (Bearer header)
// Depende de: constants.js, store.js
// Expone: WSPP.startSSE, WSPP.updateSseBar, WSPP.sseStatus
//
// Usamos fetch() en lugar de EventSource porque EventSource no soporta
// headers custom. El backend solo acepta Bearer token (no query param).
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  WSPP.sseStatus = 'off'; // 'off' | 'live' | 'err'

  /** Actualiza visualmente todas las barras SSE del panel */
  WSPP.updateSseBar = function updateSseBar() {
    const labels = {
      off:  'Sin conexión en tiempo real',
      live: 'Tiempo real activo',
      err:  'Reconectando...',
    };
    const panel = document.getElementById('wspp-crm-panel');
    if (!panel) return;
    panel.querySelectorAll('.w-sse-bar').forEach(bar => {
      bar.innerHTML = `<div class="w-sse-dot ${WSPP.sseStatus}"></div><span>${labels[WSPP.sseStatus]}</span>`;
    });
  };

  /**
   * Parsea el stream SSE de texto plano en eventos {event, data}.
   * Acumula datos multi-línea y despacha al encontrar línea vacía.
   * Robusto a chunks cortados — el buffer externo garantiza que solo
   * recibimos bloques completos (separados por '\n\n').
   */
  function parseSseChunk(chunk, onEvent) {
    const lines = chunk.split('\n');
    let event   = '';
    let dataParts = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataParts.push(line.slice(5).trim());
      } else if (line === '') {
        // Línea vacía = fin del evento
        if (dataParts.length > 0) {
          const data = dataParts.join('\n');
          onEvent(event || 'message', data);
        }
        event = ''; dataParts = [];
      }
      // Ignorar líneas 'id:' y 'retry:' (no las usamos)
    }
    // Si quedó un evento sin línea vacía final, despacharlo igual
    if (dataParts.length > 0) {
      onEvent(event || 'message', dataParts.join('\n'));
    }
  }

  /**
   * Inicia la conexión SSE al stream CMS via fetch+ReadableStream.
   * Implementa backoff exponencial en error (2s → 4s → ... → 30s max).
   */
  WSPP.startSSE = function startSSE() {
    const { S, API_BASE } = WSPP;
    if (!S.token || !S.activeCampaignId) return;

    // Cancelar conexión previa
    if (S.sseAbort) { try { S.sseAbort.abort(); } catch (_) {} }
    S.sseAbort  = null;
    S.sseSource = null; // ya no usamos EventSource

    const abort = new AbortController();
    S.sseAbort  = abort;

    const url = `${API_BASE}/api/cms/stream?campaign_id=${encodeURIComponent(S.activeCampaignId)}`;

    fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${S.token}`,
        'x-campaign-id':  S.activeCampaignId,
        ...(S.waNumber ? { 'x-wa-number': S.waNumber } : {}),
        'Accept': 'text/event-stream',
      },
      signal: abort.signal,
    })
    .then(res => {
      if (!res.ok) {
        // 401 → intentar refresh antes de reconectar
        if (res.status === 401) {
          return WSPP.tryRefreshToken().then(ok => {
            if (ok) {
              S.sseBackoff = 2000;
              WSPP.startSSE();
            } else {
              WSPP.doLogout();
            }
          });
        }
        throw new Error(`SSE HTTP ${res.status}`);
      }

      // Conexión establecida
      WSPP.sseStatus = 'live';
      S.sseBackoff   = 2000;
      WSPP.updateSseBar();

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      function pump() {
        // Si ya se abortó (nueva llamada a startSSE), salir silenciosamente
        if (abort.signal.aborted) return;

        reader.read().then(({ done, value }) => {
          if (done || abort.signal.aborted) return;

          buffer += decoder.decode(value, { stream: true });

          // Procesar bloques completos (separados por '\n\n')
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop(); // el último puede estar incompleto
          for (const block of blocks) {
            if (!block.trim()) continue;
            parseSseChunk(block + '\n\n', handleSseEvent);
          }

          pump();
        }).catch(err => {
          if (abort.signal.aborted) return; // cierre limpio, no reconectar
          handleSseError(err);
        });
      }

      pump();
    })
    .catch(err => {
      if (abort.signal.aborted) return;
      handleSseError(err);
    });
  };

  /** Despacha un evento SSE al estado de la app */
  function handleSseEvent(event, rawData) {
    const { S } = WSPP;
    if (event === 'heartbeat') return; // keep-alive, ignorar

    let d;
    try { d = JSON.parse(rawData); } catch (_) { return; }

    if (event === 'contact.created') {
      // New lead ingested from external source (Meta Lead Ads, manual import).
      // Re-fetch the lead list so it appears without requiring a manual reload.
      if (S.view === 'leads' || S.view === 'lead-detail') {
        WSPP.loadLeads().then(() => {
          if (S.view === 'leads') WSPP.renderList();
        });
      }
      return;
    }

    if (event === 'contact.updated' || event === 'contact.notes_updated') {
      // Backend payload: { contact: {...}, previous_status, operator_id, stats, ... }
      const contact = d.contact;
      if (!contact?.id) return;
      const lead = S.leads.find(l => l.id === contact.id);
      if (lead) {
        Object.assign(lead, contact);
        if (S.activeLead?.id === contact.id) Object.assign(S.activeLead, contact);
        if (S.view === 'leads')                                      WSPP.renderList();
        if (S.view === 'lead-detail' && S.activeLead?.id === contact.id) WSPP.render();
      }
    } else if (event === 'contact.tags_updated') {
      // Backend payload: { contact: {...}, operator_id, operator_email }
      const contact = d.contact;
      if (!contact?.id) return;
      const lead = S.leads.find(l => l.id === contact.id);
      if (lead) {
        lead.cms_tags = contact.cms_tags;
        if (S.activeLead?.id === contact.id) S.activeLead.cms_tags = contact.cms_tags;
        if (S.view === 'leads') WSPP.renderList();
      }
    }
  }

  /** Maneja errores y programa reconexión con backoff */
  function handleSseError(err) {
    const { S } = WSPP;
    console.warn('[WSPP SSE] error, reconectando:', err?.message || err);
    WSPP.sseStatus = 'err';
    WSPP.updateSseBar();
    const delay  = Math.min(S.sseBackoff, 30000);
    S.sseBackoff = Math.min(S.sseBackoff * 2, 30000);
    setTimeout(() => { if (S.token && S.activeCampaignId) WSPP.startSSE(); }, delay);
  }
})();
