import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { resolveAndStoreGeo } from "./geo";

export function buildQrTrackerRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    await repo.ensureQrTrackerTables();

    // ──────────────────────────────────────────────────────────────────
    // GET /r/:slug
    // PUBLIC — when someone scans the QR, this records the scan and
    // 302-redirects to the target URL.
    // ──────────────────────────────────────────────────────────────────
    app.get("/r/:slug", async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const tracker = await repo.getBySlug(slug);

      if (!tracker) {
        return reply.code(404).send({ error: "QR no encontrado" });
      }

      // Record the scan (non-blocking — don't make the user wait)
      // Chain geo resolution after successful recording
      repo
        .recordScan({
          tracker_id: tracker.id,
          ip: request.ip,
          user_agent: request.headers["user-agent"] ?? null,
          referer: request.headers.referer ?? null,
        })
        .then(({ scan_id }) => {
          resolveAndStoreGeo(scan_id, request.ip)
            .catch((err) => app.log.error({ err }, "[qr-tracker] geo lookup failed"));
        })
        .catch((err) => app.log.error({ err }, "[qr-tracker] recordScan failed"));

      return reply.redirect(tracker.target_url);
    });

    // ──────────────────────────────────────────────────────────────────
    // GET /api/qr-trackers
    // Authenticated (admin) — list all trackers with their scan counts.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/qr-trackers",
      { preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato"] })] },
      async (request, reply) => {
        const trackers = await repo.listAll();
        return reply.code(200).send({ ok: true, request_id: String(request.id), trackers });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/qr-trackers/:slug/stats
    // Authenticated — get tracker details + recent scans.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/qr-trackers/:slug/stats",
      { preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato"] })] },
      async (request, reply) => {
        const { slug } = request.params as { slug: string };
        const requestId = String(request.id);

        const tracker = await repo.getBySlug(slug);
        if (!tracker) {
          return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "Tracker no encontrado"));
        }

        const recentScans = await repo.getRecentScans(tracker.id);

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          tracker,
          recent_scans: recentScans,
        });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/qr-trackers
    // Authenticated (admin) — create a new tracked QR.
    // Body: { slug, target_url, label? }
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/qr-trackers",
      { preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { slug, target_url, label } = (request.body ?? {}) as {
          slug?: string;
          target_url?: string;
          label?: string;
        };

        if (!slug || !target_url) {
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", "slug y target_url son requeridos"));
        }

        if (!/^[a-z0-9_-]+$/i.test(slug)) {
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", "slug solo puede contener letras, números, guiones y guiones bajos"));
        }

        try {
          const tracker = await repo.createTracker({ slug, target_url, label });
          return reply.code(201).send({ ok: true, request_id: requestId, tracker });
        } catch (err: unknown) {
          if (err instanceof Error && err.message.includes("unique")) {
            return reply.code(409).send(errorPayload(requestId, "CONFLICT", "Ese slug ya existe"));
          }
          throw err;
        }
      },
    );
    // ──────────────────────────────────────────────────────────────────
    // POST /api/qr-trackers/my-qr
    // Authenticated — returns (or creates) the brigadista's static QR
    // tracker. Body: { target_url }. Slug = "b-{userId}".
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/qr-trackers/my-qr",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const userId = req.userId!;
        const { target_url } = (request.body ?? {}) as { target_url?: string };

        if (!target_url) {
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "target_url es requerido"));
        }

        const slug = `b-${userId}`;
        let tracker = await repo.getBySlug(slug);

        if (!tracker) {
          tracker = await repo.createTracker({ slug, target_url, label: req.userId });
        }

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          slug: tracker.slug,
          scan_count: tracker.scan_count,
          redirect_url: `/r/${tracker.slug}`,
        });
      },
    );
  };
}
