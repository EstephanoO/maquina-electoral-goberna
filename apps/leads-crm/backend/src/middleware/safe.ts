import type { Request, Response, NextFunction } from "express";

/**
 * Safe async handler — atrapa rechazos de promise no manejados, loggea contexto
 * (method + path) y devuelve 500 con el mensaje. Único punto de catch para
 * todos los handlers async, evita olvidar try/catch en cada uno.
 */
export type AsyncHandler = (req: Request, res: Response, next?: NextFunction) => Promise<unknown>;

export function safe(fn: AsyncHandler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (e: any) {
      console.error(`[api] ${req.method} ${req.path} error:`, e?.message);
      if (!res.headersSent) {
        res.status(500).json({ error: e?.message || "server_error" });
      }
    }
  };
}
