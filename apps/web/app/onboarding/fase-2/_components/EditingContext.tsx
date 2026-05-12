"use client";

/**
 * Contexto para edición inline del Fase 2 deck.
 *
 * El admin route (`/admin/fase2/[slug]`) envuelve el Fase2Deck en
 * `<EditingProvider>` con `editing=true/false`. Los slides usan
 * `<EditableText>` que consulta este contexto:
 *   - editing=false → texto plano
 *   - editing=true  → contentEditable + debounced PATCH
 *
 * El form se mantiene como estado del provider (optimistic). En cada
 * edición:
 *   1. setForm(...) actualiza inmediatamente la UI
 *   2. setTimeout 600ms → onboardingApi.patchFase2Form(slug, patch)
 *   3. onFormChange callback bombea al admin page para que el ctx
 *      bajado a Fase2Deck refleje la edición
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { onboardingApi, type ConsultorFormFase2 } from "@/lib/onboarding-api";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type EditingContextValue = {
  editing: boolean;
  slug: string | null;
  form: ConsultorFormFase2;
  /** Setea un campo top-level (section, field). Para nested usar `patchSection`. */
  patchField: (section: keyof ConsultorFormFase2, field: string, value: unknown) => void;
  /** Reemplaza una sección entera. Útil para arrays o updates compuestos. */
  patchSection: <K extends keyof ConsultorFormFase2>(
    section: K,
    value: ConsultorFormFase2[K],
  ) => void;
  status: SaveStatus;
  errorMessage: string | null;
};

const EditingContext = createContext<EditingContextValue>({
  editing: false,
  slug: null,
  form: {},
  patchField: () => {},
  patchSection: () => {},
  status: "idle",
  errorMessage: null,
});

export function useEditing() {
  return useContext(EditingContext);
}

interface ProviderProps {
  editing: boolean;
  slug: string;
  initialForm: ConsultorFormFase2;
  onFormChange?: (form: ConsultorFormFase2) => void;
  children: ReactNode;
}

const DEBOUNCE_MS = 600;

export function EditingProvider({
  editing,
  slug,
  initialForm,
  onFormChange,
  children,
}: ProviderProps) {
  const [form, setForm] = useState<ConsultorFormFase2>(initialForm);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Debug — visible en consola browser para diagnosticar por qué un texto
  // no parece editable. Triggerea solo cuando cambia el flag editing, no
  // en cada render.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[GobernaEdit] EditingProvider editing=%s slug=%s", editing, slug);
  }, [editing, slug]);

  // Re-init si cambia el slug (admin abre otro candidato) o el initialForm
  // (carga inicial completa). NO reseteamos cuando solo editamos.
  const slugRef = useRef(slug);
  useEffect(() => {
    if (slugRef.current !== slug) {
      slugRef.current = slug;
      setForm(initialForm);
      setStatus("idle");
      setErrorMessage(null);
    }
  }, [slug, initialForm]);

  // Un timer por (section,field) para no pisar saves cuando el usuario
  // edita varios campos rápido.
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Send a section-level patch a backend (con debounce a nivel section,
  // así si el user edita 3 fields de la misma sección en 600ms se
  // mandan juntos).
  const scheduleSave = useCallback(
    (section: keyof ConsultorFormFase2, nextForm: ConsultorFormFase2) => {
      const existing = timers.current.get(String(section));
      if (existing) clearTimeout(existing);
      const t = setTimeout(async () => {
        timers.current.delete(String(section));
        setStatus("saving");
        setErrorMessage(null);
        try {
          const patch = { [section]: nextForm[section] } as Partial<ConsultorFormFase2>;
          const result = await onboardingApi.patchFase2Form(slug, patch);
          if (!result) {
            setStatus("error");
            setErrorMessage("No se pudo guardar");
          } else {
            setStatus("saved");
            // Volvemos a idle después de 2s
            setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
          }
        } catch (e) {
          setStatus("error");
          setErrorMessage((e as Error).message);
        }
      }, DEBOUNCE_MS);
      timers.current.set(String(section), t);
    },
    [slug],
  );

  const patchField = useCallback(
    (section: keyof ConsultorFormFase2, field: string, value: unknown) => {
      setForm((prev) => {
        const prevSection = (prev[section] as Record<string, unknown>) ?? {};
        const nextSection = { ...prevSection };
        if (value === undefined || value === null || value === "") {
          delete nextSection[field];
        } else {
          nextSection[field] = value;
        }
        const next = { ...prev, [section]: nextSection } as ConsultorFormFase2;
        onFormChange?.(next);
        scheduleSave(section, next);
        return next;
      });
    },
    [onFormChange, scheduleSave],
  );

  const patchSection = useCallback(
    <K extends keyof ConsultorFormFase2>(section: K, value: ConsultorFormFase2[K]) => {
      setForm((prev) => {
        const next = { ...prev, [section]: value } as ConsultorFormFase2;
        onFormChange?.(next);
        scheduleSave(section, next);
        return next;
      });
    },
    [onFormChange, scheduleSave],
  );

  return (
    <EditingContext.Provider
      value={{
        editing,
        slug,
        form,
        patchField,
        patchSection,
        status,
        errorMessage,
      }}
    >
      {children}
    </EditingContext.Provider>
  );
}
