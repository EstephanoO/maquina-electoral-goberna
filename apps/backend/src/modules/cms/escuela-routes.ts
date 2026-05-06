/**
 * Escuela ERP lookup — endpoints para enriquecer leads del bot con datos del
 * cliente real (nombre, dni, ocupación, courses comprados, LTV, tier).
 *
 * Origen de los datos: dump del ERP de Goberna Escuela importado a `escuela.*`
 * (ver migration 054_escuela_erp.sql + scripts/import-escuela-erp.ts).
 *
 * Endpoints:
 *   GET /api/cms/escuela/lookup-by-phone/:phone
 *   GET /api/cms/escuela/products/active
 *
 * Auth: X-Bot-Secret (bot Baileys) o JWT del CMS. Ambos paths sirven el
 * mismo response — el bot usa el secret porque corre fuera del frontend.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";

import type { AppEnv } from "../../config/env";
import { pool } from "../../db";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";

// ── Auth helper: acepta X-Bot-Secret (bot) o JWT (CMS) ──────────────

function isBotAuthenticated(request: FastifyRequest, env: AppEnv): boolean {
  if (!env.botSharedSecret) return false;
  const provided = (request.headers["x-bot-secret"] ?? "") as string;
  return provided === env.botSharedSecret;
}

// ── Types ────────────────────────────────────────────────────────────

type Lead360Row = {
  canonical_phone: string;
  prefijo: string | null;
  client_id: string;
  codigo_cliente: string;
  nombre: string;
  apellido: string;
  nombre_completo: string;
  dni: string | null;
  ocupacion: string | null;
  tratamiento: string | null;
  fecha_nacimiento: string | null;
  first_registered_at: string | null;
  email_principal: string | null;
  moodle_email: string | null;
  moodle_user_id: number | null;
  sales_count: string;
  sales_total: string;
  last_purchase_at: string | null;
  enrollments_count: string;
  active_enrollments: string;
  last_enrolled_course: string | null;
  certificates_count: string;
  buyer_tier: string;
};

// ── Routes ───────────────────────────────────────────────────────────

export function buildEscuelaRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── GET /api/cms/escuela/lookup-by-phone/:phone ─────────────────
    //
    // Acepta phone con o sin "+", con o sin formato. Normaliza a últimos 9
    // y últimos 11 dígitos para matchear contra escuela.lead_360.canonical_phone
    // (que se guarda con últimos 11 dígitos = país + número).
    //
    // Response shape:
    //   { ok, lead: Lead360Row | null, suggested_tags: string[] }
    //
    // suggested_tags es lo que el bot puede mergear directo a leads-crm
    // (interés:gestion-parlamentaria, profesion:abogado, cliente:vip, etc).
    const lookupHandler = async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = String(request.id);

      const isBot = isBotAuthenticated(request, env);
      if (!isBot && !(request as { userId?: string }).userId) {
        return reply.code(401).send(errorPayload(requestId, "UNAUTHORIZED", "auth requerido (X-Bot-Secret o JWT)"));
      }

      const { phone } = request.params as { phone: string };
      const digits = (phone ?? "").replace(/\D/g, "");
      if (digits.length < 8) {
        return reply.code(400).send(errorPayload(requestId, "INVALID_PHONE", "phone inválido (mínimo 8 dígitos)"));
      }

      // Match: probamos los últimos 11 dígitos (con prefix país) primero,
      // luego los últimos 9 (sin prefix). Postgres usa el index de canonical_phone.
      // Si hay múltiples clientes con el mismo phone (raro, pero ocurre),
      // priorizamos por buyer_tier (vip > repeat > single > prospect) y
      // recencia de compra.
      const last11 = digits.slice(-11);
      const last9 = digits.slice(-9);

      const { rows } = await pool.query<Lead360Row>(
        `SELECT
            canonical_phone, prefijo, client_id::text, codigo_cliente,
            nombre, apellido, nombre_completo, dni, ocupacion, tratamiento,
            fecha_nacimiento::text, first_registered_at::text,
            email_principal, moodle_email, moodle_user_id,
            sales_count::text, sales_total::text,
            last_purchase_at::text,
            enrollments_count::text, active_enrollments::text,
            last_enrolled_course, certificates_count::text,
            buyer_tier
          FROM escuela.lead_360
         WHERE canonical_phone IN ($1, $2)
            OR RIGHT(canonical_phone, 9) = $2
         ORDER BY
            CASE buyer_tier
              WHEN 'vip' THEN 1 WHEN 'repeat' THEN 2
              WHEN 'single' THEN 3 ELSE 4
            END,
            COALESCE(last_purchase_at, first_registered_at) DESC NULLS LAST
         LIMIT 1`,
        [last11, last9],
      );

      const lead = rows[0] ?? null;
      const suggestedTags = lead ? buildSuggestedTags(lead) : [];

      return reply.code(200).send({
        ok: true,
        request_id: requestId,
        lead,
        suggested_tags: suggestedTags,
      });
    };

    app.get(
      "/api/cms/escuela/lookup-by-phone/:phone",
      // Auth se valida en el handler — soporta X-Bot-Secret (sin JWT) o JWT.
      // El authorize plugin solo se aplica si no hay X-Bot-Secret.
      {
        preHandler: async (request, reply) => {
          if (isBotAuthenticated(request, env)) return;
          await app.authenticate(request, reply);
          if (reply.sent) return;
          await authorize({ requireCampaign: false })(request, reply);
        },
      },
      lookupHandler,
    );

    // ── GET /api/cms/escuela/products/active ─────────────────────────
    //
    // Lista de productos activos con su schedule más reciente.
    // Usado por: classifier (auto-sync de PRODUCT_RULES), auto-reply
    // (template con fechas + precio reales), CMS (display).
    app.get(
      "/api/cms/escuela/products/active",
      {
        preHandler: async (request, reply) => {
          if (isBotAuthenticated(request, env)) return;
          await app.authenticate(request, reply);
          if (reply.sent) return;
          await authorize({ requireCampaign: false })(request, reply);
        },
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const { rows } = await pool.query(
          `SELECT
              p.id::text, p.sku, p.nombre, p.precio_normal::text, p.precio_promocion::text,
              s.fecha_inicio::text, s.fecha_fin::text, s.cantidad_modulos,
              s.horas_academicas, s.dias_semana
            FROM escuela.products p
            LEFT JOIN LATERAL (
              SELECT * FROM escuela.product_schedules ss
              WHERE ss.product_id = p.id
              ORDER BY ss.fecha_inicio DESC NULLS LAST
              LIMIT 1
            ) s ON TRUE
            WHERE p.estado = 1
            ORDER BY COALESCE(s.fecha_inicio, p.fecha_registro) DESC NULLS LAST
            LIMIT 200`,
        );
        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          products: rows,
        });
      },
    );
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convierte el lead_360 row en tags hard que el bot/wa-events pueden mergear. */
function buildSuggestedTags(lead: Lead360Row): string[] {
  const tags: string[] = [];

  // Tier
  if (lead.buyer_tier && lead.buyer_tier !== "prospect") {
    tags.push(`cliente:${lead.buyer_tier}`);
  }

  // Profesión / ocupación
  if (lead.ocupacion) {
    tags.push(`profesion:${slug(lead.ocupacion)}`);
  }

  // País (derivado del prefijo si está, sino se infiere desde canonical)
  if (lead.prefijo) {
    const p = lead.prefijo.replace(/\D/g, "");
    const map: Record<string, string> = {
      "51": "peru", "52": "mexico", "57": "colombia", "56": "chile",
      "54": "argentina", "58": "venezuela", "55": "brasil", "53": "cuba",
      "591": "bolivia", "593": "ecuador", "595": "paraguay", "598": "uruguay",
      "506": "costa-rica", "502": "guatemala", "503": "el-salvador",
      "504": "honduras", "505": "nicaragua", "507": "panama",
      "1": "eeuu", "34": "espana",
    };
    const country = map[p] ?? null;
    if (country) tags.push(`país:${country}`);
  }

  // Curso más reciente matriculado
  if (lead.last_enrolled_course) {
    tags.push(`matriculado:${slug(lead.last_enrolled_course).slice(0, 50)}`);
  }

  // Cliente activo (con matrícula viva)
  if (Number(lead.active_enrollments) > 0) {
    tags.push("estado:cursando");
  }

  // Recordatorio de re-engagement
  if (lead.last_purchase_at) {
    const days = Math.floor((Date.now() - new Date(lead.last_purchase_at).getTime()) / 86400000);
    if (days > 365) tags.push("estado:dormido_1y");
    else if (days > 180) tags.push("estado:dormido_6m");
  }

  // Certificados
  const certs = Number(lead.certificates_count);
  if (certs > 0) tags.push(`certificados:${certs}`);

  return tags;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
