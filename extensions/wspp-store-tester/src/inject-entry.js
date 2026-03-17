// inject-entry.js — Entry point para esbuild.
// Output: inject.js (IIFE, world: MAIN, accede a window.require de WA Web)

// 1. Bootstrap: WA_ORIGIN, getOwnNumber(), isCatalogConsultor(), listeners SET_*
import './inject/bootstrap.js';

// 2. JID resolver: cache, indexes, helpers (depende de bootstrap)
import './inject/jid-resolver.js';

// 3. Send hook: click/keydown listeners (depende de bootstrap + jid-resolver)
import './inject/send-hook.js';

// 4. Validation overlay: overlay DOM + spam overlay (depende de bootstrap)
import './inject/validation-overlay.js';

// 5. WA module installer: MsgCollection, ChatCollection, health check
//    (depende de bootstrap + jid-resolver)
import './inject/wa-module-installer.js';

// 6. Audio catalog panel: panel UI + PTT send
import './inject/audio-catalog-panel.js';

// 7. Template analyzer: análisis de riesgo de plantillas pre-envío
import './inject/template-analyzer.js';

// 8. Blast panel: motor de blast masivo + anti-ban
import './inject/blast-panel.js';

// 9. WA Validator panel: verificación de números (silencioso + conversación)
import './inject/wa-validator-panel.js';

// 10. Chat opener: flujo DOM para abrir chats con números nuevos
import './inject/chat-opener.js';

// 11. Sidebar: panel lateral unificado (reemplaza los 3 FABs separados)
import './inject/sidebar.js';

// ── Bootstrap WA listeners ────────────────────────────────────────────
import { tryInstallWAListeners } from './inject/wa-module-installer.js';
import { insertSidebarFAB } from './inject/sidebar.js';

// Instalar listeners de módulos WA cuando WA Web cargue
if (document.readyState === 'complete') {
  setTimeout(tryInstallWAListeners, 5000);
} else {
  window.addEventListener('load', () => setTimeout(tryInstallWAListeners, 5000));
}

// ── Un único FAB para todo el sistema ────────────────────────────────
// Reemplaza los 3 FABs anteriores (blast, validador, catálogo)
// El sidebar contiene todo: contactos, audios, estado.
const tryInsertFAB = () => {
  if (document.body) insertSidebarFAB();
  else setTimeout(tryInsertFAB, 1000);
};
setTimeout(tryInsertFAB, 3500);
