/**
 * AppContext — Estado global de la app.
 *
 * Provee:
 * - Estado de autenticacion (logged out / pending / active)
 * - AppConfig (candidato, formulario, agente) una vez autenticado
 * - Funciones de login, register, logout
 *
 * Config is composed client-side from multiple backend endpoints:
 * - POST /api/auth/login → user + campaigns
 * - GET /api/candidates → candidate info (public)
 * - GET /api/campaigns/:id → campaign config (colors, etc.)
 * - GET /api/form-definitions/active?campaign_id=X → active form
 *
 * Toda la app se renderiza en funcion de este contexto.
 * Ninguna pantalla hardcodea datos — todo viene de aca.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import * as api from './api';
import * as authStore from './auth-store';
import type {
  AppConfig,
  AuthUser,
  CampaignMembership,
  LoginRequest,
  RegisterRequest,
  ApiResult,
} from './types';

// ─── Default colors when campaign has no config ─────────────

const DEFAULT_PRIMARY = '#163960';
const DEFAULT_SECONDARY = '#FFC800';

// ─── State machine ──────────────────────────────────────────

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'pending'; user: AuthUser; campaigns: CampaignMembership[] }
  | { status: 'suspended'; user: AuthUser }
  | { status: 'active'; user: AuthUser; campaigns: CampaignMembership[]; config: AppConfig };

type AppContextValue = {
  auth: AuthState;
  login: (body: LoginRequest) => Promise<ApiResult<void>>;
  register: (body: RegisterRequest) => Promise<ApiResult<void>>;
  logout: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  checkApproval: () => Promise<void>;
  switchCampaign: (campaignId: string) => Promise<void>;
  availableCampaigns: CampaignMembership[];
};

const AppContext = createContext<AppContextValue | null>(null);

// ─── Config builder ─────────────────────────────────────────

/**
 * Fetches all data needed to build AppConfig from multiple endpoints.
 * Returns null if any critical fetch fails.
 */
async function buildAppConfig(
  user: AuthUser,
  campaigns: CampaignMembership[],
): Promise<AppConfig | null> {
  if (campaigns.length === 0) return null;

  // Get active campaign ID from store
  const activeCampaignId = await authStore.getActiveCampaignId();
  const activeCampaign =
    campaigns.find((c) => c.id === activeCampaignId) ?? campaigns[0];

  // Fetch candidate info + campaign config + form definitions in parallel
  const [candidatesResult, campaignResult, formDefsResult] = await Promise.all([
    api.getCandidates(),
    api.getCampaign(activeCampaign.id),
    api.getActiveFormDefinitions(activeCampaign.id),
  ]);

  // Find candidate matching active campaign
  let candidateInfo = null;
  if (candidatesResult.ok) {
    candidateInfo = candidatesResult.data.candidates.find(
      (c) => c.id === activeCampaign.id,
    ) ?? candidatesResult.data.candidates[0] ?? null;
  }

  // Extract campaign config for colors
  const campaignConfig = campaignResult.ok ? campaignResult.data.campaign : null;

  // Get first active form definition
  const formDef = formDefsResult.ok
    ? formDefsResult.data.form_definitions[0] ?? null
    : null;

  // Build composed config
  const config: AppConfig = {
    candidate: {
      id: candidateInfo?.id ?? activeCampaign.id,
      name: candidateInfo?.name ?? activeCampaign.name,
      slug: candidateInfo?.slug ?? activeCampaign.slug,
      cargo: candidateInfo?.cargo ?? campaignConfig?.cargo ?? '',
      numero: candidateInfo?.numero ?? campaignConfig?.numero ?? 0,
      partido: candidateInfo?.partido ?? campaignConfig?.partido ?? '',
      foto_url: candidateInfo?.foto_url ?? campaignConfig?.foto_url ?? null,
      color_primario: campaignConfig?.config?.color_primario ?? DEFAULT_PRIMARY,
      color_secundario: campaignConfig?.config?.color_secundario ?? DEFAULT_SECONDARY,
      logo_url: campaignConfig?.config?.logo_url ?? null,
    },
    form: formDef,
    agent: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    },
    campaign: activeCampaign,
  };

  return config;
}

// ─── Provider ───────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

  // ── Boot: check stored session ────────────────────────────
  useEffect(() => {
    (async () => {
      const user = await authStore.getStoredUser();
      if (!user) {
        setAuth({ status: 'unauthenticated' });
        return;
      }

      const campaigns = await authStore.getStoredCampaigns();

      if (user.status === 'pending') {
        setAuth({ status: 'pending', user, campaigns });
        return;
      }

      if (user.status === 'suspended') {
        setAuth({ status: 'suspended', user });
        return;
      }

      // Active user — try to fetch fresh data from /auth/me first
      const meResult = await api.getMe();
      if (meResult.ok) {
        const freshUser = meResult.data.user;
        const freshCampaigns = meResult.data.campaigns;
        await authStore.setStoredUser(freshUser);
        await authStore.setStoredCampaigns(freshCampaigns);

        if (freshUser.status !== 'active') {
          if (freshUser.status === 'suspended') {
            setAuth({ status: 'suspended', user: freshUser });
          } else {
            setAuth({ status: 'pending', user: freshUser, campaigns: freshCampaigns });
          }
          return;
        }

        // Build config
        const config = await buildAppConfig(freshUser, freshCampaigns);
        if (config) {
          setAuth({ status: 'active', user: freshUser, campaigns: freshCampaigns, config });
        } else {
          // No campaigns → pending-like state
          setAuth({ status: 'pending', user: freshUser, campaigns: freshCampaigns });
        }
      } else if (meResult.code === 'AUTH_TOKEN_EXPIRED' || meResult.status === 401) {
        // Token completely dead, force re-login
        await authStore.clearAuthData();
        setAuth({ status: 'unauthenticated' });
      } else {
        // Network error — try with stale stored data
        if (campaigns.length > 0) {
          const config = await buildAppConfig(user, campaigns);
          if (config) {
            setAuth({ status: 'active', user, campaigns, config });
            return;
          }
        }
        // Can't build config offline, go to unauthenticated
        setAuth({ status: 'unauthenticated' });
      }
    })();
  }, []);

  // ── Login ─────────────────────────────────────────────────
  const login = useCallback(async (body: LoginRequest): Promise<ApiResult<void>> => {
    const result = await api.login(body);
    if (!result.ok) return result;

    const { user, campaigns } = result.data;
    await authStore.saveAuthData(result.data);

    if (user.status === 'pending') {
      setAuth({ status: 'pending', user, campaigns });
      return { ok: true, data: undefined };
    }

    if (user.status === 'suspended') {
      setAuth({ status: 'suspended', user });
      return { ok: true, data: undefined };
    }

    // Active — build config
    const config = await buildAppConfig(user, campaigns);
    if (config) {
      setAuth({ status: 'active', user, campaigns, config });
    } else {
      // Active but no campaigns yet
      setAuth({ status: 'pending', user, campaigns });
    }

    return { ok: true, data: undefined };
  }, []);

  // ── Register ──────────────────────────────────────────────
  const register = useCallback(async (body: RegisterRequest): Promise<ApiResult<void>> => {
    const result = await api.register(body);
    if (!result.ok) return result;
    return { ok: true, data: undefined };
  }, []);

  // ── Logout ────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await authStore.clearAuthData();
    setAuth({ status: 'unauthenticated' });
  }, []);

  // ── Refresh config (pull-to-refresh on dashboard) ─────────
  const refreshConfig = useCallback(async () => {
    if (auth.status !== 'active') return;

    // Re-fetch /auth/me + rebuild config
    const meResult = await api.getMe();
    if (meResult.ok) {
      const freshUser = meResult.data.user;
      const freshCampaigns = meResult.data.campaigns;
      await authStore.setStoredUser(freshUser);
      await authStore.setStoredCampaigns(freshCampaigns);

      const config = await buildAppConfig(freshUser, freshCampaigns);
      if (config) {
        setAuth({ status: 'active', user: freshUser, campaigns: freshCampaigns, config });
      }
    }
  }, [auth]);

  // ── Check approval (polling from pending screen) ──────────
  // Called when user is waiting for access request approval.
  // User may be status='active' but with no campaigns (waiting for approval).
  // The "pending" state in the app means: user has no approved campaigns yet.
  const checkApproval = useCallback(async () => {
    // Only run if we're in a waiting state (pending or active with no campaigns)
    if (auth.status !== 'pending') return;

    const meResult = await api.getMe();
    if (!meResult.ok) return;

    const freshUser = meResult.data.user;
    const freshCampaigns = meResult.data.campaigns;

    // Update stored data
    await authStore.setStoredUser(freshUser);
    await authStore.setStoredCampaigns(freshCampaigns);

    // Check if user was suspended
    if (freshUser.status === 'suspended') {
      setAuth({ status: 'suspended', user: freshUser });
      return;
    }

    // Check if user was set to pending by admin
    if (freshUser.status === 'pending') {
      setAuth({ status: 'pending', user: freshUser, campaigns: freshCampaigns });
      return;
    }

    // Check if user now has campaigns (access request was approved)
    // This is the key check: campaigns.length > 0 means approval happened
    if (freshCampaigns.length > 0) {
      const config = await buildAppConfig(freshUser, freshCampaigns);
      if (config) {
        setAuth({ status: 'active', user: freshUser, campaigns: freshCampaigns, config });
      }
    }
    // Otherwise stay in pending state (user active but no campaigns approved yet)
  }, [auth]);

  // ── Switch campaign (for users with multiple campaigns or admin) ──
  const switchCampaign = useCallback(async (campaignId: string) => {
    if (auth.status !== 'active') return;

    // Save new active campaign
    await authStore.setActiveCampaignId(campaignId);

    // Rebuild config with new campaign
    const config = await buildAppConfig(auth.user, auth.campaigns);
    if (config) {
      setAuth({ status: 'active', user: auth.user, campaigns: auth.campaigns, config });
    }
  }, [auth]);

  // ── Get available campaigns for switching ────────────────
  const availableCampaigns = useMemo<CampaignMembership[]>(() => {
    if (auth.status === 'active' || auth.status === 'pending') {
      return auth.campaigns;
    }
    return [];
  }, [auth]);

  // ── Memoize context value ─────────────────────────────────
  const value = useMemo<AppContextValue>(
    () => ({ auth, login, register, logout, refreshConfig, checkApproval, switchCampaign, availableCampaigns }),
    [auth, login, register, logout, refreshConfig, checkApproval, switchCampaign, availableCampaigns],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ─── Hook ───────────────────────────────────────────────────

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// ─── Convenience hooks ──────────────────────────────────────

export function useAppConfig(): AppConfig {
  const { auth } = useApp();
  if (auth.status !== 'active') {
    throw new Error('useAppConfig called but user is not active');
  }
  return auth.config;
}

export function useCandidate() {
  return useAppConfig().candidate;
}

export function useFormConfig() {
  return useAppConfig().form;
}

export function useAgent() {
  return useAppConfig().agent;
}

export function useActiveCampaign() {
  return useAppConfig().campaign;
}
