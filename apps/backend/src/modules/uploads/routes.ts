import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { join, extname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export function buildUploadsRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    const uploadsDir = env.uploadsDir;

    // Ensure uploads directory exists
    await mkdir(uploadsDir, { recursive: true });

    // ── POST /api/uploads ──────────────────────────────────────────
    // Admin uploads a file (candidate photo, etc.)
    app.post(
      "/api/uploads",
      { preHandler: [app.authenticate, authorize({ roles: ["admin", "supervisor"] })] },
      async (request, reply) => {
        const requestId = String(request.id);

        try {
          const contentType = (request.headers["content-type"] ?? "").toLowerCase();

          // Accept raw binary upload with Content-Type header
          if (!ALLOWED_MIME.has(contentType)) {
            return reply.code(400).send(
              errorPayload(requestId, "INVALID_FILE_TYPE", `tipo de archivo no permitido: ${contentType}. Permitidos: ${[...ALLOWED_MIME].join(", ")}`),
            );
          }

          const chunks: Buffer[] = [];
          let totalSize = 0;

          for await (const chunk of request.raw) {
            totalSize += chunk.length;
            if (totalSize > MAX_FILE_SIZE) {
              return reply.code(413).send(
                errorPayload(requestId, "FILE_TOO_LARGE", `archivo excede ${MAX_FILE_SIZE / 1024 / 1024}MB`),
              );
            }
            chunks.push(chunk as Buffer);
          }

          const buffer = Buffer.concat(chunks);

          if (buffer.length === 0) {
            return reply.code(400).send(
              errorPayload(requestId, "EMPTY_FILE", "archivo vacio"),
            );
          }

          // Generate unique filename
          const ext = MIME_TO_EXT[contentType] ?? extname("file.bin");
          const slug = (request.headers["x-upload-slug"] as string | undefined)?.replace(/[^a-z0-9-]/gi, "-").toLowerCase() ?? "";
          const prefix = slug ? `${slug}-` : "";
          const filename = `${prefix}${randomUUID()}${ext}`;

          // Optionally organize by subfolder
          const subfolder = (request.headers["x-upload-folder"] as string | undefined)?.replace(/[^a-z0-9-]/gi, "-").toLowerCase() ?? "";
          const targetDir = subfolder ? join(uploadsDir, subfolder) : uploadsDir;
          await mkdir(targetDir, { recursive: true });

          const filePath = join(targetDir, filename);
          await writeFile(filePath, buffer);

          // Return the public URL path
          const publicPath = subfolder ? `/uploads/${subfolder}/${filename}` : `/uploads/${filename}`;

          return reply.code(201).send({
            ok: true,
            request_id: requestId,
            upload: {
              filename,
              path: publicPath,
              size: buffer.length,
              content_type: contentType,
            },
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "upload failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPLOAD_ERROR", "error subiendo archivo"),
          );
        }
      },
    );
  };
}
