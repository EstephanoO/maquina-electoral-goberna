import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import { recordScanSchema } from "./schemas";
import * as repo from "./repository";

// ── In-memory scan code tracker (short-lived, for QR scan detection) ──
// Key: code string → { campaignId, brigadistaId, redirectUrl, scannedAt? }
type ScanCode = {
  campaignId: string;
  brigadistaId: string;
  redirectUrl: string;
  createdAt: number;
  scannedAt?: string;
};
const scanCodes = new Map<string, ScanCode>();

// Cleanup stale codes every 5 min (TTL = 15 min)
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, val] of scanCodes) {
    if (val.createdAt < cutoff) scanCodes.delete(key);
  }
}, 5 * 60 * 1000);

export function buildQrLeadsRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    await repo.ensureQrLeadsTable();

    // ──────────────────────────────────────────────────────────────────
    // POST /api/qr-leads/codes
    // Authenticated: create a scan code for a QR. Returns the code.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/qr-leads/codes",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const { redirect_url } = (request.body ?? {}) as { redirect_url?: string };

        if (!redirect_url) {
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "redirect_url es requerido"));
        }

        const code = `qr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        scanCodes.set(code, {
          campaignId: req.activeCampaignId!,
          brigadistaId: req.userId!,
          redirectUrl: redirect_url,
          createdAt: Date.now(),
        });

        return reply.code(201).send({ ok: true, request_id: requestId, code });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/qr-leads/redirect/:code
    // PUBLIC — called when someone scans the QR. Records the scan in DB
    // and 302-redirects to the WhatsApp channel URL.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/qr-leads/redirect/:code",
      async (request, reply) => {
        const { code } = request.params as { code: string };
        const entry = scanCodes.get(code);

        if (!entry) {
          return reply.code(404).send({ error: "QR expirado o invalido" });
        }

        // Mark as scanned (for polling)
        if (!entry.scannedAt) {
          entry.scannedAt = new Date().toISOString();

          // Also persist in DB via qr_leads table
          try {
            await repo.recordScan({
              campaign_id: entry.campaignId,
              brigadista_id: entry.brigadistaId,
              scan_source: "qr",
              user_agent: request.headers["user-agent"] ?? null,
            });
            app.log.info({ code, campaignId: entry.campaignId }, "[qr-leads] QR scanned via redirect");
          } catch (err) {
            app.log.error({ err }, "[qr-leads] redirect recordScan failed (non-blocking)");
          }
        }

        return reply.redirect(entry.redirectUrl);
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/qr-leads/codes/:code/status
    // Authenticated: check if a scan code has been scanned.
    // Dashboard polls this to detect when someone scans the QR.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/qr-leads/codes/:code/status",
      {
        preHandler: [app.authenticate],
      },
      async (request, reply) => {
        const { code } = request.params as { code: string };
        const requestId = String(request.id);
        const entry = scanCodes.get(code);

        if (!entry) {
          return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "Codigo no encontrado o expirado"));
        }

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          scanned: !!entry.scannedAt,
          scanned_at: entry.scannedAt ?? null,
        });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/qr-leads/scan
    // Mobile calls this when the brigadista shows their QR and someone
    // taps "Contactado" or when the app self-registers a scan event.
    // brigadista_id = JWT userId. campaign_id = x-campaign-id header.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/qr-leads/scan",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req       = request as AuthenticatedRequest;
        const requestId = String(request.id);

        const parsed = recordScanSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Payload inválido")
          );
        }

        const campaignId   = req.activeCampaignId!;
        const brigadistaId = req.userId!;

        try {
          const lead = await repo.recordScan({
            campaign_id:   campaignId,
            brigadista_id: brigadistaId,
            phone:         parsed.data.phone,
            message_text:  parsed.data.message_text,
            scan_source:   parsed.data.scan_source,
            user_agent:    request.headers["user-agent"] ?? null,
          });

          app.log.info({ campaignId, brigadistaId }, "[qr-leads] scan recorded");

          return reply.code(201).send({
            ok:         true,
            request_id: requestId,
            id:         lead.id,
            scanned_at: lead.scanned_at,
          });
        } catch (err) {
          app.log.error({ err }, "[qr-leads] recordScan failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al registrar el scan")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/qr-leads/my-stats
    // Returns total / today / this_week scan counts for the authenticated
    // brigadista in their active campaign.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/qr-leads/my-stats",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req       = request as AuthenticatedRequest;
        const requestId = String(request.id);

        const campaignId   = req.activeCampaignId!;
        const brigadistaId = req.userId!;

        try {
          const stats = await repo.getMyStats(brigadistaId, campaignId);
          return reply.code(200).send({
            ok:         true,
            request_id: requestId,
            stats,
          });
        } catch (err) {
          app.log.error({ err }, "[qr-leads] getMyStats failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener estadísticas")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/qr-leads/leaderboard
    // Campaign-level leaderboard. candidato+ only.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/qr-leads/leaderboard",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["candidato"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req       = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;

        try {
          const leaderboard = await repo.getCampaignLeaderboard(campaignId);
          return reply.code(200).send({
            ok:          true,
            request_id:  requestId,
            leaderboard,
          });
        } catch (err) {
          app.log.error({ err }, "[qr-leads] leaderboard failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener leaderboard")
          );
        }
      }
    );
  };
}
