import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../auth.js";

/**
 * Allowlist gate: rutas que el bot llama internamente desde dentro del docker
 * network sin token (porque correrían fuera de la sesión de operador). El resto
 * exige JWT válido.
 *
 * Por qué allowlist y no whitelist por header del bot: simplicidad y porque el
 * bot está en la misma red docker — la única manera de llegar acá es desde
 * containers internos. Si exponemos el API a internet con CORS abierto, hay que
 * revisitar (mover el bot a token también).
 */

const BOT_OPEN_PREFIXES = [
  "/messages",
  "/leads/by-phone/",
  "/leads/count",
  "/chats",
  "/bot/",
];

export function botAllowOrAuth(req: Request, res: Response, next: NextFunction) {
  if (BOT_OPEN_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  // /ai/rules GET — bot lo lee con cache 60s para clasificar inbounds
  if (req.method === "GET" && req.path === "/ai/rules") return next();

  // Bot lee config + templates + queue de campaña (read-only, dentro del network)
  if (req.method === "GET" && (
    req.path === "/config/instances" ||
    req.path === "/templates" ||
    req.path === "/campaigns/queue"
  )) return next();

  // Bot reporta status de envío de campaña
  if (req.method === "POST" && /^\/campaigns\/recipient\/[0-9]+\/(sent|failed)$/.test(req.path)) {
    return next();
  }

  // Bot flagea atención humana
  if (req.method === "POST" && /^\/leads\/[0-9]+\/flag-attention$/.test(req.path)) {
    return next();
  }

  // Bot escala intent sensible (POST). GET listing exige auth (admin only).
  if (req.method === "POST" && req.path === "/escalations") return next();

  // Cascade del picker — sin esto el bot recibe 401 silente y nunca usa el
  // matching aprendido / semantic.
  if (req.method === "POST" && (
    req.path === "/learned-replies/match" ||
    req.path === "/templates/pick-semantic" ||
    req.path === "/rules/match-semantic"
  )) return next();

  // RAG cuando el bot va por Gemini fallback
  if (req.method === "POST" && /^\/leads\/[0-9]+\/relevant-history$/.test(req.path)) {
    return next();
  }

  // Agendamiento desde el bot
  if (req.method === "GET" && req.path.startsWith("/appointment-slots/available")) return next();
  if (req.method === "POST" && req.path === "/appointments") return next();

  // Bot consulta historial de un lead
  if (req.method === "GET" && /^\/leads\/[0-9]+\/interactions$/.test(req.path)) {
    return next();
  }

  return requireAuth(req, res, next);
}
