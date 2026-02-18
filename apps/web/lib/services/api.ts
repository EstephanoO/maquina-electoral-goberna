/**
 * GOBERNA — API Service
 * Handles authenticated requests with automatic token refresh.
 */

import type { ApiResponse } from "../types";

type TokenStore = {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  setTokens: (access: string, refresh: string) => void;
  clearTokens: () => void;
};

let tokenStore: TokenStore | null = null;

export function setTokenStore(store: TokenStore): void {
  tokenStore = store;
}

function getBaseUrl(): string {
  // In Next.js, /api/* is proxied to the backend via rewrites
  return "";
}

async function refreshAccessToken(): Promise<boolean> {
  if (!tokenStore) return false;
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${getBaseUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      tokenStore.clearTokens();
      return false;
    }

    const data = await res.json();
    if (data.access_token && data.refresh_token) {
      tokenStore.setTokens(data.access_token, data.refresh_token);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit & { campaignId?: string } = {},
): Promise<ApiResponse<T>> {
  const { campaignId, ...fetchOptions } = options;
  const url = `${getBaseUrl()}${path}`;

  const headers = new Headers(fetchOptions.headers);

  // Only set Content-Type for JSON bodies (not for file uploads)
  if (!headers.has("Content-Type") && fetchOptions.body && typeof fetchOptions.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  if (tokenStore) {
    const token = tokenStore.getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  if (campaignId) {
    headers.set("x-campaign-id", campaignId);
  }

  const doFetch = async (): Promise<Response> => {
    return fetch(url, { ...fetchOptions, headers });
  };

  let res = await doFetch();

  // Auto-refresh on 401
  if (res.status === 401 && tokenStore?.getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = tokenStore!.getAccessToken();
      if (newToken) {
        headers.set("Authorization", `Bearer ${newToken}`);
      }
      res = await doFetch();
    }
  }

  try {
    const body = await res.json();

    if (!res.ok) {
      return {
        ok: false,
        error: { code: body.code ?? "UNKNOWN", message: body.message ?? "Error desconocido" },
        status: res.status,
      };
    }

    return { ok: true, data: body as T, status: res.status };
  } catch {
    return {
      ok: false,
      error: { code: "PARSE_ERROR", message: "Error parseando respuesta" },
      status: res.status,
    };
  }
}

// Convenience methods
export const api = {
  get: <T = unknown>(path: string, opts?: RequestInit & { campaignId?: string }) =>
    apiRequest<T>(path, { ...opts, method: "GET" }),

  post: <T = unknown>(path: string, body?: unknown, opts?: RequestInit & { campaignId?: string }) =>
    apiRequest<T>(path, { ...opts, method: "POST", body: body ? JSON.stringify(body) : undefined }),

  put: <T = unknown>(path: string, body?: unknown, opts?: RequestInit & { campaignId?: string }) =>
    apiRequest<T>(path, { ...opts, method: "PUT", body: body ? JSON.stringify(body) : undefined }),

  delete: <T = unknown>(path: string, opts?: RequestInit & { campaignId?: string; body?: unknown }) =>
    apiRequest<T>(path, { ...opts, method: "DELETE", body: opts?.body ? JSON.stringify(opts.body) : undefined }),
};
