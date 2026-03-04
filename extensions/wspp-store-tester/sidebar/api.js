// sidebar/api.js — Capa de comunicación con la API de Goberna
// Depende de: constants.js, store.js
// Expone: WSPP.apiFetch, WSPP.tryRefreshToken,
//         WSPP.loadLeads, WSPP.loadTags, WSPP.loadStats, WSPP.loadExtMetrics
//
// CORS:
//   - GET sin cuerpo: fetch() directo (no hay preflight)
//   - POST/PUT/DELETE: chrome.runtime.sendMessage(WSPP_API_FETCH)
//     El service worker background.js hace el fetch sin restricciones de CORS.
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  /**
   * Envía una request a través del background service worker (evita CORS).
   * Retorna la respuesta como si fuera fetch().json().
   */
  function bgFetch(url, method, headers, body) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'WSPP_API_FETCH',
        payload: { url, method, headers, body },
      }, resp => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!resp)                    return reject(new Error('Sin respuesta del background'));
        if (!resp.ok) {
          // resp.error  → error de red (fetch lanzó excepción en background)
          // resp.data.* → error HTTP con cuerpo JSON del servidor
          const msg = resp.error
            || resp.data?.message
            || resp.data?.error
            || (resp.status ? `HTTP ${resp.status}` : 'Error de red');
          console.warn('[WSPP bgFetch]', method, url, '→', resp.status ?? 'net-err', resp.error ?? resp.data);
          const err = new Error(msg);
          err.status = resp.status;
          return reject(err);
        }
        resolve(resp.data);
      });
    });
  }

  /**
   * Fetch autenticado hacia la API de Goberna.
   *
   * GET  → fetch() directo (no dispara preflight CORS)
   * POST/PUT/DELETE → bgFetch() a través del service worker
   *
   * Maneja 401 con un intento de refresh automático.
   */
  WSPP.apiFetch = async function apiFetch(path, opts = {}) {
    const { S, API_BASE, storage } = WSPP;
    const { method = 'GET', body, headers: extraHeaders = {} } = opts;

    const url     = `${API_BASE}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(S.token            ? { 'Authorization': `Bearer ${S.token}` }  : {}),
      ...(S.activeCampaignId ? { 'x-campaign-id': S.activeCampaignId }  : {}),
      ...(S.waNumber         ? { 'x-wa-number':   S.waNumber }           : {}),
      ...extraHeaders,
    };

    const isMutating = method !== 'GET' && method !== 'HEAD';

    try {
      let data;

      if (isMutating) {
        // PUT/POST/DELETE → sin CORS preflight issue en background
        data = await bgFetch(url, method, headers, body);
      } else {
        // GET → fetch directo (no hay preflight)
        const res = await fetch(url, { method, headers });
        data = await res.json().catch(() => ({}));
        if (res.status === 401) throw Object.assign(new Error('Unauthorized'), { status: 401 });
        if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`);
      }

      return data;

    } catch (err) {
      if (err.status === 401) {
        const refreshed = await WSPP.tryRefreshToken();
        if (refreshed) return WSPP.apiFetch(path, opts);
        WSPP.doLogout();
        throw new Error('Sesión expirada');
      }
      throw err;
    }
  };

  /** Intenta renovar el access_token usando el refresh token actual */
  WSPP.tryRefreshToken = async function tryRefreshToken() {
    const { S, API_BASE, storage } = WSPP;
    try {
      const data = await bgFetch(
        `${API_BASE}/api/auth/refresh`,
        'POST',
        {
          'Content-Type': 'application/json',
          ...(S.token ? { 'Authorization': `Bearer ${S.token}` } : {}),
        },
        null,
      );
      if (data?.access_token) {
        S.token = data.access_token;
        storage.set({ wspp_token: S.token });
        return true;
      }
      return false;
    } catch (_) { return false; }
  };

  /** Carga leads paginados con filtros activos */
  WSPP.loadLeads = async function loadLeads(append = false) {
    const { S, apiFetch } = WSPP;
    if (!S.token || !S.activeCampaignId) return;
    S.loading = !append;
    const limit  = 50;
    const params = new URLSearchParams({ limit, offset: S.page * limit, status: S.status });
    if (S.search)    params.set('search', S.search);
    if (S.tagFilter) params.set('tag', S.tagFilter);
    try {
      const data   = await apiFetch(`/api/cms/contacts?${params}`);
      S.leads      = append ? [...S.leads, ...(data.contacts || [])] : (data.contacts || []);
      S.totalLeads = data.total || 0;
    } catch (e) { console.error('[WSPP CRM] loadLeads:', e); }
    S.loading = false;
  };

  /** Carga las etiquetas disponibles para la campaña activa */
  WSPP.loadTags = async function loadTags() {
    const { S, C, apiFetch } = WSPP;
    if (!S.token || !S.activeCampaignId) return;
    try {
      const data = await apiFetch('/api/cms/tags');
      S.availableTags = (data.tags || []).map(t => typeof t === 'object' ? t : { name: t, color: C.gold });
    } catch (_) {}
  };

  /** Carga estadísticas globales de la campaña */
  WSPP.loadStats = async function loadStats() {
    const { S, apiFetch } = WSPP;
    if (!S.token || !S.activeCampaignId) return;
    try {
      const data = await apiFetch('/api/cms/stats');
      S.stats = data.stats || null;
    } catch (_) {}
  };

  /** Carga métricas extendidas (por celular) */
  WSPP.loadExtMetrics = async function loadExtMetrics() {
    const { S, apiFetch } = WSPP;
    if (!S.token || !S.activeCampaignId) return;
    try {
      const data = await apiFetch('/api/cms/metrics/extension');
      S.extMetrics = data || null;
    } catch (_) {}
  };

  /**
   * Solicita a inject.js todos los contactos de WhatsApp con teléfono.
   * Incluye etiquetas WA de cada contacto.
   * Persiste en chrome.storage para disponibilidad offline.
   */
  WSPP.loadWaContacts = async function loadWaContacts() {
    const { S, storage } = WSPP;
    let resolved = false;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        if (!resolved) { resolved = true; resolve(false); }
      }, 8000);

      chrome.runtime.sendMessage({ action: 'getWaContacts' }, result => {
        clearTimeout(timer);
        if (chrome.runtime.lastError || !result) {
          if (!resolved) { resolved = true; resolve(false); }
          return;
        }
        const contacts = result.contacts || [];
        S.waContacts       = contacts;
        S.waContactsLoaded = true;

        // Actualizar waPhoneLabelMap con los datos frescos
        const map = {};
        for (const c of contacts) {
          if (c.waLabels?.length) map[c.phone] = c.waLabels;
        }
        if (Object.keys(map).length) {
          S.waPhoneLabelMap = { ...S.waPhoneLabelMap, ...map };
        }

        // Persistir
        storage.set({
          wspp_wa_contacts:        JSON.stringify(contacts),
          wspp_wa_phone_label_map: JSON.stringify(S.waPhoneLabelMap),
          wspp_wa_contacts_ts:     Date.now(),
        });
        console.log('[WSPP CRM] WA contacts cargados:', contacts.length);
        if (!resolved) { resolved = true; resolve(true); }
      });
    });
  };

  /** Carga métricas de ranking de brigadistas */
  WSPP.loadBrigadistaMetrics = async function loadBrigadistaMetrics() {
    const { S, apiFetch } = WSPP;
    if (!S.token || !S.activeCampaignId) return;
    try {
      const data = await apiFetch('/api/cms/metrics/brigadistas');
      S.brigadistaMetrics = data.brigadistas || [];
    } catch (_) { S.brigadistaMetrics = []; }
  };
})();
