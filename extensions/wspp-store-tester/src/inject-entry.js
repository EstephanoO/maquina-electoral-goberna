// inject-entry.js — Entry point para esbuild.
// Importa los módulos en el orden correcto.
// Output: inject.js (IIFE, --format=iife via esbuild)

// 1. Bootstrap: WA_ORIGIN, _ownNumber, _catalogIsConsultor, listeners SET_*
import './inject/bootstrap.js';

// 2. JID resolver: cache, indexes, helpers (depende de bootstrap)
import './inject/jid-resolver.js';

// 3. Send hook: click/keydown listeners (depende de bootstrap + jid-resolver)
import './inject/send-hook.js';

// 4. Validation overlay: overlay DOM + message listener (depende de bootstrap)
import './inject/validation-overlay.js';

// 5. WA module installer: MsgCollection, ChatCollection, health check
//    (depende de bootstrap + jid-resolver)
import './inject/wa-module-installer.js';

// 6. Audio catalog panel: panel UI + PTT send
//    (depende de bootstrap + wa-module-installer._lastActiveChatJid)
import './inject/audio-catalog-panel.js';

// ── Bootstrap WA listeners + catalog button ─────────────────────────
import { tryInstallWAListeners } from './inject/wa-module-installer.js';
import { waitForChatAndInsertButton } from './inject/audio-catalog-panel.js';

// Esperar a que WA Web cargue para instalar listeners de módulos internos
if (document.readyState === 'complete') {
  setTimeout(tryInstallWAListeners, 5000);
} else {
  window.addEventListener('load', () => setTimeout(tryInstallWAListeners, 5000));
}

// Wait for WA Web to load before inserting catalog button
if (document.readyState === 'complete') {
  setTimeout(waitForChatAndInsertButton, 3000);
} else {
  window.addEventListener('load', () => setTimeout(waitForChatAndInsertButton, 3000));
}
