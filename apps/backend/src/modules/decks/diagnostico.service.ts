// diagnostico.service.ts
// Genera el deck HTML de diagnóstico inicial a partir de un CandidatoSnapshotPublico.
// Guarda en filesystem + fila en public.decks (mismo patrón que onboarding/routes.ts).

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { pool } from "../../db";
import type { CandidatoSnapshotPublico } from "../onboarding/snapshot.schemas";
import * as decksRepo from "./repository";

const STORAGE_DIR = process.env.DECKS_STORAGE_DIR ?? "/srv/uploads/decks";

// ── HTML Template ───────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(): string {
  return new Date().toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildNivelLabel(nivel: string): string {
  const map: Record<string, string> = {
    PRESIDENCIAL: "Nacional",
    PARLAMENTARIO: "Nacional",
    GOBIERNO_REGIONAL: "Regional",
    GOBIERNO_LOCAL: "Local",
    GOBIERNO_PROVINCIAL: "Provincial",
  };
  return map[nivel] ?? nivel;
}

function proximosPasos(cargoNombre: string): string[] {
  const lower = cargoNombre.toLowerCase();
  if (lower.includes("alcalde") || lower.includes("regidor")) {
    return [
      "Completar perfil en el dashboard electoral",
      "Definir zonas prioritarias en la app mobile",
      "Conectar WhatsApp al CRM electoral",
      "Subir formulario de captación de votantes",
      "Configurar equipo (brigadistas, supervisores)",
    ];
  }
  if (lower.includes("congresista") || lower.includes("senador")) {
    return [
      "Completar perfil en el dashboard electoral",
      "Mapear zonas de mayor votación histórica",
      "Configurar estrategia de comunicación digital",
      "Subir formulario de referidos electorales",
      "Armar equipo territorial por circunscripción",
    ];
  }
  if (lower.includes("gobernador") || lower.includes("consejero")) {
    return [
      "Completar perfil en el dashboard electoral",
      "Definir subregiones prioritarias",
      "Conectar WhatsApp al CRM electoral",
      "Subir formulario de captación de votantes",
      "Configurar red de coordinadores provinciales",
    ];
  }
  return [
    "Completar perfil en el dashboard electoral",
    "Definir zonas prioritarias en la app mobile",
    "Conectar WhatsApp al CRM electoral",
    "Subir formulario de captación de votantes",
    "Configurar equipo de campaña",
  ];
}

export function buildDiagnosticoHtml(snap: CandidatoSnapshotPublico): string {
  const { candidato, postulacion, territorio, estrategia, infra } = snap;
  const pc = esc(candidato.primaryColor);
  const fullName = esc(candidato.fullName);
  const fecha = esc(formatDate());

  const cargoNombre = esc(postulacion?.cargo?.nombre ?? "");
  const cargoAmbito = esc(postulacion?.cargo?.ambito ?? "");
  const nivelLabel = esc(buildNivelLabel(postulacion?.nivelGobierno ?? ""));
  const partidoLabel = postulacion?.partido
    ? `${esc(postulacion.partido.nombre)} (${esc(postulacion.partido.siglas)})`
    : "Candidato independiente";

  // Territorio
  const jurLabel = esc(
    territorio?.distrito?.nombre ??
      territorio?.provincia?.nombre ??
      territorio?.departamento?.nombre ??
      territorio?.pais?.nombre ??
      "",
  );
  const breadcrumb = [
    territorio?.departamento?.nombre,
    territorio?.provincia?.nombre,
    territorio?.distrito?.nombre,
  ]
    .filter((v): v is string => Boolean(v))
    .map(esc)
    .join(" &rsaquo; ");
  const ubigeo = territorio?.distrito?.ubigeo ? esc(territorio.distrito.ubigeo) : "";
  const areaTxt =
    territorio?.area_km2 != null
      ? `${territorio.area_km2.toFixed(1)} km²`
      : "No disponible";

  const pasos = proximosPasos(postulacion?.cargo?.nombre ?? "");
  const pasosHtml = pasos
    .map((p, i) => `<div class="paso"><span class="paso-num">${i + 1}</span><span>${esc(p)}</span></div>`)
    .join("\n          ");

  const siteUrl = esc(infra.siteUrl);
  const dashUrl = esc(infra.dashboardUrl);
  const mailbox = esc(infra.mailboxEmail);
  const mobileUrl = "https://electoral.goberna.club/mobile/download";

  const estrategiaMode = estrategia.mode ? esc(estrategia.mode) : "Por definir";
  const estrategiaDesc = esc(estrategia.description);

  const tenantId = esc(candidato.slug);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Diagnóstico Inicial — ${fullName}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{
    scroll-snap-type:y mandatory;
    overflow-y:scroll;
    height:100%;
    font-family:"Segoe UI",system-ui,sans-serif;
  }
  body{height:100%;background:#0f172a}
  section{
    height:100vh;
    scroll-snap-align:start;
    scroll-snap-stop:always;
    padding:48px 64px;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    overflow:hidden;
  }
  /* Colores base */
  .slide-dark{background:#0a1f4a;color:#fff}
  .slide-light{background:#fff;color:#0a1f4a}
  .slide-gray{background:#f8fafc;color:#1e293b}
  .slide-accent{background:${pc};color:#fff}
  /* Tipografía */
  .label{font-size:11px;font-weight:700;letter-spacing:.25em;text-transform:uppercase;opacity:.6}
  .h1{font-size:clamp(40px,6vw,72px);font-weight:900;line-height:1;letter-spacing:-.02em}
  .h2{font-size:clamp(28px,4vw,48px);font-weight:800;line-height:1.1}
  .h3{font-size:24px;font-weight:700}
  .body{font-size:18px;line-height:1.6;opacity:.8}
  /* Acento dorado */
  .gold{color:#fbbf24}
  .gold-bar{height:5px;width:64px;background:#fbbf24;border-radius:3px}
  /* Grilla de datos */
  .data-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;margin-top:32px}
  .data-card{background:rgba(255,255,255,.08);padding:20px 24px;border-radius:12px}
  .data-card.light{background:rgba(10,31,74,.06)}
  .data-label{font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;opacity:.5;margin-bottom:6px}
  .data-val{font-size:22px;font-weight:700}
  /* Pasos */
  .pasos{display:flex;flex-direction:column;gap:14px;margin-top:24px}
  .paso{display:flex;align-items:flex-start;gap:16px;font-size:17px;line-height:1.4}
  .paso-num{
    min-width:32px;height:32px;background:#fbbf24;color:#0a1f4a;
    border-radius:50%;display:flex;align-items:center;justify-content:center;
    font-weight:800;font-size:15px;flex-shrink:0
  }
  /* Productos */
  .productos{display:flex;flex-direction:column;gap:16px;margin-top:28px}
  .producto{
    display:flex;align-items:center;gap:16px;
    padding:16px 20px;border-radius:12px;
    background:rgba(255,255,255,.08);
    font-size:16px;
  }
  .producto.light{background:rgba(10,31,74,.06)}
  .producto-icon{font-size:24px;min-width:36px;text-align:center}
  .producto-link{color:#60a5fa;word-break:break-all}
  /* Footer contraportada */
  .footer-row{display:flex;gap:48px;align-items:flex-end;flex-wrap:wrap}
  .footer-col{display:flex;flex-direction:column;gap:4px}
  /* Navegación hint */
  .hint{
    position:fixed;bottom:24px;right:28px;
    background:rgba(255,255,255,.12);
    color:#fff;font-size:12px;padding:6px 12px;border-radius:20px;
    pointer-events:none;z-index:100;backdrop-filter:blur(4px);
  }
</style>
</head>
<body>

<!-- ─── SLIDE 1: PORTADA ─────────────────────────────────────────────── -->
<section class="slide-accent">
  <div>
    <div class="label">Diagnóstico Inicial</div>
    <div style="margin-top:4px;font-size:13px;opacity:.7">Generado automáticamente · ${fecha}</div>
  </div>
  <div>
    <div class="h1">${fullName}</div>
    <div style="margin-top:16px;font-size:22px;opacity:.85">${cargoNombre} · ${jurLabel}</div>
    <div style="margin-top:12px;display:inline-block;padding:6px 16px;border:1.5px solid rgba(255,255,255,.4);border-radius:6px;font-size:14px;font-weight:600;letter-spacing:.05em">${partidoLabel}</div>
  </div>
  <div style="display:flex;align-items:center;gap:12px">
    <div class="gold-bar"></div>
    <span style="font-size:13px;opacity:.6;font-weight:600;letter-spacing:.1em">GOBERNA · MÁQUINA ELECTORAL DIGITAL</span>
  </div>
</section>

<!-- ─── SLIDE 2: JURISDICCIÓN ─────────────────────────────────────────── -->
<section class="slide-light">
  <div>
    <div class="label" style="color:${pc}">Tu Jurisdicción</div>
    <div class="gold-bar" style="background:${pc};margin-top:8px"></div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:24px;margin-top:24px">
    <div class="h2" style="color:${pc}">${jurLabel}</div>
    ${breadcrumb ? `<div class="body">${breadcrumb}</div>` : ""}
    <div class="data-grid">
      ${ubigeo ? `<div class="data-card light"><div class="data-label">UBIGEO</div><div class="data-val" style="font-family:monospace">${ubigeo}</div></div>` : ""}
      <div class="data-card light"><div class="data-label">Área estimada</div><div class="data-val">${areaTxt}</div></div>
      ${cargoAmbito ? `<div class="data-card light"><div class="data-label">Ámbito</div><div class="data-val" style="text-transform:capitalize">${cargoAmbito}</div></div>` : ""}
    </div>
    <div class="data-card light" style="padding:20px;background:rgba(10,31,74,.04);border:1.5px dashed rgba(10,31,74,.15)">
      <div class="data-label">Mapa de jurisdicción</div>
      <div style="margin-top:6px;font-size:15px;opacity:.6">[ Visualización cartográfica disponible en el dashboard electoral ]</div>
    </div>
  </div>
  <div></div>
</section>

<!-- ─── SLIDE 3: POSTULACIÓN ──────────────────────────────────────────── -->
<section class="slide-gray">
  <div>
    <div class="label" style="color:${pc}">Tu Postulación</div>
    <div class="gold-bar" style="background:${pc};margin-top:8px"></div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div class="data-grid">
      <div class="data-card light"><div class="data-label">Cargo</div><div class="data-val">${cargoNombre}</div></div>
      <div class="data-card light"><div class="data-label">Nivel</div><div class="data-val">${nivelLabel}</div></div>
      <div class="data-card light"><div class="data-label">Partido / Alianza</div><div class="data-val">${partidoLabel}</div></div>
      <div class="data-card light"><div class="data-label">Ámbito territorial</div><div class="data-val" style="text-transform:capitalize">${cargoAmbito || nivelLabel}</div></div>
    </div>
  </div>
  <div></div>
</section>

<!-- ─── SLIDE 4: ESTRATEGIA ───────────────────────────────────────────── -->
<section class="slide-dark">
  <div>
    <div class="label">Tu Estrategia Elegida</div>
    <div class="gold-bar" style="margin-top:8px"></div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:20px">
    <div class="data-card" style="padding:28px 32px">
      <div class="data-label">Modo de campaña</div>
      <div class="h3 gold" style="margin-top:8px">${estrategiaMode}</div>
    </div>
    <div class="body" style="max-width:640px">${estrategiaDesc}</div>
    <div class="data-card" style="padding:20px 24px;background:rgba(255,255,255,.05);border:1px dashed rgba(255,255,255,.2)">
      <div class="data-label">Radar estratégico</div>
      <div style="margin-top:6px;font-size:14px;opacity:.5">[ Tierra · Digital · Datos — disponible en el dashboard ]</div>
    </div>
  </div>
  <div></div>
</section>

<!-- ─── SLIDE 5: PLATAFORMA DIGITAL ──────────────────────────────────── -->
<section class="slide-light">
  <div>
    <div class="label" style="color:${pc}">Tu Plataforma Digital</div>
    <div class="gold-bar" style="background:${pc};margin-top:8px"></div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div class="productos">
      <div class="producto light">
        <span class="producto-icon">🌐</span>
        <div>
          <div class="data-label">Sitio web</div>
          <a href="${siteUrl}" class="producto-link">${siteUrl}</a>
        </div>
      </div>
      <div class="producto light">
        <span class="producto-icon">📊</span>
        <div>
          <div class="data-label">Dashboard electoral</div>
          <a href="${dashUrl}" class="producto-link">${dashUrl}</a>
        </div>
      </div>
      <div class="producto light">
        <span class="producto-icon">📧</span>
        <div>
          <div class="data-label">Email institucional</div>
          <span class="producto-link">${mailbox}</span>
        </div>
      </div>
    </div>
  </div>
  <div></div>
</section>

<!-- ─── SLIDE 6: PRÓXIMOS PASOS ───────────────────────────────────────── -->
<section class="slide-dark">
  <div>
    <div class="label">Próximos Pasos</div>
    <div class="gold-bar" style="margin-top:8px"></div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div class="pasos">
      ${pasosHtml}
    </div>
  </div>
  <div></div>
</section>

<!-- ─── SLIDE 7: ACCESO A PRODUCTOS ──────────────────────────────────── -->
<section class="slide-gray">
  <div>
    <div class="label" style="color:${pc}">Acceso a Productos</div>
    <div class="gold-bar" style="background:${pc};margin-top:8px"></div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div class="productos">
      <div class="producto light">
        <span class="producto-icon">📊</span>
        <div>
          <div class="data-label">Electoral Dashboard</div>
          <a href="${dashUrl}" class="producto-link">${dashUrl}</a>
        </div>
      </div>
      <div class="producto light">
        <span class="producto-icon">📱</span>
        <div>
          <div class="data-label">App Mobile Territorio</div>
          <a href="${mobileUrl}" class="producto-link">${mobileUrl}</a>
        </div>
      </div>
      <div class="producto light" style="opacity:.6">
        <span class="producto-icon">💬</span>
        <div>
          <div class="data-label">CRM Electoral</div>
          <span style="font-size:15px">Próximamente disponible</span>
        </div>
      </div>
    </div>
  </div>
  <div></div>
</section>

<!-- ─── SLIDE 8: CONTRAPORTADA ────────────────────────────────────────── -->
<section class="slide-accent">
  <div>
    <div class="label">Goberna</div>
    <div style="margin-top:4px;font-size:13px;opacity:.7">Máquina Electoral Digital</div>
  </div>
  <div>
    <div class="h2">Todo el poder<br>de la data electoral,<br>en tus manos.</div>
    <div class="gold-bar" style="margin-top:24px"></div>
  </div>
  <div class="footer-row">
    <div class="footer-col">
      <div class="label">Generado</div>
      <div style="font-size:15px">${fecha}</div>
    </div>
    <div class="footer-col">
      <div class="label">Tenant ID (soporte)</div>
      <div style="font-size:15px;font-family:monospace">${tenantId}</div>
    </div>
    <div class="footer-col">
      <div class="label">Dashboard</div>
      <div style="font-size:14px;opacity:.75">${dashUrl}</div>
    </div>
  </div>
</section>

<div class="hint">↑↓ scroll para navegar</div>

</body>
</html>`;
}

// ── Idempotent create deck ──────────────────────────────────────────────

export type GenerateResult = {
  deck_id: string;
  created: boolean;
};

/**
 * Genera (o reutiliza) el deck diagnóstico para un campaign_id.
 * Idempotente: si ya existe un deck con type='diagnostico' y status='draft'
 * para este candidato_id, devuelve el existente sin crear otro.
 *
 * El uploaded_by_user_id se resuelve al user activo de la campaign (candidato).
 * Si no hay ninguno, usa un sentinel UUID estático (solo para satisfacer la FK).
 */
export async function generateDiagnosticoDeck(
  campaignId: string,
  snap: CandidatoSnapshotPublico,
): Promise<GenerateResult> {
  // 1. Resolver candidato_id y user_id de la campaign
  const { rows: candRows } = await pool.query<{
    candidato_id: number;
    user_id: string | null;
  }>(
    `SELECT
       p.id_candidato AS candidato_id,
       uc.user_id
     FROM candidatos.postulacion p
     LEFT JOIN user_campaigns uc
       ON uc.campaign_id = p.campaign_id
      AND uc.role = 'candidato'
      AND uc.status = 'active'
     WHERE p.campaign_id = $1
     LIMIT 1`,
    [campaignId],
  );

  if (!candRows[0]) {
    throw new Error("POSTULACION_NOT_FOUND: no hay postulación para este campaign_id");
  }

  const candidatoId = candRows[0].candidato_id;
  const uploaderUserId = candRows[0].user_id;

  if (!uploaderUserId) {
    throw new Error("USER_NOT_FOUND: campaign sin user activo para satisfacer FK");
  }

  // 2. Verificar idempotencia: ¿ya existe un draft diagnóstico para este candidato?
  const existing = await decksRepo.findDraftByKey(candidatoId, uploaderUserId, "diagnostico");
  if (existing) {
    return { deck_id: existing.id, created: false };
  }

  // 2b. También buscar cualquier deck diagnóstico (independiente del uploader)
  // para no duplicar si fue creado por otro flujo (e.g. seed-deck del wizard).
  const { rows: anyDiag } = await pool.query<{ id: string }>(
    `SELECT id FROM public.decks
      WHERE candidato_id = $1 AND type = 'diagnostico' AND status = 'draft'
      ORDER BY created_at DESC LIMIT 1`,
    [candidatoId],
  );
  if (anyDiag[0]) {
    return { deck_id: anyDiag[0].id, created: false };
  }

  // 3. Generar HTML
  const html = buildDiagnosticoHtml(snap);
  const sizeBytes = Buffer.byteLength(html, "utf8");
  const id = randomUUID();
  const storagePath = join(STORAGE_DIR, `${id}.html`);

  await fs.mkdir(STORAGE_DIR, { recursive: true });
  await fs.writeFile(storagePath, html, "utf8");

  // 4. Persistir en DB
  const row = await decksRepo.insertDeck({
    id,
    candidato_id: candidatoId,
    campaign_id: campaignId,
    uploaded_by_user_id: uploaderUserId,
    title: `Diagnóstico Inicial — ${snap.candidato.fullName}`,
    type: "diagnostico",
    description: "Diagnóstico automático generado al completar el onboarding",
    storage_path: storagePath,
    size_bytes: sizeBytes,
  });

  return { deck_id: row.id, created: true };
}
