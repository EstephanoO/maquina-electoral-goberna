// validation-client.js — lookup y update de validaciones en el backend.

import { apiFetch } from './api-client.js';

export async function lookupValidation(phone) {
  if (!phone) return null;
  const res = await apiFetch(`/api/validacion/lookup?phone=${encodeURIComponent(phone)}`);
  if (res.ok && res.item) return res.item;
  return null;
}

export async function updateValidationStatus(id, status, vote_class, notes) {
  const body = { status, vote_class: vote_class || undefined, notes: notes || undefined };
  const res = await apiFetch(`/api/validacion/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res;
}

export async function claimValidation(id) {
  return apiFetch(`/api/validacion/${id}/claim`, { method: 'PUT' });
}

// ── Cache local de validaciones por teléfono ────────────────────────────────
const _validationCache = new Map(); // phone → { item, ts }
const CACHE_TTL = 5 * 60 * 1000;   // 5 minutos

export async function getCachedValidation(phone) {
  if (!phone) return null;
  const cached = _validationCache.get(phone);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return cached.item;
  }
  const item = await lookupValidation(phone);
  if (item) {
    _validationCache.set(phone, { item, ts: Date.now() });
  } else {
    // M-3: Cache negativo corto (15s)
    _validationCache.set(phone, { item: null, ts: Date.now() - CACHE_TTL + 15000 });
  }
  return item;
}

export function invalidateCache(phone) {
  if (phone) _validationCache.delete(phone);
}
