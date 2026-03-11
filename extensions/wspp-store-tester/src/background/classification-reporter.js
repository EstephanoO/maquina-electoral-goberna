// ═══════════════════════════════════════════════════════════════════════
// CLASSIFICATION EVENT REPORTER — persiste clasificaciones en el backend
// para el dashboard de monitoreo, métricas de accuracy, y correcciones
// ═══════════════════════════════════════════════════════════════════════

import { apiFetch } from './api-client.js';

/**
 * Reporta un evento de clasificación al backend (fire-and-forget).
 * No bloquea el flujo principal — errores se loguean pero se ignoran.
 */
export function reportClassificationEvent(data) {
  apiFetch('/api/validacion/classification-event', {
    method: 'POST',
    body: JSON.stringify(data),
  }).then(res => {
    if (res.ok) {
      console.log('[WSPP CLASSIFY-EVENT] ✓ Reportado:', data.source, data.category);
    } else {
      console.warn('[WSPP CLASSIFY-EVENT] Error:', res.message || res.error);
    }
  }).catch(err => {
    console.warn('[WSPP CLASSIFY-EVENT] Fetch error:', err.message);
  });
}
