"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { onboardingApi, type CandidatoContext } from "@/lib/onboarding-api";

import { WizardShell } from "./wizard/WizardShell";
import { useDebounce } from "./form-fields";

// ── Types ────────────────────────────────────────────────────────────

type WizardCategory = "terreno" | "perfil" | "presencia";

interface WizardSection {
  id: string;
  label: string;
  sublabel: string;
  category: WizardCategory;
}

const SECTIONS: WizardSection[] = [
  // ── TERRENO — E (Estructura) ──────────────────────────────────────────────
  { id: "e1", label: "Demografía y Geografía",      sublabel: "E1 · Estructura",   category: "terreno" },
  { id: "e2", label: "Capital Económico",            sublabel: "E2 · Estructura",   category: "terreno" },
  { id: "e3", label: "Capital Cultural y Social",    sublabel: "E3 · Estructura",   category: "terreno" },
  { id: "e4", label: "Campo Político y Figuras",     sublabel: "E4 · Estructura",   category: "terreno" },
  { id: "e5", label: "Cleavages y Fracturas",        sublabel: "E5 · Estructura",   category: "terreno" },
  // ── TERRENO — C (Conciencia) ──────────────────────────────────────────────
  { id: "c1", label: "Identidades y Percepciones",   sublabel: "C1 · Conciencia",   category: "terreno" },
  { id: "c2", label: "Segmentos Psicográficos",      sublabel: "C2 · Conciencia",   category: "terreno" },
  { id: "c3", label: "Memoria Política",             sublabel: "C3 · Conciencia",   category: "terreno" },
  { id: "c4", label: "Issues Prioritarios",          sublabel: "C4 · Conciencia",   category: "terreno" },
  { id: "c5", label: "Medios y Encuestas",           sublabel: "C5 · Conciencia",   category: "terreno" },
  // ── TERRENO — D (Decisión) ────────────────────────────────────────────────
  { id: "d1", label: "Universo Electoral",           sublabel: "D1 · Decisión",     category: "terreno" },
  { id: "d2", label: "Historial Electoral",          sublabel: "D2 · Decisión",     category: "terreno" },
  { id: "d3", label: "Oferta Política",              sublabel: "D3 · Decisión",     category: "terreno" },
  { id: "d4", label: "Lógica del Votante",           sublabel: "D4 · Decisión",     category: "terreno" },
  { id: "d5", label: "Matriz de Decisión",           sublabel: "D5 · Decisión",     category: "terreno" },
  // ── PERFIL — 5N ───────────────────────────────────────────────────────────
  { id: "n1", label: "Identidad",                    sublabel: "N1 · Perfil",       category: "perfil"  },
  { id: "n2", label: "Trayectoria y Vida Personal",  sublabel: "N2 · Perfil",       category: "perfil"  },
  { id: "n3", label: "Riesgo Legal y Reputacional",  sublabel: "N3 · Perfil",       category: "perfil"  },
  { id: "n4", label: "Solvencia y Patrimonio",       sublabel: "N4 · Perfil",       category: "perfil"  },
  { id: "n5", label: "Salud y Capacidad Funcional",  sublabel: "N5 · Perfil",       category: "perfil"  },
  // ── PRESENCIA — PENTA-D ───────────────────────────────────────────────────
  { id: "pd0", label: "Universo Competitivo",        sublabel: "Config · PentaD",   category: "presencia" },
  { id: "pd1", label: "Eje 1 · Presencia",           sublabel: "E1 · PentaD",       category: "presencia" },
  { id: "pd2", label: "Eje 2 · Desempeño",           sublabel: "E2 · PentaD",       category: "presencia" },
  { id: "pd3", label: "Eje 3 · Inversión",           sublabel: "E3 · PentaD",       category: "presencia" },
  { id: "pd4", label: "Eje 4 · Reputación",          sublabel: "E4 · PentaD",       category: "presencia" },
  { id: "pd5", label: "Eje 5 · Operativa",           sublabel: "E5 · PentaD",       category: "presencia" },
];

const SECTION_PATH: Record<string, { formKey: "terreno" | "perfil" | "presencia"; subKey: string }> = {
  e1:  { formKey: "terreno",   subKey: "e1_demografia" },
  e2:  { formKey: "terreno",   subKey: "e2_capital_economico" },
  e3:  { formKey: "terreno",   subKey: "e3_capital_cultural_social" },
  e4:  { formKey: "terreno",   subKey: "e4_campo_politico" },
  e5:  { formKey: "terreno",   subKey: "e5_cleavages" },
  c1:  { formKey: "terreno",   subKey: "c1_identidades" },
  c2:  { formKey: "terreno",   subKey: "c2_psicografia" },
  c3:  { formKey: "terreno",   subKey: "c3_memoria_politica" },
  c4:  { formKey: "terreno",   subKey: "c4_issues" },
  c5:  { formKey: "terreno",   subKey: "c5_medios" },
  d1:  { formKey: "terreno",   subKey: "d1_universo" },
  d2:  { formKey: "terreno",   subKey: "d2_historial" },
  d3:  { formKey: "terreno",   subKey: "d3_oferta" },
  d4:  { formKey: "terreno",   subKey: "d4_logica" },
  d5:  { formKey: "terreno",   subKey: "d5_matriz" },
  n1:  { formKey: "perfil",    subKey: "n1_identidad" },
  n2:  { formKey: "perfil",    subKey: "n2_trayectoria" },
  n3:  { formKey: "perfil",    subKey: "n3_riesgo" },
  n4:  { formKey: "perfil",    subKey: "n4_patrimonio" },
  n5:  { formKey: "perfil",    subKey: "n5_salud" },
  pd0: { formKey: "presencia", subKey: "periodo_observacion" },
  pd1: { formKey: "presencia", subKey: "candidato_propio" },
  pd2: { formKey: "presencia", subKey: "candidato_propio" },
  pd3: { formKey: "presencia", subKey: "candidato_propio" },
  pd4: { formKey: "presencia", subKey: "candidato_propio" },
  pd5: { formKey: "presencia", subKey: "candidato_propio" },
};

// ── Placeholder temporal para secciones sin componente propio ────────

function SectionPlaceholder({
  section,
  value,
  onChange,
}: {
  section: WizardSection;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-white/50">{section.sublabel} — completar datos de {section.label.toLowerCase()}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none h-32 focus:outline-none focus:border-amber-400/50"
        placeholder={`Ingresá la información de ${section.label}...`}
      />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

interface Fase1RapidaClientProps {
  slug: string;
  /** Si está presente, se monta con este ctx y se saltea el fetch al backend. */
  mockCtx?: CandidatoContext | null;
}

export function Fase1RapidaClient({ slug, mockCtx }: Fase1RapidaClientProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // sectionData stores per-section text while no dedicated form component exists
  const [sectionData, setSectionData] = useState<Record<string, string>>({});
  const lastSavedRef = useRef<string>("");

  // Load existing data — or use mock if provided (preview dev)
  useEffect(() => {
    if (mockCtx !== undefined) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        await onboardingApi.getFase2BySlug(slug);
      } catch {
        // no-op — fresh form
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, mockCtx]);

  // Auto-save with debounce — DISABLED in mock mode
  const debouncedData = useDebounce(sectionData, 1500);

  useEffect(() => {
    if (mockCtx !== undefined || loading) return;
    const serialized = JSON.stringify(debouncedData);
    if (serialized === lastSavedRef.current) return;
    lastSavedRef.current = serialized;
    (async () => {
      setSaving(true);
      try {
        // Build patch from accumulated sectionData entries
        const patch: Record<string, unknown> = {};
        for (const [id, text] of Object.entries(debouncedData)) {
          const path = SECTION_PATH[id];
          if (!path) continue;
          const { formKey, subKey } = path;
          if (!patch[formKey]) patch[formKey] = {};
          (patch[formKey] as Record<string, unknown>)[subKey] = text;
        }
        if (Object.keys(patch).length > 0) {
          await onboardingApi.patchFase2Form(slug, patch);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    })();
  }, [debouncedData, slug, loading, mockCtx]);

  const handleNext = useCallback(async () => {
    const currentId = SECTIONS[activeSection]?.id;
    if (!currentId) return;
    const path = SECTION_PATH[currentId];
    if (!path) return;
    const { formKey, subKey } = path;
    const text = sectionData[currentId] ?? "";

    setSaving(true);
    try {
      await onboardingApi.patchFase2Form(slug, {
        [formKey]: { [subKey]: text },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
    if (activeSection < SECTIONS.length - 1) {
      setActiveSection((s) => s + 1);
    }
  }, [slug, sectionData, activeSection, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020a1e]">
        <Loader2 className="size-10 animate-spin text-amber-400" />
      </div>
    );
  }

  const currentSection = SECTIONS[activeSection]!;

  return (
    <WizardShell
      slug={slug}
      sections={SECTIONS}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onNext={handleNext}
      saving={saving}
      saved={saved}
    >
      <SectionPlaceholder
        key={currentSection.id}
        section={currentSection}
        value={sectionData[currentSection.id] ?? ""}
        onChange={(v) =>
          setSectionData((prev) => ({ ...prev, [currentSection.id]: v }))
        }
      />
      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}
    </WizardShell>
  );
}
