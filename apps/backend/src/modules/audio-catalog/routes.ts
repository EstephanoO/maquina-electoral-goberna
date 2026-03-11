import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import {
  listCatalogSchema,
  generateAudioSchema,
  createItemSchema,
  updateItemSchema,
} from "./schemas";

// ═══════════════════════════════════════════════════════════════════════
// AUDIO CATALOG MODULE
//
// Pre-generated audio catalog for reusable voice messages.
// Audios are generated once via ElevenLabs TTS and stored as base64.
// Operators pick from the catalog instead of generating TTS per message.
//
// Endpoints:
//   GET  /api/audio-catalog          — List catalog items (metadata only)
//   GET  /api/audio-catalog/:id      — Get single item WITH audio blob
//   POST /api/audio-catalog/:id/generate — Generate audio for an item (consultor+)
//   POST /api/audio-catalog          — Create new item (consultor+)
//   PUT  /api/audio-catalog/:id      — Update item metadata (consultor+)
//   DELETE /api/audio-catalog/:id    — Delete item (consultor+)
// ═══════════════════════════════════════════════════════════════════════

export function buildAudioCatalogRoutes(env: AppEnv): FastifyPluginAsync {
  return async function audioCatalogRoutes(app) {

    // ── GET /api/audio-catalog — list items (no audio blob) ──────────
    app.get("/api/audio-catalog", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) {
        return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      }

      const q = request.query as Record<string, unknown>;
      const parsed = listCatalogSchema.safeParse({ campaign_id: campaignId, active_only: q.active_only });
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }

      const items = await repo.list(parsed.data.campaign_id, parsed.data.active_only);
      return reply.send({ ok: true, request_id: requestId, items });
    });

    // ── GET /api/audio-catalog/:id — get single item WITH audio ──────
    app.get<{ Params: { id: string } }>("/api/audio-catalog/:id", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const item = await repo.getWithAudio(request.params.id);
      if (!item) {
        return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "audio no encontrado"));
      }
      if (!item.audio_base64) {
        return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "audio aun no generado — usar POST /generate primero"));
      }
      return reply.send({
        ok: true,
        request_id: requestId,
        item: {
          id: item.id,
          category: item.category,
          label: item.label,
          audioBase64: item.audio_base64,
          mimeType: item.mime_type,
          audioSize: item.audio_size,
          durationMs: item.duration_ms,
        },
      });
    });

    // ── POST /api/audio-catalog/:id/generate — generate audio via ElevenLabs ──
    // This is the ONLY endpoint that calls ElevenLabs. Called once per item.
    app.post<{ Params: { id: string } }>("/api/audio-catalog/:id/generate", {
      preHandler: [app.authenticate, authorize({ roles: ["consultor"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);

      if (!env.elevenlabsApiKey) {
        return reply.code(503).send(errorPayload(requestId, "UPSTREAM_ERROR", "TTS service not configured"));
      }

      const item = await repo.getWithAudio(request.params.id);
      if (!item) {
        return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "item no encontrado"));
      }

      // Generate via ElevenLabs
      try {
        // Use /stream endpoint with output_format query param — the body-level
        // output_format param is ignored by ElevenLabs and always returns MP3.
        // opus_48000_32 produces a real OGG/Opus container (magic bytes: OggS)
        // which is the only format WhatsApp PTT accepts.
        const ttsRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(item.voice_id)}/stream?output_format=opus_48000_32`,
          {
            method: "POST",
            headers: {
              "xi-api-key": env.elevenlabsApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: item.script_text,
              model_id: "eleven_multilingual_v2",
            }),
          },
        );

        if (!ttsRes.ok) {
          const errText = await ttsRes.text().catch(() => ttsRes.statusText);
          app.log.error({ status: ttsRes.status, body: errText }, "ElevenLabs TTS error (catalog)");
          return reply.code(502).send(errorPayload(requestId, "UPSTREAM_ERROR", `ElevenLabs returned ${ttsRes.status}`));
        }

        const buffer = await ttsRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const size = buffer.byteLength;
        // Opus at 32kbps: duration ≈ (size * 8) / 32000 seconds
        const durationMs = Math.round((size * 8 / 32000) * 1000);

        await repo.saveAudio(item.id, base64, size, durationMs);

        app.log.info({ id: item.id, category: item.category, size }, "audio generated for catalog item");

        return reply.send({
          ok: true,
          request_id: requestId,
          id: item.id,
          audioSize: size,
          durationMs,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown TTS error";
        app.log.error({ err }, "TTS catalog generation error");
        return reply.code(502).send(errorPayload(requestId, "UPSTREAM_ERROR", message));
      }
    });

    // ── POST /api/audio-catalog — create new item (consultor+) ───────
    app.post("/api/audio-catalog", {
      preHandler: [app.authenticate, authorize({ roles: ["consultor"], requireCampaign: true })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = (request as unknown as { activeCampaignId: string }).activeCampaignId;

      const parsed = createItemSchema.safeParse({ ...(request.body as Record<string, unknown>), campaign_id: campaignId });
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }

      const authed = request as unknown as { userId: string };
      const item = await repo.create({ ...parsed.data, created_by: authed.userId });
      return reply.code(201).send({ ok: true, request_id: requestId, item });
    });

    // ── PUT /api/audio-catalog/:id — update item metadata ────────────
    app.put<{ Params: { id: string } }>("/api/audio-catalog/:id", {
      preHandler: [app.authenticate, authorize({ roles: ["consultor"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);

      const parsed = updateItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }

      const item = await repo.update(request.params.id, parsed.data);
      if (!item) {
        return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "item no encontrado"));
      }
      return reply.send({ ok: true, request_id: requestId, item });
    });

    // ── DELETE /api/audio-catalog/:id — delete item ──────────────────
    app.delete<{ Params: { id: string } }>("/api/audio-catalog/:id", {
      preHandler: [app.authenticate, authorize({ roles: ["consultor"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const deleted = await repo.remove(request.params.id);
      if (!deleted) {
        return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "item no encontrado"));
      }
      return reply.send({ ok: true, request_id: requestId });
    });
  };
}
