import type { AppEnv } from "../config/env";

export async function fetchWithRetry(url: string, env: AppEnv, init?: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= env.upstreamRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status >= 500 && attempt < env.upstreamRetries) {
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (attempt === env.upstreamRetries) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("Error desconocido consultando upstream");
}
