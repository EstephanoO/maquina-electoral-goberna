"use client";

import type { ConsultorFormFase2, SocialHandles } from "@/lib/onboarding-api";

import { Field, TextInput, Textarea, RadioGroup } from "../form-fields";

type PresenciaDigital = NonNullable<ConsultorFormFase2["presencia_digital"]>;

interface Props {
  presencia: PresenciaDigital;
  redes: SocialHandles;
  onChangePresencia: (v: PresenciaDigital) => void;
  onChangeRedes: (v: SocialHandles) => void;
}

const ESTADO_OPTIONS = [
  { value: "ok",     label: "Bueno" },
  { value: "review", label: "A revisar" },
  { value: "flag",   label: "Crítico" },
];

const ESTADO_FIELDS: Array<{
  key: "web_oficial" | "google_results" | "redes_verificadas" | "info_clave";
  label: string;
}> = [
  { key: "web_oficial",       label: "Web oficial" },
  { key: "google_results",    label: "Resultados en Google" },
  { key: "redes_verificadas", label: "Redes verificadas" },
  { key: "info_clave",        label: "Información clave" },
];

const HANDLE_FIELDS: Array<{
  key: keyof SocialHandles;
  label: string;
  placeholder: string;
}> = [
  { key: "facebook",    label: "Facebook",    placeholder: "https://facebook.com/usuario" },
  { key: "instagram",   label: "Instagram",   placeholder: "https://instagram.com/usuario" },
  { key: "tiktok",      label: "TikTok",      placeholder: "https://tiktok.com/@usuario" },
  { key: "twitter",     label: "Twitter / X", placeholder: "https://x.com/usuario" },
  { key: "youtube",     label: "YouTube",     placeholder: "https://youtube.com/@canal" },
  { key: "web_oficial", label: "Web oficial", placeholder: "https://midominio.pe" },
  { key: "whatsapp",    label: "WhatsApp",    placeholder: "+51 987 654 321" },
];

/**
 * Sección extendida — presencia digital del candidato.
 * Alimenta `consultor_form.presencia_digital` y `consultor_form.redes_sociales.candidato`.
 */
export function SectionPresenciaDigital({
  presencia,
  redes,
  onChangePresencia,
  onChangeRedes,
}: Props) {
  const setPresencia = <K extends keyof PresenciaDigital>(k: K, v: PresenciaDigital[K]) =>
    onChangePresencia({ ...presencia, [k]: v });
  const setRedes = (k: keyof SocialHandles, v: string) =>
    onChangeRedes({ ...redes, [k]: v });

  return (
    <div className="space-y-6">
      {/* Estado de canales digitales */}
      <div className="space-y-4">
        <h3 className="text-xs uppercase tracking-[0.25em] text-amber-400/70 font-bold">
          Estado de canales digitales
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {ESTADO_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <RadioGroup
                value={presencia[f.key] ?? ""}
                onChange={(v) => setPresencia(f.key, v as "ok" | "review" | "flag")}
                options={ESTADO_OPTIONS}
              />
            </Field>
          ))}
        </div>

        <Field label="Notas">
          <Textarea
            value={presencia.notas ?? ""}
            onChange={(v) => setPresencia("notas", v)}
            placeholder="Observaciones sobre los canales digitales del candidato..."
            rows={3}
          />
        </Field>
      </div>

      {/* Handles del candidato */}
      <div className="space-y-4 pt-2">
        <h3 className="text-xs uppercase tracking-[0.25em] text-amber-400/70 font-bold">
          Handles del candidato
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {HANDLE_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <TextInput
                value={redes[f.key] ?? ""}
                onChange={(v) => setRedes(f.key, v)}
                placeholder={f.placeholder}
              />
            </Field>
          ))}
        </div>
      </div>
    </div>
  );
}
