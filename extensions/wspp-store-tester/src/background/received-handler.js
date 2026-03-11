// ═══════════════════════════════════════════════════════════════════════
// M-2: Per-phone classification queue — prevents concurrent race conditions
// Two messages from the same phone arriving simultaneously both reading
// cache and both trying to classify/update would cause conflicts.
// ═══════════════════════════════════════════════════════════════════════

import { classifyWithAggregation, MSG_BUFFER_SUPERSEDED } from './message-aggregator.js';
import { recordConversation } from './gemini-fallback.js';
import { apiFetch } from './api-client.js';
import { getCachedValidation, claimValidation, updateValidationStatus, invalidateCache } from './validation-client.js';
import { reportClassificationEvent } from './classification-reporter.js';
import { mergeWithConversationScore, resetConversationScore, getConversationDebug } from './conversation-scorer.js';

const _phoneQueue = new Map(); // phone → Promise chain

function enqueueForPhone(phone, fn) {
  const key = phone || '__unknown__';
  const prev = _phoneQueue.get(key) || Promise.resolve();
  const next = prev.then(fn).catch(fn); // run even if previous errored
  _phoneQueue.set(key, next);
  // Clean up after completion to avoid memory leak
  next.finally(() => {
    if (_phoneQueue.get(key) === next) _phoneQueue.delete(key);
  });
  return next;
}

// Imported by sent-handler.js — export so it can be reused
export { enqueueForPhone };

// ═══════════════════════════════════════════════════════════════════════
// INCOMING MESSAGE HANDLER (WSPP_RECEIVED)
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'WSPP_RECEIVED') return;

  const { phone, contact_name, preview, own_number, msg_type, timestamp, from_jid } = msg.payload;

  const _who = contact_name || phone || (from_jid ? `@lid:${from_jid.split('@')[0]?.slice(-6)}` : '???');
  const _previewShort = (preview || '').slice(0, 80);

  console.log(
    '\n%c ══════════ MENSAJE ENTRANTE ══════════ ',
    'background:#0e2640;color:#FFC800;font-weight:900;padding:4px 12px;border-radius:4px;font-size:13px',
  );
  console.log(
    '%c De: %c' + _who + '%c  |  Tipo: ' + msg_type,
    'color:#7a95aa', 'color:#e9eef3;font-weight:700', 'color:#7a95aa',
  );
  if (_previewShort) {
    console.log('%c  📩 "' + _previewShort + (preview && preview.length > 80 ? '…"' : '"'), 'color:#5a8aaa;font-style:italic');
  }

  // Record conversation for AI context
  recordConversation(phone || from_jid, preview, 'in');

  // M-2: Enqueue per-phone to prevent race conditions on concurrent messages
  enqueueForPhone(phone || from_jid, async () => {
    // H-5: Step 1 — fire-and-forget CMS event (non-blocking)
    const eventBody = {
      type: 'message_received',
      phone: phone || undefined,
      contact_name: contact_name || undefined,
      own_number: own_number || undefined,
      preview: preview || undefined,
      detected_at: (timestamp || Math.floor(Date.now() / 1000)) * 1000,
    };

    apiFetch('/api/cms/extension-event', {
      method: 'POST',
      body: JSON.stringify(eventBody),
    }).then(j => {
      if (j.filtered) {
        console.log('%c  📡 CMS: filtrado (own_number no registrado)', 'color:#555');
      } else if (j.matched) {
        console.log('%c  📡 CMS: match con contacto ' + j.contact_id, 'color:#3b82f6');
      }
    });

    // Report to conversations module (uses from_jid as primary identifier)
    reportConversation(from_jid, own_number, 'in', preview, phone, contact_name);

    // H-5: Step 2 — Incrementar contador (non-blocking)
    chrome.storage.local.get(['wspp_received_count'], (data) => {
      chrome.storage.local.set({ wspp_received_count: (data.wspp_received_count ?? 0) + 1 });
    });

    // H-5: Step 3 — Clasificar (may buffer short messages)
    const rawClassification = await classifyWithAggregation(phone, preview, from_jid);

    // M-5: Check for superseded sentinel — this message was replaced by a newer aggregate
    if (rawClassification === MSG_BUFFER_SUPERSEDED) {
      console.log('%c  ⏭️  Mensaje superseded por agregación — esperando buffer completo', 'color:#7a95aa');
      sendResponse({ validation: null, superseded: true });
      return;
    }

    // CONV-SCORE: fusionar clasificación del mensaje con score conversacional acumulado
    // El scorer mantiene historial de todos los mensajes y produce una clasificación estable.
    // Un solo mensaje negativo (invalido) no revierte semanas de señales positivas.
    const phoneKey = phone || from_jid;
    const classification = mergeWithConversationScore(phoneKey, rawClassification);

    if (rawClassification && classification) {
      const confPct = Math.round(classification.confidence * 100);
      const confColor = confPct >= 85 ? '#22c55e' : confPct >= 70 ? '#f59e0b' : '#ef5350';
      const scoreOverride = classification.score !== undefined;
      console.log(
        '%c  🧠 CLASIFICADO → %c' + classification.category +
        '%c  |  vote: %c' + (classification.vote_class || 'invalido') +
        '%c  |  status: %c' + classification.status +
        '%c  |  conf: %c' + confPct + '%' +
        (scoreOverride ? `%c  |  score: %c${(classification.score).toFixed(2)}` : ''),
        'color:#06b6d4;font-weight:700',
        'color:#FFC800;font-weight:900',
        'color:#555',
        'color:' + (classification.vote_class === 'duro' ? '#22c55e' : classification.vote_class === 'blando' ? '#f59e0b' : classification.vote_class === 'flotante' ? '#a855f7' : '#ef5350') + ';font-weight:900',
        'color:#555',
        'color:#3b82f6;font-weight:700',
        'color:#555',
        'color:' + confColor + ';font-weight:900',
        ...(scoreOverride ? ['color:#555', 'color:#a855f7;font-weight:700'] : []),
      );
      console.log('%c     Razón: ' + classification.reason, 'color:#7a95aa');
      if (rawClassification && rawClassification.vote_class !== classification.vote_class) {
        console.log(
          '%c     ↳ Scorer: %c' + (classification.vote_class || 'invalido') +
          '%c vs msg raw: %c' + (rawClassification.vote_class || 'invalido'),
          'color:#a855f7', 'color:#FFC800;font-weight:700',
          'color:#7a95aa', 'color:#ef5350;font-weight:700',
        );
      }
    } else if (!classification) {
      console.log('%c  🧠 Sin clasificación (mensaje muy corto o sin patrones)', 'color:#555');
    }

    // 4. Buscar validación por teléfono
    const validation = await getCachedValidation(phone);

    if (validation) {
      console.log(
        '%c  🔍 MATCH VALIDACIÓN → %c' + validation.nombre +
        '%c  |  tel: ' + validation.telefono +
        '  |  estado: %c' + validation.status +
        '%c  |  vote: %c' + (validation.vote_class || '—'),
        'color:#22c55e;font-weight:700',
        'color:#e9eef3;font-weight:900',
        'color:#555',
        'color:#3b82f6;font-weight:700',
        'color:#555',
        'color:#FFC800;font-weight:700',
      );
    } else {
      console.log('%c  🔍 Sin match en validación' + (phone ? ' (tel: ' + phone + ')' : ' (sin teléfono)'), 'color:#555');
    }

    let result = { validation: null };

    if (validation) {
      // 5. Auto-clasificar si el item está en estado contactado/respondido y hay clasificación.
      // CONV-SCORE: Ya no bloqueamos por hasVoteClass. El scorer conversacional integra el
      // historial completo, así que siempre es válido actualizar con su resultado.
      // Excepción: si la nueva clasificación es igual a la actual, no hay necesidad de escribir.
      const canAutoClassify =
        classification &&
        classification.confidence >= 0.7 &&
        !classification._fromConversationHistory &&   // no escribir al backend si es solo historial acumulado sin mensaje nuevo
        (validation.status === 'contactado' || validation.status === 'respondido' || validation.status === 'pendiente');

      const hasVoteClass = validation.vote_class && validation.vote_class !== '';
      // Actualizar si cualquiera de los dos campos es diferente (vote_class o status)
      const currentVoteClass = validation.vote_class || '';
      const currentStatus = validation.status || '';
      const newVoteClass = classification?.vote_class || '';
      const newStatus = classification?.status || '';
      const classChanged = currentVoteClass !== newVoteClass || currentStatus !== newStatus;
      const shouldClassify = canAutoClassify && classChanged;

      if (shouldClassify) {
        // Claim primero si no está reclamado
        if (!validation.claimed_by) {
          await claimValidation(validation.id);
        }

        // Auto-transicionar pendiente → contactado primero si es necesario
        if (validation.status === 'pendiente') {
          await updateValidationStatus(validation.id, 'contactado', '', null);
        }

        // Aplicar clasificación
        const autoNote = `[AUTO] ${classification.category}: ${classification.reason} (conf: ${classification.confidence})`;
        const updateRes = await updateValidationStatus(
          validation.id,
          classification.status,
          classification.vote_class,
          autoNote,
        );

        if (updateRes.ok && updateRes.item) {
          invalidateCache(phone);
          result.validation = updateRes.item;
          result.classified = true;
          result.classification = classification;

          console.log(
            '%c  ✅ AUTO-CLASIFICADO en backend → %c' + classification.vote_class + ' / ' + classification.status,
            'background:#0e2640;color:#22c55e;font-weight:900;padding:2px 8px;border-radius:3px',
            'color:#FFC800;font-weight:900',
          );

          // Reportar evento de clasificación al backend (fire-and-forget)
          reportClassificationEvent({
            phone: phone || undefined,
            contact_name: contact_name || undefined,
            message_text: (preview || '').slice(0, 2000),
            validation_id: validation.id,
            source: 'auto',
            category: classification.category,
            vote_class: classification.vote_class,
            status: classification.status,
            confidence: classification.confidence,
            reason: classification.reason,
          });
        } else {
          result.validation = validation;
          console.log('%c  ❌ Error aplicando clasificación: ' + (updateRes.error || updateRes.message), 'color:#ef5350;font-weight:700');
        }
      } else {
        // Si ya tiene clasificación o no hay match, solo auto-transicionar contactado→respondido
        if (validation.status === 'contactado' && !classification) {
          await updateValidationStatus(validation.id, 'respondido', '', null);
          invalidateCache(phone);
          const updated = await getCachedValidation(phone);
          result.validation = updated || validation;
          console.log('%c  ↗️  Auto-transición: contactado → respondido (sin clasificar)', 'color:#3b82f6');
        } else {
          result.validation = validation;
          if (hasVoteClass) {
            console.log('%c  ⏭️  Ya clasificado como: ' + validation.vote_class + ' — no se sobreescribe', 'color:#7a95aa');
          } else if (classification && classification.confidence < 0.7) {
            console.log('%c  ⏭️  Confianza baja (' + Math.round(classification.confidence * 100) + '%) — no auto-clasifica', 'color:#f59e0b');
          }
        }
        result.classified = false;
      }
    } else if (classification) {
      result.classification = classification;

      // Reportar evento aunque no haya match de validación
      reportClassificationEvent({
        phone: phone || undefined,
        contact_name: contact_name || undefined,
        message_text: (preview || '').slice(0, 2000),
        source: 'auto',
        category: classification.category,
        vote_class: classification.vote_class,
        status: classification.status,
        confidence: classification.confidence,
        reason: classification.reason,
      });
    }

    console.log(
      '%c ════════════════════════════════════════ \n',
      'background:#0e2640;color:#334d63;padding:2px 12px;border-radius:4px',
    );

    sendResponse(result);
  }); // end enqueueForPhone

  return true; // keep sendResponse alive for async
});

// ═══════════════════════════════════════════════════════════════════════
// reportConversation — shared helper used by received-handler and sent-handler
// ═══════════════════════════════════════════════════════════════════════

/**
 * Report a message to the conversations module.
 * Fire-and-forget — does not block the main handler flow.
 * Requires a JID (from_jid for inbound, to_jid for outbound).
 * If no JID is available (DOM-only WSPP_SENT), silently skips.
 */
export function reportConversation(jid, ownNumber, direction, text, phone, contactName) {
  if (!jid || !ownNumber) return;
  const body = {
    jid,
    own_number: ownNumber,
    direction,
    text: (text || '').slice(0, 2000),
    phone: phone || undefined,
    contact_name: contactName || undefined,
    timestamp: Date.now(),
  };
  apiFetch('/api/conversations/message', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(j => {
    if (j.ok) {
      console.log(`[CONV] ✓ ${direction} → conv #${j.conversation_id}`,
        j.is_new ? '(nueva)' : `(msg #${j.message_count})`,
        j.auto_classified ? '🤖 clasificada' : '');
    } else {
      console.warn('[CONV] ✗', j.error || j.message || j.code);
    }
  }).catch(err => {
    console.warn('[CONV] error:', err?.message || err);
  });
}
