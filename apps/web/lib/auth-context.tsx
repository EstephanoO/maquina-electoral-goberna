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
  setActiveCampaign: (campaignId: string | null) => void;
  /** Re-fetch /api/auth/me to refresh user + campaigns data (e.g. after editing a candidate) */
  refreshSession: () => Promise<void>;
};

type AuthContextValue = AuthState & AuthActions;

// ── Storage keys (only non-sensitive preferences — tokens are in httpOnly cookies) ──

const STORAGE_KEYS = {
  activeCampaign: "goberna_active_campaign",
} as const;

// ── Cookie helpers ──────────────────────────────────────────────────

/** Read a cookie value by name (for non-httpOnly cookies only) */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ?? null;
}

/** Delete a cookie by name */
function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0`;
}

/** Check if the session indicator cookie exists (non-httpOnly, safe to read) */
function hasSessionCookie(): boolean {
  return getCookie("goberna_session") === "1";
}

// ── Context ─────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Register token store with api-client.
  // Tokens are now in httpOnly cookies — the browser sends them automatically.
  // The tokenStore is a thin shim: getAccessToken returns the session flag (for "has token?" checks),
  // and refresh is handled server-side via the cookie.
  useEffect(() => {
    setTokenStore({
      getAccessToken: () => (hasSessionCookie() ? "__cookie__" : null),
      getRefreshToken: () => (hasSessionCookie() ? "__cookie__" : null),
      setTokens: () => {
        // No-op: tokens are set via httpOnly Set-Cookie headers by the backend
      },
      clearTokens: () => {
        // Clear the session indicator; httpOnly cookies are cleared by the backend on logout
        deleteCookie("goberna_session");
      },
    });
  }, []);

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      if (!hasSessionCookie()) {
        setIsLoading(false);
        return;
      }

      // Cookies are sent automatically by the browser via the proxy
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
        // Session invalid — clear indicator
        deleteCookie("goberna_session");
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

    // Tokens are now set as httpOnly cookies by the backend Set-Cookie headers.
    // The session indicator cookie (goberna_session=1) is also set by the backend.

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
    // Backend clears httpOnly cookies via Set-Cookie headers
    await api.post("/api/auth/logout").catch(() => {});

    // Clear session indicator and preferences
    deleteCookie("goberna_session");
    localStorage.removeItem(STORAGE_KEYS.activeCampaign);

    setUser(null);
    setCampaigns([]);
    setActiveCampaignId(null);
  }, []);

  const setActiveCampaign = useCallback((campaignId: string | null) => {
    setActiveCampaignId(campaignId);
    if (campaignId) {
      localStorage.setItem(STORAGE_KEYS.activeCampaign, campaignId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.activeCampaign);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const res = await api.get<{ user: User; campaigns: Campaign[] }>("/api/auth/me");
    if (res.ok && res.data) {
      setUser(res.data.user);
      setCampaigns(res.data.campaigns);
      // Keep current activeCampaignId if still valid, otherwise fall back
      setActiveCampaignId((prev) => {
        const stillValid = res.data!.campaigns.some((c) => c.id === prev);
        return stillValid ? prev : res.data!.campaigns[0]?.id ?? null;
      });
    }
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
      refreshSession,
    }),
    [user, campaigns, activeCampaignId, isLoading, login, logout, setActiveCampaign, refreshSession],
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
