import { useState, useEffect } from "react";
import {
  Save, Send, ArrowLeft, ArrowRight, Sparkles, Layers,
  MessageSquarePlus, Smartphone, ClipboardCheck,
} from "lucide-react";
import { useSegmentPresets, useCampaigns, usePreviewSegment } from "../../hooks/useCampaigns";
import { useToast } from "../../toast";
import { Button } from "../ui";
import { Field, TextInput, TextArea } from "../forms/Field";
import { StepIndicator } from "./StepIndicator";
import { QuickStartCards, type QuickStart, QUICK_STARTS } from "./QuickStartCards";
import { SegmentPresetGrid } from "./SegmentPresetGrid";
import { SegmentPreviewBox } from "./SegmentPreviewBox";
import { AdvancedFilterBuilder } from "./AdvancedFilterBuilder";
import { TemplatePicker } from "./TemplatePicker";
import { InstancePicker } from "./InstancePicker";
import { PersonalizationPreview } from "./PersonalizationPreview";
import { VariablesHelper } from "./VariablesHelper";
import { SendTimeEstimator } from "./SendTimeEstimator";
import { useBotInstances } from "../../hooks/useConfig";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import type { SegmentPreset } from "../../types/campaign";

type StepKey = "segment" | "message" | "instance" | "review";

type Props = { onCreated?: () => void };

export function CampaignWizard({ onCreated }: Props) {
  const toast = useToast();
  const presetsQ = useSegmentPresets();
  const { create, materialize, launch } = useCampaigns();
  const { instances } = useBotInstances();

  const [step, setStep]               = useState<StepKey>("segment");
  const [mode, setMode]               = useState<"preset" | "advanced">("preset");
  const [preset, setPreset]           = useState<SegmentPreset | null>(null);
  const [advFilter, setAdvFilter]     = useState<any>({ has_phone: true });
  const [name, setName]               = useState("");
  const [hookLine, setHookLine]       = useState("");
  const [templateId, setTemplateId]   = useState<number | null>(null);
  const [templateBody, setTemplateBody] = useState<string>("");
  const [customBody, setCustomBody]   = useState<string>("");
  const [useTemplate, setUseTemplate] = useState(true);
  const [throttle, setThrottle]       = useState(10);
  const [windowStart, setWindowStart] = useState(9);
  const [windowEnd, setWindowEnd]     = useState(19);
  const [botInstanceId, setBotInstanceId] = useState<number | null>(null);

  // Auto-pick the auto_reply ON instance as default
  useEffect(() => {
    if (botInstanceId == null && instances.length > 0) {
      const def = instances.find(i => i.auto_reply && i.enabled) ?? instances.find(i => i.enabled);
      if (def) setBotInstanceId(def.id);
    }
  }, [instances, botInstanceId]);

  const filter = mode === "preset" ? (preset?.filter ?? null) : advFilter;
  const previewQ = usePreviewSegment(filter);
  const finalBody = (hookLine.trim() ? hookLine + "\n\n" : "") + (useTemplate ? templateBody : customBody);

  // Smart defaults: cuando elegís segment, sugerimos nombre auto
  useEffect(() => {
    if (preset && !name) {
      const today = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
      setName(`${preset.name.replace(/^[^\w\s]+\s/, "")} · ${today}`);
    }
  }, [preset]);  // eslint-disable-line

  function applyQuickStart(qs: QuickStart) {
    const p = (presetsQ.data ?? []).find(x => x.slug === qs.presetSlug);
    if (!p) return;
    setMode("preset");
    setPreset(p);
    setHookLine(qs.suggestedHook);
    if (qs.suggestedTemplate) {
      // Buscar template by name
      api.get<any[]>("/templates").then(list => {
        const t = list.find(x => x.name === qs.suggestedTemplate);
        if (t) { setTemplateId(t.id); setTemplateBody(t.body); }
      });
    }
    setStep("message");
  }

  // Validation per step
  const stepValid: Record<StepKey, boolean> = {
    segment:  filter != null && (previewQ.data?.total ?? 0) > 0,
    message:  finalBody.trim().length > 0 || templateId != null,
    instance: botInstanceId != null,
    review:   name.trim().length > 0,
  };

  const STEPS = [
    { key: "segment"  as const, label: "Segmento",  done: stepValid.segment },
    { key: "message"  as const, label: "Mensaje",   done: stepValid.message },
    { key: "instance" as const, label: "Celular",   done: stepValid.instance },
    { key: "review"   as const, label: "Revisar",   done: stepValid.review },
  ];

  function next() {
    const i = STEPS.findIndex(s => s.key === step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1].key);
  }
  function prev() {
    const i = STEPS.findIndex(s => s.key === step);
    if (i > 0) setStep(STEPS[i - 1].key);
  }

  async function save(launchAfter: boolean) {
    if (!name.trim())  { toast("Nombre obligatorio", "err"); return; }
    if (!filter)       { toast("Elegí un segmento", "err"); return; }
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
      toast(`Creada · ${m.total_recipients} destinatarios`, "ok");
      if (launchAfter) { await launch.mutateAsync(c.id); toast("Lanzando 🚀", "ok"); }
      // Reset
      setStep("segment"); setName(""); setHookLine(""); setCustomBody("");
      setPreset(null); setTemplateId(null); setTemplateBody("");
      onCreated?.();
    } catch (e: any) {
      toast(`Error: ${e.message}`, "err");
    }
  }

  return (
    <section className="card p-0 overflow-hidden">
      {/* Header */}
      <header className="px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 tracking-tight">
          <Sparkles className="w-4 h-4 text-amber-500" />
          Crear nueva campaña
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">Goberna Escuela · enviado vía p4 (Kathy)</p>
      </header>

      {/* Step indicator */}
      <div className="px-5 py-4 border-b border-slate-100 bg-white">
        <StepIndicator steps={STEPS} current={step} onJump={(k) => setStep(k as StepKey)} />
      </div>

      {/* STEP CONTENT */}
      <div className="p-5 min-h-[400px] animate-fade-in" key={step}>
        {step === "segment"  && <SegmentStep
          mode={mode} setMode={setMode}
          preset={preset} setPreset={setPreset}
          advFilter={advFilter} setAdvFilter={setAdvFilter}
          presets={presetsQ.data ?? []}
          filter={filter}
          onQuickStart={applyQuickStart}
        />}
        {step === "message"  && <MessageStep
          hookLine={hookLine} setHookLine={setHookLine}
          useTemplate={useTemplate} setUseTemplate={setUseTemplate}
          templateId={templateId}
          setTemplate={(id: number | null, b: string) => { setTemplateId(id); setTemplateBody(b); }}
          customBody={customBody} setCustomBody={setCustomBody}
          finalBody={finalBody} filter={filter}
        />}
        {step === "instance" && <InstanceStep
          value={botInstanceId} onChange={setBotInstanceId}
        />}
        {step === "review"   && <ReviewStep
          name={name} setName={setName}
          throttle={throttle} setThrottle={setThrottle}
          windowStart={windowStart} setWindowStart={setWindowStart}
          windowEnd={windowEnd} setWindowEnd={setWindowEnd}
          recipientCount={previewQ.data?.total ?? 0}
          finalBody={finalBody}
          instance={instances.find(i => i.id === botInstanceId) ?? null}
          preset={preset}
        />}
      </div>

      {/* Footer with nav */}
      <footer className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
        <Button variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />}
                onClick={prev}
                disabled={step === "segment"}>
          Atrás
        </Button>

        <div className="text-[11px] text-slate-500">
          Paso {STEPS.findIndex(s => s.key === step) + 1} de {STEPS.length}
        </div>

        {step === "review" ? (
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
        ) : (
          <Button rightIcon={<ArrowRight className="w-4 h-4" />}
                  onClick={next}
                  disabled={!stepValid[step]}>
            Continuar
          </Button>
        )}
      </footer>
    </section>
  );
}

// ─── STEP COMPONENTS ───────────────────────────────────────────────

function SegmentStep({
  mode, setMode, preset, setPreset, advFilter, setAdvFilter,
  presets, filter, onQuickStart,
}: any) {
  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {!preset && mode === "preset" && (
        <QuickStartCards onPick={onQuickStart} />
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" />
            ¿A quiénes querés enviar?
          </label>
          <div className="flex gap-1">
            <ModeBtn active={mode === "preset"}    onClick={() => setMode("preset")}    label="Preset" />
            <ModeBtn active={mode === "advanced"} onClick={() => setMode("advanced")} label="Filtro custom" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
          <div>
            {mode === "preset" ? (
              <SegmentPresetGrid presets={presets} selected={preset} onSelect={setPreset} />
            ) : (
              <AdvancedFilterBuilder value={advFilter} onChange={setAdvFilter} />
            )}
          </div>
          <div className="card p-4 bg-slate-50 self-start">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-2">
              Preview del segmento
            </div>
            <SegmentPreviewBox filter={filter} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageStep({ hookLine, setHookLine, useTemplate, setUseTemplate,
                      templateId, setTemplate, customBody, setCustomBody,
                      finalBody, filter }: any) {
  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <MessageSquarePlus className="w-4 h-4 text-slate-500" />
        <h4 className="text-sm font-semibold text-slate-800">Componé el mensaje</h4>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Field label="Gancho de apertura (opcional, va antes del template)">
            <TextArea
              rows={2}
              value={hookLine}
              onChange={(e) => setHookLine(e.target.value)}
              placeholder="Hola {{nombre}} 👋 Te escribo porque…"
            />
          </Field>

          <Field label="Cuerpo del mensaje">
            <div className="flex gap-1.5 mb-2">
              <ModeBtn active={useTemplate}  onClick={() => setUseTemplate(true)}  label="Template" />
              <ModeBtn active={!useTemplate} onClick={() => setUseTemplate(false)} label="Texto custom" />
            </div>

            {useTemplate ? (
              <TemplatePicker
                selectedId={templateId}
                onChange={(id, tpl) => setTemplate(id, tpl?.body ?? "")}
              />
            ) : (
              <>
                <TextArea
                  rows={6}
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                  placeholder="Escribí o pegá el mensaje. Variables disponibles abajo."
                />
                <div className="mt-2"><VariablesHelper /></div>
              </>
            )}
          </Field>
        </div>

        <div className="space-y-3 self-start">
          {finalBody.trim() && filter ? (
            <PersonalizationPreview filter={filter} body={finalBody} />
          ) : (
            <div className="card p-4 bg-slate-50 text-xs text-slate-400 italic text-center py-8">
              {!filter ? "Volvé al paso 1 a elegir segmento" :
               "Escribí o seleccioná template para ver preview personalizado"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InstanceStep({ value, onChange }: any) {
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-slate-500" />
        <h4 className="text-sm font-semibold text-slate-800">¿Desde qué celular se envían?</h4>
      </div>
      <p className="text-xs text-slate-500">
        Recomendado: la instancia que tiene auto-reply ON (Kathy / p4).
      </p>
      <InstancePicker value={value} onChange={onChange} />
    </div>
  );
}

function ReviewStep({ name, setName, throttle, setThrottle, windowStart, setWindowStart,
                     windowEnd, setWindowEnd, recipientCount, finalBody, instance, preset }: any) {
  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-slate-500" />
        <h4 className="text-sm font-semibold text-slate-800">Revisar y confirmar</h4>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Field label="Nombre interno (auto-generado, podés editarlo)">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Re-engagement Q2" />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Throttle">
              <TextInput type="number" min={1} max={60} value={throttle}
                         onChange={(e) => setThrottle(Number(e.target.value) || 10)} />
            </Field>
            <Field label="Inicio (h)">
              <TextInput type="number" min={0} max={23} value={windowStart}
                         onChange={(e) => setWindowStart(Number(e.target.value) || 9)} />
            </Field>
            <Field label="Fin (h)">
              <TextInput type="number" min={0} max={23} value={windowEnd}
                         onChange={(e) => setWindowEnd(Number(e.target.value) || 19)} />
            </Field>
          </div>

          <SendTimeEstimator
            recipients={recipientCount}
            throttle={throttle}
            windowStart={windowStart}
            windowEnd={windowEnd}
          />
        </div>

        <div className="card p-4 bg-slate-50 space-y-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
            Resumen
          </div>
          <SummaryRow label="Segmento"       value={preset?.name ?? "Filtro custom"} />
          <SummaryRow label="Destinatarios"  value={recipientCount.toLocaleString()} highlight />
          <SummaryRow label="Enviado por"    value={instance ? `${instance.slug.toUpperCase()} · ${instance.agent_name}` : "—"} />
          <SummaryRow label="Throttle"       value={`${throttle} msj/min`} />
          <SummaryRow label="Ventana"        value={`${windowStart}:00 – ${windowEnd}:00`} />

          <div className="pt-2 border-t border-slate-200">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
              Mensaje final
            </div>
            <pre className="bg-white border border-slate-200 rounded p-2 text-[11px] whitespace-pre-wrap font-sans max-h-32 overflow-y-auto">
              {finalBody.trim() || <span className="text-slate-400 italic">vacío</span>}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-slate-500">{label}:</span>
      <span className={highlight ? "font-bold text-emerald-700 text-sm tabular-nums" : "font-medium text-slate-800 truncate ml-2"}>
        {value}
      </span>
    </div>
  );
}

export { QUICK_STARTS };
