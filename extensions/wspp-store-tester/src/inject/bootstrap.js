// bootstrap.js — shared state y listeners de configuración.
// inject.js corre en world MAIN y NO tiene acceso a chrome.storage.
// content.js (ISOLATED) lee los valores y los empuja via postMessage.

// H-3+H-4: Only accept postMessages from WA Web's own origin
export const WA_ORIGIN = 'https://web.whatsapp.com';

// ─── own_number y user_role desde storage (via content.js) ──────────────────
export let _ownNumber = null;
export let _catalogIsConsultor = false; // true when effective role is consultor or admin

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (e.data?.type === 'WSPP_SET_OWN_NUMBER') {
    _ownNumber = e.data.number || null;
    console.log('[WSPP] own_number actualizado:', _ownNumber ?? 'NULL');
    return;
  }
  if (e.data?.type === 'WSPP_SET_USER_ROLE') {
    const role = e.data.role || 'agente_digital';
    _catalogIsConsultor = ['admin', 'consultor'].includes(role);
    console.log('[WSPP] user_role actualizado:', role, '| consultor:', _catalogIsConsultor);
    return;
  }
});
