// bootstrap.js — constantes globales del background service worker.

export const API = 'https://api.goberna.us';

// S-9: Extension version header for backend observability
export const EXT_VERSION = chrome.runtime.getManifest?.()?.version ?? 'unknown';

// S-10: Use chrome.storage.session for access_token (more secure — cleared on browser close).
// Refresh token stays in chrome.storage.local for persistence across restarts.
// On SW wake-up, if session token is gone, auto-refresh from local refresh token.
if (chrome.storage.session?.setAccessLevel) {
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
}

// ── ElevenLabs TTS ─────────────────────────────────────────────────────
// C-1 FIX: API key moved to backend proxy. Extension calls /api/tts/generate.
export const ELEVENLABS_VOICE_ID = 'iaSdolcffUuIlEi5pdbj';  // César Vásquez — voz clonada
