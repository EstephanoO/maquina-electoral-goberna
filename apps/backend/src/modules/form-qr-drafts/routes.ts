import { randomBytes } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import * as formSubmissionsRepo from "../form-submissions/repository";
import * as qrLeadsRepo from "../qr-leads/repository";
import * as voterProfileRepo from "../voter-profiles/repository";
import { createDraftSchema } from "./schemas";

// 22 url-safe chars (base64url de 16 bytes truncado), ~96 bits de entropía
function generateToken(): string {
  return randomBytes(16)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const FALLBACK_WA_NUMBER = "51999999999";
const DEFAULT_QR_MESSAGE =
  "Hola, me enteré de la campaña de {candidato} a través de {brigadista}. Me gustaría saber más.";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? "https://electoral.goberna.club").replace(/\/$/, "");

function renderQrMessage(
  template: string | null | undefined,
  candidateName: string,
  brigadistaFirstName: string,
): string {
  const tpl = (template ?? "").trim() || DEFAULT_QR_MESSAGE;
  return tpl
    .replaceAll("{candidato}", candidateName || "la campaña")
    .replaceAll("{brigadista}", brigadistaFirstName || "un brigadista");
}

function buildWaLink(
  waNumber: string,
  brigadistaFirstName: string,
  candidateName: string,
  template: string | null,
): string {
  const msg = encodeURIComponent(renderQrMessage(template, candidateName, brigadistaFirstName));
  return `https://wa.me/${waNumber}?text=${msg}`;
}

function htmlPage(title: string, body: string, waLink?: string): string {
  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font:16px/1.5 system-ui,-apple-system,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#1e293b;text-align:center}
  h1{color:#163960;margin-bottom:8px}
  p{color:#475569;margin:8px 0}
  a.btn{display:inline-block;margin-top:24px;padding:14px 28px;background:#25D366;color:#fff;text-decoration:none;border-radius:12px;font-weight:600}
</style></head>
<body><h1>${title}</h1>${body}${waLink ? `<a class="btn" href="${waLink}">Abrir WhatsApp</a>` : ""}</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Landing pública con OG completos para el share desde mobile.
 *
 * Flujo:
 *   - Crawlers (WhatsApp/Facebook/etc) leen <meta property="og:*"> y arman
 *     el preview con título + descripción + imagen del candidato. NO ejecutan
 *     el JS, así que nunca disparan el redirect a wa.me. Quedan en la landing.
 *   - Usuario real abre el link → el JS dispara redirect inmediato a wa.me
 *     y se abre WhatsApp con el mensaje pre-cargado.
 *   - Si el JS no corre (rare), el botón "Abrir WhatsApp" lo cubre.
 *
 * No registra el draft como consumido — eso lo hace /api/q/:token cuando se
 * escanea el código real. Esta ruta es el "envoltorio bonito" para el share.
 */
function shareOgPage(params: {
  candidateName: string;
  brigadistaName: string;
  cargo: string;
  numero: string;
  waLink: string;
  ogImage: string;
  pageUrl: string;
}): string {
  const title = `Apoyá a ${params.candidateName}`;
  const description = params.brigadistaName
    ? `Soy ${params.brigadistaName}, te invito a apoyar la campaña de ${params.candidateName}${params.cargo ? ` (${params.cargo})` : ""}. Tocá para escribirnos por WhatsApp.`
    : `Apoyá la campaña de ${params.candidateName}${params.cargo ? ` (${params.cargo})` : ""}. Tocá para escribirnos por WhatsApp.`;

  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = escapeHtml(params.ogImage);
  const url = escapeHtml(params.pageUrl);
  const wa = escapeHtml(params.waLink);
  const candName = escapeHtml(params.candidateName);
  const numStr = params.numero ? `#${escapeHtml(params.numero)}` : "";

  return `<!DOCTYPE html>
<html lang="es" prefix="og: https://ogp.me/ns#">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Goberna">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:image:alt" content="${candName}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="es_PE">

<!-- Twitter Card (también lo usa Telegram para mejor preview) -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">

<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#163960;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;color:#1e293b;border-radius:24px;padding:32px 24px;text-align:center;max-width:420px;width:100%;box-shadow:0 16px 60px rgba(0,0,0,.4)}
  .avatar{width:120px;height:120px;border-radius:50%;object-fit:cover;margin:0 auto 16px;border:4px solid #FFC800;background:#163960}
  .candidate{font-size:22px;font-weight:700;color:#163960;margin-bottom:4px}
  .cargo{font-size:14px;color:#64748b;margin-bottom:24px}
  .numero{display:inline-block;background:#FFC800;color:#163960;font-weight:800;padding:6px 14px;border-radius:8px;margin-bottom:16px;font-size:14px;letter-spacing:.5px}
  .desc{font-size:15px;color:#475569;margin-bottom:28px;line-height:1.5}
  .btn{display:inline-flex;align-items:center;gap:10px;background:#25D366;color:#fff;padding:16px 32px;border-radius:14px;text-decoration:none;font-weight:600;font-size:17px;box-shadow:0 6px 20px rgba(37,211,102,.4)}
  .btn:active{transform:scale(.97)}
  .footer{font-size:11px;color:#94a3b8;margin-top:24px;text-transform:uppercase;letter-spacing:1px}
</style>
</head>
<body>
<div class="card">
  <img class="avatar" src="${img}" alt="${candName}">
  ${numStr ? `<div class="numero">${numStr}</div>` : ""}
  <div class="candidate">${candName}</div>
  ${params.cargo ? `<div class="cargo">${escapeHtml(params.cargo)}</div>` : ""}
  <p class="desc">${d}</p>
  <a class="btn" id="wa-link" href="${wa}" rel="noopener">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/></svg>
    Abrir WhatsApp
  </a>
  <div class="footer">Goberna · Operación Territorial</div>
</div>
<script>
  // Auto-redirect a wa.me en navegadores reales (los crawlers no corren JS y
  // por eso quedan en esta página leyendo los OG tags). Pequeño delay para
  // dar tiempo a que el preview-fetch del cliente finalice antes del jump.
  setTimeout(function(){ window.location.replace(${JSON.stringify(params.waLink)}); }, 250);
</script>
</body>
</html>`;
}

export function buildFormQrDraftsRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // Cleanup periódico de drafts vencidos hace más de 1 día.
    const cleanupInterval = setInterval(() => {
      repo.deleteExpired().then(
        (n) => { if (n > 0) app.log.info({ deleted: n }, "[form-qr-drafts] expired drafts cleaned"); },
        (err) => app.log.error({ err }, "[form-qr-drafts] cleanup failed"),
      );
    }, 60 * 60 * 1000); // 1h

    app.addHook("onClose", async () => {
      clearInterval(cleanupInterval);
    });

    // ─── POST /api/form-qr-drafts ────────────────────────────────
    // Brigadista terminó el form. Genera token + qr_url para mostrar al ciudadano.
    app.post(
      "/api/form-qr-drafts",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const campaignId = request.activeCampaignId;
        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        const parsed = createDraftSchema.safeParse(request.body);
        if (!parsed.success) {
          const msg = parsed.error.issues.map((e) => e.message).join("; ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", msg));
        }

        try {
          const token = generateToken();
          const draft = await repo.createDraft({
            token,
            campaign_id: campaignId,
            brigadista_id: authed.userId,
            form_definition_id: parsed.data.form_definition_id ?? null,
            client_id: parsed.data.client_id,
            payload: {
              data: parsed.data.data,
              lat: parsed.data.lat ?? null,
              lng: parsed.data.lng ?? null,
              client_id: parsed.data.client_id,
              form_definition_id: parsed.data.form_definition_id ?? null,
            },
          });

          const qrUrl = `${PUBLIC_BASE_URL}/api/q/${token}`;

          return reply.code(201).send({
            ok: true,
            request_id: requestId,
            token,
            qr_url: qrUrl,
            expires_at: draft.expires_at,
          });
        } catch (err) {
          app.log.error({ err }, "[form-qr-drafts] createDraft failed");
          return reply.code(500).send(errorPayload(requestId, "DRAFT_CREATE_ERROR", "no se pudo generar el QR"));
        }
      },
    );

    // ─── POST /api/qr-share-tokens ─────────────────────────────
    // Crea (o reusa) un token "share-only" para el botón Compartir del mobile.
    // El token tiene TTL de 30 días y NO está atado a un form. Su único
    // propósito es que el share use la URL bonita /r/:token (con OG completos)
    // en lugar del wa.me crudo que se ve feo en el share sheet.
    //
    // Idempotente: si el brigadista ya tiene un share token vigente, devuelve
    // el mismo (no crea uno nuevo cada vez que abre la pantalla).
    app.post(
      "/api/qr-share-tokens",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const campaignId = request.activeCampaignId;
        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const token = generateToken();
          const draft = await repo.getOrCreateShareToken({
            token,
            campaign_id: campaignId,
            brigadista_id: authed.userId,
          });

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            token: draft.token,
            share_url: `${PUBLIC_BASE_URL}/r/${draft.token}`,
            expires_at: draft.expires_at,
          });
        } catch (err) {
          app.log.error({ err }, "[form-qr-drafts] getOrCreateShareToken failed");
          return reply.code(500).send(errorPayload(requestId, "SHARE_TOKEN_ERROR", "no se pudo generar el link"));
        }
      },
    );

    // ─── GET /api/form-qr-drafts/:token/status ──────────────────
    // Mobile poll cada 2s para detectar el scan.
    app.get(
      "/api/form-qr-drafts/:token/status",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { token } = request.params as { token: string };

        const status = await repo.getStatus(token, authed.userId);
        if (!status) {
          return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "draft no encontrado"));
        }

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          scanned: status.scanned_at !== null,
          scanned_at: status.scanned_at,
          expires_at: status.expires_at,
          expired: status.expired,
        });
      },
    );

    // ─── GET /api/q/:token ───────────────────────────────────────
    // Endpoint PÚBLICO (sin auth). El ciudadano escanea, llegamos acá:
    //   1. Si expirado o consumido → 302 a wa.me (no registra de nuevo).
    //   2. Si válido → marca consumido + persiste form_submissions + 302 a wa.me.
    // Nota: usa prefijo /api/ porque el host nginx solo rutea /api/* al backend;
    // el resto cae al SPA web (que pone redirect a /login).
    app.get("/api/q/:token", async (request, reply) => {
      const { token } = request.params as { token: string };
      const userAgent = request.headers["user-agent"] ?? null;

      const draft = await repo.findByToken(token);
      if (!draft) {
        return reply
          .code(404)
          .header("content-type", "text/html; charset=utf-8")
          .send(
            htmlPage(
              "Código no válido",
              "<p>Este código QR no existe o ya fue eliminado. Pedile al brigadista que genere uno nuevo.</p>",
            ),
          );
      }

      const waInfo = await repo.getCampaignWaNumber(draft.campaign_id);
      const brigadistaFirstName = await repo.getBrigadistaFirstName(draft.brigadista_id);
      const waNumber = waInfo?.whatsapp_number ?? FALLBACK_WA_NUMBER;
      const candidateName = waInfo?.campaign_name ?? "la campaña";
      const waLink = buildWaLink(
        waNumber,
        brigadistaFirstName,
        candidateName,
        waInfo?.whatsapp_qr_message ?? null,
      );

      // Si es un share-token (no tiene form atado), no hay nada que consumir
      // ni que persistir — solo redirigimos al wa.me. Los stats del brigadista
      // se actualizan igual abajo.
      const isShare = draft.kind === "share";

      // Atomic: solo el primer scan dentro del TTL inserta el form.
      const consumed = !isShare && (await repo.tryConsume(token, userAgent));

      if (consumed) {
        try {
          await formSubmissionsRepo.insertBatch(
            [
              {
                form_definition_id: draft.form_definition_id ?? undefined,
                campaign_id: draft.campaign_id,
                data: draft.payload.data,
                lat: draft.payload.lat ?? undefined,
                lng: draft.payload.lng ?? undefined,
                client_id: draft.client_id,
              },
            ],
            draft.brigadista_id,
          );
        } catch (err) {
          app.log.error({ err, token }, "[form-qr-drafts] insert form_submission failed on scan");
          // Seguimos al redirect — el ciudadano no debe ver un error.
        }

        // Stats del brigadista
        try {
          await qrLeadsRepo.recordScan({
            campaign_id: draft.campaign_id,
            brigadista_id: draft.brigadista_id,
            scan_source: "qr",
            user_agent: userAgent,
          });
        } catch (err) {
          app.log.warn({ err, token }, "[form-qr-drafts] qr_leads recordScan failed");
        }

        // Engagement: el voter_profile ya existe (trigger de migration 050 lo
        // creó al insertar la form_submission). Lo marcamos como pendiente_envio
        // — el ciudadano escaneó pero todavía no llegó su mensaje al wa-events.
        // Si después llega un inbound, applyEngagementTransition lo subirá a
        // 'comparte'.
        const phone = typeof draft.payload.data?.telefono === "string"
          ? draft.payload.data.telefono
          : null;
        if (phone) {
          voterProfileRepo
            .markPendingEnvio(draft.campaign_id, phone)
            .catch((err) => app.log.warn({ err, token }, "[form-qr-drafts] markPendingEnvio failed"));
        }
      }

      return reply.code(302).header("location", waLink).send();
    });

    // ─── GET /api/r/:token ───────────────────────────────────────────
    // Landing pública con OG completos para el share desde mobile.
    // No consume el draft (no inserta form_submission) — su única función es
    // ser un envoltorio bonito que se previsualiza lindo en WhatsApp/redes y
    // redirige al wa.me al ser abierto por un navegador real.
    //
    // Diferencia con /api/q/:token:
    //   /api/q/:token → escaneado físico del QR, consume + persiste form,
    //                   redirige 302 a wa.me sin landing.
    //   /api/r/:token → share del link bonito, no consume, sirve HTML con OG.
    //
    // Para que el share use la URL "linda" /r/:token (sin /api/), el web app
    // tiene un rewrite en next.config que mapea /r/:token → /api/r/:token.
    // Nginx solo rutea /api/* al backend, así que la ruta debe vivir bajo /api/.
    app.get("/api/r/:token", async (request, reply) => {
      const { token } = request.params as { token: string };

      const draft = await repo.findByToken(token);
      if (!draft) {
        return reply
          .code(404)
          .header("content-type", "text/html; charset=utf-8")
          .send(
            htmlPage(
              "Enlace no válido",
              "<p>Este enlace ya no está disponible.</p>",
            ),
          );
      }

      const waInfo = await repo.getCampaignWaNumber(draft.campaign_id);
      const brigadistaFirstName = await repo.getBrigadistaFirstName(draft.brigadista_id);
      const waNumber = waInfo?.whatsapp_number ?? FALLBACK_WA_NUMBER;
      const candidateName = waInfo?.campaign_name ?? "la campaña";
      const waLink = buildWaLink(
        waNumber,
        brigadistaFirstName,
        candidateName,
        waInfo?.whatsapp_qr_message ?? null,
      );

      // Imagen para OG: foto del candidato si existe, fallback a logo Goberna.
      // Si foto_url es relativa, prepend al PUBLIC_BASE_URL (los crawlers
      // necesitan URL absoluta).
      const rawFoto = waInfo?.foto_url ?? "";
      const ogImage = rawFoto && rawFoto.startsWith("http")
        ? rawFoto
        : rawFoto
          ? `${PUBLIC_BASE_URL}${rawFoto.startsWith("/") ? rawFoto : `/${rawFoto}`}`
          : `${PUBLIC_BASE_URL}/goberna-og.png`;

      // pageUrl en og:url debe ser la URL pública "linda" que comparte el
      // mobile (/r/:token), no la interna /api/r/:token. Crawlers comparan
      // og:url con la URL que les llegó para detectar redirects.
      const html = shareOgPage({
        candidateName,
        brigadistaName: brigadistaFirstName,
        cargo: waInfo?.cargo ?? "",
        numero: waInfo?.numero ?? "",
        waLink,
        ogImage,
        pageUrl: `${PUBLIC_BASE_URL}/r/${token}`,
      });

      // Cache-Control corto: los crawlers a veces cachean preview por horas;
      // queremos balance entre no joder al CDN y permitir que se reflejen
      // updates del whatsapp_qr_message rápido.
      return reply
        .code(200)
        .header("content-type", "text/html; charset=utf-8")
        .header("cache-control", "public, max-age=300, s-maxage=300")
        .send(html);
    });
  };
}
