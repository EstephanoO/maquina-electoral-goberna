/**
 * GOBERNA — API Service
 * Handles authenticated requests with automatic token refresh.
 *
 * Auth tokens are stored in httpOnly cookies set by the backend.
 * The browser sends them automatically on every fetch via the Next.js proxy.
 * The TokenStore is now a thin shim for "has session?" checks only.
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
  try {
    // Refresh token is in httpOnly cookie — sent automatically by browser.
    // POST body is empty; backend reads the cookie and issues new access token.
    const res = await fetch(`${getBaseUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "same-origin",
    });

    if (!res.ok) {
      tokenStore?.clearTokens();
      return false;
    }

    return true;
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

  // Auth is handled by httpOnly cookies sent automatically by the browser.
  // No need to set Authorization header for web requests.

  if (campaignId) {
    headers.set("x-campaign-id", campaignId);
  }

  const doFetch = async (): Promise<Response> => {
    return fetch(url, { ...fetchOptions, headers, credentials: "same-origin" });
  };

  let res = await doFetch();

  // Auto-refresh on 401 — access token expired (15m TTL), refresh via httpOnly cookie
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
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

  patch: <T = unknown>(path: string, body?: unknown, opts?: RequestInit & { campaignId?: string }) =>
    apiRequest<T>(path, { ...opts, method: "PATCH", body: body ? JSON.stringify(body) : undefined }),

  delete: <T = unknown>(path: string, opts?: RequestInit & { campaignId?: string; body?: unknown }) =>
    apiRequest<T>(path, { ...opts, method: "DELETE", body: opts?.body ? JSON.stringify(opts.body) : undefined }),
};
