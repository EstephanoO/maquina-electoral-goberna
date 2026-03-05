'use strict';

const API = 'https://api.goberna.us';
const STORAGE_KEYS = ['wspp_token', 'wspp_user', 'wspp_count', 'wspp_campaign_id'];

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
    // Usar la primera campaña disponible como scope activo
    const campaignId = data.campaigns?.[0]?.id ?? null;

    chrome.storage.local.set({
      wspp_token:       token,
      wspp_user:        userName,
      wspp_count:       0,
      wspp_campaign_id: campaignId,
    });

    showDash(userName, 0);
  } catch (e) {
    showErr(e.message);
    btn.disabled    = false;
    btn.textContent = 'Entrar';
  }
}

// ── Logout ───────────────────────────────────────────────────────────
function doLogout() {
  chrome.storage.local.remove(STORAGE_KEYS);
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

  chrome.storage.local.get([...STORAGE_KEYS, 'wspp_wa_active'], (saved) => {
    if (saved.wspp_token && saved.wspp_user) {
      showDash(saved.wspp_user, saved.wspp_count ?? 0);
    } else {
      showLogin();
    }
    if (saved.wspp_wa_active) {
      $('wa-status').textContent = '✓ WhatsApp Web conectado';
    }
  });
});
