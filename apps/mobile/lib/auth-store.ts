/**
 * Auth token storage usando expo-secure-store.
 * Tokens JWT se guardan cifrados en el keychain del dispositivo.
 * NUNCA usar AsyncStorage para tokens.
 *
 * Also stores:
 * - Campaign memberships (from login response)
 * - Device UUID (stable per install, used as client_id for dedupe)
 */

import * as SecureStore from 'expo-secure-store';

import type { AuthUser, CampaignMembership, RefreshResponse } from './types';

const KEYS = {
  ACCESS_TOKEN: 'goberna_access_token',
  REFRESH_TOKEN: 'goberna_refresh_token',
  USER_JSON: 'goberna_user',
  CAMPAIGNS_JSON: 'goberna_campaigns',
  DEVICE_UUID: 'goberna_device_uuid',
  ACTIVE_CAMPAIGN_ID: 'goberna_active_campaign_id',
  FORM_CONFIG_JSON: 'goberna_form_config',
} as const;

// ─── In-memory cache for hot-path reads ─────────────────────
// Avoids SecureStore IPC (Keychain) on every authenticated request.
// Invalidated on login, logout, switchCampaign, and token refresh.

let _cachedCampaignId: string | null | undefined = undefined; // undefined = not loaded yet

// ─── Access Token ───────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
}

export async function setAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, token);
}

// ─── Refresh Token ──────────────────────────────────────────

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, token);
}

// ─── User data ──────────────────────────────────────────────

export async function getStoredUser(): Promise<AuthUser | null> {
  const json = await SecureStore.getItemAsync(KEYS.USER_JSON);
  if (!json) return null;
  try {
    return JSON.parse(json) as AuthUser;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: AuthUser): Promise<void> {
  await SecureStore.setItemAsync(KEYS.USER_JSON, JSON.stringify(user));
}

// ─── Campaigns ──────────────────────────────────────────────

export async function getStoredCampaigns(): Promise<CampaignMembership[]> {
  const json = await SecureStore.getItemAsync(KEYS.CAMPAIGNS_JSON);
  if (!json) return [];
  try {
    return JSON.parse(json) as CampaignMembership[];
  } catch {
    return [];
  }
}

export async function setStoredCampaigns(campaigns: CampaignMembership[]): Promise<void> {
  await SecureStore.setItemAsync(KEYS.CAMPAIGNS_JSON, JSON.stringify(campaigns));
}

// ─── Active Campaign (cached in memory) ─────────────────────

export async function getActiveCampaignId(): Promise<string | null> {
  // Serve from memory cache to avoid Keychain IPC on every request
  if (_cachedCampaignId !== undefined) return _cachedCampaignId;
  const id = await SecureStore.getItemAsync(KEYS.ACTIVE_CAMPAIGN_ID);
  _cachedCampaignId = id;
  return id;
}

export async function setActiveCampaignId(id: string): Promise<void> {
  _cachedCampaignId = id; // Update cache immediately
  await SecureStore.setItemAsync(KEYS.ACTIVE_CAMPAIGN_ID, id);
}

// ─── Device UUID (stable per install) ───────────────────────

export async function getDeviceUUID(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEYS.DEVICE_UUID);
  if (existing) return existing;

  // Generate once and persist — use crypto.randomUUID() (available in Hermes/RN)
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : _fallbackUUID();
  await SecureStore.setItemAsync(KEYS.DEVICE_UUID, uuid);
  return uuid;
}

/** Fallback for envs where crypto.randomUUID is unavailable (should not happen in Hermes). */
function _fallbackUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Cached Form Config (survives network failures) ─────────

export async function getStoredFormConfig(): Promise<unknown | null> {
  const json = await SecureStore.getItemAsync(KEYS.FORM_CONFIG_JSON);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function setStoredFormConfig(formDef: unknown): Promise<void> {
  if (!formDef) {
    await SecureStore.deleteItemAsync(KEYS.FORM_CONFIG_JSON);
    return;
  }
  await SecureStore.setItemAsync(KEYS.FORM_CONFIG_JSON, JSON.stringify(formDef));
}

// ─── Save all auth data at once (after login) ──────────────
// Sequential writes to avoid concurrent Keychain IPC issues on iOS.

export async function saveAuthData(data: {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
  campaigns: CampaignMembership[];
}): Promise<void> {
  await setAccessToken(data.access_token);
  await setRefreshToken(data.refresh_token);
  await setStoredUser(data.user);
  await setStoredCampaigns(data.campaigns);

  // Auto-select first campaign if none active or current is no longer valid
  if (data.campaigns.length > 0) {
    const currentActive = await getActiveCampaignId();
    const validIds = data.campaigns.map((c) => c.id);
    if (!currentActive || !validIds.includes(currentActive)) {
      await setActiveCampaignId(data.campaigns[0].id);
    }
  }
}

// ─── Clear all (logout) ────────────────────────────────────
// Sequential writes to avoid concurrent Keychain IPC issues on iOS.

export async function clearAuthData(): Promise<void> {
  _cachedCampaignId = undefined; // Invalidate memory cache
  await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(KEYS.USER_JSON);
  await SecureStore.deleteItemAsync(KEYS.CAMPAIGNS_JSON);
  await SecureStore.deleteItemAsync(KEYS.ACTIVE_CAMPAIGN_ID);
  await SecureStore.deleteItemAsync(KEYS.FORM_CONFIG_JSON);
  // Note: DEVICE_UUID is NOT cleared on logout (it's per-install, not per-session)
}

// ─── Check if we have a session ─────────────────────────────

export async function hasSession(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

// ─── Token refresh (shared by api.ts and sync-service.ts) ───
// Single implementation to avoid drift. Both callers import from here.
//
// Returns:
//   'ok'        — tokens refreshed successfully
//   'expired'   — 401/403 from refresh endpoint, or no refresh token stored
//                 → caller SHOULD clear session and redirect to login
//   'transient' — 5xx, network error, timeout
//                 → caller MUST NOT clear session; just retry later

export type RefreshResult = 'ok' | 'expired' | 'transient';

let _refreshPromise: Promise<RefreshResult> | null = null;

export async function refreshTokens(apiBase: string): Promise<RefreshResult> {
  // Deduplicate concurrent refresh attempts
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async (): Promise<RefreshResult> => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return 'expired';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);

      try {
        const response = await fetch(`${apiBase}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) return 'expired';
        if (!response.ok) return 'transient';

        const data = await response.json() as RefreshResponse;
        await setAccessToken(data.access_token);
        await setRefreshToken(data.refresh_token);
        return 'ok';
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      // Network drop, AbortError (timeout), etc. — do NOT clear session
      return 'transient';
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}
