"use client";

import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

import { Field, Textarea, TagList } from "../form-fields";

type QuienEs = NonNullable<ConsultorFormFase2["quien_es"]>;

interface Props {
  data: QuienEs;
  onChange: (v: QuienEs) => void;
}

/**
 * Sección extendida — narrativa "¿Quién es el candidato?".
 * Alimenta el campo top-level `consultor_form.quien_es`.
 */
export function SectionQuienEs({ data, onChange }: Props) {
  const set = <K extends keyof QuienEs>(k: K, v: QuienEs[K]) =>
    onChange({ ...data, [k]: v });

  return (
    <div className="space-y-6">
      <Field label="Narrativa libre — ¿quién es?">
        <Textarea
          value={data.texto_libre ?? ""}
          onChange={(v) => set("texto_libre", v)}
          placeholder="Texto que va a aparecer en la slide 'Quién Es' del deck..."
          rows={6}
        />
      </Field>

      <Field label="Trayectoria">
        <Textarea
          value={data.trayectoria ?? ""}
          onChange={(v) => set("trayectoria", v)}
          placeholder="Carrera profesional y política, hitos relevantes..."
          rows={4}
        />
      </Field>

      <Field label="Valores principales">
        <TagList
          items={data.valores ?? []}
          onChange={(v) => set("valores", v)}
          placeholder="Ej: Justicia social, descentralización..."
          minItems={0}
        />
      </Field>
    </div>
  );
}
