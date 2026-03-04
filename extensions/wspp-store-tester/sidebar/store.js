// sidebar/store.js — Estado global y wrapper de chrome.storage
// Depende de: constants.js
// Expone: WSPP.S, WSPP.storage
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  // ── chrome.storage wrapper ─────────────────────────────────────
  WSPP.storage = {
    get: (keys) => new Promise(r => chrome.storage?.local ? chrome.storage.local.get(keys, r) : r({})),
    set: (obj)  => chrome.storage?.local?.set(obj),
    del: (keys) => chrome.storage?.local?.remove(keys),
  };

  // ── Estado reactivo de la aplicación ──────────────────────────
  WSPP.S = {
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
    availableTags:    [],   // [{name, color}] — tags del CRM Goberna
    waLabelFilter:    '',   // nombre de etiqueta WA activa como filtro
    waLabels:         [],   // [{id, name, color, predefinedId}] — etiquetas de WA Business
    // phone (51XXXXXXXXX) → [{id, name, color}] — qué labels tiene cada chat de WA
    waPhoneLabelMap:  {},
    // Todos los contactos de WA exportados: [{phone, name, waLabels, source}]
    waContacts:       [],
    waContactsLoaded: false,
    loading:          false,
    view:             'login',   // login | leads | lead-detail | metrics | messages
    activeLead:       null,
    stats:              null,
    extMetrics:         null,
    brigadistaMetrics:  [],   // [{brigadista_id, full_name, email, total_captures, hablados, respondieron, archivados}]
    // Messages tab: incoming WA messages from non-replied leads
    messages:         [],   // {from, body, timestamp, fromMe, seen, leadId?, leadName?}
    // Pending map: phone → last incoming message (not yet replied by me)
    pendingMap:       {},   // phone → {body, timestamp, leadId, leadName, from}
    wasSent:          0,
    sseAbort:         null,  // AbortController del fetch SSE activo
    sseBackoff:       2000,
    waNumber:         null,
    // Tag color picker state
    newTagName:       '',
    newTagColor:      '#FFC800',
  };
})();
