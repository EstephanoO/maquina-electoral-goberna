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
  createCategorySchema,
  updateCategorySchema,
} from "./schemas";

// ── OGG/Opus duration parser (no external deps) ──────────────────────
// Reads the last OGG page's granule_position and the OpusHead pre-skip
// to compute exact duration. Falls back to bitrate estimation on error.
//
// OGG page header layout (RFC 3533):
//   0-3:   capture_pattern "OggS"
//   4:     stream_structure_version
//   5:     header_type_flag
//   6-13:  granule_position (int64 LE)
//   14-17: bitstream_serial_number
//   18-21: page_sequence_number
//   22-25: CRC checksum
//   26:    number_page_segments
//   27..:  segment_table
//
// OpusHead packet layout (RFC 7845 §5.1):
//   0-7:   "OpusHead" magic
//   8:     version
//   9:     channel_count
//   10-11: pre_skip (uint16 LE)
//   12-15: input_sample_rate (uint32 LE) — informational only
//   ...
//
// Opus output sample rate is always 48000 Hz (fixed by spec).
// Duration = (last_granule_position - pre_skip) / 48000
function parseOggOpusDurationMs(buffer: ArrayBuffer): number {
  const FALLBACK_KBPS = 32;
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);

  try {
    // 1. Find pre_skip from the first OpusHead page
    let preSkip = 0;
    for (let i = 0; i < bytes.length - 8; i++) {
      // Find "OpusHead" magic signature
      if (
        bytes[i] === 0x4f && bytes[i+1] === 0x70 && bytes[i+2] === 0x75 &&
        bytes[i+3] === 0x73 && bytes[i+4] === 0x48 && bytes[i+5] === 0x65 &&
        bytes[i+6] === 0x61 && bytes[i+7] === 0x64
      ) {
        preSkip = dv.getUint16(i + 10, true); // LE uint16
        break;
      }
    }

    // 2. Scan all OGG pages to find the maximum granule_position
    // (last page = end of stream)
    let maxGranule = 0;
    let i = 0;
    while (i < bytes.length - 27) {
      // Find "OggS" capture pattern
      if (
        bytes[i] !== 0x4f || bytes[i+1] !== 0x67 ||
        bytes[i+2] !== 0x67 || bytes[i+3] !== 0x53
      ) {
        i++;
        continue;
      }

      // Read granule_position as two uint32 (JS can't do int64 natively)
      const granuleLo = dv.getUint32(i + 6,  true);
      const granuleHi = dv.getUint32(i + 10, true);
      // granuleHi should be 0 for audio files under ~25 hours — safe to ignore
      if (granuleHi === 0 && granuleLo > maxGranule) {
        maxGranule = granuleLo;
      }

      // Skip to next page: parse segment table to find page body size
      const numSegments = bytes[i + 26] ?? 0;
      if (i + 27 + numSegments > bytes.length) break;
      let pageBodySize = 0;
      for (let s = 0; s < numSegments; s++) {
        pageBodySize += bytes[i + 27 + s] ?? 0;
      }
      i += 27 + numSegments + pageBodySize;
    }

    if (maxGranule > preSkip) {
      return Math.round(((maxGranule - preSkip) / 48000) * 1000);
    }
  } catch {
    // Fall through to estimation
  }

  // Fallback: bitrate estimation (±30% accuracy)
  return Math.round((buffer.byteLength * 8 / (FALLBACK_KBPS * 1000)) * 1000);
}

// ── Shared ElevenLabs TTS call — reused by generate endpoint and auto-generate ──
async function callElevenLabsTTS(
  apiKey: string,
  voiceId: string,
  scriptText: string,
): Promise<{ base64: string; size: number; durationMs: number } | { error: string; status: number }> {
  const ttsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=opus_48000_32`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: scriptText,
        model_id: "eleven_multilingual_v2",
      }),
    },
  );

  if (!ttsRes.ok) {
    const errText = await ttsRes.text().catch(() => ttsRes.statusText);
    return { error: errText, status: ttsRes.status };
  }

  const buffer = await ttsRes.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const size = buffer.byteLength;
  const durationMs = parseOggOpusDurationMs(buffer);

  return { base64, size, durationMs };
}

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
    // This is the canonical endpoint that calls ElevenLabs TTS. Called once per item.
    // Uses the item's voice_id (defaults to César Vásquez clone if not set).
    // Output format: OGG/Opus 48kHz 32kbps (only format WhatsApp PTT accepts).
    // Duration is parsed from OGG granule_position — exact, not estimated.
    app.post<{ Params: { id: string } }>("/api/audio-catalog/:id/generate", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"], requirePermission: "audio_admin" })],
    }, async (request, reply) => {
      const requestId = String(request.id);

      if (!env.elevenlabsApiKey) {
        return reply.code(503).send(errorPayload(requestId, "UPSTREAM_ERROR", "TTS service not configured"));
      }

      const item = await repo.getWithAudio(request.params.id);
      if (!item) {
        return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "item no encontrado"));
      }

      try {
        const result = await callElevenLabsTTS(env.elevenlabsApiKey, item.voice_id, item.script_text);

        if ("error" in result) {
          app.log.error({ status: result.status, body: result.error }, "ElevenLabs TTS error (catalog generate)");
          return reply.code(502).send(errorPayload(requestId, "UPSTREAM_ERROR", `ElevenLabs returned ${result.status}`));
        }

        await repo.saveAudio(item.id, result.base64, result.size, result.durationMs);
        app.log.info({ id: item.id, category: item.category, size: result.size, durationMs: result.durationMs }, "audio generated for catalog item");

        return reply.send({
          ok: true,
          request_id: requestId,
          id: item.id,
          audioSize: result.size,
          durationMs: result.durationMs,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown TTS error";
        app.log.error({ err }, "TTS catalog generation error");
        return reply.code(502).send(errorPayload(requestId, "UPSTREAM_ERROR", message));
      }
    });

    // ── POST /api/audio-catalog — create new item (consultor+) ───────
    // If auto_generate: true is sent in the body AND ELEVENLABS_API_KEY is
    // configured, the backend calls ElevenLabs immediately after creating the
    // item and returns { item, audioSize, durationMs, audio_generated: true }.
    // If TTS fails, the item is still created — audio_generated: false in response.
    app.post("/api/audio-catalog", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"], requirePermission: "audio_admin" })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = (request as unknown as { activeCampaignId: string }).activeCampaignId;

      const parsed = createItemSchema.safeParse({ ...(request.body as Record<string, unknown>), campaign_id: campaignId });
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }

      const authed = request as unknown as { userId: string };
      const { auto_generate, ...createData } = parsed.data;
      const item = await repo.create({ ...createData, created_by: authed.userId });

      // Auto-generate audio if requested and TTS is configured
      if (auto_generate && env.elevenlabsApiKey) {
        try {
          const voiceId = item.voice_id;
          const ttsResult = await callElevenLabsTTS(env.elevenlabsApiKey, voiceId, item.script_text);

          if ("error" in ttsResult) {
            app.log.warn({ id: item.id, status: ttsResult.status }, "auto-generate TTS failed after create");
            return reply.code(201).send({
              ok: true,
              request_id: requestId,
              item,
              audio_generated: false,
              audio_error: `ElevenLabs returned ${ttsResult.status}`,
            });
          }

          await repo.saveAudio(item.id, ttsResult.base64, ttsResult.size, ttsResult.durationMs);
          app.log.info({ id: item.id, category: item.category, size: ttsResult.size, durationMs: ttsResult.durationMs }, "audio auto-generated on create");

          // Return the item with updated audio metadata
          const itemWithAudio = {
            ...item,
            has_audio: true,
            audio_size: ttsResult.size,
            duration_ms: ttsResult.durationMs,
          };

          return reply.code(201).send({
            ok: true,
            request_id: requestId,
            item: itemWithAudio,
            audio_generated: true,
            audioSize: ttsResult.size,
            durationMs: ttsResult.durationMs,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "TTS error";
          app.log.warn({ err, id: item.id }, "auto-generate TTS threw on create");
          return reply.code(201).send({
            ok: true,
            request_id: requestId,
            item,
            audio_generated: false,
            audio_error: message,
          });
        }
      }

      return reply.code(201).send({ ok: true, request_id: requestId, item, audio_generated: false });
    });

    // ── PUT /api/audio-catalog/:id — update item metadata ────────────
    app.put<{ Params: { id: string } }>("/api/audio-catalog/:id", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"], requirePermission: "audio_admin" })],
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
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"], requirePermission: "audio_admin" })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const deleted = await repo.remove(request.params.id);
      if (!deleted) {
        return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "item no encontrado"));
      }
      return reply.send({ ok: true, request_id: requestId });
    });

    // ══════════════════════════════════════════════════════════════════
    // CATEGORY CRUD
    // ══════════════════════════════════════════════════════════════════

    // ── GET /api/audio-catalog-categories — list categories ──────────
    app.get("/api/audio-catalog-categories", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) {
        return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      }
      const categories = await repo.listCategories(campaignId);
      return reply.send({ ok: true, request_id: requestId, categories });
    });

    // ── POST /api/audio-catalog-categories — create category ─────────
    app.post("/api/audio-catalog-categories", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"], requirePermission: "audio_admin" })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = (request as unknown as { activeCampaignId: string }).activeCampaignId;

      const parsed = createCategorySchema.safeParse({ ...(request.body as Record<string, unknown>), campaign_id: campaignId });
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }

      try {
        const category = await repo.createCategory(parsed.data);
        return reply.code(201).send({ ok: true, request_id: requestId, category });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "unknown";
        if (msg.includes("unique") || msg.includes("duplicate")) {
          return reply.code(409).send(errorPayload(requestId, "DUPLICATE_CATEGORY", "ya existe una categoría con esa key"));
        }
        throw err;
      }
    });

    // ── PUT /api/audio-catalog-categories/:id — update category ──────
    app.put<{ Params: { id: string } }>("/api/audio-catalog-categories/:id", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"], requirePermission: "audio_admin" })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const parsed = updateCategorySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }
      const category = await repo.updateCategory(request.params.id, parsed.data);
      if (!category) {
        return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "categoría no encontrada"));
      }
      return reply.send({ ok: true, request_id: requestId, category });
    });

    // ── DELETE /api/audio-catalog-categories/:id — delete category ────
    // Also deletes all audio items in this category.
    app.delete<{ Params: { id: string } }>("/api/audio-catalog-categories/:id", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"], requirePermission: "audio_admin" })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const deleted = await repo.removeCategory(request.params.id);
      if (!deleted) {
        return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "categoría no encontrada"));
      }
      return reply.send({ ok: true, request_id: requestId });
    });
  };
}
