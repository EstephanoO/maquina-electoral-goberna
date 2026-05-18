"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown, ChevronRight, Loader2, Save, CheckCircle2,
  User, MapPin, Zap, Target, Palette, BarChart3, Layers, Star,
} from "lucide-react";

import {
  onboardingApi,
  type CandidatoContext,
  type ConsultorFormFase2,
  type Fase2DeckMeta,
  type PerfilCandidato,
  type TerritoryEcd,
  type C2Segmento,
  type D5MatrixRow,
  type Fase1Rapida,
} from "@/lib/onboarding-api";

// ── Types ──────────────────────────────────────────────────────────────────

type CompletionLevel = "empty" | "partial" | "done";

// ── Helpers ────────────────────────────────────────────────────────────────

function completionDot(level: CompletionLevel) {
  return (
    <span
      className={`size-2.5 rounded-full flex-shrink-0 ${
        level === "done"
          ? "bg-green-400"
          : level === "partial"
            ? "bg-amber-400"
            : "bg-gray-600"
      }`}
    />
  );
}

function stringsCompletion(arr: string[] | undefined, min = 1): CompletionLevel {
  if (!arr || arr.length === 0) return "empty";
  const filled = arr.filter((s) => s.trim().length > 0).length;
  if (filled === 0) return "empty";
  return filled >= min ? "done" : "partial";
}

function objectCompletion(
  obj: Record<string, unknown> | null | undefined,
  requiredKeys: string[],
): CompletionLevel {
  if (!obj) return "empty";
  const filled = requiredKeys.filter((k) => {
    const v = obj[k];
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
  if (filled === 0) return "empty";
  return filled >= Math.ceil(requiredKeys.length * 0.6) ? "done" : "partial";
}

// ── Section accordion wrapper ──────────────────────────────────────────────

function Section({
  id,
  icon: Icon,
  title,
  subtitle,
  badge,
  completion,
  isOpen,
  onToggle,
  children,
  summary,
  aiPrefilled,
}: {
  id: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  badge?: string;
  completion: CompletionLevel;
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
  summary?: React.ReactNode;
  aiPrefilled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0a1e4a]/40 overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="size-9 rounded-xl bg-[#020a1e]/60 border border-white/10 flex items-center justify-center flex-shrink-0">
          <Icon className="size-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm">{title}</span>
            {badge && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-400 font-black uppercase tracking-wider">
                {badge}
              </span>
            )}
            {aiPrefilled && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold">
                ✦ IA
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{subtitle}</p>
          {!isOpen && completion !== "empty" && summary && (
            <p className="text-[10px] text-amber-300/70 mt-1.5 truncate">{summary}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {completionDot(completion)}
          {isOpen ? (
            <ChevronDown className="size-4 text-gray-500" />
          ) : (
            <ChevronRight className="size-4 text-gray-500" />
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/8 px-5 py-5 space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Input helpers ──────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full bg-[#020a1e]/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 transition-colors";

const textareaClass = inputClass + " resize-none";

const selectClass = inputClass;

function TagsInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder ?? "Escribir y Enter"}
          className={inputClass}
        />
        <button
          type="button"
          onClick={commit}
          className="px-3 py-2 rounded-xl bg-amber-400/20 text-amber-400 text-xs font-bold hover:bg-amber-400/30 transition-colors"
        >
          +
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 text-gray-300 text-xs"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="text-gray-500 hover:text-red-400 transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function PerfilHubClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<CandidatoContext | null>(null);
  const [deck, setDeck] = useState<Fase2DeckMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [openSection, setOpenSection] = useState<string | null>("candidato");

  // Form state — all sections
  const [f1, setF1] = useState<Fase1Rapida>({});
  const [perfil, setPerfil] = useState<PerfilCandidato>({});
  const [ecd, setEcd] = useState<TerritoryEcd>({});

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Partial<ConsultorFormFase2>>({});

  // Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await onboardingApi.getFase2BySlug(slug);
        if (cancelled) return;
        if (!result) {
          setError("Candidatura no encontrada.");
          return;
        }
        setCtx(result.ctx);
        setDeck(result.deck);
        const form = result.deck.consultor_form;
        if (form?.fase1_rapida) setF1(form.fase1_rapida);
        if (form?.perfil_candidato) setPerfil(form.perfil_candidato);
        if (form?.territorio_ecd) setEcd(form.territorio_ecd);
        // Seed from ctx if candidato name not set
        if (!form?.fase1_rapida?.candidato?.nombre_completo && result.ctx.user.full_name) {
          setF1((prev) => ({
            ...prev,
            candidato: {
              ...prev.candidato,
              nombre_completo: result.ctx.user.full_name,
              foto_url: result.ctx.user.foto_url ?? prev.candidato?.foto_url,
            },
          }));
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const scheduleSave = useCallback(
    (patch: Partial<ConsultorFormFase2>) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const toSave = pendingRef.current;
        pendingRef.current = {};
        setSaving(true);
        try {
          await onboardingApi.patchFase2Form(slug, toSave);
          setSavedAt(new Date());
        } finally {
          setSaving(false);
        }
      }, 1500);
    },
    [slug],
  );

  function updateF1(patch: Partial<Fase1Rapida>) {
    setF1((prev) => {
      const next = deepMerge(prev, patch) as Fase1Rapida;
      scheduleSave({ fase1_rapida: next });
      return next;
    });
  }

  function updatePerfil(patch: Partial<PerfilCandidato>) {
    setPerfil((prev) => {
      const next = deepMerge(prev, patch) as PerfilCandidato;
      scheduleSave({ perfil_candidato: next });
      return next;
    });
  }

  function updateEcd(patch: Partial<TerritoryEcd>) {
    setEcd((prev) => {
      const next = deepMerge(prev, patch) as TerritoryEcd;
      scheduleSave({ territorio_ecd: next });
      return next;
    });
  }

  function toggleSection(id: string) {
    setOpenSection((prev) => (prev === id ? null : id));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020a1e]">
        <Loader2 className="size-10 animate-spin text-amber-400" />
      </div>
    );
  }

  if (error || !ctx || !deck) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020a1e] text-white">
        <div className="text-center px-6">
          <p className="text-red-400 mb-4 text-sm">{error ?? "Error"}</p>
          <button
            onClick={() => router.push("/onboarding")}
            className="px-6 py-2.5 rounded-full border border-gray-700 text-gray-300 text-sm"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  const nombre = f1.candidato?.nombre_completo ?? ctx.user.full_name ?? slug;
  const color1 = f1.branding?.color_primario ?? "#fbc02d";

  // Completion levels per section
  const comp = {
    candidato: objectCompletion(f1.candidato as Record<string, unknown> | undefined, ["nombre_completo", "bio_corta", "fecha_nacimiento"]),
    branding: objectCompletion(f1.branding as Record<string, unknown> | undefined, ["slogan", "color_primario"]),
    estrategia: objectCompletion(f1.estrategia as Record<string, unknown> | undefined, ["tipo_campana", "eje_emocional", "frente_principal"]),
    propuestas: f1.propuestas && f1.propuestas.length >= 3 ? "done" as CompletionLevel : f1.propuestas && f1.propuestas.length > 0 ? "partial" as CompletionLevel : "empty" as CompletionLevel,
    foda: objectCompletion(f1.diagnostico_inicial as Record<string, unknown> | undefined, ["fortalezas", "debilidades"]),
    c2: ecd.c2_segmentos && ecd.c2_segmentos.length >= 2 ? "done" as CompletionLevel : ecd.c2_segmentos && ecd.c2_segmentos.length > 0 ? "partial" as CompletionLevel : "empty" as CompletionLevel,
    d5: ecd.d5_matrix && ecd.d5_matrix.length > 0 ? (ecd.d5_matrix.every(r => r.mensaje_clave && r.canal_efectivo) ? "done" as CompletionLevel : "partial" as CompletionLevel) : "empty" as CompletionLevel,
    estructura: objectCompletion(ecd.e4_campo_politico as Record<string, unknown> | undefined, ["partidos_fuertes", "nivel_polarizacion"]),
    nucleo: objectCompletion(ecd.nucleo_goberna as Record<string, unknown> | undefined, ["propuesta_central", "diferenciador_clave"]),
    n_perfil: objectCompletion(perfil.n1_identidad as Record<string, unknown> | undefined, ["bio_corta", "lugar_nacimiento", "estado_civil"]),
  };

  const allLevels = Object.values(comp);
  const donePct = Math.round((allLevels.filter(l => l === "done").length / allLevels.length) * 100);
  const deckReady = donePct >= 40; // candidato, estrategia, propuestas al menos

  // ── Computed summaries for closed sections ─────────────────────────────
  const c2Summary = ecd.c2_segmentos?.length
    ? ecd.c2_segmentos.slice(0, 3).map(s => `${s.nombre.split('/')[0].trim()} ${s.pct_aprox ?? ''}%`).join(' · ')
    : undefined;

  const concienciaIssues = ecd.c3_issues?.top_issues;
  const concienciaSummary = concienciaIssues?.length
    ? concienciaIssues.slice(0, 3).map(i => `${i.issue} ${i.pct_menciona ?? ''}%`).join(' · ')
    : undefined;

  const candidatoSummary = f1.candidato?.bio_corta
    ? f1.candidato.bio_corta.slice(0, 80) + (f1.candidato.bio_corta.length > 80 ? '…' : '')
    : undefined;

  const estructuraSummary = ecd.e4_campo_politico?.partidos_fuertes?.length
    ? ecd.e4_campo_politico.partidos_fuertes.slice(0, 3).map(p => `${p.nombre} ${p.pct_aprox ?? ''}%`).join(' · ')
    : undefined;

  return (
    <div className="min-h-screen bg-[#020a1e] text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#020a1e]/95 backdrop-blur-md border-b border-white/8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Back to wizard */}
            <a
              href="/onboarding"
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors uppercase tracking-wider hidden sm:block"
            >
              ← Inicio
            </a>
            <div
              className="size-8 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0"
              style={{ background: color1 + "25", color: color1, border: `1.5px solid ${color1}50` }}
            >
              {nombre[0]?.toUpperCase() ?? "C"}
            </div>
            <div>
              <h1 className="font-black text-white text-sm leading-tight">{nombre}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="h-1 w-20 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${donePct}%`,
                      background: donePct >= 60 ? "#4ade80" : donePct >= 30 ? "#fbbf24" : "#6b7280",
                    }}
                  />
                </div>
                <span className="text-[10px] text-gray-500">{donePct}%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saving ? (
              <span className="flex items-center gap-1.5 text-[10px] text-amber-400/70">
                <Loader2 className="size-3 animate-spin" /> Guardando…
              </span>
            ) : savedAt ? (
              <span className="flex items-center gap-1.5 text-[10px] text-green-400/70">
                <CheckCircle2 className="size-3" /> Guardado
              </span>
            ) : null}
            <a
              href={`/onboarding/${slug}/fase-2`}
              className={`px-3.5 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold transition-colors ${
                deckReady
                  ? "bg-amber-400 text-[#0a1e4a] hover:bg-amber-300"
                  : "bg-amber-400/10 text-amber-400 border border-amber-400/30 hover:bg-amber-400/20"
              }`}
            >
              {deckReady ? "Ver presentación →" : "Presentación →"}
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-3">
        {/* Priority label */}
        <p className="text-[10px] uppercase tracking-[0.3em] text-gray-600 font-semibold px-1 mb-4">
          Secciones prioritarias
        </p>

        {/* ── C2 Segmentos ★ ─────────────────────────────────────────────── */}
        <Section
          id="c2"
          icon={Target}
          title="Segmentos Electorales"
          subtitle="C2 — Perfil psicográfico de cada grupo de votantes"
          badge="★ clave"
          completion={comp.c2}
          isOpen={openSection === "c2"}
          onToggle={toggleSection}
          summary={c2Summary}
          aiPrefilled={!!(ecd.c2_segmentos && ecd.c2_segmentos.length > 0)}
        >
          <C2SegmentosEditor
            value={ecd.c2_segmentos ?? []}
            onChange={(v) => updateEcd({ c2_segmentos: v })}
          />
          {ecd.c2_segmentos && ecd.c2_segmentos.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/8">
              <p className="text-[9px] uppercase tracking-[0.3em] text-gray-500 font-semibold mb-3">Vista previa — Mapa de segmentos</p>
              <SegmentosPreview segments={ecd.c2_segmentos} />
            </div>
          )}
        </Section>

        {/* ── D5 Decisión ★ ──────────────────────────────────────────────── */}
        <Section
          id="d5"
          icon={Layers}
          title="Matriz de Decisión"
          subtitle="D5 — Mensaje, canal y portavoz por segmento"
          badge="★ clave"
          completion={comp.d5}
          isOpen={openSection === "d5"}
          onToggle={toggleSection}
        >
          <D5MatrixEditor
            segments={ecd.c2_segmentos ?? []}
            value={ecd.d5_matrix ?? []}
            onChange={(v) => updateEcd({ d5_matrix: v })}
          />
        </Section>

        {/* ── Núcleo Goberna ─────────────────────────────────────────────── */}
        <Section
          id="nucleo"
          icon={Star}
          title="Núcleo Goberna"
          subtitle="E×C×D — Síntesis estratégica: propuesta central y diferenciador"
          completion={comp.nucleo}
          isOpen={openSection === "nucleo"}
          onToggle={toggleSection}
        >
          <NucleoEditor
            value={ecd.nucleo_goberna ?? {}}
            segments={ecd.c2_segmentos ?? []}
            onChange={(v) => updateEcd({ nucleo_goberna: v })}
            color1={color1}
          />
        </Section>

        <p className="text-[10px] uppercase tracking-[0.3em] text-gray-600 font-semibold px-1 pt-2">
          Perfil y presentación
        </p>

        {/* ── Candidato básico ───────────────────────────────────────────── */}
        <Section
          id="candidato"
          icon={User}
          title="Candidato"
          subtitle="Nombre, bio, datos personales y postulación"
          completion={comp.candidato}
          isOpen={openSection === "candidato"}
          onToggle={toggleSection}
          summary={candidatoSummary}
        >
          <CandidatoEditor
            f1={f1}
            ctx={ctx}
            onChange={(patch) => updateF1(patch)}
          />
        </Section>

        {/* ── Estrategia ─────────────────────────────────────────────────── */}
        <Section
          id="estrategia"
          icon={Zap}
          title="Estrategia"
          subtitle="Tipo de campaña, eje emocional y frentes"
          completion={comp.estrategia}
          isOpen={openSection === "estrategia"}
          onToggle={toggleSection}
        >
          <EstrategiaEditor
            value={f1.estrategia ?? {}}
            onChange={(v) => updateF1({ estrategia: v })}
            color1={color1}
          />
        </Section>

        {/* ── Propuestas ─────────────────────────────────────────────────── */}
        <Section
          id="propuestas"
          icon={BarChart3}
          title="Propuestas"
          subtitle="3-6 propuestas programáticas con sector e ícono"
          completion={comp.propuestas}
          isOpen={openSection === "propuestas"}
          onToggle={toggleSection}
        >
          <PropuestasEditor
            value={f1.propuestas ?? []}
            onChange={(v) => updateF1({ propuestas: v })}
            color1={color1}
          />
        </Section>

        {/* ── Branding ───────────────────────────────────────────────────── */}
        <Section
          id="branding"
          icon={Palette}
          title="Branding"
          subtitle="Slogan, colores y logo de campaña"
          completion={comp.branding}
          isOpen={openSection === "branding"}
          onToggle={toggleSection}
        >
          <BrandingEditor
            value={f1.branding ?? {}}
            onChange={(v) => updateF1({ branding: v })}
          />
        </Section>

        {/* ── FODA ───────────────────────────────────────────────────────── */}
        <Section
          id="foda"
          icon={BarChart3}
          title="Diagnóstico FODA"
          subtitle="Fortalezas, debilidades, oportunidades, amenazas y competidores"
          completion={comp.foda}
          isOpen={openSection === "foda"}
          onToggle={toggleSection}
        >
          <FodaEditor
            value={f1.diagnostico_inicial ?? {}}
            onChange={(v) => updateF1({ diagnostico_inicial: v })}
            color1={color1}
          />
        </Section>

        <p className="text-[10px] uppercase tracking-[0.3em] text-gray-600 font-semibold px-1 pt-2">
          Territorio ECD
        </p>

        {/* ── Estructura ─────────────────────────────────────────────────── */}
        <Section
          id="estructura"
          icon={MapPin}
          title="Estructura Territorial"
          subtitle="E1-E5 — Capital económico, social, cultural, político e infraestructura"
          completion={comp.estructura}
          isOpen={openSection === "estructura"}
          onToggle={toggleSection}
          summary={estructuraSummary}
          aiPrefilled={!!(ecd.e4_campo_politico?.partidos_fuertes?.length)}
        >
          <EstructuraEditor
            value={ecd}
            onChange={(patch) => updateEcd(patch)}
          />
        </Section>

        {/* ── Conciencia C ───────────────────────────────────────────────── */}
        <Section
          id="conciencia"
          icon={Target}
          title="Conciencia Electoral"
          subtitle="C1, C3-C6 — Intención de voto, issues, evaluación y voto útil"
          completion={
            objectCompletion(ecd.c5_intencion_voto as Record<string, unknown> | undefined, ["candidato_puntero", "pct_nuestro_candidato"])
          }
          isOpen={openSection === "conciencia"}
          onToggle={toggleSection}
          summary={concienciaSummary}
          aiPrefilled={!!(concienciaIssues?.length)}
        >
          <ConcienciaEditor value={ecd} onChange={(patch) => updateEcd(patch)} />
        </Section>

        <p className="text-[10px] uppercase tracking-[0.3em] text-gray-600 font-semibold px-1 pt-2">
          Perfil profundo (5N)
        </p>

        {/* ── Perfil completo N1-N5 ──────────────────────────────────────── */}
        <Section
          id="n_perfil"
          icon={User}
          title="Perfil Completo"
          subtitle="N1-N5 — Identidad, trayectoria, riesgo, patrimonio, salud + Entorno y Coherencia"
          completion={comp.n_perfil}
          isOpen={openSection === "n_perfil"}
          onToggle={toggleSection}
        >
          <PerfilCompletoEditor
            value={perfil}
            onChange={(patch) => updatePerfil(patch)}
          />
        </Section>

        <div className="h-12" />
      </div>
    </div>
  );
}

// ── SegmentosPreview ───────────────────────────────────────────────────────

function SegmentosPreview({ segments }: { segments: C2Segmento[] }) {
  return (
    <div className="space-y-2">
      {segments.map((seg) => (
        <div key={seg.id} className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/80 font-medium">{seg.nombre}</span>
            <span className="text-amber-400 font-bold">{seg.pct_aprox ?? 0}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-400/70 transition-all duration-500"
              style={{ width: `${seg.pct_aprox ?? 0}%` }}
            />
          </div>
          {seg.problema_principal && (
            <p className="text-[10px] text-gray-500 truncate">{seg.problema_principal}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Section editors ────────────────────────────────────────────────────────

function CandidatoEditor({
  f1,
  ctx,
  onChange,
}: {
  f1: Fase1Rapida;
  ctx: CandidatoContext;
  onChange: (patch: Partial<Fase1Rapida>) => void;
}) {
  const c = f1.candidato ?? {};
  const p = f1.postulacion ?? {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombre completo">
          <input
            className={inputClass}
            value={c.nombre_completo ?? ""}
            onChange={(e) => onChange({ candidato: { ...c, nombre_completo: e.target.value } })}
            placeholder={ctx.user.full_name}
          />
        </Field>
        <Field label="Apodo / nombre de campaña">
          <input
            className={inputClass}
            value={c.apodo ?? ""}
            onChange={(e) => onChange({ candidato: { ...c, apodo: e.target.value } })}
            placeholder="Como lo llama la gente"
          />
        </Field>
      </div>

      <Field label="Bio corta (para el deck)">
        <textarea
          className={textareaClass}
          rows={3}
          maxLength={300}
          value={c.bio_corta ?? ""}
          onChange={(e) => onChange({ candidato: { ...c, bio_corta: e.target.value } })}
          placeholder="Descripción de 1-2 oraciones del candidato..."
        />
      </Field>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Fecha de nacimiento">
          <input
            type="date"
            className={inputClass}
            value={c.fecha_nacimiento ?? ""}
            onChange={(e) => onChange({ candidato: { ...c, fecha_nacimiento: e.target.value } })}
          />
        </Field>
        <Field label="Sexo">
          <select
            className={selectClass}
            value={c.sexo ?? ""}
            onChange={(e) => onChange({ candidato: { ...c, sexo: e.target.value as "M" | "F" } })}
          >
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </Field>
        <Field label="Tipo doc">
          <select
            className={selectClass}
            value={c.documento_tipo ?? ""}
            onChange={(e) =>
              onChange({ candidato: { ...c, documento_tipo: e.target.value as "DNI" | "CE" | "PASAPORTE" } })
            }
          >
            <option value="">—</option>
            <option value="DNI">DNI</option>
            <option value="CE">CE</option>
            <option value="PASAPORTE">Pasaporte</option>
          </select>
        </Field>
        <Field label="Número">
          <input
            className={inputClass}
            value={c.documento_numero ?? ""}
            onChange={(e) => onChange({ candidato: { ...c, documento_numero: e.target.value } })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Ocupación actual">
          <input
            className={inputClass}
            value={c.ocupacion_actual ?? ""}
            onChange={(e) => onChange({ candidato: { ...c, ocupacion_actual: e.target.value } })}
          />
        </Field>
        <Field label="URL de foto">
          <input
            className={inputClass}
            value={c.foto_url ?? ""}
            onChange={(e) => onChange({ candidato: { ...c, foto_url: e.target.value } })}
            placeholder="https://..."
          />
        </Field>
      </div>

      <hr className="border-white/8" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Cargo al que postula">
          <select
            className={selectClass}
            value={p.cargo_codigo ?? ""}
            onChange={(e) => onChange({ postulacion: { ...p, cargo_codigo: e.target.value as NonNullable<Fase1Rapida["postulacion"]>["cargo_codigo"] } })}
          >
            <option value="">Seleccionar cargo</option>
            <option value="alcalde_distrital">Alcalde Distrital</option>
            <option value="alcalde_provincial">Alcalde Provincial</option>
            <option value="regidor">Regidor</option>
            <option value="consejero_regional">Consejero Regional</option>
            <option value="gobernador_regional">Gobernador Regional</option>
            <option value="congresista">Congresista</option>
            <option value="presidente">Presidente</option>
          </select>
        </Field>
        <Field label="Nivel territorial">
          <select
            className={selectClass}
            value={p.nivel_territorio ?? ""}
            onChange={(e) =>
              onChange({
                postulacion: { ...p, nivel_territorio: e.target.value as "distrital" | "provincial" | "regional" | "nacional" },
              })
            }
          >
            <option value="">—</option>
            <option value="distrital">Distrital</option>
            <option value="provincial">Provincial</option>
            <option value="regional">Regional</option>
            <option value="nacional">Nacional</option>
          </select>
        </Field>
        <Field label="Territorio">
          <input
            className={inputClass}
            value={p.nombre_territorio ?? ""}
            onChange={(e) => onChange({ postulacion: { ...p, nombre_territorio: e.target.value } })}
            placeholder={
              ctx.jurisdiccion.distrito?.nombre ??
              ctx.jurisdiccion.provincia?.nombre ??
              ctx.jurisdiccion.departamento?.nombre ?? ""
            }
          />
        </Field>
        <Field label="Organización política">
          <input
            className={inputClass}
            value={p.nombre_organizacion ?? ""}
            onChange={(e) => onChange({ postulacion: { ...p, nombre_organizacion: e.target.value } })}
            placeholder={ctx.organizacion_politica?.nombre ?? "Partido / movimiento"}
          />
        </Field>
        <Field label="Fecha de elección">
          <input
            type="date"
            className={inputClass}
            value={p.fecha_eleccion ?? ""}
            onChange={(e) => onChange({ postulacion: { ...p, fecha_eleccion: e.target.value } })}
          />
        </Field>
      </div>
    </div>
  );
}

function BrandingEditor({
  value,
  onChange,
}: {
  value: NonNullable<Fase1Rapida["branding"]>;
  onChange: (v: NonNullable<Fase1Rapida["branding"]>) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Slogan de campaña">
        <input
          className={inputClass}
          value={value.slogan ?? ""}
          onChange={(e) => onChange({ ...value, slogan: e.target.value })}
          placeholder="Frase central de la campaña"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Color primario">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={value.color_primario ?? "#fbc02d"}
              onChange={(e) => onChange({ ...value, color_primario: e.target.value })}
              className="size-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
            />
            <input
              className={inputClass}
              value={value.color_primario ?? ""}
              onChange={(e) => onChange({ ...value, color_primario: e.target.value })}
              placeholder="#fbc02d"
            />
          </div>
        </Field>
        <Field label="Color secundario">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={value.color_secundario ?? "#0a1e4a"}
              onChange={(e) => onChange({ ...value, color_secundario: e.target.value })}
              className="size-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
            />
            <input
              className={inputClass}
              value={value.color_secundario ?? ""}
              onChange={(e) => onChange({ ...value, color_secundario: e.target.value })}
              placeholder="#0a1e4a"
            />
          </div>
        </Field>
      </div>
      <Field label="URL del logo">
        <input
          className={inputClass}
          value={value.logo_url ?? ""}
          onChange={(e) => onChange({ ...value, logo_url: e.target.value })}
          placeholder="https://..."
        />
      </Field>
    </div>
  );
}

function EstrategiaEditor({
  value,
  onChange,
  color1,
}: {
  value: NonNullable<Fase1Rapida["estrategia"]>;
  onChange: (v: NonNullable<Fase1Rapida["estrategia"]>) => void;
  color1: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tipo de campaña">
          <select
            className={selectClass}
            value={value.tipo_campana ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                tipo_campana: e.target.value as "RACIONAL" | "EMOTIVA" | "INSTINTIVA" | "MIXTA",
              })
            }
          >
            <option value="">Seleccionar</option>
            <option value="RACIONAL">Racional</option>
            <option value="EMOTIVA">Emotiva</option>
            <option value="INSTINTIVA">Instintiva</option>
            <option value="MIXTA">Mixta</option>
          </select>
        </Field>
        <Field label="Eje emocional">
          <select
            className={selectClass}
            value={value.eje_emocional ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                eje_emocional: e.target.value as NonNullable<Fase1Rapida["estrategia"]>["eje_emocional"],
              })
            }
          >
            <option value="">Seleccionar</option>
            <option value="PLAN_DE_GOBIERNO">Plan de Gobierno</option>
            <option value="EQUIPO_DE_CAMPAÑA">Equipo de Campaña</option>
            <option value="SIMPATIA">Simpatía</option>
            <option value="ESPERANZA">Esperanza</option>
            <option value="ODIO">Indignación</option>
            <option value="MIEDO">Miedo</option>
          </select>
        </Field>
        <Field label="Frente principal">
          <select
            className={selectClass}
            value={value.frente_principal ?? ""}
            onChange={(e) =>
              onChange({ ...value, frente_principal: e.target.value as "TIERRA" | "MAR" | "AIRE" })
            }
          >
            <option value="">—</option>
            <option value="TIERRA">Tierra (puerta a puerta)</option>
            <option value="MAR">Mar (TV / radio)</option>
            <option value="AIRE">Aire (digital)</option>
          </select>
        </Field>
      </div>
      {value.tipo_campana === "MIXTA" && (
        <Field label="Combinación mixta">
          <div className="flex gap-2 flex-wrap">
            {(["RACIONAL", "EMOTIVA", "INSTINTIVA"] as const).map((t) => {
              const selected = value.combinacion_mixta?.includes(t) ?? false;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    const cur = value.combinacion_mixta ?? [];
                    const next = selected ? cur.filter((x) => x !== t) : [...cur, t].slice(0, 2);
                    onChange({ ...value, combinacion_mixta: next });
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    selected
                      ? "border-amber-400/50 bg-amber-400/20 text-amber-400"
                      : "border-gray-700 text-gray-500"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </Field>
      )}
    </div>
  );
}

function PropuestasEditor({
  value,
  onChange,
  color1,
}: {
  value: NonNullable<Fase1Rapida["propuestas"]>;
  onChange: (v: NonNullable<Fase1Rapida["propuestas"]>) => void;
  color1: string;
}) {
  function addPropuesta() {
    onChange([
      ...value,
      { orden: value.length + 1, titulo: "", descripcion_corta: "" },
    ]);
  }

  function updatePropuesta(
    i: number,
    patch: Partial<NonNullable<Fase1Rapida["propuestas"]>[number]>,
  ) {
    onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  function removePropuesta(i: number) {
    onChange(value.filter((_, j) => j !== i).map((p, j) => ({ ...p, orden: j + 1 })));
  }

  return (
    <div className="space-y-4">
      {value.map((prop, i) => (
        <div
          key={i}
          className="rounded-xl border border-white/8 bg-[#020a1e]/40 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-black px-2 py-0.5 rounded-full"
              style={{ background: color1 + "20", color: color1 }}
            >
              #{prop.orden}
            </span>
            <button
              type="button"
              onClick={() => removePropuesta(i)}
              className="text-gray-600 hover:text-red-400 text-xs transition-colors"
            >
              Eliminar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <input
                className={inputClass}
                value={prop.titulo}
                onChange={(e) => updatePropuesta(i, { titulo: e.target.value })}
                placeholder="Título de la propuesta"
              />
            </div>
            <input
              className={inputClass}
              value={prop.sector ?? ""}
              onChange={(e) => updatePropuesta(i, { sector: e.target.value })}
              placeholder="Sector (salud, agua…)"
            />
          </div>
          <textarea
            className={textareaClass}
            rows={2}
            maxLength={140}
            value={prop.descripcion_corta}
            onChange={(e) => updatePropuesta(i, { descripcion_corta: e.target.value })}
            placeholder="Descripción breve (máx 140 chars)"
          />
          <input
            className={inputClass}
            value={prop.icono ?? ""}
            onChange={(e) => updatePropuesta(i, { icono: e.target.value })}
            placeholder="Ícono emoji (🏥 💧 🛣️)"
          />
        </div>
      ))}
      {value.length < 6 && (
        <button
          type="button"
          onClick={addPropuesta}
          className="w-full py-2.5 rounded-xl border border-dashed border-amber-400/30 text-amber-400/60 text-sm hover:border-amber-400/50 hover:text-amber-400 transition-colors"
        >
          + Agregar propuesta
        </button>
      )}
    </div>
  );
}

function FodaEditor({
  value,
  onChange,
  color1,
}: {
  value: NonNullable<Fase1Rapida["diagnostico_inicial"]>;
  onChange: (v: NonNullable<Fase1Rapida["diagnostico_inicial"]>) => void;
  color1: string;
}) {
  const quadrants: {
    key: "fortalezas" | "debilidades" | "oportunidades" | "amenazas";
    label: string;
    color: string;
  }[] = [
    { key: "fortalezas", label: "Fortalezas", color: "#4ade80" },
    { key: "debilidades", label: "Debilidades", color: "#f87171" },
    { key: "oportunidades", label: "Oportunidades", color: "#60a5fa" },
    { key: "amenazas", label: "Amenazas", color: "#fb923c" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {quadrants.map(({ key, label, color }) => (
          <div key={key} className="space-y-2">
            <label
              className="text-[10px] uppercase tracking-[0.2em] font-semibold"
              style={{ color }}
            >
              {label}
            </label>
            <TagsInput
              value={value[key] ?? []}
              onChange={(v) => onChange({ ...value, [key]: v })}
              placeholder={`Agregar ${label.toLowerCase()}…`}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold">
          Principales competidores
        </label>
        {(value.principales_competidores ?? []).map((comp, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className={inputClass}
              value={comp.nombre}
              onChange={(e) => {
                const cur = [...(value.principales_competidores ?? [])];
                cur[i] = { ...cur[i]!, nombre: e.target.value };
                onChange({ ...value, principales_competidores: cur });
              }}
              placeholder="Nombre del rival"
            />
            <select
              className={`${selectClass} max-w-[120px]`}
              value={comp.nivel_amenaza ?? "medio"}
              onChange={(e) => {
                const cur = [...(value.principales_competidores ?? [])];
                cur[i] = {
                  ...cur[i]!,
                  nivel_amenaza: e.target.value as "bajo" | "medio" | "alto",
                };
                onChange({ ...value, principales_competidores: cur });
              }}
            >
              <option value="bajo">Bajo</option>
              <option value="medio">Medio</option>
              <option value="alto">Alto</option>
            </select>
            <button
              type="button"
              onClick={() => {
                const cur = (value.principales_competidores ?? []).filter((_, j) => j !== i);
                onChange({ ...value, principales_competidores: cur });
              }}
              className="text-gray-600 hover:text-red-400 transition-colors px-2"
            >
              ×
            </button>
          </div>
        ))}
        {(value.principales_competidores ?? []).length < 5 && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                principales_competidores: [
                  ...(value.principales_competidores ?? []),
                  { nombre: "", nivel_amenaza: "medio" },
                ],
              })
            }
            className="text-xs text-amber-400/60 hover:text-amber-400 transition-colors"
          >
            + Agregar rival
          </button>
        )}
      </div>
    </div>
  );
}

function C2SegmentosEditor({
  value,
  onChange,
}: {
  value: C2Segmento[];
  onChange: (v: C2Segmento[]) => void;
}) {
  function addSegmento() {
    const id = `seg_${Date.now()}`;
    onChange([...value, { id, nombre: "" }]);
  }

  function update(i: number, patch: Partial<C2Segmento>) {
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Define los segmentos psicográficos del electorado. Estos alimentan la Matriz D5 y el Núcleo Goberna.
      </p>
      {value.map((seg, i) => (
        <div key={seg.id} className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="size-6 rounded-full bg-amber-400/20 text-amber-400 font-black text-xs flex items-center justify-center">
              {i + 1}
            </span>
            <input
              className={`${inputClass} flex-1`}
              value={seg.nombre}
              onChange={(e) => update(i, { nombre: e.target.value })}
              placeholder="Nombre del segmento (ej: Madres jóvenes urbanas)"
            />
            <input
              type="number"
              min={0}
              max={100}
              className={`${inputClass} w-20`}
              value={seg.pct_aprox ?? ""}
              onChange={(e) => update(i, { pct_aprox: Number(e.target.value) })}
              placeholder="%"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-gray-600 hover:text-red-400 transition-colors"
            >
              ×
            </button>
          </div>

          <Field label="Problema principal">
            <input
              className={inputClass}
              value={seg.problema_principal ?? ""}
              onChange={(e) => update(i, { problema_principal: e.target.value })}
              placeholder="¿Cuál es su mayor problema hoy?"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[9px] uppercase tracking-wider text-gray-600 font-semibold">Valores</label>
              <TagsInput
                value={seg.valores ?? []}
                onChange={(v) => update(i, { valores: v })}
                placeholder="familia, trabajo…"
              />
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wider text-gray-600 font-semibold">Aspiraciones</label>
              <TagsInput
                value={seg.aspiraciones ?? []}
                onChange={(v) => update(i, { aspiraciones: v })}
                placeholder="progreso, seguridad…"
              />
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wider text-gray-600 font-semibold">Temores</label>
              <TagsInput
                value={seg.temores ?? []}
                onChange={(v) => update(i, { temores: v })}
                placeholder="desempleo, inseguridad…"
              />
            </div>
          </div>

          <Field label="Medio de información preferido">
            <input
              className={inputClass}
              value={seg.medio_info_preferido ?? ""}
              onChange={(e) => update(i, { medio_info_preferido: e.target.value })}
              placeholder="WhatsApp, radio local, TikTok…"
            />
          </Field>
        </div>
      ))}
      {value.length < 8 && (
        <button
          type="button"
          onClick={addSegmento}
          className="w-full py-2.5 rounded-xl border border-dashed border-amber-400/30 text-amber-400/60 text-sm hover:border-amber-400/50 hover:text-amber-400 transition-colors"
        >
          + Agregar segmento
        </button>
      )}
    </div>
  );
}

function D5MatrixEditor({
  segments,
  value,
  onChange,
}: {
  segments: C2Segmento[];
  value: D5MatrixRow[];
  onChange: (v: D5MatrixRow[]) => void;
}) {
  if (segments.length === 0) {
    return (
      <p className="text-sm text-gray-600 italic">
        Primero define los segmentos en "Segmentos Electorales".
      </p>
    );
  }

  function getRow(segId: string): D5MatrixRow {
    return value.find((r) => r.segmento_id === segId) ?? { segmento_id: segId };
  }

  function updateRow(segId: string, patch: Partial<D5MatrixRow>) {
    const existing = value.find((r) => r.segmento_id === segId);
    if (existing) {
      onChange(value.map((r) => (r.segmento_id === segId ? { ...r, ...patch } : r)));
    } else {
      onChange([...value, { segmento_id: segId, ...patch }]);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Para cada segmento, define el mensaje clave, el canal más efectivo y el portavoz ideal.
      </p>
      {segments.map((seg) => {
        const row = getRow(seg.id);
        return (
          <div key={seg.id} className="rounded-xl border border-white/10 bg-[#020a1e]/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-400 text-sm">{seg.nombre || `Segmento ${seg.id}`}</span>
              {seg.pct_aprox && (
                <span className="text-xs text-gray-500">{seg.pct_aprox}%</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Candidato preferido actualmente">
                <input
                  className={inputClass}
                  value={row.candidato_preferido ?? ""}
                  onChange={(e) => updateRow(seg.id, { candidato_preferido: e.target.value })}
                  placeholder="Nombre del rival preferido"
                />
              </Field>
              <Field label="Razón de preferencia">
                <input
                  className={inputClass}
                  value={row.razon_preferencia ?? ""}
                  onChange={(e) => updateRow(seg.id, { razon_preferencia: e.target.value })}
                  placeholder="Por qué prefieren al rival"
                />
              </Field>
              <Field label="Probabilidad de cambio">
                <select
                  className={selectClass}
                  value={row.prob_cambio ?? ""}
                  onChange={(e) =>
                    updateRow(seg.id, { prob_cambio: e.target.value as "alta" | "media" | "baja" })
                  }
                >
                  <option value="">—</option>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </Field>
              <Field label="¿Voto útil?">
                <div className="flex gap-3 items-center pt-2">
                  {[
                    { v: true, label: "Sí" },
                    { v: false, label: "No" },
                  ].map(({ v, label }) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => updateRow(seg.id, { voto_util: v })}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        row.voto_util === v
                          ? "border-amber-400/50 bg-amber-400/20 text-amber-400"
                          : "border-gray-700 text-gray-500"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <Field label="Mensaje clave para este segmento">
              <textarea
                className={textareaClass}
                rows={2}
                value={row.mensaje_clave ?? ""}
                onChange={(e) => updateRow(seg.id, { mensaje_clave: e.target.value })}
                placeholder="El mensaje principal que mueve a este segmento hacia nosotros…"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Canal más efectivo">
                <input
                  className={inputClass}
                  value={row.canal_efectivo ?? ""}
                  onChange={(e) => updateRow(seg.id, { canal_efectivo: e.target.value })}
                  placeholder="WhatsApp, mítines, radio…"
                />
              </Field>
              <Field label="Portavoz sugerido">
                <input
                  className={inputClass}
                  value={row.portavoz_sugerido ?? ""}
                  onChange={(e) => updateRow(seg.id, { portavoz_sugerido: e.target.value })}
                  placeholder="Quién debe transmitir el mensaje"
                />
              </Field>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NucleoEditor({
  value,
  segments,
  onChange,
  color1,
}: {
  value: NonNullable<TerritoryEcd["nucleo_goberna"]>;
  segments: C2Segmento[];
  onChange: (v: NonNullable<TerritoryEcd["nucleo_goberna"]>) => void;
  color1: string;
}) {
  return (
    <div className="space-y-4">
      <div
        className="rounded-xl p-4 border"
        style={{ background: color1 + "08", borderColor: color1 + "30" }}
      >
        <p className="text-xs text-amber-400/70 mb-3 font-semibold uppercase tracking-wider">
          Síntesis E×C×D → Núcleo Goberna
        </p>
        <div className="space-y-3">
          <Field label="Propuesta central (promesa de campaña)">
            <textarea
              className={textareaClass}
              rows={2}
              value={value.propuesta_central ?? ""}
              onChange={(e) => onChange({ ...value, propuesta_central: e.target.value })}
              placeholder="La propuesta principal que unifica toda la campaña…"
            />
          </Field>
          <Field label="Diferenciador clave (vs. competidores)">
            <textarea
              className={textareaClass}
              rows={2}
              value={value.diferenciador_clave ?? ""}
              onChange={(e) => onChange({ ...value, diferenciador_clave: e.target.value })}
              placeholder="Por qué el candidato es mejor opción que los rivales…"
            />
          </Field>
        </div>
      </div>

      {segments.length > 0 && (
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold">
            Segmentos prioritarios (máx 3)
          </label>
          {(value.segmentos_prioritarios ?? []).map((sp, i) => {
            const seg = segments.find((s) => s.id === sp.segmento_id);
            return (
              <div key={i} className="rounded-xl border border-white/8 bg-[#020a1e]/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-amber-400">{seg?.nombre ?? sp.segmento_id}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...value,
                        segmentos_prioritarios: (value.segmentos_prioritarios ?? []).filter((_, j) => j !== i),
                      })
                    }
                    className="text-gray-600 hover:text-red-400 text-xs"
                  >
                    Quitar
                  </button>
                </div>
                <input
                  className={inputClass}
                  value={sp.mensaje_central ?? ""}
                  onChange={(e) => {
                    const cur = [...(value.segmentos_prioritarios ?? [])];
                    cur[i] = { ...cur[i]!, mensaje_central: e.target.value };
                    onChange({ ...value, segmentos_prioritarios: cur });
                  }}
                  placeholder="Mensaje central para este segmento"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    className={inputClass}
                    value={sp.canal_principal ?? ""}
                    onChange={(e) => {
                      const cur = [...(value.segmentos_prioritarios ?? [])];
                      cur[i] = { ...cur[i]!, canal_principal: e.target.value };
                      onChange({ ...value, segmentos_prioritarios: cur });
                    }}
                    placeholder="Canal"
                  />
                  <input
                    className={inputClass}
                    value={sp.portavoz ?? ""}
                    onChange={(e) => {
                      const cur = [...(value.segmentos_prioritarios ?? [])];
                      cur[i] = { ...cur[i]!, portavoz: e.target.value };
                      onChange({ ...value, segmentos_prioritarios: cur });
                    }}
                    placeholder="Portavoz"
                  />
                  <input
                    className={inputClass}
                    value={sp.accion_inmediata ?? ""}
                    onChange={(e) => {
                      const cur = [...(value.segmentos_prioritarios ?? [])];
                      cur[i] = { ...cur[i]!, accion_inmediata: e.target.value };
                      onChange({ ...value, segmentos_prioritarios: cur });
                    }}
                    placeholder="Acción"
                  />
                </div>
              </div>
            );
          })}
          {(value.segmentos_prioritarios ?? []).length < 3 && segments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {segments
                .filter((s) => !(value.segmentos_prioritarios ?? []).find((sp) => sp.segmento_id === s.id))
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...value,
                        segmentos_prioritarios: [
                          ...(value.segmentos_prioritarios ?? []),
                          { segmento_id: s.id },
                        ],
                      })
                    }
                    className="px-3 py-1 rounded-full border border-dashed border-amber-400/30 text-amber-400/60 text-xs hover:border-amber-400/50 hover:text-amber-400 transition-colors"
                  >
                    + {s.nombre || s.id}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      <Field label="Notas internas">
        <textarea
          className={textareaClass}
          rows={2}
          value={value.notas ?? ""}
          onChange={(e) => onChange({ ...value, notas: e.target.value })}
          placeholder="Contexto adicional del equipo de consultoría…"
        />
      </Field>
    </div>
  );
}

function EstructuraEditor({
  value,
  onChange,
}: {
  value: TerritoryEcd;
  onChange: (patch: Partial<TerritoryEcd>) => void;
}) {
  const e4 = value.e4_campo_politico ?? {};
  const e1 = value.e1_capital_economico ?? {};
  const e2 = value.e2_capital_social ?? {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Pobreza estimada (%)">
          <input
            type="number"
            min={0}
            max={100}
            className={inputClass}
            value={e1.nivel_pobreza_pct ?? ""}
            onChange={(e) =>
              onChange({ e1_capital_economico: { ...e1, nivel_pobreza_pct: Number(e.target.value) } })
            }
          />
        </Field>
        <Field label="Polarización política">
          <select
            className={selectClass}
            value={e4.nivel_polarizacion ?? ""}
            onChange={(e) =>
              onChange({
                e4_campo_politico: {
                  ...e4,
                  nivel_polarizacion: e.target.value as "bajo" | "medio" | "alto",
                },
              })
            }
          >
            <option value="">—</option>
            <option value="bajo">Baja</option>
            <option value="medio">Media</option>
            <option value="alto">Alta</option>
          </select>
        </Field>
      </div>

      <Field label="Principales sectores económicos">
        <TagsInput
          value={e1.principales_sectores ?? []}
          onChange={(v) => onChange({ e1_capital_economico: { ...e1, principales_sectores: v } })}
          placeholder="agricultura, minería, comercio…"
        />
      </Field>

      <Field label="Tendencia histórica del voto">
        <input
          className={inputClass}
          value={e4.voto_historico_tendencia ?? ""}
          onChange={(e) =>
            onChange({ e4_campo_politico: { ...e4, voto_historico_tendencia: e.target.value } })
          }
          placeholder="Ej: voto conservador, fragmentado, anti-fujimorismo…"
        />
      </Field>

      <Field label="Organizaciones sociales clave">
        <TagsInput
          value={e2.organizaciones_clave ?? []}
          onChange={(v) => onChange({ e2_capital_social: { ...e2, organizaciones_clave: v } })}
          placeholder="APAFA, rondas campesinas, sindicatos…"
        />
      </Field>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold">
          Partidos/movimientos fuertes en la zona
        </label>
        {(e4.partidos_fuertes ?? []).map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className={inputClass}
              value={p.nombre}
              onChange={(e) => {
                const cur = [...(e4.partidos_fuertes ?? [])];
                cur[i] = { ...cur[i]!, nombre: e.target.value };
                onChange({ e4_campo_politico: { ...e4, partidos_fuertes: cur } });
              }}
              placeholder="Nombre del partido"
            />
            <input
              type="number"
              min={0}
              max={100}
              className={`${inputClass} w-20`}
              value={p.pct_aprox ?? ""}
              onChange={(e) => {
                const cur = [...(e4.partidos_fuertes ?? [])];
                cur[i] = { ...cur[i]!, pct_aprox: Number(e.target.value) };
                onChange({ e4_campo_politico: { ...e4, partidos_fuertes: cur } });
              }}
              placeholder="%"
            />
            <select
              className={`${selectClass} max-w-[110px]`}
              value={p.trend ?? ""}
              onChange={(e) => {
                const cur = [...(e4.partidos_fuertes ?? [])];
                cur[i] = { ...cur[i]!, trend: e.target.value as "subiendo" | "estable" | "bajando" };
                onChange({ e4_campo_politico: { ...e4, partidos_fuertes: cur } });
              }}
            >
              <option value="">trend</option>
              <option value="subiendo">↑</option>
              <option value="estable">→</option>
              <option value="bajando">↓</option>
            </select>
            <button
              type="button"
              onClick={() => {
                const cur = (e4.partidos_fuertes ?? []).filter((_, j) => j !== i);
                onChange({ e4_campo_politico: { ...e4, partidos_fuertes: cur } });
              }}
              className="text-gray-600 hover:text-red-400 transition-colors"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              e4_campo_politico: {
                ...e4,
                partidos_fuertes: [...(e4.partidos_fuertes ?? []), { nombre: "" }],
              },
            })
          }
          className="text-xs text-amber-400/60 hover:text-amber-400 transition-colors"
        >
          + Agregar partido
        </button>
      </div>
    </div>
  );
}

function ConcienciaEditor({
  value,
  onChange,
}: {
  value: TerritoryEcd;
  onChange: (patch: Partial<TerritoryEcd>) => void;
}) {
  const c5 = value.c5_intencion_voto ?? {};
  const c4 = value.c4_evaluacion ?? {};
  const c6 = value.c6_voto_util ?? {};
  const c3 = value.c3_issues ?? {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Candidato puntero (rival principal)">
          <input
            className={inputClass}
            value={c5.candidato_puntero ?? ""}
            onChange={(e) =>
              onChange({ c5_intencion_voto: { ...c5, candidato_puntero: e.target.value } })
            }
          />
        </Field>
        <Field label="Nuestro candidato (% intención)">
          <input
            type="number"
            min={0}
            max={100}
            className={inputClass}
            value={c5.pct_nuestro_candidato ?? ""}
            onChange={(e) =>
              onChange({ c5_intencion_voto: { ...c5, pct_nuestro_candidato: Number(e.target.value) } })
            }
            placeholder="%"
          />
        </Field>
        <Field label="Indecisos (%)">
          <input
            type="number"
            min={0}
            max={100}
            className={inputClass}
            value={c5.pct_indecisos ?? ""}
            onChange={(e) =>
              onChange({ c5_intencion_voto: { ...c5, pct_indecisos: Number(e.target.value) } })
            }
            placeholder="%"
          />
        </Field>
        <Field label="Fuente de la encuesta">
          <input
            className={inputClass}
            value={c5.fuente ?? ""}
            onChange={(e) =>
              onChange({ c5_intencion_voto: { ...c5, fuente: e.target.value } })
            }
            placeholder="IPSOS, encuesta propia…"
          />
        </Field>
        <Field label="Aprobación nuestro candidato (%)">
          <input
            type="number"
            min={0}
            max={100}
            className={inputClass}
            value={c4.aprobacion_candidato ?? ""}
            onChange={(e) =>
              onChange({ c4_evaluacion: { ...c4, aprobacion_candidato: Number(e.target.value) } })
            }
            placeholder="%"
          />
        </Field>
        <Field label="Riesgo voto útil">
          <select
            className={selectClass}
            value={c6.riesgo_voto_util ?? ""}
            onChange={(e) =>
              onChange({
                c6_voto_util: { ...c6, riesgo_voto_util: e.target.value as "bajo" | "medio" | "alto" },
              })
            }
          >
            <option value="">—</option>
            <option value="bajo">Bajo</option>
            <option value="medio">Medio</option>
            <option value="alto">Alto</option>
          </select>
        </Field>
      </div>

      <Field label="Principales issues del electorado">
        <TagsInput
          value={(c3.top_issues ?? []).map((i) => i.issue)}
          onChange={(v) =>
            onChange({
              c3_issues: {
                ...c3,
                top_issues: v.map((issue, idx) => ({ issue, prioridad: idx + 1 })),
              },
            })
          }
          placeholder="seguridad, agua, empleo…"
        />
      </Field>

      <Field label="Escenario voto útil">
        <textarea
          className={textareaClass}
          rows={2}
          value={c6.escenario ?? ""}
          onChange={(e) => onChange({ c6_voto_util: { ...c6, escenario: e.target.value } })}
          placeholder="Describir el escenario de voto útil y cómo nos afecta…"
        />
      </Field>
    </div>
  );
}

function PerfilCompletoEditor({
  value,
  onChange,
}: {
  value: PerfilCandidato;
  onChange: (patch: Partial<PerfilCandidato>) => void;
}) {
  const n1 = value.n1_identidad ?? {};
  const n2 = value.n2_trayectoria ?? {};
  const n3 = value.n3_riesgo ?? {};
  const n5 = value.n5_salud ?? {};
  const entorno = value.entorno ?? {};
  const coherencia = value.coherencia ?? {};

  return (
    <div className="space-y-6">
      {/* N1 extended */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/60 font-semibold mb-3">
          N1 — Identidad extendida
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Lugar de nacimiento">
            <input
              className={inputClass}
              value={n1.lugar_nacimiento ?? ""}
              onChange={(e) => onChange({ n1_identidad: { ...n1, lugar_nacimiento: e.target.value } })}
            />
          </Field>
          <Field label="Estado civil">
            <input
              className={inputClass}
              value={n1.estado_civil ?? ""}
              onChange={(e) => onChange({ n1_identidad: { ...n1, estado_civil: e.target.value } })}
            />
          </Field>
          <Field label="Hijos">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={n1.hijos ?? ""}
              onChange={(e) => onChange({ n1_identidad: { ...n1, hijos: Number(e.target.value) } })}
            />
          </Field>
          <Field label="Religión">
            <input
              className={inputClass}
              value={n1.religion ?? ""}
              onChange={(e) => onChange({ n1_identidad: { ...n1, religion: e.target.value } })}
            />
          </Field>
        </div>
      </div>

      {/* N2 Trayectoria */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/60 font-semibold mb-3">
          N2 — Trayectoria
        </p>
        <Field label="Logros principales">
          <TagsInput
            value={n2.logros_principales ?? []}
            onChange={(v) => onChange({ n2_trayectoria: { ...n2, logros_principales: v } })}
            placeholder="Logro destacado…"
          />
        </Field>
      </div>

      {/* N3 Riesgos */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-red-400/60 font-semibold mb-3">
          N3 — Riesgos legales / reputacionales
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nivel de riesgo global">
            <select
              className={selectClass}
              value={n3.nivel_riesgo_global ?? ""}
              onChange={(e) =>
                onChange({
                  n3_riesgo: {
                    ...n3,
                    nivel_riesgo_global: e.target.value as "bajo" | "medio" | "alto" | "critico",
                  },
                })
              }
            >
              <option value="">—</option>
              <option value="bajo">Bajo</option>
              <option value="medio">Medio</option>
              <option value="alto">Alto</option>
              <option value="critico">Crítico</option>
            </select>
          </Field>
        </div>
        <Field label="Observaciones JNE / ONPE">
          <TagsInput
            value={n3.jne_observaciones ?? []}
            onChange={(v) => onChange({ n3_riesgo: { ...n3, jne_observaciones: v } })}
            placeholder="Observación…"
          />
        </Field>
        <Field label="Búsquedas negativas en Google">
          <TagsInput
            value={n3.google_negativo ?? []}
            onChange={(v) => onChange({ n3_riesgo: { ...n3, google_negativo: v } })}
            placeholder="Titular negativo…"
          />
        </Field>
      </div>

      {/* N5 Salud */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/60 font-semibold mb-3">
          N5 — Salud y energía
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Estado general">
            <select
              className={selectClass}
              value={n5.estado_general ?? ""}
              onChange={(e) =>
                onChange({
                  n5_salud: { ...n5, estado_general: e.target.value as "optimo" | "bueno" | "regular" | "preocupante" },
                })
              }
            >
              <option value="">—</option>
              <option value="optimo">Óptimo</option>
              <option value="bueno">Bueno</option>
              <option value="regular">Regular</option>
              <option value="preocupante">Preocupante</option>
            </select>
          </Field>
          <Field label="Energía para campaña">
            <select
              className={selectClass}
              value={n5.energia_campana ?? ""}
              onChange={(e) =>
                onChange({ n5_salud: { ...n5, energia_campana: e.target.value as "alta" | "media" | "baja" } })
              }
            >
              <option value="">—</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </Field>
        </div>
      </div>

      {/* Entorno */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/60 font-semibold mb-3">
          Entorno
        </p>
        <Field label="Financiadores clave">
          <TagsInput
            value={entorno.financiadores_clave ?? []}
            onChange={(v) => onChange({ entorno: { ...entorno, financiadores_clave: v } })}
            placeholder="Nombre / organización…"
          />
        </Field>
        <Field label="Adversarios internos">
          <TagsInput
            value={entorno.adversarios_internos ?? []}
            onChange={(v) => onChange({ entorno: { ...entorno, adversarios_internos: v } })}
            placeholder="Persona u organización…"
          />
        </Field>
      </div>

      {/* Coherencia */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/60 font-semibold mb-3">
          Coherencia narrativa
        </p>
        <Field label="Historia de vida → candidatura (¿por qué él/ella?)">
          <textarea
            className={textareaClass}
            rows={3}
            value={coherencia.mensaje_vida_candidatura ?? ""}
            onChange={(e) =>
              onChange({ coherencia: { ...coherencia, mensaje_vida_candidatura: e.target.value } })
            }
            placeholder="Cómo su historia personal conecta con la candidatura…"
          />
        </Field>
        <Field label="Posibles contradicciones a resolver">
          <TagsInput
            value={coherencia.contradicciones ?? []}
            onChange={(v) => onChange({ coherencia: { ...coherencia, contradicciones: v } })}
            placeholder="Contradicción…"
          />
        </Field>
      </div>
    </div>
  );
}

// ── Utility: deep merge (shallow 1 level) ─────────────────────────────────

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const bv = base[key];
    if (
      pv !== null &&
      typeof pv === "object" &&
      !Array.isArray(pv) &&
      bv !== null &&
      typeof bv === "object" &&
      !Array.isArray(bv)
    ) {
      result[key] = { ...(bv as Record<string, unknown>), ...(pv as Record<string, unknown>) };
    } else {
      result[key] = pv;
    }
  }
  return result;
}
