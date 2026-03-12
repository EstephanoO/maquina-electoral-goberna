"use client";

import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api-client";
import { useTheme } from "../../../lib/theme-context";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Spinner, PageHeader } from "../../../lib/ui";
import { WaPhonesSection } from "./_components/wa-phones-section";

/* ═══════════════════════════════════════════════════════════════════════
   GOBERNA — Settings: Change Password
   ═══════════════════════════════════════════════════════════════════════ */

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

export default function SettingsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) return null;

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

  return (
    <div
      style={{
        fontFamily: fontStack,
        maxWidth: 600,
      }}
    >
      <PageHeader
        title="Configuracion"
        description="Gestione su cuenta y preferencias."
        breadcrumbs={[{ label: "Dashboard", href: "/home" }, { label: "Configuracion" }]}
      />

      {/* User info card */}
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>
          Cuenta
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {user?.full_name}
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          {user?.email}
        </div>
        <div style={{ marginTop: 8 }}>
          <span
            style={{
              display: "inline-block",
              padding: "3px 10px",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              borderRadius: 20,
              background: user?.role === "admin" ? "var(--goberna-gold)" : "var(--goberna-blue-100)",
              color: user?.role === "admin" ? "var(--goberna-blue-950)" : "var(--goberna-blue-600)",
            }}
          >
            {user?.role}
          </span>
        </div>
      </div>

      {/* WA Phones section */}
      <WaPhonesSection />

      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: 24,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 8px" }}>
          Tema
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 16px" }}>
          Elija el tema visual para todo el dashboard.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {([
            { id: "light", label: "Claro" },
            { id: "dark", label: "Oscuro" },
          ] as const).map((option) => {
            const active = theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: `1px solid ${active ? (isDark ? "#8fb2da" : "var(--color-primary)") : "var(--color-border-strong)"}`,
                  background: active ? "var(--color-surface-active)" : "var(--color-surface)",
                  color: active ? (isDark ? "#e2ecff" : "var(--color-primary)") : "var(--color-text-secondary)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: active && isDark ? "0 0 0 1px rgba(143,178,218,0.35) inset" : "none",
                }}
              >
                {option.id === "light" ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                )}
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Change password form */}
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
                <Spinner size={16} />
                <span>Guardando...</span>
              </>
            ) : (
              "Cambiar Contrasena"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
