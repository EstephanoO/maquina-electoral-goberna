import { useState } from "react";
import { Send, Save, Sparkles } from "lucide-react";
import { useSegmentPresets, useCampaigns } from "../../hooks/useCampaigns";
import { useToast } from "../../toast";
import { Button } from "../ui";
import { Field, TextInput, TextArea } from "../forms/Field";
import { SegmentPresetGrid } from "./SegmentPresetGrid";
import { SegmentPreviewBox } from "./SegmentPreviewBox";
import type { SegmentPreset } from "../../types/campaign";

type Props = { onCreated?: () => void };

export function CampaignBuilder({ onCreated }: Props) {
  const toast = useToast();
  const presetsQ = useSegmentPresets();
  const { create, materialize } = useCampaigns();

  const [preset, setPreset] = useState<SegmentPreset | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [throttle, setThrottle] = useState(10);

  async function save() {
    if (!preset || !name.trim() || !body.trim()) {
      toast("Nombre, segmento y mensaje son obligatorios", "err"); return;
    }
    try {
      const c = await create.mutateAsync({
        name,
        segment_filter: preset.filter,
        custom_body: body,
        throttle_per_min: throttle,
      } as any);
      await materialize.mutateAsync(c.id);
      toast(`Campaña "${name}" creada con ${c.total_recipients ?? "?"} destinatarios`, "ok");
      setName(""); setBody(""); setPreset(null);
      onCreated?.();
    } catch (e: any) {
      toast(`Error: ${e.message}`, "err");
    }
  }

  return (
    <section className="card p-5 space-y-5">
      <header className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="text-sm font-bold text-slate-800">Nueva campaña</h3>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: segment picker */}
        <div className="space-y-3">
          <Field label="1 · Segmento — a quién enviar">
            {presetsQ.isLoading ? (
              <div className="text-xs text-slate-400 py-4">Cargando segmentos…</div>
            ) : (
              <SegmentPresetGrid
                presets={presetsQ.data ?? []}
                selected={preset}
                onSelect={setPreset}
              />
            )}
          </Field>
        </div>

        {/* Right: preview */}
        <div className="card p-4 bg-slate-50 border-slate-200">
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500 mb-2">
            Preview del segmento
          </div>
          <SegmentPreviewBox filter={preset?.filter ?? null} />
        </div>
      </div>

      {/* Bottom: message + send */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Field label="2 · Nombre interno de la campaña">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Re-engagement VIPs Q2 2026"
          />
        </Field>
        <Field label="Throttle (mensajes / minuto)" hint="Para no bannear el número, recomendado 5-15">
          <TextInput
            type="number" min={1} max={60}
            value={throttle}
            onChange={(e) => setThrottle(Number(e.target.value) || 10)}
          />
        </Field>
      </div>

      <Field label="3 · Mensaje a enviar">
        <TextArea
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Hola 👋\nTe escribo desde Goberna Escuela. Estamos abriendo el nuevo Diploma de…`}
        />
      </Field>

      <footer className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <Button variant="secondary" leftIcon={<Save className="w-4 h-4" />}
                onClick={save} loading={create.isPending || materialize.isPending}
                disabled={!preset || !name.trim() || !body.trim()}>
          Guardar como borrador
        </Button>
      </footer>
    </section>
  );
}
