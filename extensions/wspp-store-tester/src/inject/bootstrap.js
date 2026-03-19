// bootstrap.js — shared state y listeners de configuración.
// inject.js corre en world MAIN y NO tiene acceso a chrome.storage.
// content.js (ISOLATED) lee los valores y los empuja via postMessage.

// H-3+H-4: Only accept postMessages from WA Web's own origin
export const WA_ORIGIN = 'https://web.whatsapp.com';

// ─── own_number y user_role desde storage (via content.js) ──────────────────
//
// IMPORTANTE — esbuild IIFE live bindings:
// esbuild compila todos los módulos inject en un solo IIFE. Cuando otro módulo
// hace `import { _ownNumber } from './bootstrap.js'`, esbuild captura el valor
// en el momento de la compilación (null/false), NO una referencia viva.
// Por eso estas variables se exportan como funciones getter, no como `export let`.
// Los consumidores deben llamar getOwnNumber() / isCatalogConsultor().
//
// El setter setOwnNumber() sí funciona como función (las funciones son estables).

let _ownNumber = null;
let _catalogIsConsultor = false;
let _userRole = 'agente_digital';

/** Número de WA propio del operador (ej: "51901938157") o null si no detectado */
export function getOwnNumber() { return _ownNumber; }

/** true cuando el usuario puede crear/editar/borrar items del catálogo de audio */
export function isCatalogConsultor() { return _catalogIsConsultor; }

/** true when user has consultor-level access (can see blast panel, WA sidebar) */
export function isConsultorLevel() {
  return ['admin', 'consultor', 'candidato'].includes(_userRole);
}

/** Setter para _ownNumber — llamado por wa-module-installer al detectar el número */
export function setOwnNumber(num) {
  _ownNumber = num || null;
}

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (e.data?.type === 'WSPP_SET_OWN_NUMBER') {
    _ownNumber = e.data.number || null;
    console.log('[WSPP] own_number actualizado:', _ownNumber ?? 'NULL');
    return;
  }
  if (e.data?.type === 'WSPP_SET_USER_ROLE') {
    const role = e.data.role || 'agente_digital';
    const audioAdmin = !!e.data.perm_audio_admin;
    _userRole = role;
    _catalogIsConsultor = ['admin', 'consultor'].includes(role) || audioAdmin;
    console.log('[WSPP] user_role actualizado:', role, '| audio_admin:', audioAdmin, '| catalogCRUD:', _catalogIsConsultor, '| consultorLevel:', isConsultorLevel());
    return;
  }
});
