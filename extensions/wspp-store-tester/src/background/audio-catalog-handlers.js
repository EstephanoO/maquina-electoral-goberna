// ═══════════════════════════════════════════════════════════════════════
// AUDIO CATALOG — pre-generated audio messages (v7.2.0)
// Replaces per-message ElevenLabs TTS with a reusable catalog.
// ═══════════════════════════════════════════════════════════════════════

import { apiFetch } from './api-client.js';

// In-memory cache of catalog metadata (refreshed every 5 minutes)
let _audioCatalogCache = null;
let _audioCatalogCacheTs = 0;
const CATALOG_CACHE_TTL = 5 * 60 * 1000; // 5 min

// Audio blob cache — keeps fetched audio base64 to avoid re-fetching
const _audioDataCache = new Map(); // id → { audioBase64, mimeType }
const AUDIO_DATA_CACHE_MAX = 20;

// FETCH_AUDIO_CATALOG — returns full catalog list (with TTL cache)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'FETCH_AUDIO_CATALOG') return;

  (async () => {
    try {
      const now = Date.now();
      if (_audioCatalogCache && (now - _audioCatalogCacheTs) < CATALOG_CACHE_TTL) {
        sendResponse({ ok: true, items: _audioCatalogCache });
        return;
      }

      const result = await apiFetch('/api/audio-catalog');
      if (!result.ok) {
        const errDetail = result.error || result.message || 'Failed to fetch catalog';
        console.error('[WSPP CATALOG] apiFetch failed:', errDetail, '| status:', result.status);
        sendResponse({ ok: false, error: errDetail });
        return;
      }

      _audioCatalogCache = result.items || [];
      _audioCatalogCacheTs = now;
      console.log('[WSPP CATALOG] Fetched', _audioCatalogCache.length, 'items');
      sendResponse({ ok: true, items: _audioCatalogCache });
    } catch (err) {
      console.error('[WSPP CATALOG] Fetch error:', err);
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});

// GET_CATALOG_AUDIO — returns audio base64 for a single item (with cache)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'GET_CATALOG_AUDIO') return;

  const audioId = msg.id;
  if (!audioId) {
    sendResponse({ ok: false, error: 'Missing audio id' });
    return true;
  }

  (async () => {
    try {
      // Check cache first
      const cached = _audioDataCache.get(audioId);
      if (cached) {
        console.log('[WSPP CATALOG] Audio from cache:', audioId);
        sendResponse({ ok: true, ...cached });
        return;
      }

      const result = await apiFetch(`/api/audio-catalog/${audioId}`);
      if (!result.ok || !result.item?.audioBase64) {
        const errDetail = result.error || result.message || 'Audio not available';
        console.error('[WSPP CATALOG] audio fetch failed:', audioId, errDetail, '| status:', result.status);
        sendResponse({ ok: false, error: errDetail });
        return;
      }

      const data = {
        audioBase64: result.item.audioBase64,
        mimeType: result.item.mimeType || 'audio/ogg; codecs=opus',
        label: result.item.label,
        category: result.item.category,
      };

      // Cache it
      if (_audioDataCache.size >= AUDIO_DATA_CACHE_MAX) {
        const oldest = _audioDataCache.keys().next().value;
        _audioDataCache.delete(oldest);
      }
      _audioDataCache.set(audioId, data);

      console.log('[WSPP CATALOG] Audio fetched:', audioId, data.label);
      sendResponse({ ok: true, ...data });
    } catch (err) {
      console.error('[WSPP CATALOG] Get audio error:', err);
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});

// GENERATE_CATALOG_AUDIO — calls backend to regenerate audio for an item
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'GENERATE_CATALOG_AUDIO') return;
  const itemId = msg.id;
  if (!itemId) { sendResponse({ ok: false, error: 'Missing id' }); return true; }

  (async () => {
    try {
      const result = await apiFetch(`/api/audio-catalog/${itemId}/generate`, { method: 'POST' });
      if (!result.ok) {
        sendResponse({ ok: false, error: result.message || result.error || 'Generation failed' });
        return;
      }
      // Bust audio cache for this item so next fetch gets fresh data
      _audioDataCache.delete(itemId);
      // Also bust metadata cache so duration/size refresh
      _audioCatalogCache = null;
      _audioCatalogCacheTs = 0;
      sendResponse({ ok: true, id: itemId, audioSize: result.audioSize, durationMs: result.durationMs });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});

// UPDATE_CATALOG_SCRIPT — updates the script_text of a catalog item
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'UPDATE_CATALOG_SCRIPT') return;
  const { id: itemId, script_text } = msg;
  if (!itemId || !script_text) { sendResponse({ ok: false, error: 'Missing id or script_text' }); return true; }

  (async () => {
    try {
      const result = await apiFetch(`/api/audio-catalog/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ script_text }),
      });
      if (!result.ok) {
        sendResponse({ ok: false, error: result.message || result.error || 'Update failed' });
        return;
      }
      // Bust all caches — metadata changed
      _audioDataCache.delete(itemId);
      _audioCatalogCache = null;
      _audioCatalogCacheTs = 0;
      sendResponse({ ok: true, id: itemId, script_text });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});

// BUST_AUDIO_CACHE / BUST_CATALOG_CACHE — cache invalidation from inject
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'BUST_AUDIO_CACHE' && msg.id) {
    _audioDataCache.delete(msg.id);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'BUST_CATALOG_CACHE') {
    _audioCatalogCache = null;
    _audioCatalogCacheTs = 0;
    _categoriesCache = null;
    _categoriesCacheTs = 0;
    sendResponse({ ok: true });
    return true;
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CATEGORIES — dynamic categories from backend
// ═══════════════════════════════════════════════════════════════════════
let _categoriesCache = null;
let _categoriesCacheTs = 0;
const CATEGORIES_CACHE_TTL = 5 * 60 * 1000;

// FETCH_CATALOG_CATEGORIES — returns dynamic categories from backend
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'FETCH_CATALOG_CATEGORIES') return;

  (async () => {
    try {
      const now = Date.now();
      if (_categoriesCache && (now - _categoriesCacheTs) < CATEGORIES_CACHE_TTL) {
        sendResponse({ ok: true, categories: _categoriesCache });
        return;
      }
      const result = await apiFetch('/api/audio-catalog-categories');
      if (!result.ok) {
        sendResponse({ ok: false, error: result.error || result.message || 'Failed to fetch categories' });
        return;
      }
      _categoriesCache = result.categories || [];
      _categoriesCacheTs = now;
      console.log('[WSPP CATALOG] Fetched', _categoriesCache.length, 'categories');
      sendResponse({ ok: true, categories: _categoriesCache });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// CREATE_CATALOG_CATEGORY
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'CREATE_CATALOG_CATEGORY') return;
  const { data } = msg;
  if (!data?.key || !data?.label) {
    sendResponse({ ok: false, error: 'Missing key or label' });
    return true;
  }

  (async () => {
    try {
      const result = await apiFetch('/api/audio-catalog-categories', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!result.ok) {
        sendResponse({ ok: false, error: result.message || result.error || 'Create failed' });
        return;
      }
      _categoriesCache = null;
      _categoriesCacheTs = 0;
      sendResponse({ ok: true, category: result.category });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// DELETE_CATALOG_CATEGORY
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'DELETE_CATALOG_CATEGORY') return;
  const catId = msg.id;
  if (!catId) { sendResponse({ ok: false, error: 'Missing id' }); return true; }

  (async () => {
    try {
      const result = await apiFetch(`/api/audio-catalog-categories/${catId}`, { method: 'DELETE' });
      if (!result.ok) {
        sendResponse({ ok: false, error: result.message || result.error || 'Delete failed' });
        return;
      }
      _categoriesCache = null;
      _categoriesCacheTs = 0;
      _audioCatalogCache = null;
      _audioCatalogCacheTs = 0;
      sendResponse({ ok: true, id: catId });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// DELETE_CATALOG_ITEM — deletes a catalog item from the backend
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'DELETE_CATALOG_ITEM') return;
  const itemId = msg.id;
  if (!itemId) { sendResponse({ ok: false, error: 'Missing id' }); return true; }

  (async () => {
    try {
      const result = await apiFetch(`/api/audio-catalog/${itemId}`, { method: 'DELETE' });
      if (!result.ok) {
        sendResponse({ ok: false, error: result.message || result.error || 'Delete failed' });
        return;
      }
      // Bust all caches
      _audioDataCache.delete(itemId);
      _audioCatalogCache = null;
      _audioCatalogCacheTs = 0;
      sendResponse({ ok: true, id: itemId });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});

// CREATE_CATALOG_ITEM — creates a new catalog item in the backend.
// Sends auto_generate: true so the backend calls ElevenLabs immediately
// after creating the item. Response includes audio_generated flag and
// updated item with has_audio / audio_size / duration_ms if TTS succeeded.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'CREATE_CATALOG_ITEM') return;
  const { data } = msg;
  if (!data?.label || !data?.script_text) {
    sendResponse({ ok: false, error: 'Missing required fields (label, script_text)' });
    return true;
  }

  (async () => {
    try {
      const result = await apiFetch('/api/audio-catalog', {
        method: 'POST',
        body: JSON.stringify({ ...data, auto_generate: true }),
      });
      if (!result.ok) {
        sendResponse({ ok: false, error: result.message || result.error || 'Create failed' });
        return;
      }
      // Bust catalog metadata cache so next list fetch is fresh
      _audioCatalogCache = null;
      _audioCatalogCacheTs = 0;
      // Pass through audio_generated + audioSize + durationMs so the panel
      // can update its local state without a second round-trip
      sendResponse({
        ok: true,
        item: result.item ?? result,
        audio_generated: result.audio_generated ?? false,
        audioSize: result.audioSize,
        durationMs: result.durationMs,
        audio_error: result.audio_error,
      });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});
