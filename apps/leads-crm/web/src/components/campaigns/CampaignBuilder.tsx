import { useState } from "react";
import { Save, Sparkles, Layers, Filter as FilterIcon, MessageSquarePlus, Send, Smartphone } from "lucide-react";
import { useSegmentPresets, useCampaigns, usePreviewSegment } from "../../hooks/useCampaigns";
import { useToast } from "../../toast";
import { Button } from "../ui";
import { Field, TextInput, TextArea } from "../forms/Field";
import { SegmentPresetGrid } from "./SegmentPresetGrid";
import { SegmentPreviewBox } from "./SegmentPreviewBox";
import { AdvancedFilterBuilder } from "./AdvancedFilterBuilder";
import { TemplatePicker } from "./TemplatePicker";
import { InstancePicker } from "./InstancePicker";
import { PersonalizationPreview } from "./PersonalizationPreview";
import { VariablesHelper } from "./VariablesHelper";
import { SendTimeEstimator } from "./SendTimeEstimator";
import type { SegmentPreset } from "../../types/campaign";

type Mode = "preset" | "advanced";

type Props = { onCreated?: () => void };

export function CampaignBuilder({ onCreated }: Props) {
  const toast = useToast();
  const presetsQ = useSegmentPresets();
  const { create, materialize, launch } = useCampaigns();

  const [mode, setMode] = useState<Mode>("preset");
  const [preset, setPreset] = useState<SegmentPreset | null>(null);
  const [advFilter, setAdvFilter] = useState<any>({ has_phone: true });
  const filter = mode === "preset" ? (preset?.filter ?? null) : advFilter;
  const previewQ = usePreviewSegment(filter);

  const [name, setName]                 = useState("");
  const [hookLine, setHookLine]         = useState("");
  const [templateId, setTemplateId]     = useState<number | null>(null);
  const [templateBody, setTemplateBody] = useState<string>("");
  const [customBody, setCustomBody]     = useState<string>("");
  const [useTemplate, setUseTemplate]   = useState(true);

  const [throttle, setThrottle]   = useState(10);
  const [windowStart, setWindowStart] = useState(9);
  const [windowEnd, setWindowEnd]     = useState(19);
  const [botInstanceId, setBotInstanceId] = useState<number | null>(null);

  const finalBody = (hookLine.trim() ? hookLine + "\n\n" : "") + (useTemplate ? templateBody : customBody);

  async function save(launchAfter: boolean) {
    if (!filter)             { toast("Elegí un segmento", "err"); return; }
    if (!name.trim())        { toast("Nombre obligatorio", "err"); return; }
    if (!finalBody.trim() && !templateId) { toast("Mensaje obligatorio", "err"); return; }

    try {
      const c = await create.mutateAsync({
        name,
        segment_filter: filter,
        template_id: useTemplate ? templateId : null,
        custom_body: useTemplate ? null : finalBody,
        throttle_per_min: throttle,
        window_start_hr: windowStart,
        window_end_hr: windowEnd,
        bot_instance_id: botInstanceId,
      } as any);
      const m = await materialize.mutateAsync(c.id);
      toast(`Campaña creada · ${m.total_recipients} destinatarios`, "ok");
      if (launchAfter) {
        await launch.mutateAsync(c.id);
        toast("Lanzando ahora 🚀", "ok");
      }
      setName(""); setHookLine(""); setCustomBody("");
      setPreset(null); setTemplateId(null); setTemplateBody("");
      onCreated?.();
    } catch (e: any) {
      toast(`Error: ${e.message}`, "err");
    }
  }

  return (
    <section className="card p-5 space-y-5">
      <header>
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          Nueva campaña — Goberna Escuela / p4
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Elegí segmento + template + gancho. Throttled vía Kathy.
        </p>
      </header>

      <Step n={1} title="Segmento — ¿a quién enviar?" icon={Layers}>
        <div className="flex gap-2 mb-3">
          <ModeButton current={mode} value="preset"   onClick={() => setMode("preset")}   label="Preset rápido" />
          <ModeButton current={mode} value="advanced" onClick={() => setMode("advanced")} label="Filtro custom" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            {mode === "preset" ? (
              presetsQ.isLoading ? <div className="text-xs text-slate-400 py-4">Cargando…</div> :
              <SegmentPresetGrid presets={presetsQ.data ?? []} selected={preset} onSelect={setPreset} />
            ) : (
              <AdvancedFilterBuilder value={advFilter} onChange={setAdvFilter} />
            )}
          </div>
          <div className="card p-4 bg-slate-50 border-slate-200 self-start">
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500 mb-2">Preview del segmento</div>
            <SegmentPreviewBox filter={filter} />
          </div>
        </div>
      </Step>

      <Step n={2} title="Template + gancho personalizable" icon={MessageSquarePlus}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Field label="Gancho de apertura (opcional, va antes del template)">
              <TextArea
                rows={2}
                value={hookLine}
                onChange={(e) => setHookLine(e.target.value)}
                placeholder="Hola 👋 Te escribo porque pensaba en vos…"
              />
            </Field>

            <Field label="Cuerpo del mensaje">
              <div className="flex gap-2 mb-2">
                <ModeButton current={useTemplate ? "tpl" : "custom"} value="tpl"    onClick={() => setUseTemplate(true)}  label="Usar template" />
                <ModeButton current={useTemplate ? "tpl" : "custom"} value="custom" onClick={() => setUseTemplate(false)} label="Texto custom" />
              </div>

              {useTemplate ? (
                <TemplatePicker
                  selectedId={templateId}
                  onChange={(id, tpl) => { setTemplateId(id); setTemplateBody(tpl?.body ?? ""); }}
                />
              ) : (
                <>
                  <TextArea
                    rows={6}
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    placeholder="Escribí el mensaje. Hacé click abajo para insertar variables ↓"
                  />
                  <div className="mt-2">
                    <VariablesHelper />
                  </div>
                </>
              )}
            </Field>
          </div>

          <div className="space-y-3 self-start">
            <div className="card p-4 bg-slate-50 border-slate-200">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500 mb-2">Preview del mensaje raw</div>
              <div className="bg-white rounded-lg border border-slate-200 p-3 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs font-mono">
                {finalBody.trim() || <span className="text-slate-400 italic font-sans">Escribí o seleccioná template…</span>}
              </div>
              <div className="text-[10px] text-slate-400 mt-2">
                {finalBody.length} caracteres
                {finalBody.length > 1000 && <span className="text-amber-600 ml-2">⚠ muy largo</span>}
              </div>
            </div>

            {finalBody.trim() && filter && (
              <PersonalizationPreview filter={filter} body={finalBody} />
            )}
          </div>
        </div>
      </Step>

      <Step n={3} title="Celular que envía" icon={Smartphone}>
        <p className="text-xs text-slate-500 mb-3">
          Elegí desde qué instancia del bot se enviarán los mensajes. Recomendado: la que tiene auto-reply ON.
        </p>
        <InstancePicker value={botInstanceId} onChange={setBotInstanceId} />
      </Step>

      <Step n={4} title="Configuración + estimador" icon={FilterIcon}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="grid grid-cols-2 gap-3 self-start">
            <Field label="Nombre interno">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Re-engagement Q2" />
            </Field>
            <Field label="Throttle (msj/min)" hint="5-15 recomendado">
              <TextInput type="number" min={1} max={60} value={throttle}
                         onChange={(e) => setThrottle(Number(e.target.value) || 10)} />
            </Field>
            <Field label="Ventana inicio (hora)">
              <TextInput type="number" min={0} max={23} value={windowStart}
                         onChange={(e) => setWindowStart(Number(e.target.value) || 9)} />
            </Field>
            <Field label="Ventana fin (hora)">
              <TextInput type="number" min={0} max={23} value={windowEnd}
                         onChange={(e) => setWindowEnd(Number(e.target.value) || 19)} />
            </Field>
          </div>

          <SendTimeEstimator
            recipients={previewQ.data?.total ?? 0}
            throttle={throttle}
            windowStart={windowStart}
            windowEnd={windowEnd}
          />
        </div>
      </Step>

      <footer className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
        <div className="text-xs text-slate-500">
          {previewQ.data ? (
            <span>Listos para alcanzar <span className="font-bold text-slate-800">{previewQ.data.total.toLocaleString()}</span> leads</span>
          ) : "Elegí segmento para ver alcance"}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" leftIcon={<Save className="w-4 h-4" />}
                  loading={create.isPending && !launch.isPending}
                  onClick={() => save(false)}>
            Guardar borrador
          </Button>
          <Button leftIcon={<Send className="w-4 h-4" />}
                  loading={launch.isPending}
                  onClick={() => save(true)}>
            Lanzar ahora
          </Button>
        </div>
      </footer>
    </section>
  );
}

function Step({ n, title, icon: Icon, children }: {
  n: number; title: string; icon: any; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-[#1B365D] text-white text-[10px] font-bold flex items-center justify-center">{n}</span>
        <Icon className="w-4 h-4 text-slate-500" />
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      </div>
      <div className="pl-8">{children}</div>
    </div>
  );
}

function ModeButton({ current, value, onClick, label }: { current: string; value: string; onClick: () => void; label: string }) {
  const active = current === value;
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-xs font-medium transition ${
        active ? "bg-[#1B365D] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
