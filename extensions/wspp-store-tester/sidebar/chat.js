// sidebar/chat.js — Lógica de apertura de chat y detección de envío
// Depende de: constants.js, store.js, sse.js (indirectamente)
// Expone: WSPP.openChat, WSPP.watchComposerForSend, WSPP.composerWatchers
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  // Mapa de watchers activos por teléfono → función de limpieza
  WSPP.composerWatchers = new Map();

  /**
   * Abre el chat de WhatsApp para un número de teléfono.
   *
   * Dos flujos completamente separados:
   *
   *   CHAT EXISTENTE → content.js pregunta a inject.js si existe en ChatCollection.
   *                    Si sí: WAWebCmd.openChatBottom lo muestra directamente en la lista.
   *                    No se tipea nada, no se abre "Nuevo chat".
   *
   *   CHAT NUEVO     → fallback CDP: abre "Nuevo chat", tipea el número en el buscador,
   *                    presiona Enter para ir al chat. Solo ocurre si found: false.
   *
   * En ambos casos marca el contacto como "hablado" y activa el watcher del composer.
   */
  WSPP.openChat = async function openChat(phone, leadId) {
    const { S, normPhone, apiFetch, render, renderList, renderMessages, watchComposerForSend } = WSPP;
    const digits = normPhone(phone);

    // Marcar como hablado al abrir (ambos flujos) — usa apiFetch para refresh automático
    if (S.token && leadId) {
      apiFetch(`/api/cms/contacts/${leadId}/hablado`, { method: 'PUT' }).catch(() => {});
      const lead = S.leads.find(l => l.id === leadId);
      if (lead) { lead.cms_status = 'hablado'; lead.cms_hablado_at = new Date().toISOString(); }
      if (S.activeLead?.id === leadId) S.activeLead.cms_status = 'hablado';
    }

    S.wasSent++;

    // ── Flujo 1: chat existente ──────────────────────────────────────
    // content.js → inject.js busca en ChatCollection → WAWebCmd navega visualmente
    let chatFound = false;
    try {
      const result = await chrome.runtime.sendMessage({ action: 'openChat', phone: digits });
      chatFound = result?.found === true;
    } catch (_) {
      chatFound = false;
    }

    if (chatFound) {
      // El chat ya existe y fue abierto por inject.js — no hacer nada más aquí.
      // El usuario ve la conversación existente en la lista de chats de WA.
      console.log('[WSPP CRM] Chat existente abierto para:', digits);

    } else {
      // ── Flujo 2: chat nuevo ─────────────────────────────────────────
      // CDP: abre "Nuevo chat", tipea el número en el buscador y navega.
      // No se escribe saludo — el usuario decide qué mandar a un contacto nuevo.
      console.log('[WSPP CRM] Chat no encontrado, abriendo nuevo para:', digits);
      chrome.runtime.sendMessage({ type: 'WSPP_TYPE_PHONE', payload: { phone: digits, greeting: '' } });
    }

    // Watcher del composer activo en ambos flujos (detecta Enter → respondieron)
    watchComposerForSend(digits, leadId);

    if (S.view === 'leads') renderList();
    if (S.view === 'lead-detail') render();
    if (S.view === 'messages') renderMessages();
  };

  /**
   * Monitorea el compositor de WhatsApp Web.
   * Cuando el usuario presiona Enter (sin Shift) en el composer:
   * - Marca el lead como "respondieron"
   * - Elimina el número del mapa de pendientes
   * - Actualiza la UI correspondiente
   * - Se auto-limpia tras el primer envío o en 5 minutos
   */
  WSPP.watchComposerForSend = function watchComposerForSend(phone, leadId) {
    const { S, apiFetch, composerWatchers, render, renderList, renderMessages, updateMsgBadge } = WSPP;

    // Limpiar watcher anterior para este teléfono
    if (composerWatchers.has(phone)) {
      composerWatchers.get(phone)();
    }

    const COMPOSER_SEL = '[aria-placeholder="Escribe un mensaje"], [contenteditable="true"][aria-label]';
    let timeout = null;

    function onKeyDown(e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      const el = e.target;
      if (!el) return;
      const isComposer = el.matches?.(COMPOSER_SEL) ||
                         el.closest?.('[role="main"] [contenteditable="true"]');
      if (!isComposer) return;

      // Marcar como respondieron — usa apiFetch para refresh automático
      if (S.token && leadId) {
        apiFetch(`/api/cms/contacts/${leadId}/respondieron`, { method: 'PUT' }).catch(() => {});
        const lead = S.leads.find(l => l.id === leadId);
        if (lead) { lead.cms_status = 'respondieron'; lead.cms_respondieron_at = new Date().toISOString(); }
        if (S.activeLead?.id === leadId) {
          S.activeLead.cms_status = 'respondieron';
          S.activeLead.cms_respondieron_at = new Date().toISOString();
        }
      }

      // Eliminar de pendientes (phone ya está normalizado a 51XXXXXXXXX por openChat)
      delete S.pendingMap[phone];

      // Actualizar UI
      if (S.view === 'leads') renderList();
      if (S.view === 'lead-detail' && S.activeLead?.id === leadId) render();
      if (S.view === 'messages') renderMessages();
      updateMsgBadge();

      // Dejar de escuchar tras el primer envío
      cleanup();
    }

    function cleanup() {
      document.removeEventListener('keydown', onKeyDown, true);
      clearTimeout(timeout);
      composerWatchers.delete(phone);
    }

    document.addEventListener('keydown', onKeyDown, true);
    // Auto-limpieza tras 15 minutos de inactividad
    timeout = setTimeout(cleanup, 15 * 60 * 1000);
    composerWatchers.set(phone, cleanup);
  };
})();
