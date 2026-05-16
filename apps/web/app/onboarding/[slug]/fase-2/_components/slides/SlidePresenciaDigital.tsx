"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";

// ─────────────────────────────────────────────────────────────────────────────
// Inline UI primitives (no external _ui dir yet)
// ─────────────────────────────────────────────────────────────────────────────

type SelloVariant = "critico" | "atencion" | "ok";

interface SelloProps {
  variant?: SelloVariant;
  label?: string;
}

const SELLO_CONFIG: Record<SelloVariant, { label: string; border: string; text: string }> = {
  critico:  { label: "CRÍTICO",  border: "border-red-600",   text: "text-red-600" },
  atencion: { label: "ATENCIÓN", border: "border-amber-600", text: "text-amber-600" },
  ok:       { label: "OK",       border: "border-emerald-500", text: "text-emerald-500" },
};

/** Stamp de diagnóstico — borde doble, rotado, estilo PDF Roberto Sánchez. */
function CriticoSello({ variant = "critico", label }: SelloProps) {
  const cfg = SELLO_CONFIG[variant];
  return (
    <span
      className={`inline-block px-5 py-1.5 border-[3px] ${cfg.border} ${cfg.text} font-black uppercase tracking-widest text-lg rounded-sm bg-white/5`}
      style={{ transform: "rotate(-12deg)", boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }}
    >
      {label ?? cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic simulation helpers
// ─────────────────────────────────────────────────────────────────────────────

interface SimData {
  fbSeg: number;
  fbVerif: boolean;
  igSeg: number;
  igPosts: number;
  tiktokSeg: number;
  googlePos: number;  // 2–5 (never first result)
  webActiva: boolean;
}

function simData(fullName: string): SimData {
  const h = [...fullName].reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    fbSeg:     (((h * 37) % 195) + 5) * 1000,
    fbVerif:   h % 7 === 0,
    igSeg:     (((h * 13) % 78) + 2) * 1000,
    igPosts:   (h % 180) + 20,
    tiktokSeg: (((h * 5) % 28) + 1) * 1000,
    googlePos: (h % 4) + 2,
    webActiva: h % 3 === 0,
  };
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(0)} mil` : String(n);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Stamp logic helpers
// ─────────────────────────────────────────────────────────────────────────────

function googleSello(pd: ConsultorFormFase2["presencia_digital"], sim: SimData): SelloVariant {
  if (pd?.google_results === "ok" && pd?.web_oficial === "ok") return "ok";
  if (pd?.google_results === "review" || pd?.web_oficial === "review") return "atencion";
  if (pd?.google_results === "ok") return "atencion";
  return "critico";
}

function facebookSello(
  fbHandle: string | undefined,
  pd: ConsultorFormFase2["presencia_digital"],
  sim: SimData,
): SelloVariant {
  if (!fbHandle) return "critico";
  const seg = sim.fbSeg;
  if (seg >= 100_000 && (pd?.redes_verificadas === "ok" || sim.fbVerif)) return "ok";
  if (seg >= 50_000) return "atencion";
  return "critico";
}

function instagramSello(igHandle: string | undefined): SelloVariant {
  // Instagram sin estrategia propia siempre es ATENCIÓN como mínimo
  if (!igHandle) return "critico";
  return "atencion";
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab panels
// ─────────────────────────────────────────────────────────────────────────────

interface TabGoogleProps {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
  sim: SimData;
}

function GooglePanel({ ctx, f2, sim }: TabGoogleProps) {
  const pd = f2.presencia_digital;
  const fullName = ctx.user.full_name;
  const cargo = ctx.cargo.nombre;
  const partido = ctx.organizacion_politica?.siglas ?? ctx.organizacion_politica?.nombre ?? "su partido";
  const webHandle = f2.redes_sociales?.candidato?.web_oficial;
  const hasRealWeb = !!webHandle && webHandle.trim().length > 0;
  const webActiva = hasRealWeb || sim.webActiva;
  const sello = googleSello(pd, sim);

  // Simulated name-based URL
  const simDomain = fullName.toLowerCase().replace(/\s+/g, "");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 h-full">
      {/* Panel izq: Google mock */}
      <div className="rounded-2xl overflow-hidden border border-white/10 p-1">
        <div className="bg-white rounded-xl p-4 text-gray-900 font-sans text-sm h-full">
          {/* Search bar simulada */}
          <div className="flex items-center gap-2 border border-gray-300 rounded-full px-4 py-2 mb-4 text-gray-500 text-xs">
            <span className="text-blue-600 font-black text-base leading-none">G</span>
            <span>{fullName}</span>
            <span className="ml-auto text-gray-300">🔍</span>
          </div>

          {/* Resultado 1 */}
          <div className="mb-3">
            <p className="text-[11px] text-green-700 truncate">
              {hasRealWeb ? webHandle : `${simDomain}.com`}
            </p>
            <p className="text-blue-700 text-sm font-medium leading-snug">
              {fullName} — {cargo}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              {cargo} · Candidato por {partido}. Conocé su plan de gobierno, propuestas y trayectoria política.
            </p>
          </div>

          {/* Resultado 2: noticia */}
          <div className="mb-3">
            <p className="text-[11px] text-green-700">peru21.pe › noticias</p>
            <p className="text-blue-700 text-sm font-medium leading-snug">
              {fullName}: «Necesitamos cambio real en {cargo}»
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              Hace 3 días · El candidato respondió a las críticas de sus adversarios en declaraciones exclusivas...
            </p>
          </div>

          {/* Resultado 3: negativo simulado */}
          <div className="mb-3">
            <p className="text-[11px] text-green-700">ojo.pe › política</p>
            <p className="text-blue-700 text-sm font-medium leading-snug">
              Critican gestión de {fullName.split(" ")[0]} en el sector público
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              Hace 1 semana · Opositores cuestionan el desempeño y los vínculos del candidato...
            </p>
          </div>

          {/* Badge sin web */}
          {!webActiva && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[11px] text-red-700 font-semibold">
              ⚠ Sin sitio web oficial indexado
            </div>
          )}

          {/* Indicador posición */}
          <div className="mt-2 text-[10px] text-gray-400 italic text-center">
            * Simulación — aparece en posición #{sim.googlePos} de búsqueda
          </div>
        </div>
      </div>

      {/* Panel der: análisis */}
      <RightPanel
        sello={sello}
        title="El candidato no tiene control de su narrativa"
        body={`El mensaje de ${fullName}, sus propuestas y su aparición pública están en manos de los medios.`}
        bullets={[
          "No aparece en las primeras posiciones de búsqueda.",
          "AUSENCIA DE WEB Y POSICIONAMIENTO EN BUSCADORES.",
          "Ataques de buscadores no podrán ser defendidos.",
        ]}
        boldBullet={1}
        notas={f2.presencia_digital?.notas}
      />
    </div>
  );
}

interface TabFacebookProps {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
  sim: SimData;
}

function FacebookPanel({ ctx, f2, sim }: TabFacebookProps) {
  const fullName = ctx.user.full_name;
  const cargo = ctx.cargo.nombre;
  const partido = ctx.organizacion_politica?.siglas ?? ctx.organizacion_politica?.nombre ?? "partido";
  const fbHandle = f2.redes_sociales?.candidato?.facebook;
  const sello = facebookSello(fbHandle, f2.presencia_digital, sim);
  const ini = initials(fullName);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 h-full">
      {/* Panel izq: Facebook mock */}
      <div className="rounded-2xl overflow-hidden border border-white/10 p-1">
        <div className="rounded-xl overflow-hidden bg-[#f0f2f5] h-full">
          {/* Header nav FB */}
          <div className="bg-[#1877f2] px-4 py-2.5 flex items-center gap-2">
            <span className="text-white font-black text-xl">f</span>
            <div className="flex-1" />
            <span className="text-white/70 text-xs">🔔 👤</span>
          </div>

          {/* Cover photo */}
          <div className="h-24 bg-gradient-to-br from-[#0a1e4a] via-[#1a3a7a] to-[#0a1e4a] relative">
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
              <div className="w-16 h-16 rounded-full bg-gray-300 border-4 border-white flex items-center justify-center text-gray-600 font-black text-xl shadow-md">
                {ini}
              </div>
            </div>
          </div>

          <div className="pt-10 px-4 pb-4 bg-white text-center">
            <p className="font-bold text-gray-900 text-sm">{fullName}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{cargo} · {partido}</p>
            {fbHandle ? (
              <p className="text-[10px] text-blue-600 mt-0.5">{fbHandle}</p>
            ) : null}
            <div className="flex justify-center gap-5 mt-3 text-xs text-gray-700">
              <div className="text-center">
                <p className="font-bold text-gray-900">{fmtK(sim.fbSeg)}</p>
                <p className="text-[10px] text-gray-500">seguidores</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-900">
                  {sim.fbVerif || f2.presencia_digital?.redes_verificadas === "ok" ? "✓" : "✗"}
                </p>
                <p className="text-[10px] text-gray-500">verificado</p>
              </div>
            </div>
            {(!sim.fbVerif && f2.presencia_digital?.redes_verificadas !== "ok") && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded px-2 py-1 text-[10px] text-red-700 font-semibold">
                ✗ Cuenta sin verificación oficial
              </div>
            )}
            <div className="mt-2 text-[9px] text-gray-400 italic">* Datos simulados</div>
          </div>
        </div>
      </div>

      {/* Panel der: análisis */}
      <RightPanel
        sello={sello}
        title="En Facebook, la interacción es limitada"
        body="El alcance de los mensajes resulta insuficiente para una campaña competitiva."
        bullets={[
          "No tiene organización digital",
          `${fmtK(sim.fbSeg)} seguidores (sin verificación oficial)`,
          `Organizar la masa partidaria a nivel ${ctx.cargo.ambito} requiere mínimo 100 mil seguidores leales`,
        ]}
        boldBullet={2}
      />
    </div>
  );
}

interface TabInstagramProps {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
  sim: SimData;
}

function InstagramPanel({ ctx, f2, sim }: TabInstagramProps) {
  const fullName = ctx.user.full_name;
  const igHandle = f2.redes_sociales?.candidato?.instagram;
  const tiktokHandle = f2.redes_sociales?.candidato?.tiktok;
  const sello = instagramSello(igHandle);
  const ini = initials(fullName);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 h-full">
      {/* Panel izq: Instagram mock */}
      <div className="rounded-2xl overflow-hidden border border-white/10 p-1">
        <div className="rounded-xl overflow-hidden h-full">
          {/* Instagram header */}
          <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500 px-4 py-2.5 flex items-center justify-between">
            <span className="text-white font-black italic text-lg">Instagram</span>
            <span className="text-white/80 text-xs">🔔 ➕</span>
          </div>

          <div className="bg-white px-4 pt-5 pb-4 h-full">
            {/* Profile info */}
            <div className="flex items-start gap-5 mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white font-black text-xl shrink-0">
                {ini}
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 text-sm">{igHandle ?? fullName.toLowerCase().replace(/\s+/g, "_")}</p>
                {!igHandle && <p className="text-[10px] text-red-500 mt-0.5">* handle simulado</p>}
                <div className="flex gap-4 mt-2 text-center">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{sim.igPosts}</p>
                    <p className="text-[10px] text-gray-500">posts</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{fmtK(sim.igSeg)}</p>
                    <p className="text-[10px] text-gray-500">seguidores</p>
                  </div>
                </div>
              </div>
            </div>

            {/* TikTok info */}
            {tiktokHandle ? (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 border border-gray-200">
                <span className="font-bold text-black">TikTok:</span> {tiktokHandle} · {fmtK(sim.tiktokSeg)} seguidores
              </div>
            ) : (
              <div className="bg-red-50 rounded-lg p-3 text-[11px] text-red-700 border border-red-200">
                ⚠ Sin presencia en TikTok — audiencia joven desatendida
              </div>
            )}

            <div className="mt-3 text-[9px] text-gray-400 italic">* Datos parcialmente simulados</div>
          </div>
        </div>
      </div>

      {/* Panel der: análisis */}
      <RightPanel
        sello={sello}
        title="Instagram se usa como red de rebote de contenido"
        body="Se debe usar la herramienta para acercamiento a un nuevo tipo de población."
        bullets={[
          "INSTAGRAM ES URBANO Y CLASE MEDIA — Debe tener una estrategia integrada independiente.",
          "El contenido actual es reposteo — sin línea editorial propia.",
          tiktokHandle
            ? `TikTok activo con ${fmtK(sim.tiktokSeg)} seguidores — capitalizar audiencia joven.`
            : "Sin TikTok — franja etaria 18-35 años desatendida completamente.",
        ]}
        boldBullet={0}
        goldBullet={0}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared right-panel component
// ─────────────────────────────────────────────────────────────────────────────

interface RightPanelProps {
  sello: SelloVariant;
  title: string;
  body: string;
  bullets: string[];
  boldBullet?: number;   // index of bullet to render in all-caps bold
  goldBullet?: number;   // index of bullet to render in gold
  notas?: string;
}

function RightPanel({ sello, title, body, bullets, boldBullet, goldBullet, notas }: RightPanelProps) {
  return (
    <div className="flex flex-col justify-between gap-6 py-2">
      {/* Top: diagnosis */}
      <div className="space-y-4">
        <h3 className="text-xl font-black text-white leading-snug">
          {title}
        </h3>
        <p className="text-sm text-white/60 leading-relaxed">
          {body}
        </p>

        {/* Bullets */}
        <ul className="space-y-2.5">
          {bullets.map((b, i) => {
            const isGold = i === goldBullet;
            const isBold = i === boldBullet;
            return (
              <li key={i} className="flex items-start gap-2.5">
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${isGold ? "bg-amber-400" : "bg-red-500"}`} />
                <span
                  className={`text-sm leading-snug font-semibold ${
                    isGold
                      ? "text-amber-400 font-black uppercase tracking-wide"
                      : isBold
                        ? "text-white font-black uppercase tracking-wide"
                        : "text-white/80"
                  }`}
                >
                  {b}
                </span>
              </li>
            );
          })}
        </ul>

        {notas ? (
          <p className="text-[11px] italic text-white/35 leading-relaxed border-l-2 border-white/10 pl-3">
            Nota consultor: {notas}
          </p>
        ) : null}
      </div>

      {/* Bottom: sello */}
      <div className="flex justify-start pt-2">
        <CriticoSello variant={sello} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main slide
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  ctx?: CandidatoContext;
  f2: ConsultorFormFase2;
}

const TABS = ["Web / Google", "Facebook", "Instagram"] as const;
type TabIndex = 0 | 1 | 2;

const FALLBACK_CTX: CandidatoContext = {
  user: { id: "", full_name: "Candidato", email: "", phone: null, has_password: false, foto_url: null },
  campaign: { id: "", slug: "", name: "" },
  cargo: { codigo: "", nombre: "Candidato", ambito: "distrito", nivel_codigo: "", nivel_nombre: "" },
  jurisdiccion: { pais: { id: 0, nombre: "Perú", iso2: "PE" }, departamento: null, provincia: null, distrito: null },
  organizacion_politica: null,
};

export function SlidePresenciaDigital({ ctx: ctxProp, f2 }: Props) {
  const ctx = ctxProp ?? FALLBACK_CTX;
  const [activeTab, setActiveTab] = useState<TabIndex>(0);
  const sim = simData(ctx.user.full_name);

  return (
    <div className="w-full h-full flex flex-col bg-[#020a1e] overflow-hidden min-h-[500px]">
      {/* Slide title */}
      <div className="px-6 sm:px-8 pt-6 pb-0 flex-shrink-0">
        <p className="text-[11px] uppercase tracking-[0.25em] text-amber-400/60 font-semibold mb-1">
          Diagnóstico Digital
        </p>
        <h2 className="text-2xl sm:text-3xl font-black uppercase text-white leading-tight">
          ¿Quién es {ctx.user.full_name}? — En Internet
        </h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-6 sm:px-8 mt-4 flex-shrink-0 flex-wrap">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(i as TabIndex)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeTab === i
                ? "bg-amber-400 text-[#020a1e]"
                : "bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content panel */}
      <div className="flex-1 px-6 sm:px-8 py-5 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            {activeTab === 0 && <GooglePanel ctx={ctx} f2={f2} sim={sim} />}
            {activeTab === 1 && <FacebookPanel ctx={ctx} f2={f2} sim={sim} />}
            {activeTab === 2 && <InstagramPanel ctx={ctx} f2={f2} sim={sim} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// isVisible predicate (exported for Fase2F1Deck catalog)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determina si la slide es relevante para el deck del candidato.
 * - Algún handle en redes_sociales.candidato no vacío, OR
 * - Algún campo de presencia_digital.* poblado.
 */
export function isVisible(f2: ConsultorFormFase2): boolean {
  const handles = f2.redes_sociales?.candidato;
  const hasHandle = !!handles && Object.values(handles).some(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  const pd = f2.presencia_digital;
  const hasPd = !!pd && (
    !!pd.web_oficial ||
    !!pd.google_results ||
    !!pd.redes_verificadas ||
    !!pd.info_clave ||
    (typeof pd.notas === "string" && pd.notas.trim().length > 0)
  );
  return hasHandle || hasPd;
}
