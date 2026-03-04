"use client";

import { useState, useRef, type CSSProperties, type ReactNode } from "react";
import { FONT_STACK } from "@/lib/constants";
import { createVoluntario, type CreateVoluntarioInput, type RangoEdad } from "@/lib/services";
import type { CandidatePublic } from "@/lib/types";
import { DEPARTAMENTO_OPTIONS } from "./peru-geo";

// ── Brand tokens ─────────────────────────────────────────────────────
const C = {
  blue: "#163960",
  blueMid: "rgb(22, 57, 96)",
  blueDark: "rgb(14, 38, 64)",
  blueLight: "rgb(30, 70, 115)",
  gold: "#FFC800",
  goldDim: "rgba(255,200,0,0.12)",
  goldBorder: "rgba(255,200,0,0.25)",
  goldShadow: "rgba(255,200,0,0.3)",
  white: "#ffffff",
  whiteHigh: "rgba(255,255,255,0.9)",
  whiteMid: "rgba(255,255,255,0.6)",
  whiteLow: "rgba(255,255,255,0.25)",
  whiteGhost: "rgba(255,255,255,0.06)",
  whiteGhostBorder: "rgba(255,255,255,0.12)",
  error: "#f87171",
  errorBg: "rgba(239,68,68,0.1)",
  errorBorder: "rgba(239,68,68,0.3)",
} as const;

// ── Steps config ─────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Tus datos",   hint: "Quién eres tú" },
  { id: 2, label: "Tu zona",    hint: "Dónde estás" },
  { id: 3, label: "Tu campaña", hint: "A quién apoyas" },
] as const;

const RANGOS: { value: RangoEdad; label: string; sub: string }[] = [
  { value: "18-25", label: "18 – 25", sub: "años" },
  { value: "26-35", label: "26 – 35", sub: "años" },
  { value: "36-45", label: "36 – 45", sub: "años" },
];

// ── Form state ────────────────────────────────────────────────────────
type FormState = {
  nombre_completo: string;
  telefono: string;
  departamento: string;
  provincia: string;
  distrito: string;
  rango_edad: RangoEdad | "";
  candidato_slug: string;
};
type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL: FormState = {
  nombre_completo: "",
  telefono: "",
  departamento: "",
  provincia: "",
  distrito: "",
  rango_edad: "",
  candidato_slug: "",
};

// ── Tiny style helpers ────────────────────────────────────────────────
const label = (extra?: CSSProperties): CSSProperties => ({
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: C.whiteMid,
  marginBottom: 8,
  fontFamily: FONT_STACK,
  textTransform: "uppercase",
  ...extra,
});

const input = (hasError = false, extraStyle?: CSSProperties): CSSProperties => ({
  width: "100%",
  padding: "13px 16px",
  fontSize: 15,
  fontFamily: FONT_STACK,
  fontWeight: 500,
  border: `1.5px solid ${hasError ? C.error : C.whiteGhostBorder}`,
  borderRadius: 10,
  background: hasError ? C.errorBg : C.whiteGhost,
  color: C.white,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
  ...extraStyle,
});

// ── Main Component ────────────────────────────────────────────────────
export function VoluntarioForm({ candidates }: { candidates: CandidatePublic[] }) {
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const [animating, setAnimating] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  function set(key: keyof FormState, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  }

  function validateStep(s: number): FormErrors {
    const e: FormErrors = {};
    if (s === 1) {
      if (!form.nombre_completo.trim() || form.nombre_completo.trim().length < 2)
        e.nombre_completo = "Ingresa tu nombre completo";
      const tel = form.telefono.trim();
      if (!tel || tel.length < 7) e.telefono = "Número inválido";
      else if (!/^[0-9+\s\-()]+$/.test(tel)) e.telefono = "Solo números, +, espacios y guiones";
    }
    if (s === 2) {
      if (!form.departamento) e.departamento = "Selecciona un departamento";
      if (!form.provincia.trim()) e.provincia = "Ingresa tu provincia";
      if (!form.distrito.trim()) e.distrito = "Ingresa tu distrito";
      if (!form.rango_edad) e.rango_edad = "Selecciona tu rango";
    }
    return e;
  }

  function navigate(nextStep: number, direction: "forward" | "back") {
    if (animating) return;
    setDir(direction);
    setAnimating(true);
    setTimeout(() => {
      setStep(nextStep);
      setAnimating(false);
    }, 220);
  }

  function goNext() {
    const e = validateStep(step);
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setErrors({});
    navigate(step + 1, "forward");
  }

  function goBack() {
    setErrors({});
    navigate(step - 1, "back");
  }

  async function handleSubmit() {
    if (status === "loading") return;
    setStatus("loading");
    setServerError(null);

    const res = await createVoluntario({
      nombre_completo: form.nombre_completo.trim(),
      telefono: form.telefono.trim(),
      departamento: form.departamento,
      provincia: form.provincia.trim(),
      distrito: form.distrito.trim(),
      rango_edad: form.rango_edad as RangoEdad,
      ...(form.candidato_slug ? { candidato_slug: form.candidato_slug } : {}),
    } satisfies CreateVoluntarioInput);

    if (res.ok) {
      setStatus("success");
    } else {
      setStatus("error");
      setServerError(res.error?.message ?? "Error inesperado. Inténtalo de nuevo.");
    }
  }

  if (status === "success") return <SuccessState name={form.nombre_completo.split(" ")[0]} />;

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div style={{ fontFamily: FONT_STACK }}>
      {/* ── Keyframes injection ── */}
      <style>{`
        @keyframes vf-slide-forward {
          from { opacity: 0; transform: translateX(28px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes vf-slide-back {
          from { opacity: 0; transform: translateX(-28px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes vf-exit-forward {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(-20px); }
        }
        @keyframes vf-exit-back {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(20px); }
        }
        .vf-input:focus {
          border-color: ${C.gold} !important;
          box-shadow: 0 0 0 3px ${C.goldShadow}22 !important;
        }
        .vf-pill:hover {
          border-color: rgba(255,200,0,0.5) !important;
          background: rgba(255,200,0,0.07) !important;
        }
        .vf-candidate:hover {
          border-color: ${C.goldBorder} !important;
          background: rgba(255,200,0,0.06) !important;
        }
        .vf-btn-primary:hover:not(:disabled) {
          box-shadow: 0 6px 28px ${C.goldShadow} !important;
          transform: translateY(-1px) !important;
        }
        .vf-btn-primary:active:not(:disabled) {
          transform: translateY(0) !important;
        }
        .vf-btn-ghost:hover {
          background: rgba(255,255,255,0.08) !important;
        }
        .vf-select option { background: #163960; color: #fff; }
      `}</style>

      {/* ── Step indicator ── */}
      <div style={{ marginBottom: 32 }}>
        {/* Dots + labels */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, position: "relative" }}>
                {/* Connector line */}
                {i > 0 && (
                  <div style={{
                    position: "absolute",
                    top: 15,
                    right: "50%",
                    width: "100%",
                    height: 1.5,
                    background: done || active ? `linear-gradient(90deg, ${C.gold}, ${done ? C.gold : C.whiteGhostBorder})` : C.whiteGhostBorder,
                    transition: "background 0.4s ease",
                    zIndex: 0,
                  }} />
                )}
                {/* Dot */}
                <div style={{
                  position: "relative",
                  zIndex: 1,
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  border: `2px solid ${active ? C.gold : done ? C.gold : C.whiteGhostBorder}`,
                  background: done ? C.gold : active ? C.goldDim : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.3s ease",
                  boxShadow: active ? `0 0 0 5px ${C.goldShadow}22` : "none",
                }}>
                  {done ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.blueDark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 800, color: active ? C.gold : C.whiteLow }}>{s.id}</span>
                  )}
                </div>
                {/* Label */}
                <span style={{
                  marginTop: 6,
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  color: active ? C.gold : done ? C.whiteMid : C.whiteLow,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  transition: "color 0.3s ease",
                  whiteSpace: "nowrap",
                }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, borderRadius: 99, background: C.whiteGhostBorder, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${C.gold}, #FFE066)`,
            borderRadius: 99,
            transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: `0 0 10px ${C.goldShadow}`,
          }} />
        </div>
      </div>

      {/* ── Step content ── */}
      <div
        ref={contentRef}
        style={{
          animation: animating
            ? `vf-exit-${dir} 0.18s ease forwards`
            : `vf-slide-${dir} 0.22s ease forwards`,
          minHeight: 280,
        }}
      >
        {step === 1 && (
          <StepOne form={form} errors={errors} set={set} />
        )}
        {step === 2 && (
          <StepTwo form={form} errors={errors} set={set} />
        )}
        {step === 3 && (
          <StepThree
            form={form}
            errors={errors}
            set={set}
            candidates={candidates}
            serverError={serverError}
            status={status}
          />
        )}
      </div>

      {/* ── Navigation ── */}
      <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
        {step > 1 && (
          <button
            onClick={goBack}
            className="vf-btn-ghost"
            style={{
              flex: "0 0 auto",
              padding: "13px 20px",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: FONT_STACK,
              color: C.whiteMid,
              background: "transparent",
              border: `1.5px solid ${C.whiteGhostBorder}`,
              borderRadius: 10,
              cursor: "pointer",
              transition: "background 0.18s ease",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Atrás
          </button>
        )}

        {step < 3 ? (
          <button
            onClick={goNext}
            className="vf-btn-primary"
            style={{
              flex: 1,
              padding: "14px 24px",
              fontSize: 15,
              fontWeight: 700,
              fontFamily: FONT_STACK,
              color: C.blueDark,
              background: C.gold,
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              transition: "box-shadow 0.2s ease, transform 0.15s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              letterSpacing: 0.2,
            }}
          >
            Continuar
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={status === "loading"}
            className="vf-btn-primary"
            style={{
              flex: 1,
              padding: "14px 24px",
              fontSize: 15,
              fontWeight: 700,
              fontFamily: FONT_STACK,
              color: status === "loading" ? C.whiteMid : C.blueDark,
              background: status === "loading" ? "rgba(255,200,0,0.4)" : C.gold,
              border: "none",
              borderRadius: 10,
              cursor: status === "loading" ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              letterSpacing: 0.2,
            }}
          >
            {status === "loading" ? (
              <>
                <Spinner />
                Enviando...
              </>
            ) : (
              <>
                Quiero ser voluntario
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
        )}
      </div>

      {/* Step hint */}
      <p style={{ textAlign: "center", fontSize: 12, color: C.whiteLow, marginTop: 16, fontFamily: FONT_STACK }}>
        Paso {step} de {STEPS.length} — {STEPS[step - 1].hint}
      </p>
    </div>
  );
}

// ── Step 1: Identidad ─────────────────────────────────────────────────
function StepOne({ form, errors, set }: {
  form: FormState; errors: FormErrors;
  set: (k: keyof FormState, v: string) => void;
}) {
  return (
    <div>
      <StepHeader
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        }
        title="¿Quién eres?"
        subtitle="Tu información de contacto para que el equipo pueda ubicarte."
      />

      <Field label="Nombre completo" error={errors.nombre_completo} required>
        <input
          id="nombre_completo"
          className="vf-input"
          type="text"
          placeholder="Ej. Juan Carlos Pérez López"
          value={form.nombre_completo}
          onChange={(e) => set("nombre_completo", e.target.value)}
          style={input(!!errors.nombre_completo)}
          autoComplete="name"
          autoFocus
        />
      </Field>

      <Field label="Número de teléfono" error={errors.telefono} required>
        <input
          id="telefono"
          className="vf-input"
          type="tel"
          placeholder="Ej. 987 654 321"
          value={form.telefono}
          onChange={(e) => set("telefono", e.target.value)}
          style={input(!!errors.telefono)}
          autoComplete="tel"
        />
      </Field>
    </div>
  );
}

// ── Step 2: Ubicación + Edad ──────────────────────────────────────────
function StepTwo({ form, errors, set }: {
  form: FormState; errors: FormErrors;
  set: (k: keyof FormState, v: string) => void;
}) {
  return (
    <div>
      <StepHeader
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        }
        title="¿Dónde estás?"
        subtitle="Tu zona nos ayuda a asignarte al equipo más cercano."
      />

      <Field label="Departamento" error={errors.departamento} required>
        <select
          id="departamento"
          className="vf-input vf-select"
          value={form.departamento}
          onChange={(e) => set("departamento", e.target.value)}
          style={{
            ...input(!!errors.departamento),
            color: form.departamento ? C.white : C.whiteLow,
          }}
        >
          <option value="">Seleccionar departamento</option>
          {DEPARTAMENTO_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Provincia" error={errors.provincia} required>
          <input
            className="vf-input"
            type="text"
            placeholder="Ej. Lima"
            value={form.provincia}
            onChange={(e) => set("provincia", e.target.value)}
            style={input(!!errors.provincia)}
          />
        </Field>
        <Field label="Distrito" error={errors.distrito} required>
          <input
            className="vf-input"
            type="text"
            placeholder="Ej. San Isidro"
            value={form.distrito}
            onChange={(e) => set("distrito", e.target.value)}
            style={input(!!errors.distrito)}
          />
        </Field>
      </div>

      {/* Rango de edad — cards visuales */}
      <div style={{ marginTop: 8 }}>
        <p style={label({ marginBottom: 12 })}>Rango de edad *</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {RANGOS.map((r) => {
            const active = form.rango_edad === r.value;
            return (
              <label
                key={r.value}
                className="vf-pill"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "14px 10px",
                  borderRadius: 12,
                  border: `2px solid ${active ? C.gold : C.whiteGhostBorder}`,
                  background: active ? C.goldDim : C.whiteGhost,
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                  boxShadow: active ? `0 0 0 4px ${C.goldShadow}22` : "none",
                  userSelect: "none",
                }}
              >
                <input
                  type="radio"
                  name="rango_edad"
                  value={r.value}
                  checked={active}
                  onChange={() => set("rango_edad", r.value)}
                  style={{ display: "none" }}
                  aria-label={`${r.label} ${r.sub}`}
                />
                <span style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: active ? C.gold : C.whiteHigh,
                  fontFamily: FONT_STACK,
                  lineHeight: 1,
                }}>
                  {r.label}
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: active ? C.gold : C.whiteLow,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginTop: 4,
                }}>
                  {r.sub}
                </span>
              </label>
            );
          })}
        </div>
        {errors.rango_edad && (
          <p style={{ fontSize: 11, color: C.error, marginTop: 8, fontFamily: FONT_STACK }}>
            {errors.rango_edad}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Step 3: Candidato + Confirmación ─────────────────────────────────
function StepThree({ form, errors, set, candidates, serverError, status }: {
  form: FormState; errors: FormErrors;
  set: (k: keyof FormState, v: string) => void;
  candidates: CandidatePublic[];
  serverError: string | null;
  status: string;
}) {
  return (
    <div>
      <StepHeader
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        }
        title="Casi listo"
        subtitle="Confirma a qué candidato quieres apoyar y envía tu registro."
      />

      {/* Summary card */}
      <div style={{
        padding: "16px 18px",
        borderRadius: 12,
        background: "rgba(255,200,0,0.05)",
        border: `1px solid ${C.goldBorder}`,
        marginBottom: 20,
      }}>
        <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: C.gold, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Tu registro
        </p>
        <SummaryRow icon="👤" label="Nombre" value={form.nombre_completo || "—"} />
        <SummaryRow icon="📞" label="Teléfono" value={form.telefono || "—"} />
        <SummaryRow icon="📍" label="Ubicación" value={[form.distrito, form.provincia, form.departamento].filter(Boolean).join(", ") || "—"} />
        <SummaryRow icon="🎂" label="Edad" value={form.rango_edad ? `${form.rango_edad} años` : "—"} last />
      </div>

      {/* Candidato selector */}
      {candidates.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={label({ marginBottom: 12 })}>¿A qué candidato apoyas?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
            {/* Ninguno opción */}
            <CandidatoCard
              label="Sin preferencia"
              sub="Decide más tarde"
              active={form.candidato_slug === ""}
              onClick={() => set("candidato_slug", "")}
            />
            {candidates.map((c) => (
              <CandidatoCard
                key={c.slug}
                label={c.name}
                sub={[c.cargo, c.numero ? `N° ${c.numero}` : ""].filter(Boolean).join(" · ")}
                active={form.candidato_slug === c.slug}
                onClick={() => set("candidato_slug", c.slug)}
              />
            ))}
          </div>
        </div>
      )}

      {serverError && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 10,
          background: C.errorBg,
          border: `1px solid ${C.errorBorder}`,
          color: "#fca5a5",
          fontSize: 13,
          marginBottom: 16,
          fontFamily: FONT_STACK,
        }}>
          {serverError}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function StepHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 24 }}>
      <div style={{
        flexShrink: 0,
        width: 44,
        height: 44,
        borderRadius: 12,
        background: "rgba(255,200,0,0.1)",
        border: `1px solid ${C.goldBorder}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {icon}
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.white, fontFamily: FONT_STACK }}>
          {title}
        </h3>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.whiteMid, fontFamily: FONT_STACK, lineHeight: 1.5 }}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function Field({ label: labelText, error, required, children }: {
  label: string; error?: string; required?: boolean; children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={label()}>
        {labelText}{required && <span style={{ color: C.gold, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: 11, color: C.error, marginTop: 6, fontFamily: FONT_STACK }}>{error}</p>}
    </div>
  );
}

function SummaryRow({ icon, label: l, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "baseline",
      gap: 10,
      paddingBottom: last ? 0 : 10,
      marginBottom: last ? 0 : 10,
      borderBottom: last ? "none" : `1px solid ${C.whiteGhostBorder}`,
    }}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 11, color: C.whiteLow, fontFamily: FONT_STACK, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>{l}</span>
      <span style={{ fontSize: 13, color: C.whiteHigh, fontFamily: FONT_STACK, fontWeight: 600, marginLeft: "auto", textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

function CandidatoCard({ label, sub, active, onClick }: {
  label: string; sub: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="vf-candidate"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        border: `1.5px solid ${active ? C.gold : C.whiteGhostBorder}`,
        background: active ? C.goldDim : C.whiteGhost,
        cursor: "pointer",
        transition: "all 0.18s ease",
        boxShadow: active ? `0 0 0 3px ${C.goldShadow}22` : "none",
        textAlign: "left",
        fontFamily: FONT_STACK,
      }}
    >
      {/* Radio dot */}
      <div style={{
        flexShrink: 0,
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: `2px solid ${active ? C.gold : C.whiteLow}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "border-color 0.18s ease",
      }}>
        {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.gold }} />}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: active ? C.white : C.whiteMid }}>{label}</p>
        {sub && <p style={{ margin: "2px 0 0", fontSize: 11, color: C.whiteLow }}>{sub}</p>}
      </div>
    </button>
  );
}

function Spinner() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: "goberna-spin 0.8s linear infinite" }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  );
}

// ── Success State ─────────────────────────────────────────────────────
function SuccessState({ name }: { name: string }) {
  return (
    <div style={{
      textAlign: "center",
      padding: "40px 24px",
      fontFamily: FONT_STACK,
      animation: "vf-slide-forward 0.3s ease",
    }}>
      <style>{`
        @keyframes vf-slide-forward {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes vf-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>

      {/* Animated check */}
      <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 28px" }}>
        {/* Pulse rings */}
        {[1, 2].map((i) => (
          <div key={i} style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `2px solid ${C.gold}`,
            animation: `vf-pulse-ring 1.6s ease-out ${i * 0.4}s infinite`,
          }} />
        ))}
        <div style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          background: "rgba(255,200,0,0.12)",
          border: `2px solid ${C.gold}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>

      <h3 style={{ fontSize: 24, fontWeight: 800, color: C.white, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
        ¡Bienvenido{name ? `, ${name}` : ""}!
      </h3>

      <p style={{ fontSize: 15, lineHeight: 1.65, color: C.whiteMid, maxWidth: 340, margin: "0 auto 28px" }}>
        Tu registro como brigadista voluntario fue recibido. En menos de 48 h un coordinador te contactará.
      </p>

      {/* Stat */}
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 20px",
        borderRadius: 100,
        background: C.goldDim,
        border: `1px solid ${C.goldBorder}`,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.gold, fontFamily: FONT_STACK }}>
          Respuesta en menos de 48 h
        </span>
      </div>
    </div>
  );
}
