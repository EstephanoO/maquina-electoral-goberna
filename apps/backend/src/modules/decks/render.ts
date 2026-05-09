/**
 * Renderer de deck Goberna estándar — HTML standalone que matchea la
 * estética del Fase 2 deck del candidato (navy + gold + Montserrat).
 *
 * Toma la data merged del onboarding + capa 1 (resultados electorales,
 * indicadores) + form del consultor, devuelve un solo HTML.
 *
 * 6 slides según el wireframe Goberna:
 *   1. Presentación Goberna
 *   2. Intro Candidato (auto del onboarding)
 *   3. ¿Cómo le fue al partido en EG 2026? (capa 1 + form)
 *   4. Histórico local 2022·2018·2014 (capa 1 + form)
 *   5. Historial candidato + posicionamiento Google (form)
 *   6. ¿Quién es? (form libre)
 */
import type { CandidatoSnapshot } from "../onboarding/repository";

// ── Form schema ──────────────────────────────────────────────────────

export type ConsultorForm = {
  intro?: {
    biografia_corta?: string;
    tagline?: string;
  };
  partido_eg?: {
    como_le_fue_resumen?: string;
    costo_beneficio_acercamiento?: string;
    porcentaje_partido_zona?: number | null;
  };
  historico_local?: Array<{
    anio: number;
    candidato_partido?: string;
    votos?: number | null;
    porcentaje?: number | null;
    posicion?: number | null;
    observaciones?: string;
  }>;
  candidato_historial?: {
    cargos_anteriores?: string[];
    pagina_web?: string;
    redes_sociales?: Array<{ plataforma: string; url: string }>;
    denuncias?: string[];
    info_relevante?: string;
    posicionamiento_google?: string;
  };
  quien_es?: {
    texto_libre?: string;
    edad?: number | null;
    profesion?: string;
    trayectoria?: string;
  };
};

export type DeckRenderData = {
  snapshot: CandidatoSnapshot;
  form: ConsultorForm;
};

// ── Helpers ──────────────────────────────────────────────────────────

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function jurisdiccionLabel(snap: CandidatoSnapshot): string {
  return (
    snap.jurisdiccion.distrito?.nombre ??
    snap.jurisdiccion.provincia?.nombre ??
    snap.jurisdiccion.departamento?.nombre ??
    snap.jurisdiccion.pais.nombre
  );
}

function eleccionLabel(ambito: string): string {
  if (ambito === "pais") return "ELECCIONES GENERALES 2026";
  if (ambito === "departamento" || ambito === "provincia" || ambito === "distrito") {
    return "ELECCIONES REGIONALES Y MUNICIPALES 2026";
  }
  return "ELECCIONES 2026";
}

function placeholderOr(value: string | null | undefined, fallback = "[A completar]"): string {
  if (!value || !value.trim()) return `<span class="placeholder">${fallback}</span>`;
  return esc(value);
}

// ── HTML render ──────────────────────────────────────────────────────

export function renderDeckHtml(data: DeckRenderData): string {
  const { snapshot: snap, form } = data;
  const fullName = snap.user.full_name;
  const cargo = snap.cargo.nombre;
  const ambito = snap.cargo.ambito;
  const jurisdiccion = jurisdiccionLabel(snap);
  const partido = snap.organizacion_politica?.nombre ?? "[partido a definir]";
  const partidoSiglas = snap.organizacion_politica?.siglas ?? "";
  const fotoUrl = snap.user.foto_url ?? null;
  const eleccion = eleccionLabel(ambito);

  // Default histórico: 3 elecciones esperables si no vino del form
  const historico = (form.historico_local && form.historico_local.length > 0)
    ? [...form.historico_local].sort((a, b) => b.anio - a.anio)
    : [
        { anio: 2022, candidato_partido: undefined, votos: null, porcentaje: null, posicion: null, observaciones: undefined },
        { anio: 2018, candidato_partido: undefined, votos: null, porcentaje: null, posicion: null, observaciones: undefined },
        { anio: 2014, candidato_partido: undefined, votos: null, porcentaje: null, posicion: null, observaciones: undefined },
      ];

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(fullName)} · Propuesta Técnica ${ambito === "pais" ? "EG" : "ERM"} 2026</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Montserrat', system-ui, sans-serif; background: #020a1e; color: #fff; margin: 0; }
  .slide { min-height: 100vh; display: flex; flex-direction: column; padding: 4rem 5rem; position: relative; overflow: hidden; }
  .slide.bg-cloud { background: linear-gradient(180deg, #0a1f4a 0%, #061633 50%, #020a1e 100%); }
  .slide.bg-white { background: #fff; color: #0a1f4a; }
  .slide.bg-gold { background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: #0a1f4a; }
  .gold-bar { width: 80px; height: 6px; background: #fbbf24; }
  .gold-bar.full { width: 100%; }
  .underline-gold { border-bottom: 6px solid #fbbf24; padding-bottom: 0.5rem; display: inline-block; }
  .placeholder { color: #fbbf24; opacity: 0.65; font-style: italic; font-weight: 400; }
  .kicker { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3em; color: #fbbf24; }
  .section-num { font-size: 12rem; font-weight: 900; color: rgba(251, 191, 36, 0.18); line-height: 1; position: absolute; right: 4rem; top: 4rem; pointer-events: none; }
  .footer-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #fbbf24 0%, transparent 100%); }
  table.partidos { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 1rem; }
  table.partidos th { text-align: left; padding: 8px 12px; background: rgba(251,191,36,0.12); color: #fbbf24; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; font-size: 11px; border-bottom: 2px solid rgba(251,191,36,0.3); }
  table.partidos td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .pill { display: inline-block; padding: 4px 12px; background: #fbbf24; color: #0a1f4a; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; border-radius: 2px; }
  .pill-outline { display: inline-block; padding: 4px 12px; border: 1.5px solid rgba(251,191,36,0.6); color: #fbbf24; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; }
  .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); padding: 1.25rem; border-radius: 4px; }
  .card-light { background: #f8fafc; border: 1px solid #e2e8f0; padding: 1.5rem; border-radius: 4px; color: #0a1f4a; }
  .big-num { font-size: 5rem; font-weight: 900; color: #fbbf24; line-height: 0.9; letter-spacing: -0.03em; }
  .nav { position: fixed; bottom: 1rem; right: 1rem; display: flex; gap: 0.5rem; z-index: 100; font-size: 11px; }
  .nav button { background: rgba(10,31,74,0.85); color: #fff; border: 1px solid rgba(251,191,36,0.4); padding: 6px 12px; cursor: pointer; backdrop-filter: blur(8px); }
  @media print { .nav { display: none; } .slide { page-break-after: always; min-height: 100vh; } }
</style>
</head>
<body>

<!-- ─────────── SLIDE 1: PORTADA / PRESENTACIÓN GOBERNA ─────────── -->
<section class="slide bg-cloud justify-between" id="s1">
  <div>
    <div class="kicker">Propuesta Técnica · Goberna Electoral</div>
  </div>
  <div>
    <h1 class="text-7xl md:text-8xl font-black tracking-tight uppercase leading-[0.9] mb-4">
      ${esc(fullName)}
    </h1>
    <div class="text-3xl md:text-4xl text-white/80 font-bold mb-4">${esc(cargo)} · ${esc(jurisdiccion)}</div>
    <div class="flex items-center gap-3 mt-6">
      <span class="pill">${esc(eleccion)}</span>
      ${partidoSiglas ? `<span class="pill-outline">${esc(partidoSiglas)}</span>` : ""}
    </div>
  </div>
  <div class="gold-bar"></div>
  <div class="footer-bar"></div>
</section>

<!-- ─────────── SLIDE 2: INTRO CANDIDATO ─────────── -->
<section class="slide bg-white" id="s2">
  <div class="section-num">02</div>
  <div class="kicker text-[#0a1f4a]/60 mb-1">Intro Candidato</div>
  <div class="gold-bar mb-6"></div>
  <h2 class="text-5xl font-black uppercase leading-tight text-[#0a1f4a] mb-10">¿A quién postulamos?</h2>
  <div class="grid grid-cols-12 gap-8 items-start mt-4">
    <div class="col-span-3">
      ${
        fotoUrl
          ? `<img src="${esc(fotoUrl)}" alt="${esc(fullName)}" class="w-full aspect-square object-cover border-4 border-[#fbbf24] shadow-2xl"/>`
          : `<div class="w-full aspect-square bg-[#0a1f4a] flex items-center justify-center text-[#fbbf24] text-7xl font-black">${esc(fullName.split(" ").slice(0, 2).map((n) => n[0]).join(""))}</div>`
      }
    </div>
    <div class="col-span-9 grid grid-cols-2 gap-6">
      <div>
        <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-1">Organización Política</div>
        <div class="text-2xl font-black text-[#0a1f4a]">${esc(partido)}</div>
      </div>
      <div>
        <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-1">Circunscripción</div>
        <div class="text-2xl font-black text-[#0a1f4a]">${esc(jurisdiccion)}</div>
      </div>
      <div>
        <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-1">Cargo a Postular</div>
        <div class="text-2xl font-black text-[#0a1f4a]">${esc(cargo)}</div>
      </div>
      <div>
        <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-1">Elección</div>
        <div class="text-2xl font-black text-[#0a1f4a]">${esc(eleccion)}</div>
      </div>
      ${
        form.intro?.tagline
          ? `<div class="col-span-2 mt-4 border-l-4 border-[#fbbf24] pl-4">
              <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-1">Tagline</div>
              <div class="text-xl text-[#0a1f4a] italic">${esc(form.intro.tagline)}</div>
            </div>`
          : ""
      }
      ${
        form.intro?.biografia_corta
          ? `<div class="col-span-2 mt-4">
              <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-1">Biografía corta</div>
              <p class="text-base text-[#0a1f4a] leading-relaxed">${esc(form.intro.biografia_corta)}</p>
            </div>`
          : ""
      }
    </div>
  </div>
  <div class="footer-bar"></div>
</section>

<!-- ─────────── SLIDE 3: PARTIDO EN ELECCIONES GENERALES ─────────── -->
<section class="slide bg-cloud" id="s3">
  <div class="section-num">03</div>
  <div class="kicker mb-1">Análisis Electoral</div>
  <div class="gold-bar mb-6"></div>
  <h2 class="text-5xl font-black uppercase leading-tight mb-2">
    ¿Cómo le fue a <span class="text-[#fbbf24]">${esc(partido)}</span>
  </h2>
  <h3 class="text-4xl font-black uppercase text-white/70 mb-10">en ${esc(jurisdiccion)}?</h3>

  <div class="grid grid-cols-12 gap-8 items-start mt-6">
    <div class="col-span-7 card">
      <div class="kicker mb-3">Última elección general</div>
      <p class="text-lg leading-relaxed">${placeholderOr(form.partido_eg?.como_le_fue_resumen, "Análisis del desempeño del partido en EG 2026 — completar con resultados oficiales ONPE/INFOGOB.")}</p>
      ${
        form.partido_eg?.costo_beneficio_acercamiento
          ? `<div class="mt-6 pt-6 border-t border-white/10">
              <div class="kicker mb-2">Costo / Beneficio del acercamiento</div>
              <p class="text-base text-white/85 leading-relaxed">${esc(form.partido_eg.costo_beneficio_acercamiento)}</p>
            </div>`
          : `<div class="mt-6 pt-6 border-t border-white/10">
              <div class="kicker mb-2">Costo / Beneficio del acercamiento</div>
              <p class="placeholder">[A completar por el consultor — ¿conviene acercarse al partido provincial?]</p>
            </div>`
      }
    </div>
    <div class="col-span-5">
      <div class="card">
        <div class="kicker mb-3">Resumen rápido</div>
        ${
          form.partido_eg?.porcentaje_partido_zona != null
            ? `<div class="big-num">${form.partido_eg.porcentaje_partido_zona}%</div>
              <div class="text-sm text-white/70 mt-2">Voto válido del partido en la zona</div>`
            : `<div class="placeholder text-2xl">% partido en la zona [A completar]</div>`
        }
      </div>
      <div class="card mt-4">
        <div class="kicker mb-3">3 partidos más importantes en la zona</div>
        <p class="placeholder text-sm">[Capa 1 INFOGOB — pendiente]</p>
      </div>
    </div>
  </div>
  <div class="footer-bar"></div>
</section>

<!-- ─────────── SLIDE 4: HISTÓRICO LOCAL 2022·2018·2014 ─────────── -->
<section class="slide bg-cloud" id="s4">
  <div class="section-num">04</div>
  <div class="kicker mb-1">Histórico Local</div>
  <div class="gold-bar mb-6"></div>
  <h2 class="text-5xl font-black uppercase leading-tight mb-10">
    ${esc(partido)} en las últimas <span class="text-[#fbbf24]">3 elecciones locales</span>
  </h2>
  <table class="partidos">
    <thead>
      <tr>
        <th>Año</th>
        <th>Candidato/a por ${esc(partidoSiglas || partido)}</th>
        <th>Votos</th>
        <th>%</th>
        <th>Posición</th>
        <th>Observaciones</th>
      </tr>
    </thead>
    <tbody>
      ${historico
        .map(
          (h) => `
        <tr>
          <td class="font-black text-[#fbbf24]">${esc(String(h.anio))}</td>
          <td>${placeholderOr(h.candidato_partido, "[candidato/a]")}</td>
          <td>${h.votos != null ? esc(h.votos.toLocaleString("es-PE")) : `<span class="placeholder">[votos]</span>`}</td>
          <td>${h.porcentaje != null ? esc(h.porcentaje + "%") : `<span class="placeholder">[%]</span>`}</td>
          <td>${h.posicion != null ? esc(h.posicion + "°") : `<span class="placeholder">[pos]</span>`}</td>
          <td class="text-white/70 text-sm">${placeholderOr(h.observaciones, "")}</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>
  <div class="mt-8 card">
    <div class="kicker mb-2">Lectura del consultor</div>
    <p class="placeholder">[A completar — ¿qué patrón se repite? ¿Cuál fue el mejor año? ¿En qué jurisdicción ha tenido mejor desempeño?]</p>
  </div>
  <div class="footer-bar"></div>
</section>

<!-- ─────────── SLIDE 5: HISTORIAL CANDIDATO + GOOGLE ─────────── -->
<section class="slide bg-white" id="s5">
  <div class="section-num">05</div>
  <div class="kicker text-[#0a1f4a]/60 mb-1">Historial del candidato</div>
  <div class="gold-bar mb-6"></div>
  <h2 class="text-5xl font-black uppercase leading-tight text-[#0a1f4a] mb-10">¿Qué dice Google de ${esc(fullName.split(" ")[0])}?</h2>

  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-7 card-light">
      <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-2">Posicionamiento Google</div>
      <p class="text-base leading-relaxed text-[#0a1f4a]">${placeholderOr(form.candidato_historial?.posicionamiento_google, "[Resumen de qué sale al googlear al candidato — apariciones en prensa, info relevante, primeras 5 páginas de resultados.]")}</p>
    </div>

    <div class="col-span-5 grid gap-4">
      <div class="card-light">
        <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-2">Página web</div>
        ${
          form.candidato_historial?.pagina_web
            ? `<a href="${esc(form.candidato_historial.pagina_web)}" target="_blank" class="text-base font-bold text-[#0a1f4a] underline">${esc(form.candidato_historial.pagina_web)}</a>`
            : `<div class="placeholder">[A completar]</div>`
        }
      </div>
      <div class="card-light">
        <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-2">Redes sociales</div>
        ${
          form.candidato_historial?.redes_sociales && form.candidato_historial.redes_sociales.length > 0
            ? `<ul class="space-y-1 text-sm text-[#0a1f4a]">${form.candidato_historial.redes_sociales
                .map(
                  (r) =>
                    `<li><strong>${esc(r.plataforma)}:</strong> <a href="${esc(r.url)}" target="_blank" class="underline">${esc(r.url)}</a></li>`,
                )
                .join("")}</ul>`
            : `<div class="placeholder">[A completar]</div>`
        }
      </div>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-6 mt-6">
    <div class="card-light">
      <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700 mb-2">Denuncias / Líos</div>
      ${
        form.candidato_historial?.denuncias && form.candidato_historial.denuncias.length > 0
          ? `<ul class="space-y-2 text-sm">${form.candidato_historial.denuncias
              .map((d) => `<li class="border-l-3 border-red-500 pl-3">${esc(d)}</li>`)
              .join("")}</ul>`
          : `<div class="placeholder">[Buscar en INFOGOB / Google — denuncias activas, sentencias, observaciones del JNE.]</div>`
      }
    </div>
    <div class="card-light">
      <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-2">Info relevante</div>
      <p class="text-sm text-[#0a1f4a] leading-relaxed">${placeholderOr(form.candidato_historial?.info_relevante)}</p>
    </div>
  </div>

  ${
    form.candidato_historial?.cargos_anteriores && form.candidato_historial.cargos_anteriores.length > 0
      ? `<div class="card-light mt-6">
          <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-2">Cargos anteriores</div>
          <ul class="space-y-1 text-sm text-[#0a1f4a]">
            ${form.candidato_historial.cargos_anteriores.map((c) => `<li>· ${esc(c)}</li>`).join("")}
          </ul>
        </div>`
      : ""
  }

  <div class="footer-bar"></div>
</section>

<!-- ─────────── SLIDE 6: ¿QUIÉN ES? ─────────── -->
<section class="slide bg-gold" id="s6">
  <div class="kicker text-[#0a1f4a]/80 mb-1">Conclusión</div>
  <div class="gold-bar mb-6" style="background: #0a1f4a;"></div>
  <h2 class="text-7xl md:text-8xl font-black uppercase leading-[0.9] text-[#0a1f4a] mb-10">
    ¿Quién es<br/>${esc(fullName.split(" ")[0])}?
  </h2>

  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-8">
      <p class="text-2xl font-bold leading-snug text-[#0a1f4a]">
        ${placeholderOr(form.quien_es?.texto_libre, "[El elevator pitch del candidato — quién es, por qué postula, qué lo diferencia. Texto narrativo del consultor.]")}
      </p>
      ${
        form.quien_es?.trayectoria
          ? `<p class="text-base leading-relaxed text-[#0a1f4a]/85 mt-6">${esc(form.quien_es.trayectoria)}</p>`
          : ""
      }
    </div>
    <div class="col-span-4 grid gap-4">
      ${
        form.quien_es?.edad
          ? `<div class="border-l-4 border-[#0a1f4a] pl-4">
              <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-1">Edad</div>
              <div class="text-3xl font-black text-[#0a1f4a]">${form.quien_es.edad}</div>
            </div>`
          : ""
      }
      ${
        form.quien_es?.profesion
          ? `<div class="border-l-4 border-[#0a1f4a] pl-4">
              <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a1f4a]/60 mb-1">Profesión</div>
              <div class="text-xl font-bold text-[#0a1f4a]">${esc(form.quien_es.profesion)}</div>
            </div>`
          : ""
      }
    </div>
  </div>
</section>

<!-- ─────────── NAV (sólo en pantalla, no en print) ─────────── -->
<nav class="nav">
  <button onclick="document.getElementById('s1').scrollIntoView({behavior:'smooth'})">1</button>
  <button onclick="document.getElementById('s2').scrollIntoView({behavior:'smooth'})">2</button>
  <button onclick="document.getElementById('s3').scrollIntoView({behavior:'smooth'})">3</button>
  <button onclick="document.getElementById('s4').scrollIntoView({behavior:'smooth'})">4</button>
  <button onclick="document.getElementById('s5').scrollIntoView({behavior:'smooth'})">5</button>
  <button onclick="document.getElementById('s6').scrollIntoView({behavior:'smooth'})">6</button>
</nav>

</body>
</html>`;
}
