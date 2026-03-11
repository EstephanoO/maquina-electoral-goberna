// ═══════════════════════════════════════════════════════════════════════
// CLASSIFY HANDLER (WSPP_CLASSIFY — operador clasifica manualmente)
// ═══════════════════════════════════════════════════════════════════════

import { getCachedValidation, claimValidation, updateValidationStatus, invalidateCache } from './validation-client.js';
import { recordCorrection } from './adaptive-scoring.js';
import { reportClassificationEvent } from './classification-reporter.js';
import { seedConversationScore } from './conversation-scorer.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'WSPP_CLASSIFY') return;

  const { validation_id, vote_class, status, original_category } = msg.payload;

  (async () => {
    try {
      // Claim primero
      await claimValidation(validation_id);

      // Fetch current state before updating (for adaptive scoring)
      const currentValidation = await getCachedValidation(msg.payload._phone);

      // Actualizar status
      const res = await updateValidationStatus(validation_id, status, vote_class, '[MANUAL] Clasificado desde extensión WA');
      if (res.ok && res.item) {
        // Invalidar cache para este teléfono
        invalidateCache(res.item.telefono);

        // CONV-SCORE: Sembrar historial con la corrección del operador.
        // En lugar de borrar el historial (que causaría que el próximo mensaje
        // empiece desde cero), sembramos signals que reflejan la decisión correcta.
        // Los mensajes futuros se acumularán sobre esta base.
        if (res.item.telefono || msg.payload._phone) {
          seedConversationScore(
            res.item.telefono || msg.payload._phone,
            vote_class,
            status,
          );
        }

        // Adaptive scoring: learn from operator correction
        if (original_category || (currentValidation && currentValidation.vote_class)) {
          const prevCategory = original_category || currentValidation?.vote_class || '';
          const wasCorrect = prevCategory === vote_class;
          recordCorrection(prevCategory, vote_class, wasCorrect);
        }

        // Reportar evento de clasificación manual
        reportClassificationEvent({
          phone: res.item.telefono || undefined,
          contact_name: res.item.nombre || undefined,
          validation_id: validation_id,
          source: 'manual',
          category: 'manual_override',
          vote_class: vote_class,
          status: status,
          confidence: 1.0,
          reason: 'Clasificación manual desde extensión WA',
        });

        sendResponse({ ok: true, item: res.item });
      } else {
        sendResponse({ ok: false, error: res.message || 'Error al clasificar' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});
