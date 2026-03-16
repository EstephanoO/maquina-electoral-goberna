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

// 7. Blast panel: mass message UI + anti-ban engine
import './inject/blast-panel.js';

// 8. WA Validator panel: verificación de números + modo conversación
import './inject/wa-validator-panel.js';

// ── Bootstrap WA listeners + catalog button ─────────────────────────
import { tryInstallWAListeners } from './inject/wa-module-installer.js';
import { waitForChatAndInsertButton } from './inject/audio-catalog-panel.js';
import { toggleBlastPanel } from './inject/blast-panel.js';
import { toggleValidatorPanel } from './inject/wa-validator-panel.js';

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

// ── Blast button — fixed bottom-right FAB ────────────────────────────
function insertBlastButton() {
  if (document.getElementById('wspp-blast-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'wspp-blast-fab';
  fab.title = 'Blast Masivo — Goberna';
  fab.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>`;
  Object.assign(fab.style, {
    position: 'fixed', bottom: '20px', right: '20px', zIndex: '2147483645',
    width: '48px', height: '48px', borderRadius: '50%',
    background: '#163960', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 20px rgba(0,0,0,.4)',
    transition: 'transform 0.15s',
  });
  fab.addEventListener('mouseenter', () => fab.style.transform = 'scale(1.1)');
  fab.addEventListener('mouseleave', () => fab.style.transform = 'scale(1)');
  fab.addEventListener('click', () => toggleBlastPanel());
  document.body.appendChild(fab);
}

// Try to insert FAB after WA loads
const tryInsertFab = () => {
  if (document.body) insertBlastButton();
  else setTimeout(tryInsertFab, 1000);
};
setTimeout(tryInsertFab, 4000);

// ── WA Validator FAB — fixed bottom-right, above blast FAB ──────────
function insertValidatorButton() {
  if (document.getElementById('wspp-validator-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'wspp-validator-fab';
  fab.title = 'Validador WA — Goberna';
  fab.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  Object.assign(fab.style, {
    position: 'fixed', bottom: '76px', right: '20px', zIndex: '2147483644',
    width: '44px', height: '44px', borderRadius: '50%',
    background: '#1a3a5c', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,.4)',
    transition: 'transform 0.15s',
  });
  fab.addEventListener('mouseenter', () => fab.style.transform = 'scale(1.1)');
  fab.addEventListener('mouseleave', () => fab.style.transform = 'scale(1)');
  fab.addEventListener('click', () => toggleValidatorPanel());
  document.body.appendChild(fab);
}

const tryInsertValidatorFab = () => {
  if (document.body) insertValidatorButton();
  else setTimeout(tryInsertValidatorFab, 1000);
};
setTimeout(tryInsertValidatorFab, 4500);
