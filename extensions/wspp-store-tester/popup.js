'use strict';

const API = 'https://api.goberna.us';
const STORAGE_KEYS = ['wspp_token', 'wspp_user', 'wspp_user_role', 'wspp_audio_admin', 'wspp_count', 'wspp_campaign_id', 'wspp_own_number', 'wspp_campaigns'];

function $(id) { return document.getElementById(id); }

// ── Status colors (iOS-inspired) ───────────────────────────────────────
const STATUS_COLORS = {
  pendiente:  { bg: 'rgba(255,149,0,.2)',  fg: '#ff9f0a', label: 'PEND' },
  contactado: { bg: 'rgba(10,132,255,.2)', fg: '#0a84ff', label: 'CONT' },
  respondido: { bg: 'rgba(48,209,88,.2)',  fg: '#30d158', label: 'RESP' },
  invalido:   { bg: 'rgba(255,69,58,.2)',  fg: '#ff453a', label: 'IMP' },
};
const VOTE_COLORS = {
  duro:     { bg: '#30d158', fg: '#fff' },
  blando:   { bg: '#0a84ff', fg: '#fff' },
  flotante: { bg: '#bf5af2', fg: '#fff' },
  tibio:    { bg: '#ff9f0a', fg: '#fff' },
};

// ── View switching ────────────────────────────────────────────────────
function showLogin() {
  $('view-login').style.display = 'flex';
  $('view-dash').style.display  = 'none';
}
function showDash(userName, count) {
  $('view-login').style.display = 'none';
  $('view-dash').style.display  = 'flex';
  $('user-name').textContent    = userName;
  $('counter').textContent      = count;
  $('dot').classList.add('on');
}
function showErr(msg) {
  const el = $('err');
  el.textContent   = msg;
  el.style.display = 'block';
}
function clearErr() { $('err').style.display = 'none'; }

// ── Tab navigation ────────────────────────────────────────────────────
let _activeTab = 'home';
function switchTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));
  if (tab === 'validacion' && _valItems.length === 0) fetchValidations();
}

// ── Phone number ─────────────────────────────────────────────────────
function renderPhone(ownNumber) {
  if (ownNumber) {
    $('phone-missing').style.display  = 'none';
    $('phone-display').style.display  = 'flex';
    $('phone-edit').style.display     = 'none';
    $('phone-value').textContent      = '+' + ownNumber;
  } else {
    $('phone-missing').style.display  = 'block';
    $('phone-display').style.display  = 'none';
    $('phone-edit').style.display     = 'flex';
  }
}
function startPhoneEdit() {
  $('phone-display').style.display = 'none';
  $('phone-missing').style.display = 'none';
  $('phone-edit').style.display    = 'flex';
  $('inp-phone').focus();
}
function savePhone() {
  const raw = $('inp-phone').value.replace(/\D/g, '');
  if (raw.length < 10 || raw.length > 13) {
    $('inp-phone').style.borderColor = '#ff453a';
    $('inp-phone').focus();
    return;
  }
  $('inp-phone').style.borderColor = '';
  chrome.storage.local.set({ wspp_own_number: raw });
  renderPhone(raw);
}

// ── Login ────────────────────────────────────────────────────────────
async function doLogin() {
  const email = $('inp-email').value.trim();
  const pass  = $('inp-password').value;
  if (!email || !pass) { showErr('Completa email y contrasena'); return; }

  const btn = $('btn-login');
  btn.disabled    = true;
  btn.textContent = 'Entrando...';
  clearErr();

  try {
    const res  = await fetch(`${API}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ identifier: email, password: pass }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Error ${res.status}`);

    const token      = data.access_token;
    const userName   = data.user?.full_name || data.user?.email || email;
    const campaigns  = data.campaigns || [];
    const campaignId = campaigns[0]?.id ?? null;

    const ROLE_LEVEL = { admin: 50, consultor: 40, candidato: 30, brigadista_zonal: 20, agente_campo: 10, agente_digital: 10 };
    const globalLevel = ROLE_LEVEL[data.user?.role] ?? 0;
    const campaignLevel = campaigns.reduce((max, c) => Math.max(max, ROLE_LEVEL[c.role] ?? 0), 0);
    const effectiveLevel = Math.max(globalLevel, campaignLevel);
    const effectiveRole = Object.entries(ROLE_LEVEL).find(([, v]) => v === effectiveLevel)?.[0] || data.user?.role || 'agente_digital';

    // Check perm_audio_admin for the active campaign
    const activeCampaign = campaigns.find(c => c.id === campaignId);
    const audioAdmin = !!activeCampaign?.perm_audio_admin;

    chrome.storage.local.set({
      wspp_token:         token,
      wspp_refresh_token: data.refresh_token || null,
      wspp_user:          userName,
      wspp_user_role:     effectiveRole,
      wspp_audio_admin:   audioAdmin,
      wspp_count:         0,
      wspp_campaign_id:   campaignId,
      wspp_campaigns:     JSON.stringify(campaigns.map(c => ({ id: c.id, name: c.name || c.candidate_name || c.id, perm_audio_admin: !!c.perm_audio_admin }))),
    });
    if (chrome.storage.session) {
      chrome.storage.session.set({ wspp_token: token });
    }

    showDash(userName, 0);
    renderCampaignSelector(campaigns, campaignId);
    chrome.storage.local.get('wspp_own_number', (s) => renderPhone(s.wspp_own_number || null));
  } catch (e) {
    showErr(e.message);
    btn.disabled    = false;
    btn.textContent = 'Entrar';
  }
}

// ── Logout ───────────────────────────────────────────────────────────
function doLogout() {
  chrome.storage.local.get(['wspp_token'], (data) => {
    if (data.wspp_token) {
      fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${data.wspp_token}` },
      }).catch(() => {});
    }
  });
  chrome.storage.local.remove(['wspp_token', 'wspp_refresh_token', 'wspp_user', 'wspp_user_role', 'wspp_audio_admin', 'wspp_count', 'wspp_campaign_id', 'wspp_campaigns']);
  if (chrome.storage.session) chrome.storage.session.remove(['wspp_token']);
  $('inp-email').value    = '';
  $('inp-password').value = '';
  clearErr();
  $('dot').classList.remove('on');
  _valItems = [];
  showLogin();
}

// ── Campaign selector ─────────────────────────────────────────────────
function renderCampaignSelector(campaigns, activeId) {
  const section = $('campaign-section');
  const sel = $('sel-campaign');
  if (!section || !sel) return;
  if (!campaigns || campaigns.length <= 1) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  sel.innerHTML = '';
  for (const c of campaigns) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name || c.candidate_name || c.id;
    if (c.id === activeId) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ── VALIDACION TAB ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

let _valItems = [];
let _valFilter = 'pendiente';
let _valSearch = '';
let _valPage = 1;
let _valTotal = 0;
let _valLoading = false;
let _valStats = null;
let _userId = null;

async function apiFetchPopup(path) {
  return new Promise((resolve) => {
    const getToken = (cb) => {
      chrome.storage.local.get(['wspp_campaign_id', 'wspp_token'], (ld) => {
        if (chrome.storage.session) {
          chrome.storage.session.get(['wspp_token'], (sd) => {
            cb({ token: sd?.wspp_token || ld.wspp_token, campaignId: ld.wspp_campaign_id });
          });
        } else {
          cb({ token: ld.wspp_token, campaignId: ld.wspp_campaign_id });
        }
      });
    };
    getToken(async ({ token, campaignId }) => {
      if (!token) { resolve({ ok: false, error: 'No auth' }); return; }
      try {
        const res = await fetch(`${API}${path}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-campaign-id': campaignId || '',
            'Content-Type': 'application/json',
          },
        });
        resolve(await res.json());
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  });
}

async function apiPutPopup(path, body) {
  return new Promise((resolve) => {
    const getToken = (cb) => {
      chrome.storage.local.get(['wspp_campaign_id', 'wspp_token'], (ld) => {
        if (chrome.storage.session) {
          chrome.storage.session.get(['wspp_token'], (sd) => {
            cb({ token: sd?.wspp_token || ld.wspp_token, campaignId: ld.wspp_campaign_id });
          });
        } else {
          cb({ token: ld.wspp_token, campaignId: ld.wspp_campaign_id });
        }
      });
    };
    getToken(async ({ token, campaignId }) => {
      if (!token) { resolve({ ok: false }); return; }
      try {
        const res = await fetch(`${API}${path}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-campaign-id': campaignId || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        resolve(await res.json());
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  });
}

async function fetchValidations(append) {
  if (_valLoading) return;
  _valLoading = true;
  if (!append) { _valPage = 1; _valItems = []; }

  const params = new URLSearchParams();
  if (_valFilter) params.set('status', _valFilter);
  params.set('page', String(_valPage));
  params.set('limit', '30');

  const [itemsRes, statsRes] = await Promise.all([
    apiFetchPopup(`/api/validacion?${params}`),
    _valStats ? Promise.resolve(null) : apiFetchPopup('/api/validacion/stats'),
  ]);

  if (itemsRes.ok && itemsRes.items) {
    if (append) { _valItems = [..._valItems, ...itemsRes.items]; }
    else { _valItems = itemsRes.items; }
    _valTotal = itemsRes.total || 0;
  }
  if (statsRes?.ok && statsRes.stats) _valStats = statsRes.stats;

  // Get userId for claim display
  if (!_userId) {
    const meRes = await apiFetchPopup('/api/auth/me');
    if (meRes.ok && meRes.user) _userId = meRes.user.id;
  }

  _valLoading = false;
  renderValidations();
  renderValStats();
}

function renderValStats() {
  const el = $('val-stats');
  if (!_valStats || !el) return;
  const items = [
    { label: 'Pend', count: _valStats.pendiente, color: '#ff9f0a' },
    { label: 'Cont', count: _valStats.contactado, color: '#0a84ff' },
    { label: 'Resp', count: _valStats.respondido, color: '#30d158' },
    { label: 'Imp',  count: _valStats.invalido,   color: '#ff453a' },
  ];
  el.innerHTML = items.map(i =>
    `<span><span class="val-stat-dot" style="background:${i.color}"></span>${i.label} <span class="val-stat-num">${i.count}</span></span>`
  ).join('');
}

function renderValidations() {
  const list = $('val-list');
  if (!list) return;

  // Client-side search filter
  let items = _valItems;
  if (_valSearch) {
    const q = _valSearch.toLowerCase();
    items = items.filter(i =>
      (i.nombre || '').toLowerCase().includes(q) ||
      (i.telefono || '').includes(q) ||
      (i.encuestador || '').toLowerCase().includes(q)
    );
  }

  if (items.length === 0) {
    list.innerHTML = `<div class="val-empty">${_valLoading ? 'Cargando...' : 'Sin contactos'}</div>`;
    return;
  }

  let html = '';
  for (const item of items) {
    const sc = STATUS_COLORS[item.status] || STATUS_COLORS.pendiente;
    const vc = item.vote_class ? VOTE_COLORS[item.vote_class] : null;
    const phone = (item.telefono || '').replace(/\D/g, '');
    const isMine = item.claimed_by === _userId;
    const isTaken = !!item.claimed_by && !isMine;

    html += `<button class="val-card" data-id="${item.id}" data-phone="${phone}" style="opacity:${isTaken ? '.45' : '1'}">`;
    html += `<div class="val-card-row1">`;
    html += `<span class="val-card-name">${esc(item.nombre || 'Sin nombre')}</span>`;
    html += `<span class="val-card-status" style="background:${sc.bg};color:${sc.fg}">${sc.label}</span>`;
    if (vc) html += `<span class="val-card-status" style="background:${vc.bg};color:${vc.fg}">${item.vote_class.toUpperCase()}</span>`;
    html += `</div>`;
    html += `<div class="val-card-phone">${esc(item.telefono)}</div>`;
    html += `<div class="val-card-meta">${esc(item.encuestador || '')}${item.zona ? ' · ' + esc(item.zona) : ''}</div>`;
    html += `<div class="val-card-actions">`;
    html += `<button class="val-wa-btn" data-open-chat="${phone}"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Abrir</button>`;
    if (!isMine && !isTaken) html += `<button class="val-claim-btn" data-claim="${item.id}">Tomar</button>`;
    if (isMine) html += `<span class="val-mine">Mio</span>`;
    if (isTaken) html += `<span class="val-taken">${esc(item.claimed_by_name || 'Tomado')}</span>`;
    html += `</div></button>`;
  }

  // Load more button
  if (_valItems.length < _valTotal) {
    html += `<button class="val-loadmore" id="val-loadmore">Cargar mas (${_valTotal - _valItems.length})</button>`;
  }

  list.innerHTML = html;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function claimContact(id) {
  const res = await apiPutPopup(`/api/validacion/${id}/claim`, {});
  if (res.ok && res.item) {
    _valItems = _valItems.map(i => i.id === id ? res.item : i);
    renderValidations();
  }
}

// ── Open chat in WA Web ──────────────────────────────────────────────
function openChatInWA(phone, btnEl) {
  if (!phone) return;
  // Ensure Peru country code
  const fullPhone = phone.startsWith('51') ? phone : '51' + phone;

  // Visual feedback
  const origHTML = btnEl.innerHTML;
  btnEl.innerHTML = '<span style="font-size:9px">Abriendo...</span>';
  btnEl.disabled = true;

  chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      // No WA tab open — fallback to wa.me link
      btnEl.innerHTML = origHTML;
      btnEl.disabled = false;
      window.open('https://wa.me/' + fullPhone, '_blank');
      return;
    }

    const waTab = tabs[0];
    // Focus the WA tab
    chrome.tabs.update(waTab.id, { active: true });
    if (waTab.windowId) chrome.windows.update(waTab.windowId, { focused: true });

    // Send to content.js → inject.js
    chrome.tabs.sendMessage(waTab.id, { type: 'WSPP_OPEN_CHAT', phone: fullPhone }, (response) => {
      btnEl.innerHTML = origHTML;
      btnEl.disabled = false;

      if (chrome.runtime.lastError) {
        console.warn('[WSPP Popup] sendMessage error:', chrome.runtime.lastError.message);
        // Fallback to wa.me
        window.open('https://wa.me/' + fullPhone, '_blank');
        return;
      }

      if (!response?.ok) {
        console.warn('[WSPP Popup] openChat failed:', response?.error);
        // Fallback to wa.me
        window.open('https://wa.me/' + fullPhone, '_blank');
      }
      // Success — WA Web already navigated to the chat. Close the popup.
      // (Chrome auto-closes popups when focus changes to another tab, but just in case)
    });
  });
}

// ── Reactividad: escuchar cambios de storage ─────────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.wspp_count !== undefined) {
    $('counter').textContent = changes.wspp_count.newValue ?? 0;
  }
  if (changes.wspp_wa_active !== undefined) {
    $('wa-status').textContent = changes.wspp_wa_active.newValue
      ? 'WhatsApp Web conectado'
      : 'Abre WhatsApp Web para empezar';
  }
  if (changes.wspp_own_number !== undefined) {
    renderPhone(changes.wspp_own_number.newValue || null);
  }
  // Refresh validations when campaign changes
  if (changes.wspp_campaign_id !== undefined) {
    _valStats = null;
    _valItems = [];
    if (_activeTab === 'validacion') fetchValidations();
  }
});

// ── Init ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Existing handlers
  $('btn-login').addEventListener('click', doLogin);
  $('inp-email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && $('inp-email').value.trim() && $('inp-password').value) doLogin();
  });
  $('inp-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && $('inp-email').value.trim() && $('inp-password').value) doLogin();
  });
  $('btn-logout').addEventListener('click', doLogout);
  $('btn-reset').addEventListener('click', () => {
    chrome.storage.local.set({ wspp_count: 0 });
    $('counter').textContent = '0';
  });
  $('btn-phone-edit').addEventListener('click', startPhoneEdit);
  $('btn-phone-save').addEventListener('click', savePhone);
  $('inp-phone').addEventListener('keydown', (e) => { if (e.key === 'Enter') savePhone(); });
  $('sel-campaign').addEventListener('change', () => {
    const newId = $('sel-campaign').value;
    // Update perm_audio_admin for the newly selected campaign
    chrome.storage.local.get(['wspp_campaigns'], (s) => {
      let audioAdmin = false;
      try {
        const campaigns = JSON.parse(s.wspp_campaigns || '[]');
        const camp = campaigns.find(c => c.id === newId);
        audioAdmin = !!camp?.perm_audio_admin;
      } catch {}
      chrome.storage.local.set({ wspp_campaign_id: newId, wspp_audio_admin: audioAdmin });
    });
  });

  // Tab handlers
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Validacion filter pills
  document.querySelectorAll('.val-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      _valFilter = btn.dataset.filter;
      document.querySelectorAll('.val-pill').forEach(p => p.classList.toggle('active', p === btn));
      fetchValidations();
    });
  });

  // Validacion search
  let _searchTimer;
  $('val-search').addEventListener('input', (e) => {
    _valSearch = e.target.value.trim();
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => renderValidations(), 200);
  });

  // Refresh button
  $('val-refresh').addEventListener('click', () => {
    _valStats = null;
    fetchValidations();
  });

  // Delegated click handlers for val-list
  $('val-list').addEventListener('click', (e) => {
    // Claim button
    const claimBtn = e.target.closest('[data-claim]');
    if (claimBtn) {
      e.preventDefault();
      e.stopPropagation();
      claimContact(claimBtn.dataset.claim);
      return;
    }
    // Open chat button — navigate inside WA Web
    const openChatBtn = e.target.closest('[data-open-chat]');
    if (openChatBtn) {
      e.preventDefault();
      e.stopPropagation();
      const phone = openChatBtn.dataset.openChat;
      openChatInWA(phone, openChatBtn);
      return;
    }
    // Load more
    if (e.target.closest('#val-loadmore')) {
      e.preventDefault();
      _valPage++;
      fetchValidations(true);
      return;
    }
  });

  // Init view
  chrome.storage.local.get([...STORAGE_KEYS, 'wspp_wa_active'], (saved) => {
    if (saved.wspp_token && saved.wspp_user) {
      showDash(saved.wspp_user, saved.wspp_count ?? 0);
      renderPhone(saved.wspp_own_number || null);
      try {
        const camps = JSON.parse(saved.wspp_campaigns || '[]');
        renderCampaignSelector(camps, saved.wspp_campaign_id);
      } catch (_) {}
    } else {
      showLogin();
    }
    if (saved.wspp_wa_active) {
      $('wa-status').textContent = 'WhatsApp Web conectado';
    }
  });
});
