import type { Express } from "express";

import { authRouter } from "./auth.js";
import { healthRouter } from "./health.js";
import { leadsRouter } from "./leads.js";
import { interactionsRouter } from "./interactions.js";
import { templatesRouter } from "./templates.js";
import { semanticRouter } from "./semantic.js";
import { sendsRouter } from "./sends.js";
import { chatsRouter } from "./chats.js";
import { botRouter } from "./bot.js";
import { botActivityRouter } from "./bot-activity.js";
import { configRouter } from "./config.js";
import { productsRouter } from "./products.js";
import { campaignsRouter } from "./campaigns.js";
import { appointmentsRouter } from "./appointments.js";
import { escalationsRouter } from "./escalations.js";
import { attentionRouter } from "./attention.js";
import { aiRouter } from "./ai.js";
import { adminExtractionRouter } from "./admin-extraction.js";
import { adminMiningRouter } from "./admin-mining.js";
import { adminEmbedRouter } from "./admin-embed.js";
import { settingsRouter } from "./settings.js";
import { miscRouter } from "./misc.js";
import { botAllowOrAuth } from "../middleware/bot-allow.js";

/**
 * Monta todos los routers en el orden correcto:
 *   1. Public  — /health + /auth (no auth)
 *   2. Gate    — botAllowOrAuth (allowlist + JWT)
 *   3. Protected — todo lo demás
 *
 * Nota: el orden importa. /auth/* debe ir antes del gate. /health también.
 */
export function mountRoutes(app: Express): void {
  // ── Public ──────────────────────────────────────────────────────────
  app.use(authRouter);
  app.use(healthRouter);

  // ── Gate ────────────────────────────────────────────────────────────
  app.use(botAllowOrAuth);

  // ── Protected ───────────────────────────────────────────────────────
  app.use(leadsRouter);
  app.use(interactionsRouter);
  app.use(templatesRouter);
  app.use(semanticRouter);
  app.use(sendsRouter);
  app.use(chatsRouter);
  app.use(botRouter);
  app.use(botActivityRouter);
  app.use(configRouter);
  app.use(productsRouter);
  app.use(campaignsRouter);
  app.use(appointmentsRouter);
  app.use(escalationsRouter);
  app.use(attentionRouter);
  app.use(aiRouter);
  app.use(adminExtractionRouter);
  app.use(adminMiningRouter);
  app.use(adminEmbedRouter);
  app.use(settingsRouter);
  app.use(miscRouter);
}
