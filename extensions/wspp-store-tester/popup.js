'use strict';

const API = 'https://api.goberna.us';
const STORAGE_KEYS = ['wspp_token', 'wspp_user', 'wspp_count', 'wspp_campaign_id', 'wspp_own_number'];

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
    const campaignId = data.campaigns?.[0]?.id ?? null;

    chrome.storage.local.set({
      wspp_token:       token,
      wspp_user:        userName,
      wspp_count:       0,
      wspp_campaign_id: campaignId,
    });

    showDash(userName, 0);

    // Mostrar el estado del número (puede ya estar guardado de sesiones anteriores)
    chrome.storage.local.get('wspp_own_number', (s) => renderPhone(s.wspp_own_number || null));
  } catch (e) {
    showErr(e.message);
    btn.disabled    = false;
    btn.textContent = 'Entrar';
  }
}

// ── Logout ───────────────────────────────────────────────────────────
function doLogout() {
  // Preservar wspp_own_number al hacer logout — el número del celular no cambia
  chrome.storage.local.remove(['wspp_token', 'wspp_user', 'wspp_count', 'wspp_campaign_id']);
  $('inp-email').value    = '';
  $('inp-password').value = '';
  clearErr();
  $('dot').classList.remove('on');
  showLogin();
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
  $('inp-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  $('btn-logout').addEventListener('click', doLogout);
  $('btn-reset').addEventListener('click', () => {
    chrome.storage.local.set({ wspp_count: 0 });
    $('counter').textContent = 0;
  });
  $('btn-phone-edit').addEventListener('click', startPhoneEdit);
  $('btn-phone-save').addEventListener('click', savePhone);
  $('inp-phone').addEventListener('keydown', (e) => { if (e.key === 'Enter') savePhone(); });

  chrome.storage.local.get([...STORAGE_KEYS, 'wspp_wa_active'], (saved) => {
    if (saved.wspp_token && saved.wspp_user) {
      showDash(saved.wspp_user, saved.wspp_count ?? 0);
      renderPhone(saved.wspp_own_number || null);
    } else {
      showLogin();
    }
    if (saved.wspp_wa_active) {
      $('wa-status').textContent = '✓ WhatsApp Web conectado';
    }
  });
});
