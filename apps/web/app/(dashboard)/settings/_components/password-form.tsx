"use client";

import { useState } from "react";
import { api } from "../../../../lib/api-client";
import { Spinner } from "../../../../lib/ui";

/* ─── SVG Icons ─────────────────────────────────────────────────────── */

function IconEye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Mostrar</title>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Ocultar</title>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function IconSuccess() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Exito</title>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

/* ─── Styles ────────────────────────────────────────────────────────── */

const fontStack = "var(--font-montserrat), system-ui, sans-serif";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  fontSize: 14,
  fontFamily: fontStack,
  fontWeight: 500,
  color: "var(--color-text-primary)",
  background: "var(--color-surface-hover)",
  border: "1.5px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  transition: "border-color .2s, box-shadow .2s",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: fontStack,
  color: "var(--color-text-secondary)",
  letterSpacing: "0.02em",
  textTransform: "uppercase",
};

function onInputFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--goberna-blue-500)";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(74,138,196,.15)";
}

function onInputBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--color-border)";
  e.currentTarget.style.boxShadow = "none";
}

/* ─── Component ─────────────────────────────────────────────────────── */

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!currentPassword || !newPassword) {
      setError("Todos los campos son obligatorios.");
      return;
    }

    if (newPassword.length < 8) {
      setError("La nueva contrasena debe tener al menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/api/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });

      if (!res.ok) {
        if (res.error?.code === "AUTH_INVALID_CREDENTIALS") {
          setError("La contrasena actual es incorrecta.");
        } else {
          setError(res.error?.message ?? "Error cambiando contrasena.");
        }
        return;
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Auto-hide success after 4 seconds
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Error de conexion. Intente de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: 24,
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          margin: "0 0 20px",
        }}
      >
        Cambiar Contrasena
      </h2>

      {success && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(22,163,74,.08)",
            border: "1px solid rgba(22,163,74,.2)",
            borderRadius: "var(--radius-md)",
            padding: "12px 16px",
            marginBottom: 20,
          }}
          className="animate-fade-in"
        >
          <IconSuccess />
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-success)" }}>
            Contrasena cambiada exitosamente.
          </span>
        </div>
      )}

      {error && (
        <div
          className="animate-fade-in"
          style={{
            background: "var(--color-error-bg)",
            border: "1px solid var(--color-error-border)",
            borderRadius: "var(--radius-md)",
            padding: "12px 16px",
            marginBottom: 20,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-error)" }}>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Current password */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="current-pass" style={labelStyle}>
            Contrasena actual
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="current-pass"
              type={showCurrent ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Ingrese su contrasena actual"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={submitting}
              style={{ ...inputStyle, paddingRight: 44 }}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showCurrent ? "Ocultar" : "Mostrar"}
              onClick={() => setShowCurrent((v) => !v)}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "var(--color-text-tertiary)",
                display: "flex",
              }}
            >
              {showCurrent ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="new-pass" style={labelStyle}>
            Nueva contrasena
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="new-pass"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              required
              placeholder="Minimo 8 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={submitting}
              style={{ ...inputStyle, paddingRight: 44 }}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showNew ? "Ocultar" : "Mostrar"}
              onClick={() => setShowNew((v) => !v)}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "var(--color-text-tertiary)",
                display: "flex",
              }}
            >
              {showNew ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
        </div>

        {/* Confirm password */}
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="confirm-pass" style={labelStyle}>
            Confirmar nueva contrasena
          </label>
          <input
            id="confirm-pass"
            type={showNew ? "text" : "password"}
            autoComplete="new-password"
            required
            placeholder="Repita la nueva contrasena"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={submitting}
            style={inputStyle}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: fontStack,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: submitting ? "var(--color-text-tertiary)" : "var(--goberna-blue-950)",
            background: submitting ? "var(--color-border)" : "var(--goberna-gold)",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: submitting ? "not-allowed" : "pointer",
            transition: "background .2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {submitting ? (
            <>
              <Spinner size="sm" />
              <span>Guardando...</span>
            </>
          ) : (
            "Cambiar Contrasena"
          )}
        </button>
      </form>
    </div>
  );
}
