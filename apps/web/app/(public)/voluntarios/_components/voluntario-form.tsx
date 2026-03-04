"use client";

import { useState, type FormEvent, type CSSProperties } from "react";
import { FONT_STACK } from "@/lib/constants";
import { createVoluntario, type CreateVoluntarioInput, type RangoEdad } from "@/lib/services";
import type { CandidatePublic } from "@/lib/types";
import { DEPARTAMENTO_OPTIONS } from "./peru-geo";

// ── Brand colors ────────────────────────────────────────────────────
const BLUE = "rgb(22, 57, 96)";
const BLUE_DARK = "rgb(14, 38, 64)";
const GOLD = "rgb(255, 200, 0)";
const GOLD_SHADOW = "rgba(255,200,0,0.25)";

// ── Styles ──────────────────────────────────────────────────────────

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: "rgba(255,255,255,0.65)",
  marginBottom: 6,
  fontFamily: FONT_STACK,
  textTransform: "uppercase",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  fontSize: 15,
  fontFamily: FONT_STACK,
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.07)",
  color: "#fff",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s ease, background 0.15s ease",
};

const inputErrorStyle: CSSProperties = {
  ...inputStyle,
  borderColor: "#ef4444",
};

const errorMsgStyle: CSSProperties = {
  fontSize: 11,
  color: "#f87171",
  marginTop: 4,
  fontFamily: FONT_STACK,
};

const fieldStyle: CSSProperties = { marginBottom: 20 };

// ── Types ────────────────────────────────────────────────────────────

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

const INITIAL_STATE: FormState = {
  nombre_completo: "",
  telefono: "",
  departamento: "",
  provincia: "",
  distrito: "",
  rango_edad: "",
  candidato_slug: "",
};

const RANGOS: { value: RangoEdad; label: string }[] = [
  { value: "18-25", label: "18 – 25 años" },
  { value: "26-35", label: "26 – 35 años" },
  { value: "36-45", label: "36 – 45 años" },
];

// ── Component ────────────────────────────────────────────────────────

type Props = { candidates: CandidatePublic[] };

export function VoluntarioForm({ candidates }: Props) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  function set(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (!form.nombre_completo.trim() || form.nombre_completo.trim().length < 2) {
      next.nombre_completo = "Ingresa tu nombre completo";
    }
    if (!form.telefono.trim() || form.telefono.trim().length < 7) {
      next.telefono = "Ingresa un número de teléfono válido";
    }
    if (!/^[0-9+\s\-()]+$/.test(form.telefono.trim())) {
      next.telefono = "Solo se permiten números, +, espacios y guiones";
    }
    if (!form.departamento) next.departamento = "Selecciona un departamento";
    if (!form.provincia.trim()) next.provincia = "Ingresa tu provincia";
    if (!form.distrito.trim()) next.distrito = "Ingresa tu distrito";
    if (!form.rango_edad) next.rango_edad = "Selecciona un rango de edad";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setStatus("loading");
    setServerError(null);

    const input: CreateVoluntarioInput = {
      nombre_completo: form.nombre_completo.trim(),
      telefono: form.telefono.trim(),
      departamento: form.departamento,
      provincia: form.provincia.trim(),
      distrito: form.distrito.trim(),
      rango_edad: form.rango_edad as RangoEdad,
      ...(form.candidato_slug ? { candidato_slug: form.candidato_slug } : {}),
    };

    const res = await createVoluntario(input);

    if (res.ok) {
      setStatus("success");
    } else {
      setStatus("error");
      setServerError(res.error?.message ?? "Error inesperado. Inténtalo de nuevo.");
    }
  }

  if (status === "success") {
    return <SuccessState />;
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Nombre completo */}
      <div style={fieldStyle}>
        <label htmlFor="nombre_completo" style={labelStyle}>Nombre completo *</label>
        <input
          id="nombre_completo"
          type="text"
          placeholder="Ej. Juan Carlos Pérez López"
          value={form.nombre_completo}
          onChange={(e) => set("nombre_completo", e.target.value)}
          style={errors.nombre_completo ? inputErrorStyle : inputStyle}
          autoComplete="name"
        />
        {errors.nombre_completo && <p style={errorMsgStyle}>{errors.nombre_completo}</p>}
      </div>

      {/* Teléfono */}
      <div style={fieldStyle}>
        <label htmlFor="telefono" style={labelStyle}>Número de teléfono *</label>
        <input
          id="telefono"
          type="tel"
          placeholder="Ej. 987 654 321"
          value={form.telefono}
          onChange={(e) => set("telefono", e.target.value)}
          style={errors.telefono ? inputErrorStyle : inputStyle}
          autoComplete="tel"
        />
        {errors.telefono && <p style={errorMsgStyle}>{errors.telefono}</p>}
      </div>

      {/* Ubicación — grid 3 columnas en desktop */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* Departamento */}
        <div>
          <label htmlFor="departamento" style={labelStyle}>Departamento *</label>
          <select
            id="departamento"
            value={form.departamento}
            onChange={(e) => set("departamento", e.target.value)}
            style={{
              ...(errors.departamento ? inputErrorStyle : inputStyle),
              color: form.departamento ? "#fff" : "rgba(255,255,255,0.35)",
            }}
          >
            <option value="">Seleccionar</option>
            {DEPARTAMENTO_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ color: "#000" }}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.departamento && <p style={errorMsgStyle}>{errors.departamento}</p>}
        </div>

        {/* Provincia */}
        <div>
          <label htmlFor="provincia" style={labelStyle}>Provincia *</label>
          <input
            id="provincia"
            type="text"
            placeholder="Ej. Lima"
            value={form.provincia}
            onChange={(e) => set("provincia", e.target.value)}
            style={errors.provincia ? inputErrorStyle : inputStyle}
          />
          {errors.provincia && <p style={errorMsgStyle}>{errors.provincia}</p>}
        </div>

        {/* Distrito */}
        <div>
          <label htmlFor="distrito" style={labelStyle}>Distrito *</label>
          <input
            id="distrito"
            type="text"
            placeholder="Ej. San Isidro"
            value={form.distrito}
            onChange={(e) => set("distrito", e.target.value)}
            style={errors.distrito ? inputErrorStyle : inputStyle}
          />
          {errors.distrito && <p style={errorMsgStyle}>{errors.distrito}</p>}
        </div>
      </div>

      {/* Rango de edad — radio pills */}
      <div style={fieldStyle}>
        <p style={{ ...labelStyle, marginBottom: 12 }}>Rango de edad *</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {RANGOS.map((r) => {
            const active = form.rango_edad === r.value;
            return (
              <label
                key={r.value}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  borderRadius: 100,
                  border: `2px solid ${active ? GOLD : "rgba(255,255,255,0.18)"}`,
                  background: active ? "rgba(255,200,0,0.12)" : "rgba(255,255,255,0.05)",
                  color: active ? GOLD : "rgba(255,255,255,0.7)",
                  fontFamily: FONT_STACK,
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
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
                />
                {r.label}
              </label>
            );
          })}
        </div>
        {errors.rango_edad && <p style={{ ...errorMsgStyle, marginTop: 8 }}>{errors.rango_edad}</p>}
      </div>

      {/* Candidato */}
      {candidates.length > 0 && (
        <div style={fieldStyle}>
          <label htmlFor="candidato_slug" style={labelStyle}>¿Por qué candidato quieres ser voluntario?</label>
          <select
            id="candidato_slug"
            value={form.candidato_slug}
            onChange={(e) => set("candidato_slug", e.target.value)}
            style={{
              ...inputStyle,
              color: form.candidato_slug ? "#fff" : "rgba(255,255,255,0.35)",
            }}
          >
            <option value="">Seleccionar candidato (opcional)</option>
            {candidates.map((c) => (
              <option key={c.slug} value={c.slug} style={{ color: "#000" }}>
                {c.name}
                {c.cargo ? ` — ${c.cargo}` : ""}
                {c.numero ? ` (N° ${c.numero})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Server error */}
      {serverError && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#fca5a5",
            fontSize: 13,
            marginBottom: 20,
            fontFamily: FONT_STACK,
          }}
        >
          {serverError}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={status === "loading"}
        style={{
          width: "100%",
          padding: "14px 24px",
          fontSize: 15,
          fontWeight: 700,
          fontFamily: FONT_STACK,
          color: BLUE_DARK,
          background: status === "loading" ? "rgba(255,200,0,0.5)" : GOLD,
          border: "none",
          borderRadius: 8,
          cursor: status === "loading" ? "not-allowed" : "pointer",
          boxShadow: `0 4px 20px ${GOLD_SHADOW}`,
          transition: "all 0.2s ease",
          letterSpacing: 0.3,
        }}
      >
        {status === "loading" ? "Enviando..." : "Quiero ser voluntario"}
      </button>
    </form>
  );
}

// ── Success State ─────────────────────────────────────────────────────

function SuccessState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "48px 24px",
        fontFamily: FONT_STACK,
      }}
    >
      {/* Check icon */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(255,200,0,0.12)",
          border: `2px solid ${GOLD}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h3
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: "#fff",
          margin: "0 0 12px",
        }}
      >
        ¡Gracias por inscribirte!
      </h3>

      <p
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          color: "rgba(255,255,255,0.6)",
          maxWidth: 360,
          margin: "0 auto",
        }}
      >
        Tu registro fue recibido. El equipo de campaña se pondrá en contacto contigo pronto.
      </p>
    </div>
  );
}
