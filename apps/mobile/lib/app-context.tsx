/**
 * AppContext — Estado global de la app.
 *
 * Provee:
 * - Estado de autenticacion (loading / unauthenticated / suspended / active)
 * - AppConfig (candidato, formulario, agente) una vez autenticado
 * - Funciones de OTP (send / verify) + join-campaign + registro
 *
 * Flow OTP-only:
 *   1. whatsappSend(phone) → backend manda OTP por WhatsApp
 *   2. loginWithWhatsapp(phone, code):
 *      - user existe → status 'active' (con campaigns[] y config con defaults si vacío)
 *      - user no existe (412) → cliente muestra form de registro y llama
 *        registerWithWhatsapp(...)
 *   3. joinCampaign(access_code) → linkea campaña desde Perfil (Task 14).
 *      Transiciona a 'active' con la campaña ya asignada.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as Network from 'expo-network';

import * as api from './api';
import * as authStore from './auth-store';
import type {
  AppConfig,
  ApiResult,
  AuthUser,
  CampaignMembership,
  FormDefinition,
  LoginRequest,
  RegisterRequest,
  WhatsappAuthResponse,
  WhatsappRegisterRequest,
} from './types';

// ─── Default colors when campaign has no config ─────────────

const DEFAULT_PRIMARY = '#163960';
const DEFAULT_SECONDARY = '#FFC800';

// ─── State machine ──────────────────────────────────────────

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'suspended'; user: AuthUser }
  | { status: 'active'; user: AuthUser; campaigns: CampaignMembership[]; config: AppConfig };

type AppContextValue = {
  auth: AuthState;
  /** Login con email/teléfono + password (legacy, sigue disponible) */
  login: (body: LoginRequest) => Promise<ApiResult<void>>;
  /** Registro legacy con password (no usado por mobile en flow OTP) */
  register: (body: RegisterRequest) => Promise<ApiResult<void>>;
  /** Pide al backend que envíe un código OTP por WhatsApp al número */
  whatsappSend: (phone: string) => Promise<ApiResult<void>>;
  /** Login OTP-only: phone + código → backend JWT. Si el user no existe,
   *  retorna error con code='USER_NOT_FOUND' para que el cliente muestre
   *  el form de registro. User sin campañas entra igual a 'active'. */
  loginWithWhatsapp: (phone: string, code: string) => Promise<ApiResult<void>>;
  /** Registro OTP-only: phone + código + perfil → backend JWT */
  registerWithWhatsapp: (body: WhatsappRegisterRequest) => Promise<ApiResult<void>>;
  /** Linkea al user autenticado con una campaña vía access_code (4 chars).
   *  Disponible desde Perfil (Task 14). Transiciona a 'active' con config actualizado. */
  joinCampaign: (accessCode: string) => Promise<ApiResult<void>>;
  logout: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  switchCampaign: (campaignId: string) => Promise<void>;
  availableCampaigns: CampaignMembership[];
};

const AppContext = createContext<AppContextValue | null>(null);

// ─── Config builder ─────────────────────────────────────────

async function buildAppConfig(
  user: AuthUser,
  campaigns: CampaignMembership[],
): Promise<AppConfig> {
  const activeCampaignId = await authStore.getActiveCampaignId();
  const activeCampaign =
    campaigns.length > 0
      ? (campaigns.find((c) => c.id === activeCampaignId) ?? campaigns[0])
      : null;

  // No campaign assigned — return a minimal valid config with defaults.
  // The user can join a campaign later from Perfil (Task 14).
  if (!activeCampaign) {
    return {
      candidate: {
        id: '',
        name: '',
        slug: '',
        cargo: '',
        numero: 0,
        partido: '',
        foto_url: null,
        color_primario: DEFAULT_PRIMARY,
        color_secundario: DEFAULT_SECONDARY,
        logo_url: null,
        whatsapp_number: null,
      },
      form: null,
      agent: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
      campaign: null,
    };
  }

  const [candidatesResult, campaignResult, formDefsResult] = await Promise.all([
    api.getCandidates(),
    api.getCampaign(activeCampaign.id),
    api.getActiveFormDefinitions(activeCampaign.id),
  ]);

  let candidateInfo = null;
  if (candidatesResult.ok) {
    candidateInfo =
      candidatesResult.data.candidates.find((c) => c.id === activeCampaign.id) ??
      candidatesResult.data.candidates[0] ??
      null;
  }

  const campaignConfig = campaignResult.ok ? campaignResult.data.campaign : null;

  let formDef: FormDefinition | null = null;
  if (formDefsResult.ok) {
    formDef = formDefsResult.data.form_definitions[0] ?? null;
    if (formDef) {
      authStore.setStoredFormConfig(formDef).catch(() => {});
    }
  } else {
    const cached = await authStore.getStoredFormConfig();
    if (cached && typeof cached === 'object' && 'id' in (cached as Record<string, unknown>)) {
      formDef = cached as FormDefinition;
    }
  }

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
      whatsapp_number:
        typeof campaignConfig?.config?.whatsapp_number === 'string'
          ? campaignConfig.config.whatsapp_number
          : null,
    },
    form: formDef,
    agent: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: activeCampaign.role,
    },
    campaign: activeCampaign,
  };

  return config;
}

// Exported for unit tests only — not part of the public context API.
export const buildAppConfigForTest = buildAppConfig;

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

      if (user.status === 'suspended') {
        setAuth({ status: 'suspended', user });
        return;
      }

      // Active user — check connectivity before firing network requests.
      // Si offline, usar stale data (campaigns puede estar vacío → config con defaults).
      let isOnline = false;
      try {
        const netState = await Network.getNetworkStateAsync();
        isOnline = netState.isConnected === true && netState.isInternetReachable === true;
      } catch {
        isOnline = false;
      }

      if (!isOnline) {
        const config = await buildAppConfig(user, campaigns);
        setAuth({ status: 'active', user, campaigns, config });
        return;
      }

      const meResult = await api.getMe();
      if (meResult.ok) {
        const freshUser = meResult.data.user;
        const freshCampaigns = meResult.data.campaigns;
        await authStore.setStoredUser(freshUser);
        await authStore.setStoredCampaigns(freshCampaigns);

        if (freshUser.status === 'suspended') {
          setAuth({ status: 'suspended', user: freshUser });
          return;
        }

        const config = await buildAppConfig(freshUser, freshCampaigns);
        setAuth({ status: 'active', user: freshUser, campaigns: freshCampaigns, config });
      } else if (meResult.code === 'AUTH_TOKEN_EXPIRED' || meResult.status === 401) {
        await authStore.clearAuthData();
        setAuth({ status: 'unauthenticated' });
      } else {
        // Unexpected network error while online — fall back to stale data
        const config = await buildAppConfig(user, campaigns);
        setAuth({ status: 'active', user, campaigns, config });
      }
    })();
  }, []);

  // ── Transition state from any auth response (login or register) ──
  const completeAuth = useCallback(
    async (data: WhatsappAuthResponse): Promise<ApiResult<void>> => {
      const { user, campaigns } = data;
      await authStore.saveAuthData(data);

      if (user.status === 'suspended') {
        setAuth({ status: 'suspended', user });
        return { ok: true, data: undefined };
      }

      const config = await buildAppConfig(user, campaigns);
      setAuth({ status: 'active', user, campaigns, config });
      return { ok: true, data: undefined };
    },
    [],
  );

  // ── Email/teléfono + password (legacy) ──────────────────────
  const login = useCallback(async (body: LoginRequest): Promise<ApiResult<void>> => {
    const result = await api.login(body);
    if (!result.ok) return result;
    return completeAuth(result.data);
  }, [completeAuth]);

  const register = useCallback(async (body: RegisterRequest): Promise<ApiResult<void>> => {
    const result = await api.register(body);
    if (!result.ok) return result;
    return { ok: true, data: undefined };
  }, []);

  // ── WhatsApp OTP ────────────────────────────────────────────
  const whatsappSend = useCallback(async (phone: string): Promise<ApiResult<void>> => {
    const result = await api.whatsappSend(phone);
    if (!result.ok) return result;
    return { ok: true, data: undefined };
  }, []);

  const loginWithWhatsapp = useCallback(
    async (phone: string, code: string): Promise<ApiResult<void>> => {
      const result = await api.whatsappVerifyLogin(phone, code);
      if (!result.ok) return result;
      return completeAuth(result.data);
    },
    [completeAuth],
  );

  const registerWithWhatsapp = useCallback(
    async (body: WhatsappRegisterRequest): Promise<ApiResult<void>> => {
      const result = await api.whatsappRegister(body);
      if (!result.ok) return result;
      return completeAuth(result.data);
    },
    [completeAuth],
  );

  // ── Join campaign (desde Perfil — Task 14) ───────────────────
  const joinCampaign = useCallback(
    async (accessCode: string): Promise<ApiResult<void>> => {
      const result = await api.joinCampaign(accessCode);
      if (!result.ok) return result;

      const { user: freshUser, campaigns: freshCampaigns } = result.data;
      await authStore.setStoredUser(freshUser);
      await authStore.setStoredCampaigns(freshCampaigns);

      if (freshUser.status === 'suspended') {
        setAuth({ status: 'suspended', user: freshUser });
        return { ok: true, data: undefined };
      }

      const config = await buildAppConfig(freshUser, freshCampaigns);
      setAuth({ status: 'active', user: freshUser, campaigns: freshCampaigns, config });
      return { ok: true, data: undefined };
    },
    [],
  );

  // ── Logout ────────────────────────────────────────────────
  const logout = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);
    api.logout(controller.signal).finally(() => clearTimeout(timeoutId)).catch(() => {});

    await authStore.clearAuthData();
    setAuth({ status: 'unauthenticated' });
  }, []);

  // ── Refresh config (pull-to-refresh on dashboard) ─────────
  const refreshConfig = useCallback(async () => {
    if (auth.status !== 'active') return;

    const meResult = await api.getMe();
    if (!meResult.ok) {
      if (meResult.status === 401 || meResult.code === 'AUTH_TOKEN_EXPIRED') {
        await authStore.clearAuthData();
        setAuth({ status: 'unauthenticated' });
      }
      return;
    }
    const freshUser = meResult.data.user;
    const freshCampaigns = meResult.data.campaigns;
    await authStore.setStoredUser(freshUser);
    await authStore.setStoredCampaigns(freshCampaigns);

    const config = await buildAppConfig(freshUser, freshCampaigns);
    setAuth({ status: 'active', user: freshUser, campaigns: freshCampaigns, config });
  }, [auth]);

  // ── Switch campaign (for users with multiple campaigns or admin) ──
  const switchCampaign = useCallback(async (campaignId: string) => {
    if (auth.status !== 'active') return;

    await authStore.setActiveCampaignId(campaignId);

    const config = await buildAppConfig(auth.user, auth.campaigns);
    setAuth({ status: 'active', user: auth.user, campaigns: auth.campaigns, config });
  }, [auth]);

  const availableCampaigns = useMemo<CampaignMembership[]>(() => {
    if (auth.status === 'active') return auth.campaigns;
    return [];
  }, [auth]);

  const value = useMemo<AppContextValue>(
    () => ({
      auth,
      login,
      register,
      whatsappSend,
      loginWithWhatsapp,
      registerWithWhatsapp,
      joinCampaign,
      logout,
      refreshConfig,
      switchCampaign,
      availableCampaigns,
    }),
    [
      auth,
      login,
      register,
      whatsappSend,
      loginWithWhatsapp,
      registerWithWhatsapp,
      joinCampaign,
      logout,
      refreshConfig,
      switchCampaign,
      availableCampaigns,
    ],
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
