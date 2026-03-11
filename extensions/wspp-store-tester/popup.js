'use strict';

const API = 'https://api.goberna.us';
const STORAGE_KEYS = ['wspp_token', 'wspp_user', 'wspp_user_role', 'wspp_count', 'wspp_campaign_id', 'wspp_own_number', 'wspp_campaigns'];

function $(id) { return document.getElementById(id); }

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

// ── Número propio ─────────────────────────────────────────────────────

function renderPhone(ownNumber) {
  if (ownNumber) {
    $('phone-missing').style.display  = 'none';
    $('phone-display').style.display  = 'flex';
    $('phone-edit').style.display     = 'none';
    $('phone-value').textContent      = '+' + ownNumber;
  } else {
    $('phone-missing').style.display  = 'block';
    $('phone-display').style.display  = 'none';
    $('phone-edit').style.display     = 'flex'; // mostrar form de inmediato si no hay número
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
    $('inp-phone').style.borderColor = '#ef5350';
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
  if (!email || !pass) { showErr('Completá email y contraseña'); return; }

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

    // Compute effective role = max between global role and all campaign roles.
    // The JWT uses the effective role, so we must match it here for the
    // consultor gate in the catalog panel to work correctly.
    const ROLE_LEVEL = { admin: 50, consultor: 40, candidato: 30, brigadista_zonal: 20, agente_campo: 10, agente_digital: 10 };
    const globalLevel = ROLE_LEVEL[data.user?.role] ?? 0;
    const campaignLevel = campaigns.reduce((max, c) => Math.max(max, ROLE_LEVEL[c.role] ?? 0), 0);
    const effectiveLevel = Math.max(globalLevel, campaignLevel);
    const effectiveRole = Object.entries(ROLE_LEVEL).find(([, v]) => v === effectiveLevel)?.[0] || data.user?.role || 'agente_digital';

    // H-1: Also store refresh_token for token refresh flow
    // S-7: Store campaigns list for campaign selector
    // S-10: Store access_token in session storage (more secure) + local (fallback)
    chrome.storage.local.set({
      wspp_token:         token,
      wspp_refresh_token: data.refresh_token || null,
      wspp_user:          userName,
      wspp_user_role:     effectiveRole,
      wspp_count:         0,
      wspp_campaign_id:   campaignId,
      wspp_campaigns:     JSON.stringify(campaigns.map(c => ({ id: c.id, name: c.name || c.candidate_name || c.id }))),
    });
    if (chrome.storage.session) {
      chrome.storage.session.set({ wspp_token: token });
    }

    showDash(userName, 0);
    renderCampaignSelector(campaigns, campaignId);

    // Mostrar el estado del número (puede ya estar guardado de sesiones anteriores)
    chrome.storage.local.get('wspp_own_number', (s) => renderPhone(s.wspp_own_number || null));
  } catch (e) {
    showErr(e.message);
    btn.disabled    = false;
    btn.textContent = 'Entrar';
  }
}

// ── Logout ───────────────────────────────────────────────────────────
// S-2 FIX: Revoke refresh token server-side before clearing local state.
function doLogout() {
  // Revoke server-side session (fire-and-forget — don't block UI on failure)
  chrome.storage.local.get(['wspp_token'], (data) => {
    if (data.wspp_token) {
      fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${data.wspp_token}` },
      }).catch(() => {}); // best-effort — user is leaving anyway
    }
  });
  // Preservar wspp_own_number al hacer logout — el número del celular no cambia
  // H-1: Also clear refresh_token on logout
  // S-10: Clear session storage too
  chrome.storage.local.remove(['wspp_token', 'wspp_refresh_token', 'wspp_user', 'wspp_user_role', 'wspp_count', 'wspp_campaign_id', 'wspp_campaigns']);
  if (chrome.storage.session) chrome.storage.session.remove(['wspp_token']);
  $('inp-email').value    = '';
  $('inp-password').value = '';
  clearErr();
  $('dot').classList.remove('on');
  showLogin();
}

// ── S-7: Campaign selector ────────────────────────────────────────────
function renderCampaignSelector(campaigns, activeId) {
  const section = $('campaign-section');
  const sel = $('sel-campaign');
  if (!section || !sel) return;
  if (!campaigns || campaigns.length <= 1) {
    section.style.display = 'none';
    return;
  }
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

// ── Reactividad: escuchar cambios de storage ─────────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.wspp_count !== undefined) {
    $('counter').textContent = changes.wspp_count.newValue ?? 0;
  }
  if (changes.wspp_wa_active !== undefined) {
    $('wa-status').textContent = changes.wspp_wa_active.newValue
      ? '✓ WhatsApp Web conectado'
      : 'Abre WhatsApp Web para empezar';
  }
  if (changes.wspp_own_number !== undefined) {
    renderPhone(changes.wspp_own_number.newValue || null);
  }
});

// ── Init ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $('btn-login').addEventListener('click', doLogin);
  // L-9: Only trigger login on Enter if both email AND password fields have values
  $('inp-email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && $('inp-email').value.trim() && $('inp-password').value) doLogin();
  });
  $('inp-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && $('inp-email').value.trim() && $('inp-password').value) doLogin();
  });
  $('btn-logout').addEventListener('click', doLogout);
  // L-5: Use string '0' consistently for counter
  $('btn-reset').addEventListener('click', () => {
    chrome.storage.local.set({ wspp_count: 0 });
    $('counter').textContent = '0';
  });
  $('btn-phone-edit').addEventListener('click', startPhoneEdit);
  $('btn-phone-save').addEventListener('click', savePhone);
  $('inp-phone').addEventListener('keydown', (e) => { if (e.key === 'Enter') savePhone(); });
  // S-7: Campaign selector change
  $('sel-campaign').addEventListener('change', () => {
    const newId = $('sel-campaign').value;
    chrome.storage.local.set({ wspp_campaign_id: newId });
    console.log('[WSPP] Campaign switched to:', newId);
  });

  chrome.storage.local.get([...STORAGE_KEYS, 'wspp_wa_active'], (saved) => {
    if (saved.wspp_token && saved.wspp_user) {
      showDash(saved.wspp_user, saved.wspp_count ?? 0);
      renderPhone(saved.wspp_own_number || null);
      // S-7: Restore campaign selector
      try {
        const camps = JSON.parse(saved.wspp_campaigns || '[]');
        renderCampaignSelector(camps, saved.wspp_campaign_id);
      } catch (_) {}
    } else {
      showLogin();
    }
    if (saved.wspp_wa_active) {
      $('wa-status').textContent = '✓ WhatsApp Web conectado';
    }
  });
});
