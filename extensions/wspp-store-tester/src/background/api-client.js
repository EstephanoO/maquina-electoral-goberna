// api-client.js — fetch wrapper con auth, retry, offline queue.

import { API, EXT_VERSION } from './bootstrap.js';

const OFFLINE_QUEUE_KEY = 'wspp_offline_queue';
const OFFLINE_QUEUE_MAX = 500;
const OFFLINE_FLUSH_INTERVAL = 30000; // 30s

export function enqueueOffline(path, options) {
  chrome.storage.local.get([OFFLINE_QUEUE_KEY], (data) => {
    const queue = data[OFFLINE_QUEUE_KEY] || [];
    if (queue.length >= OFFLINE_QUEUE_MAX) {
      queue.shift();
      console.warn('[WSPP OFFLINE] Queue full — dropped oldest event');
    }
    queue.push({ path, options, ts: Date.now() });
    chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: queue });
    console.log('[WSPP OFFLINE] Enqueued:', path, '| queue size:', queue.length);
  });
}

let _offlineFlushing = false;
export async function flushOfflineQueue() {
  if (_offlineFlushing) return;
  _offlineFlushing = true;
  try {
    const data = await new Promise(r => chrome.storage.local.get([OFFLINE_QUEUE_KEY], r));
    const queue = data[OFFLINE_QUEUE_KEY] || [];
    if (queue.length === 0) return;

    console.log('[WSPP OFFLINE] Flushing', queue.length, 'queued events...');
    const remaining = [];
    const maxAge = 24 * 60 * 60 * 1000;

    for (const item of queue) {
      if (Date.now() - item.ts > maxAge) {
        console.log('[WSPP OFFLINE] Discarded stale event from', new Date(item.ts).toISOString());
        continue;
      }
      const result = await apiFetch(item.path, item.options);
      if (result.ok || result.status === 400 || result.status === 403) {
        console.log('[WSPP OFFLINE] Flushed:', item.path, result.ok ? 'OK' : 'permanent error');
      } else {
        remaining.push(item);
        console.warn('[WSPP OFFLINE] Still failing:', item.path, '— re-queued');
        break;
      }
    }

    chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: remaining });
    if (remaining.length === 0) console.log('[WSPP OFFLINE] Queue drained');
  } finally {
    _offlineFlushing = false;
  }
}

// Periodic flush attempt
setInterval(flushOfflineQueue, OFFLINE_FLUSH_INTERVAL);
setTimeout(flushOfflineQueue, 5000);

// H-1: Track if we're already refreshing
let _refreshPromise = null;

export async function tryRefreshToken() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const data = await new Promise(r => chrome.storage.local.get(['wspp_refresh_token'], r));
      if (!data.wspp_refresh_token) return false;
      const res = await fetch(`${API}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: data.wspp_refresh_token }),
      });
      if (!res.ok) return false;
      const json = await res.json();
      if (json.access_token) {
        const tokenData = { wspp_token: json.access_token };
        const refreshData = { wspp_refresh_token: json.refresh_token || data.wspp_refresh_token, wspp_token: json.access_token };
        if (chrome.storage.session) {
          await new Promise(r => chrome.storage.session.set(tokenData, r));
        }
        await new Promise(r => chrome.storage.local.set(refreshData, r));
        console.log('[WSPP AUTH] ✓ Token refreshed');
        return true;
      }
      return false;
    } catch (err) {
      console.error('[WSPP AUTH] Refresh failed:', err.message);
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

export function forceReLogin() {
  chrome.storage.local.remove(['wspp_token', 'wspp_refresh_token', 'wspp_user', 'wspp_campaign_id']);
  console.warn('[WSPP AUTH] Session expired — user must re-login');
}

export function _getToken(callback) {
  chrome.storage.local.get(['wspp_campaign_id', 'wspp_token'], (localData) => {
    if (chrome.storage.session) {
      chrome.storage.session.get(['wspp_token'], (sessionData) => {
        const token = sessionData?.wspp_token || localData.wspp_token || null;
        callback({ wspp_token: token, wspp_campaign_id: localData.wspp_campaign_id });
      });
    } else {
      callback(localData);
    }
  });
}

export async function apiFetch(path, options = {}, _isRetry = false) {
  return new Promise((resolve) => {
    _getToken(async (data) => {
      if (!data.wspp_token) {
        if (!_isRetry) {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            resolve(await apiFetch(path, options, true));
            return;
          }
        }
        resolve({ ok: false, error: 'No auth' });
        return;
      }
      try {
        const res = await fetch(`${API}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.wspp_token}`,
            'x-campaign-id': data.wspp_campaign_id,
            'X-Extension-Version': EXT_VERSION,
            ...(options.headers || {}),
          },
        });

        if (res.status === 401 && !_isRetry) {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            resolve(await apiFetch(path, options, true));
            return;
          }
          forceReLogin();
          resolve({ ok: false, error: 'Session expired', status: 401 });
          return;
        }

        const json = await res.json();
        if (!res.ok && !json.status) json.status = res.status;
        resolve(json);
      } catch (err) {
        console.error('[WSPP API]', path, err.message);
        const method = (options.method || 'GET').toUpperCase();
        if ((method === 'POST' || method === 'PUT') && !_isRetry) {
          enqueueOffline(path, options);
        }
        resolve({ ok: false, error: err.message, offline: true });
      }
    });
  });
}
