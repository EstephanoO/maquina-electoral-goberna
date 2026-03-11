// scorer-bootstrap.js — precalienta el conversation-scorer con historial del backend.
//
// PROBLEMA QUE RESUELVE:
//   Al iniciar el service worker (primer uso, reinstalación, o SW terminado por Chrome),
//   el scorer arranca en frío. Los primeros N mensajes de cada contacto no tienen
//   contexto acumulado, por lo que un solo mensaje negativo puede clasificar a alguien
//   como "invalido" aunque tenga semanas de señales positivas en el backend.
//
// SOLUCIÓN:
//   Al arrancar el SW, llamar GET /api/validacion/scorer-bootstrap.
//   El backend devuelve los últimos 20 eventos auto por teléfono (máx 500 phones).
//   Los signals se inyectan en el scorer como si hubieran llegado en tiempo real.
//
// INVARIANTES:
//   - Idempotente: llamarlo dos veces no duplica signals.
//   - No sobrescribe: si un teléfono ya tiene signals en memoria, se saltea.
//   - No bloquea: fire-and-forget desde background-entry. Los mensajes pueden
//     llegar antes de que termine, el scorer simplemente tiene menos contexto.
//   - Solo se ejecuta una vez por sesión de SW (flag _bootstrapped).
//   - No falla silenciosamente: loguea resultado o error para diagnóstico.

import { apiFetch } from './api-client.js';
import { recordSignalRaw, setScorerConfig, flushScorerStorage } from './conversation-scorer.js';

const BOOTSTRAP_KEY = 'wspp_scorer_bootstrapped_at';
// No re-bootstrappear si ya se hizo en las últimas 6 horas (ej: SW reiniciado por Chrome)
const BOOTSTRAP_COOLDOWN_MS = 6 * 60 * 60 * 1000;

let _bootstrapped = false;

/**
 * Precalienta el scorer con historial del backend.
 * Diseñado para llamarse desde background-entry después de que api-client
 * y conversation-scorer estén cargados.
 *
 * Flujo:
 *   1. Verificar cooldown en chrome.storage para evitar re-runs en SW cortos
 *   2. Llamar GET /api/validacion/scorer-bootstrap
 *   3. Por cada signal devuelto, llamar recordSignalRaw() (no recalcula score)
 *   4. La extensión queda con scorer caliente sin haber recibido un solo mensaje
 */
export async function bootstrapScorer() {
  if (_bootstrapped) return;
  _bootstrapped = true;

  // Cooldown check: evita re-bootstrap si el SW estuvo activo hace poco
  const stored = await new Promise(r => chrome.storage.local.get([BOOTSTRAP_KEY], r));
  const lastRun = stored[BOOTSTRAP_KEY] ?? 0;
  if (Date.now() - lastRun < BOOTSTRAP_COOLDOWN_MS) {
    console.log(`[SCORER BOOTSTRAP] Cooldown activo — último bootstrap hace ${Math.round((Date.now() - lastRun) / 60000)}min, saltando`);
    return;
  }

  console.log('[SCORER BOOTSTRAP] Iniciando precalentamiento desde backend...');
  const t0 = Date.now();

  // ── Paso 0: Cargar config de scorer de la campaña (umbrales, pesos, decay) ──
  // Se aplica ANTES de inyectar signals, para que los pesos sean los correctos.
  try {
    const cfgRes = await apiFetch('/api/validacion/scorer-config');
    if (cfgRes.ok && cfgRes.config) {
      setScorerConfig(cfgRes.config);
      console.log('[SCORER BOOTSTRAP] Config de campaña aplicada', cfgRes.has_overrides ? '(con overrides)' : '(defaults)');
    }
  } catch (err) {
    console.warn('[SCORER BOOTSTRAP] Error cargando config:', err?.message || err);
    // No fatal — seguimos con defaults
  }

  let signals;
  try {
    const res = await apiFetch('/api/validacion/scorer-bootstrap');
    if (!res.ok) {
      // Sin campaña configurada todavía (usuario no logueado) — silencioso
      if (res.error === 'No auth' || res.code === 'AUTH_TOKEN_MISSING') {
        console.log('[SCORER BOOTSTRAP] Sin auth — se reintentará al próximo arranque de SW');
      } else {
        console.warn('[SCORER BOOTSTRAP] Error del backend:', res.error || res.message || res.code);
      }
      _bootstrapped = false; // permitir reintento
      return;
    }
    signals = res.signals;
  } catch (err) {
    console.warn('[SCORER BOOTSTRAP] Fallo de red:', err?.message || err);
    _bootstrapped = false;
    return;
  }

  if (!Array.isArray(signals) || signals.length === 0) {
    console.log('[SCORER BOOTSTRAP] Sin historial en backend para esta campaña');
    await chrome.storage.local.set({ [BOOTSTRAP_KEY]: Date.now() });
    return;
  }

  // Inyectar signals en el scorer.
  // recordSignalRaw() acepta ts histórico y no activa _persist() en ráfaga
  // (el scorer llama _persistImmediate() una sola vez al terminar el bootstrap).
  let injected = 0;
  let skipped = 0;

  for (const sig of signals) {
    if (!sig.phone || !sig.category || typeof sig.confidence !== 'number' || !sig.ts) continue;
    const wasInjected = recordSignalRaw(sig.phone, sig.category, sig.confidence, sig.ts);
    if (wasInjected) injected++;
    else skipped++;
  }

  // Persistir el estado resultante de una vez
  if (injected > 0) {
    // Llamamos a flushScorerStorage() que hace un _persistImmediate sin debounce
    flushScorerStorage();
  }

  const elapsed = Date.now() - t0;
  const phones = new Set(signals.map(s => s.phone)).size;
  console.log(
    `[SCORER BOOTSTRAP] ✓ ${injected} signals inyectadas (${skipped} saltadas — teléfonos ya calientes) | ${phones} phones | ${elapsed}ms`
  );

  await chrome.storage.local.set({ [BOOTSTRAP_KEY]: Date.now() });
}

// Re-exportamos para que bootstrap pueda ser reintentado tras login exitoso
export { bootstrapScorer as retryBootstrap };
