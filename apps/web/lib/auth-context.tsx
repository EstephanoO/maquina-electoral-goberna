"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setTokenStore } from "./api-client";

// ── Types ───────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
};

type AuthState = {
  user: User | null;
  campaigns: Campaign[];
  activeCampaignId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
};

type AuthActions = {
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  setActiveCampaign: (campaignId: string) => void;
};

type AuthContextValue = AuthState & AuthActions;

// ── Storage keys ────────────────────────────────────────────────────

const STORAGE_KEYS = {
  accessToken: "goberna_access_token",
  refreshToken: "goberna_refresh_token",
  activeCampaign: "goberna_active_campaign",
} as const;

// ── Context ─────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Register token store with api-client
  useEffect(() => {
    setTokenStore({
      getAccessToken: () => localStorage.getItem(STORAGE_KEYS.accessToken),
      getRefreshToken: () => localStorage.getItem(STORAGE_KEYS.refreshToken),
      setTokens: (access, refresh) => {
        localStorage.setItem(STORAGE_KEYS.accessToken, access);
        localStorage.setItem(STORAGE_KEYS.refreshToken, refresh);
      },
      clearTokens: () => {
        localStorage.removeItem(STORAGE_KEYS.accessToken);
        localStorage.removeItem(STORAGE_KEYS.refreshToken);
      },
    });
  }, []);

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      const token = localStorage.getItem(STORAGE_KEYS.accessToken);
      if (!token) {
        setIsLoading(false);
        return;
      }

      const res = await api.get<{
        user: User;
        campaigns: Campaign[];
      }>("/api/auth/me");

      if (res.ok && res.data) {
        setUser(res.data.user);
        setCampaigns(res.data.campaigns);

        const savedCampaign = localStorage.getItem(STORAGE_KEYS.activeCampaign);
        const validCampaign = res.data.campaigns.find((c) => c.id === savedCampaign);
        setActiveCampaignId(validCampaign?.id ?? res.data.campaigns[0]?.id ?? null);
      } else {
        // Token invalid, clear
        localStorage.removeItem(STORAGE_KEYS.accessToken);
        localStorage.removeItem(STORAGE_KEYS.refreshToken);
      }

      setIsLoading(false);
    };

    restore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{
      access_token: string;
      refresh_token: string;
      user: User;
      campaigns: Campaign[];
    }>("/api/auth/login", { identifier: email, password });

    if (!res.ok || !res.data) {
      return { ok: false, error: res.error?.message ?? "Error de autenticación" };
    }

    localStorage.setItem(STORAGE_KEYS.accessToken, res.data.access_token);
    localStorage.setItem(STORAGE_KEYS.refreshToken, res.data.refresh_token);

    setUser(res.data.user);
    setCampaigns(res.data.campaigns);

    const firstCampaign = res.data.campaigns[0]?.id ?? null;
    setActiveCampaignId(firstCampaign);
    if (firstCampaign) {
      localStorage.setItem(STORAGE_KEYS.activeCampaign, firstCampaign);
    }

    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => {});

    localStorage.removeItem(STORAGE_KEYS.accessToken);
    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    localStorage.removeItem(STORAGE_KEYS.activeCampaign);

    setUser(null);
    setCampaigns([]);
    setActiveCampaignId(null);
  }, []);

  const setActiveCampaign = useCallback((campaignId: string) => {
    setActiveCampaignId(campaignId);
    localStorage.setItem(STORAGE_KEYS.activeCampaign, campaignId);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      campaigns,
      activeCampaignId,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      setActiveCampaign,
    }),
    [user, campaigns, activeCampaignId, isLoading, login, logout, setActiveCampaign],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

// ── Hook ────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
