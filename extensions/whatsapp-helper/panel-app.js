/**
 * Goberna CMS Panel — Injected into WhatsApp Web
 * 
 * Full CMS sidebar: login, contact list, status management,
 * tags, reminders, SSE real-time, and WhatsApp chat integration.
 *
 * Communication: All API calls go through background.js (cmsApiProxy)
 * to avoid CORS issues. Auth JWT stored in chrome.storage.local.
 */

// ── Configuration ──

const API_BASE = "https://api.goberna.us";
const API_BASE_DEV = "http://localhost:3001";
const PAGE_LIMIT = 25;
const SSE_MAX_BACKOFF = 30000;
const SEARCH_DEBOUNCE_MS = 400;

const STATUS_CONFIG = {
  nuevo:        { label: "Nuevo",    cls: "gcms-status-nuevo" },
  hablado:      { label: "Hablado",  cls: "gcms-status-hablado" },
  respondieron: { label: "Contesto", cls: "gcms-status-respondieron" },
  archivado:    { label: "Archivado",cls: "gcms-status-archivado" },
};

const TABS = [
  { key: "todos",        label: "Todos",     statKey: "total" },
  { key: "nuevo",        label: "Nuevos",    statKey: "nuevos" },
  { key: "hablado",      label: "Hablados",  statKey: "hablados" },
  { key: "respondieron", label: "Contestaron", statKey: "respondieron" },
  { key: "archivado",    label: "Archivados",statKey: "archivados" },
];

// ── Debug ──

const GDEBUG = false; // Set to true for verbose console logging

// ── State ──

const state = {
  // Auth
  token: null,
  user: null,
  campaigns: [],
  activeCampaignId: null,
  // UI
  view: "login", // "login" | "list" | "detail"
  collapsed: false,
  // Contacts
  contacts: [],
  total: 0,
  loading: false,
  error: null,
  activeTab: "nuevo",
  searchQuery: "",
  selectedContact: null,
  // Stats
  stats: null,
  // Tags
  availableTags: [],
  // SSE
  sseConnected: false,
  // Action loading
  actionLoading: null,
  // Reminders (local)
  reminders: {},
};

// ── API Helper ──

function getApiBase() {
  // Detect dev by checking if WA Web opened from localhost context
  // In practice, always use production for the extension
  return API_BASE;
}

async function apiCall(method, path, body, extraHeaders) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "cmsApiProxy",
        method,
        url: `${getApiBase()}${path}`,
        body: body || null,
        headers: {
          "Content-Type": "application/json",
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
          ...(state.activeCampaignId ? { "x-campaign-id": state.activeCampaignId } : {}),
          ...(extraHeaders || {}),
        },
      },
      (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(resp || { ok: false, error: "No response" });
      }
    );
  });
}

// ── Storage ──

async function loadAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["gcms_token", "gcms_user", "gcms_campaigns", "gcms_campaign_id", "gcms_reminders"], (data) => {
      if (data.gcms_token) {
        state.token = data.gcms_token;
        state.user = data.gcms_user || null;
        state.campaigns = data.gcms_campaigns || [];
        state.activeCampaignId = data.gcms_campaign_id || null;
        state.reminders = data.gcms_reminders || {};
      }
      resolve();
    });
  });
}

function saveAuth() {
  chrome.storage.local.set({
    gcms_token: state.token,
    gcms_user: state.user,
    gcms_campaigns: state.campaigns,
    gcms_campaign_id: state.activeCampaignId,
  });
}

function saveReminders() {
  chrome.storage.local.set({ gcms_reminders: state.reminders });
}

function clearAuth() {
  state.token = null;
  state.user = null;
  state.campaigns = [];
  state.activeCampaignId = null;
  chrome.storage.local.remove(["gcms_token", "gcms_user", "gcms_campaigns", "gcms_campaign_id"]);
}

// ── Auth ──

async function doLogin(email, password) {
  const res = await apiCall("POST", "/api/auth/login", { identifier: email, password });
  if (!res.ok) return { ok: false, error: res.error || "Login failed" };

  const data = res.data;
  state.token = data.access_token || data.token;
  state.user = data.user;

  // Fetch campaigns
  const meRes = await apiCall("GET", "/api/auth/me");
  if (meRes.ok && meRes.data) {
    state.user = meRes.data.user || state.user;
    state.campaigns = meRes.data.campaigns || [];
    if (state.campaigns.length > 0 && !state.activeCampaignId) {
      state.activeCampaignId = state.campaigns[0].id;
    }
  }

  saveAuth();
  return { ok: true };
}

async function validateSession() {
  if (!state.token) return false;
  const res = await apiCall("GET", "/api/auth/me");
  if (!res.ok) {
    clearAuth();
    return false;
  }
  state.user = res.data?.user || state.user;
  state.campaigns = res.data?.campaigns || state.campaigns;
  if (state.campaigns.length > 0 && !state.activeCampaignId) {
    state.activeCampaignId = state.campaigns[0].id;
  }
  saveAuth();
  return true;
}

// ── Data fetching ──

let _fetchSeq = 0;
async function fetchContacts(offset) {
  if (!state.activeCampaignId) return;
  const seq = ++_fetchSeq;
  if (offset === 0) { state.loading = true; state.error = null; }

  const params = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    offset: String(offset || 0),
  });
  if (state.activeTab !== "todos") params.set("status", state.activeTab);
  if (state.searchQuery.trim()) params.set("search", state.searchQuery.trim());

  const res = await apiCall("GET", `/api/cms/contacts?${params}`);
  if (seq !== _fetchSeq) return; // Stale response — discard
  if (res.ok && res.data) {
    if (offset === 0) {
      state.contacts = res.data.contacts || [];
    } else {
      state.contacts = [...state.contacts, ...(res.data.contacts || [])];
    }
    state.total = res.data.total || 0;
  } else {
    state.error = res.error || "Error loading contacts";
  }
  state.loading = false;
  render();
}

async function fetchStats() {
  if (!state.activeCampaignId) return;
  const res = await apiCall("GET", "/api/cms/stats");
  if (res.ok && res.data?.stats) {
    state.stats = res.data.stats;
    render();
  }
}

async function fetchTags() {
  if (!state.activeCampaignId) return;
  const res = await apiCall("GET", "/api/cms/tags");
  if (res.ok && res.data?.tags) {
    state.availableTags = res.data.tags;
  }
}

// ── Contact actions ──

async function markHablado(contactId) {
  state.actionLoading = "hablado";
  render();
  const res = await apiCall("PUT", `/api/cms/contacts/${contactId}/hablado`, {});
  if (res.ok && res.data?.contact) updateContactInState(res.data.contact);
  state.actionLoading = null;
  fetchStats();
  render();
}

async function markRespondieron(contactId) {
  state.actionLoading = "respondieron";
  render();
  const res = await apiCall("PUT", `/api/cms/contacts/${contactId}/respondieron`, {});
  if (res.ok && res.data?.contact) updateContactInState(res.data.contact);
  state.actionLoading = null;
  fetchStats();
  render();
}

async function archiveContact(contactId) {
  state.actionLoading = "archive";
  render();
  const res = await apiCall("PUT", `/api/cms/contacts/${contactId}/archive`, {});
  if (res.ok && res.data?.contact) updateContactInState(res.data.contact);
  state.actionLoading = null;
  fetchStats();
  render();
}

async function revertContact(contactId) {
  state.actionLoading = "revert";
  render();
  const res = await apiCall("PUT", `/api/cms/contacts/${contactId}/revert`, {});
  if (res.ok && res.data?.contact) updateContactInState(res.data.contact);
  state.actionLoading = null;
  fetchStats();
  render();
}

async function setContactTags(contactId, tags) {
  const res = await apiCall("PUT", `/api/cms/contacts/${contactId}/tags`, { tags });
  if (res.ok && res.data?.contact) updateContactInState(res.data.contact);
  render();
}

function updateContactInState(updated) {
  state.contacts = state.contacts.map((c) => c.id === updated.id ? updated : c);
  if (state.selectedContact?.id === updated.id) state.selectedContact = updated;
}

// ── SSE ──

let sseController = null;
let sseAttempt = 0;

function connectSSE() {
  if (!state.activeCampaignId || !state.token) return;
  if (sseController) sseController.abort();

  sseController = new AbortController();
  state.sseConnected = false;
  render();

  const url = `${getApiBase()}/api/cms/stream`;
  
  fetch(url, {
    headers: {
      Authorization: `Bearer ${state.token}`,
      "x-campaign-id": state.activeCampaignId,
      Accept: "text/event-stream",
    },
    signal: sseController.signal,
  })
    .then(async (res) => {
      if (res.status === 401) {
        // Token expired — force re-login
        clearAuth();
        state.view = "login";
        render();
        return;
      }
      if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
      state.sseConnected = true;
      sseAttempt = 0;
      render();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const data = JSON.parse(line.slice(5).trim());
            handleSseEvent(data);
          } catch { /* skip */ }
        }
      }
    })
    .catch((err) => {
      if (err.name === "AbortError") return;
      state.sseConnected = false;
      render();
      // Reconnect with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, sseAttempt), SSE_MAX_BACKOFF);
      sseAttempt++;
      setTimeout(connectSSE, delay);
    });
}

function handleSseEvent(data) {
  if (data.type === "contact.updated" || data.type === "contact.notes_updated" || data.type === "contact.tags_updated") {
    if (data.payload?.contact) updateContactInState(data.payload.contact);
    if (data.payload?.stats) state.stats = data.payload.stats;
    render();
  }
}

function disconnectSSE() {
  if (sseController) { sseController.abort(); sseController = null; }
  state.sseConnected = false;
}

// ── WhatsApp Integration ──
// All chat navigation is delegated to background.js which executes
// DOM steps in MAIN world via chrome.scripting.executeScript.
// Content scripts run in ISOLATED world where execCommand doesn't
// trigger React, so direct DOM manipulation from here doesn't work.

/**
 * Open a WhatsApp chat by phone number — NO page reload.
 *
 * Delegates the entire navigation flow to background.js openChat handler
 * which orchestrates: click "Nuevo chat" → type phone → wait for results →
 * press Enter → validate chat opened. All DOM steps execute in MAIN world
 * where execCommand triggers React's internal handlers.
 *
 * Falls back to URL navigation (which causes reload) only if all DOM
 * attempts fail.
 */
async function openWhatsAppChat(phone) {
  if (!phone) return;
  const digits = phone.replace(/\D/g, "");
  if (!digits || digits.length < 7) return;

  // Normalize to full Peru phone number with country code
  let waPhone = digits;
  if (digits.length === 9 && digits[0] === "9") {
    waPhone = "51" + digits;
  } else if (digits.startsWith("51") && digits.length === 11) {
    waPhone = digits;
  }

  if (GDEBUG) console.log("[Goberna WA] openWhatsAppChat: delegating to background.js, phone:", waPhone);

  try {
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "openChat", phone: waPhone, text: "" },
        (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(resp);
        }
      );
    });

    if (GDEBUG) console.log("[Goberna WA] openWhatsAppChat: result:", JSON.stringify(result));

    if (result?.error) {
      console.warn("[Goberna WA] openWhatsAppChat: background error:", result.error);
    }
  } catch (err) {
    console.error("[Goberna WA] openWhatsAppChat: failed:", err.message);
  }
}

// ── Reminders (local chrome.storage) ──

function addReminder(contactId, text, dateStr) {
  if (!state.reminders[contactId]) state.reminders[contactId] = [];
  state.reminders[contactId].push({ text, date: dateStr, id: Date.now().toString(36) });
  saveReminders();
  render();
}

function removeReminder(contactId, reminderId) {
  if (!state.reminders[contactId]) return;
  state.reminders[contactId] = state.reminders[contactId].filter((r) => r.id !== reminderId);
  if (state.reminders[contactId].length === 0) delete state.reminders[contactId];
  saveReminders();
  render();
}

// ── Rendering ──

function getInitials(name) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function formatPhone(phone) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 9 && d[0] === "9") return `+51 ${d}`;
  if (d.length === 11 && d.startsWith("51")) return `+${d.slice(0,2)} ${d.slice(2)}`;
  return phone;
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
  } catch { return ""; }
}

function getRelevantTime(c) {
  return c.cms_respondieron_at || c.cms_hablado_at || c.cms_claimed_at || c.created_at;
}

function getPreview(c) {
  const n = c.cms_operator_notes;
  if (n?.comentarios) return n.comentarios;
  if (c.candidato_preferido) return `Pref: ${c.candidato_preferido}`;
  if (c.zona) return c.zona;
  return "Sin interacciones";
}

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else el.setAttribute(k, v);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === "string" || typeof child === "number") el.appendChild(document.createTextNode(String(child)));
    else if (Array.isArray(child)) { for (const c of child) { if (c) el.appendChild(c); } }
    else el.appendChild(child);
  }
  return el;
}

// ── View: Login ──

function renderLogin() {
  let errorMsg = "";
  let loading = false;

  const emailInput = h("input", { className: "gcms-input", type: "email", placeholder: "Email" });
  const passInput = h("input", { className: "gcms-input", type: "password", placeholder: "Contrasena" });
  const errorEl = h("div", { className: "gcms-login-error" });
  const btn = h("button", { className: "gcms-btn-primary", onClick: async () => {
    const email = emailInput.value.trim();
    const pass = passInput.value;
    if (!email || !pass) { errorEl.textContent = "Ingresa email y contrasena"; return; }
    btn.disabled = true;
    btn.textContent = "Ingresando...";
    errorEl.textContent = "";
    const res = await doLogin(email, pass);
    if (res.ok) {
      state.view = "list";
      render();
      fetchContacts(0);
      fetchStats();
      fetchTags();
      connectSSE();
    } else {
      errorEl.textContent = res.error || "Error al ingresar";
      btn.disabled = false;
      btn.textContent = "Ingresar";
    }
  }}, "Ingresar");

  // Enter key on password
  passInput.addEventListener("keydown", (e) => { if (e.key === "Enter") btn.click(); });

  return h("div", { className: "gcms-login" },
    h("div", { className: "gcms-login-title" }, "Goberna CMS"),
    h("div", { className: "gcms-login-subtitle" }, "Inicia sesion para acceder a tus contactos de campana"),
    emailInput,
    passInput,
    btn,
    errorEl,
  );
}

// ── View: Contact List ──

function renderStats() {
  const items = [
    { key: "total", label: "Total", bg: "#f1f5f9", color: "#475569" },
    { key: "nuevos", label: "Nuevos", bg: "#e0f2fe", color: "#0369a1" },
    { key: "hablados", label: "Hablados", bg: "#fef3c7", color: "#b45309" },
    { key: "respondieron", label: "Contesto", bg: "#d1fae5", color: "#047857" },
    { key: "archivados", label: "Archiv", bg: "#f1f5f9", color: "#64748b" },
  ];
  return h("div", { className: "gcms-stats" },
    ...items.map((it) =>
      h("span", { className: "gcms-stat-pill", style: { background: it.bg, color: it.color } },
        `${it.label} `, h("b", null, state.stats ? state.stats[it.key] : "-"))
    )
  );
}

function renderTabs() {
  return h("div", { className: "gcms-tabs" },
    ...TABS.map((tab) => {
      const count = state.stats && tab.statKey ? state.stats[tab.statKey] : null;
      return h("button", {
        className: `gcms-tab${state.activeTab === tab.key ? " active" : ""}`,
        onClick: () => {
          state.activeTab = tab.key;
          state.selectedContact = null;
          state.view = "list";
          fetchContacts(0);
        },
      }, tab.label, count != null ? h("span", { className: "gcms-tab-count" }, String(count)) : null);
    })
  );
}

let _searchTimer = null;
function renderSearch() {
  const input = h("input", {
    className: "gcms-search-input",
    type: "text",
    placeholder: "Buscar nombre, telefono...",
    value: state.searchQuery,
    onInput: (e) => {
      state.searchQuery = e.target.value;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => fetchContacts(0), SEARCH_DEBOUNCE_MS);
    },
  });
  return h("div", { className: "gcms-search-wrap" }, input);
}

function renderContactItem(contact) {
  const sc = STATUS_CONFIG[contact.cms_status] || STATUS_CONFIG.nuevo;
  const isSelected = state.selectedContact?.id === contact.id;
  const tags = contact.cms_tags || [];
  const reminderCount = (state.reminders[contact.id] || []).length;

  return h("div", {
    className: `gcms-contact${isSelected ? " selected" : ""}`,
    onClick: () => {
      state.selectedContact = contact;
      state.view = "detail";
      render();
      openWhatsAppChat(contact.telefono);
    },
  },
    h("div", { className: "gcms-avatar" }, getInitials(contact.nombre)),
    h("div", { className: "gcms-contact-body" },
      h("div", { className: "gcms-contact-row" },
        h("span", { className: "gcms-contact-name" }, contact.nombre || "Sin nombre"),
        h("span", { className: "gcms-contact-time" }, formatTime(getRelevantTime(contact))),
      ),
      contact.telefono ? h("div", { className: "gcms-contact-phone" }, formatPhone(contact.telefono)) : null,
      h("div", { className: "gcms-contact-preview" }, getPreview(contact)),
      h("div", { className: "gcms-contact-meta" },
        h("span", { className: `gcms-status ${sc.cls}` }, sc.label),
        ...tags.slice(0, 2).map((t) => h("span", { className: "gcms-tag" }, t)),
        tags.length > 2 ? h("span", { className: "gcms-tag" }, `+${tags.length - 2}`) : null,
        reminderCount > 0 ? h("span", { className: "gcms-tag", style: { background: "#fef3c7", color: "#b45309" } }, `${reminderCount} rec.`) : null,
      ),
    ),
  );
}

function renderList() {
  if (state.loading && state.contacts.length === 0) {
    return h("div", { className: "gcms-empty" },
      h("div", { className: "gcms-spinner" }),
      h("div", { className: "gcms-empty-text", style: { marginTop: "12px" } }, "Cargando contactos..."),
    );
  }
  if (state.error) {
    return h("div", { className: "gcms-empty" },
      h("div", { className: "gcms-empty-icon" }, "\u26A0\uFE0F"),
      h("div", { className: "gcms-empty-title" }, "Error"),
      h("div", { className: "gcms-empty-text" }, state.error),
      h("button", { className: "gcms-btn-primary", style: { marginTop: "12px", width: "auto" }, onClick: () => fetchContacts(0) }, "Reintentar"),
    );
  }
  if (state.contacts.length === 0) {
    return h("div", { className: "gcms-empty" },
      h("div", { className: "gcms-empty-icon" }, state.searchQuery ? "\uD83D\uDD0D" : "\uD83D\uDCCB"),
      h("div", { className: "gcms-empty-title" }, state.searchQuery ? "Sin resultados" : "Sin contactos"),
      h("div", { className: "gcms-empty-text" }, state.searchQuery ? "Prueba con otra busqueda" : "No hay contactos en este filtro"),
    );
  }

  const items = state.contacts.map(renderContactItem);

  // Load more sentinel
  if (state.contacts.length < state.total) {
    items.push(
      h("div", { style: { textAlign: "center", padding: "12px" } },
        h("button", {
          className: "gcms-btn-secondary gcms-btn",
          style: { width: "auto", fontSize: "10px" },
          onClick: () => fetchContacts(state.contacts.length),
        }, `Cargar mas (${state.contacts.length}/${state.total})`)
      )
    );
  }

  return h("div", { className: "gcms-list" }, ...items);
}

// ── View: Contact Detail ──

function renderDetail() {
  const c = state.selectedContact;
  if (!c) { state.view = "list"; return renderList(); }

  const sc = STATUS_CONFIG[c.cms_status] || STATUS_CONFIG.nuevo;
  const tags = c.cms_tags || [];
  const reminders = state.reminders[c.id] || [];

  // Action buttons based on status
  const actionBtns = [];
  if (c.cms_status === "nuevo") {
    actionBtns.push(h("button", { className: "gcms-btn gcms-btn-action", disabled: !!state.actionLoading, onClick: () => markHablado(c.id) }, state.actionLoading === "hablado" ? "..." : "Marcar Hablado"));
  } else if (c.cms_status === "hablado") {
    actionBtns.push(h("button", { className: "gcms-btn gcms-btn-secondary", disabled: !!state.actionLoading, onClick: () => revertContact(c.id) }, "Deshacer"));
    actionBtns.push(h("button", { className: "gcms-btn gcms-btn-action", disabled: !!state.actionLoading, onClick: () => markRespondieron(c.id) }, state.actionLoading === "respondieron" ? "..." : "Contesto"));
  } else if (c.cms_status === "respondieron") {
    actionBtns.push(h("button", { className: "gcms-btn gcms-btn-secondary", disabled: !!state.actionLoading, onClick: () => revertContact(c.id) }, "Deshacer"));
    actionBtns.push(h("button", { className: "gcms-btn gcms-btn-action", disabled: !!state.actionLoading, onClick: () => archiveContact(c.id) }, "Archivar"));
  } else if (c.cms_status === "archivado") {
    actionBtns.push(h("button", { className: "gcms-btn gcms-btn-secondary", disabled: !!state.actionLoading, onClick: () => revertContact(c.id) }, "Desarchivar"));
  }

  // Tag editor
  const tagInput = h("input", { className: "gcms-tag-input", placeholder: "Nueva...", onKeydown: (e) => {
    if (e.key === "Enter") {
      const val = tagInput.value.trim().toLowerCase();
      if (!val) return;
      const newTags = [...new Set([...tags, val])];
      setContactTags(c.id, newTags);
      tagInput.value = "";
    }
  }});

  // Reminder add form
  const remText = h("input", { className: "gcms-tag-input", style: { width: "120px" }, placeholder: "Nota..." });
  const remDate = h("input", { className: "gcms-tag-input", type: "datetime-local", style: { width: "130px", fontSize: "9px" } });

  return h("div", { className: "gcms-detail" },
    // Header
    h("div", { className: "gcms-detail-header" },
      h("button", { className: "gcms-detail-back", onClick: () => { state.view = "list"; state.selectedContact = null; render(); } }, "\u2190"),
      h("div", { className: "gcms-avatar", style: { width: "32px", height: "32px", fontSize: "10px" } }, getInitials(c.nombre)),
      h("div", { className: "gcms-detail-info" },
        h("div", { className: "gcms-detail-name" }, c.nombre || "Sin nombre"),
        c.telefono ? h("button", { className: "gcms-detail-phone-link", onClick: () => openWhatsAppChat(c.telefono) }, "\uD83D\uDCF1 " + formatPhone(c.telefono)) : null,
      ),
      h("span", { className: `gcms-status ${sc.cls}` }, sc.label),
    ),

    // Body
    h("div", { className: "gcms-detail-body" },
      // Info section
      h("div", { className: "gcms-section" },
        h("div", { className: "gcms-section-title" }, "Informacion"),
        h("div", { className: "gcms-info-row" }, h("span", { className: "gcms-info-label" }, "Encuestador"), h("span", { className: "gcms-info-value" }, c.encuestador || "\u2014")),
        h("div", { className: "gcms-info-row" }, h("span", { className: "gcms-info-label" }, "Zona"), h("span", { className: "gcms-info-value" }, c.zona || "\u2014")),
        h("div", { className: "gcms-info-row" }, h("span", { className: "gcms-info-label" }, "Distrito"), h("span", { className: "gcms-info-value" }, c.distrito || "\u2014")),
        h("div", { className: "gcms-info-row" }, h("span", { className: "gcms-info-label" }, "Preferido"), h("span", { className: "gcms-info-value" }, c.candidato_preferido || "\u2014")),
        h("div", { className: "gcms-info-row" }, h("span", { className: "gcms-info-label" }, "Operadora"), h("span", { className: "gcms-info-value" }, c.claimed_by_email?.split("@")[0] || "\u2014")),
      ),

      // Tags section
      h("div", { className: "gcms-section" },
        h("div", { className: "gcms-section-title" }, "Etiquetas"),
        h("div", { className: "gcms-tags-section" },
          ...tags.map((t) => h("span", { className: "gcms-tag-assigned" },
            t,
            h("button", { className: "gcms-tag-remove", onClick: () => {
              const newTags = tags.filter((x) => x !== t);
              setContactTags(c.id, newTags);
            }}, "\u00D7"),
          )),
          // Available tags not yet assigned
          ...state.availableTags.filter((t) => !tags.includes(t)).slice(0, 4).map((t) =>
            h("button", { className: "gcms-tag-add", onClick: () => {
              const newTags = [...new Set([...tags, t])];
              setContactTags(c.id, newTags);
            }}, "+ " + t)
          ),
          tagInput,
        ),
      ),

      // Reminders section
      h("div", { className: "gcms-section" },
        h("div", { className: "gcms-section-title" }, "Recordatorios"),
        ...(reminders.length === 0 ? [h("div", { style: { fontSize: "10px", color: "#94a3b8" } }, "Sin recordatorios")] : []),
        ...reminders.map((r) =>
          h("div", { className: "gcms-reminder-row" },
            h("span", { className: "gcms-reminder-time" }, r.date ? new Date(r.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""),
            h("span", { className: "gcms-reminder-text" }, r.text),
            h("button", { className: "gcms-reminder-delete", onClick: () => removeReminder(c.id, r.id) }, "\u00D7"),
          )
        ),
        h("div", { style: { display: "flex", gap: "4px", marginTop: "6px", alignItems: "center" } },
          remText, remDate,
          h("button", { className: "gcms-tag-add", onClick: () => {
            if (!remText.value.trim()) return;
            addReminder(c.id, remText.value.trim(), remDate.value || null);
            remText.value = "";
            remDate.value = "";
          }}, "+"),
        ),
      ),

      // Notes section (read-only display)
      c.cms_operator_notes?.comentarios ? h("div", { className: "gcms-section" },
        h("div", { className: "gcms-section-title" }, "Notas"),
        h("div", { style: { fontSize: "11px", color: "#475569", lineHeight: "1.5" } }, c.cms_operator_notes.comentarios),
      ) : null,
    ),

    // Actions
    h("div", { className: "gcms-actions" },
      h("button", { className: "gcms-btn gcms-btn-wa", onClick: () => openWhatsAppChat(c.telefono) }, "\uD83D\uDCAC WhatsApp"),
      ...actionBtns,
    ),
  );
}

// ── View: Header ──

function renderHeader() {
  const campaignName = state.campaigns.find((c) => c.id === state.activeCampaignId)?.name || "Campana";

  return h("div", { className: "gcms-header" },
    h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
      h("div", { className: "gcms-header-title" }, "Goberna CMS"),
      h("span", { className: `gcms-sse-dot ${state.sseConnected ? "connected" : "disconnected"}`, title: state.sseConnected ? "Conectado" : "Desconectado" }),
    ),
    h("div", { className: "gcms-header-actions" },
      state.view !== "login" ? h("span", { className: "gcms-header-badge" }, campaignName.slice(0, 15)) : null,
      h("button", { className: "gcms-btn-icon", onClick: () => { state.collapsed = true; render(); }, title: "Minimizar" }, "\u2192"),
      state.view !== "login" ? h("button", { className: "gcms-btn-icon", onClick: () => { disconnectSSE(); clearAuth(); state.view = "login"; render(); }, title: "Cerrar sesion" }, "\u23FB") : null,
    ),
  );
}

// ── Main Render ──

function render() {
  const root = document.getElementById("goberna-cms-root");
  if (!root) return;

  root.innerHTML = "";
  root.className = state.collapsed ? "gcms-collapsed" : "";

  // Toggle tab (always visible)
  root.appendChild(
    h("button", { className: "gcms-toggle-tab", onClick: () => { state.collapsed = !state.collapsed; render(); } },
      state.collapsed ? "CMS" : "\u00BB",
    )
  );

  // Header
  root.appendChild(renderHeader());

  // Campaign selector (if multiple campaigns and logged in)
  if (state.view !== "login" && state.campaigns.length > 1) {
    const sel = h("select", {
      style: { width: "100%", padding: "4px 8px", fontSize: "10px", border: "none", borderBottom: "1px solid #f1f5f9", outline: "none", background: "#fff", fontFamily: "inherit" },
      onChange: (e) => {
        state.activeCampaignId = e.target.value;
        saveAuth();
        state.contacts = [];
        state.selectedContact = null;
        state.view = "list";
        disconnectSSE();
        fetchContacts(0);
        fetchStats();
        fetchTags();
        connectSSE();
      },
    }, ...state.campaigns.map((camp) =>
      h("option", { value: camp.id, ...(camp.id === state.activeCampaignId ? { selected: "selected" } : {}) }, camp.name)
    ));
    root.appendChild(sel);
  }

  // Body
  if (state.view === "login") {
    root.appendChild(renderLogin());
  } else if (state.view === "detail") {
    root.appendChild(renderDetail());
  } else {
    root.appendChild(renderStats());
    root.appendChild(renderTabs());
    root.appendChild(renderSearch());
    root.appendChild(renderList());
  }
}

// ── Initialization ──

let _panelInitialized = false;
async function initPanel() {
  // Guard against multiple runs
  if (_panelInitialized) return;
  if (document.getElementById("goberna-cms-root")) return;
  _panelInitialized = true;

  const root = document.createElement("div");
  root.id = "goberna-cms-root";
  document.body.appendChild(root);

  // Shrink WA Web app to make room
  const appEl = document.getElementById("app");
  if (appEl) {
    appEl.style.transition = "width 0.25s ease";
    appEl.style.width = "calc(100% - 380px)";
  }

  // Load saved auth
  await loadAuth();

  // Validate session
  if (state.token) {
    const valid = await validateSession();
    if (valid) {
      state.view = "list";
      render();
      fetchContacts(0);
      fetchStats();
      fetchTags();
      connectSSE();
      return;
    }
  }

  state.view = "login";
  render();
}

// Wait for WA Web to load, then inject
function waitAndInit() {
  const check = setInterval(() => {
    const app = document.getElementById("app");
    if (app) {
      clearInterval(check);
      // Small delay to let WA Web finish rendering
      setTimeout(initPanel, 1500);
    }
  }, 500);
}

waitAndInit();
