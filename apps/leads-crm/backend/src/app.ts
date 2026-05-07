import express from "express";
import cors from "cors";
import { UPLOADS_DIR } from "./services/uploads.js";
import { mountRoutes } from "./routes/index.js";

/**
 * Express app factory. Setup en orden:
 *   1. CORS — acepta CORS_ORIGIN configurado + chrome-extension://*
 *   2. JSON body parser (cap 2MB)
 *   3. /uploads static (sin auth, son flyer images públicos)
 *   4. Private Network Access headers (Chrome extension call from /WA)
 *   5. Mount all routers (mountRoutes lo orquesta)
 *   6. Error handler de último recurso
 */
export function createApp() {
  const app = express();

  const CORS_ORIGIN = process.env.CORS_ORIGIN;
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);                  // same-origin / curl
      if (origin.startsWith("chrome-extension://")) return cb(null, true);
      if (origin.startsWith("moz-extension://")) return cb(null, true);
      if (!CORS_ORIGIN || CORS_ORIGIN === "*") return cb(null, true);
      if (origin === CORS_ORIGIN) return cb(null, true);
      cb(new Error(`origin not allowed: ${origin}`));
    },
    credentials: false,
  }));

  app.use(express.json({ limit: "2mb" }));
  app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "7d" }));

  // Chrome Private Network Access — la extension vive en chrome-extension://
  // y necesita este header para llegar al backend.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Access-Control-Request-Private-Network");
      return res.status(204).end();
    }
    next();
  });

  mountRoutes(app);

  // Error handler de último recurso — handlers individuales ya tienen `safe()`.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[api] unhandled error:", err);
    res.status(500).json({ error: "server_error", message: err?.message ?? "unknown" });
  });

  return app;
}
