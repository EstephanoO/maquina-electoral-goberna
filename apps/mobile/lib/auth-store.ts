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

import type { AuthUser, CampaignMembership } from './types';

const KEYS = {
  ACCESS_TOKEN: 'goberna_access_token',
  REFRESH_TOKEN: 'goberna_refresh_token',
  USER_JSON: 'goberna_user',
  CAMPAIGNS_JSON: 'goberna_campaigns',
  DEVICE_UUID: 'goberna_device_uuid',
  ACTIVE_CAMPAIGN_ID: 'goberna_active_campaign_id',
} as const;

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

// ─── Active Campaign ────────────────────────────────────────

export async function getActiveCampaignId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.ACTIVE_CAMPAIGN_ID);
}

export async function setActiveCampaignId(id: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.ACTIVE_CAMPAIGN_ID, id);
}

// ─── Device UUID (stable per install) ───────────────────────

export async function getDeviceUUID(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEYS.DEVICE_UUID);
  if (existing) return existing;

  // Generate once and persist
  const uuid = generateUUID();
  await SecureStore.setItemAsync(KEYS.DEVICE_UUID, uuid);
  return uuid;
}

function generateUUID(): string {
  // Simple UUID v4 without crypto dependency
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Save all auth data at once (after login) ──────────────

export async function saveAuthData(data: {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
  campaigns: CampaignMembership[];
}): Promise<void> {
  await Promise.all([
    setAccessToken(data.access_token),
    setRefreshToken(data.refresh_token),
    setStoredUser(data.user),
    setStoredCampaigns(data.campaigns),
  ]);

  // Auto-select first campaign if none active
  if (data.campaigns.length > 0) {
    const currentActive = await getActiveCampaignId();
    const validIds = data.campaigns.map((c) => c.id);
    if (!currentActive || !validIds.includes(currentActive)) {
      await setActiveCampaignId(data.campaigns[0].id);
    }
  }
}

// ─── Clear all (logout) ────────────────────────────────────

export async function clearAuthData(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN),
    SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
    SecureStore.deleteItemAsync(KEYS.USER_JSON),
    SecureStore.deleteItemAsync(KEYS.CAMPAIGNS_JSON),
    SecureStore.deleteItemAsync(KEYS.ACTIVE_CAMPAIGN_ID),
    // Note: DEVICE_UUID is NOT cleared on logout (it's per-install, not per-session)
  ]);
}

// ─── Check if we have a session ─────────────────────────────

export async function hasSession(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}
