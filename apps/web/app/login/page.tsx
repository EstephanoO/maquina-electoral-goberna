"use client";

import { useAuth } from "../../lib/auth-context";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState, useEffect, useRef, type FormEvent } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   GOBERNA — Login Page
   Institutional split-screen login.  Left: brand hero.  Right: form.
   ═══════════════════════════════════════════════════════════════════════ */

// ── Keyframe + responsive styles (injected once) ────────────────────

const INJECTED_STYLES = `
@keyframes goberna-fade-in {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes goberna-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
@keyframes goberna-spin {
  to { transform: rotate(360deg); }
}
@keyframes goberna-gold-grow {
  from { width: 0; }
  to   { width: 80px; }
}

/* ── Responsive: stack on mobile ─────────────────── */
@media (max-width: 840px) {
  [data-login-root] {
    flex-direction: column !important;
  }
  [data-login-hero] {
    flex: none !important;
    min-height: 240px !important;
    padding: 40px 24px 32px !important;
  }
  [data-login-hero] h1 {
    font-size: 26px !important;
  }
  [data-login-hero] [data-hero-logo] {
    width: 96px !important;
    height: 96px !important;
  }
  [data-hero-bottom] {
    position: static !important;
    margin-top: 16px !important;
  }
  [data-login-form-side] {
    flex: 1 1 auto !important;
    padding: 32px 24px !important;
  }
  [data-login-gold-stripe] {
    display: none !important;
  }

}
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("goberna-login-styles")) return;
  const el = document.createElement("style");
  el.id = "goberna-login-styles";
  el.textContent = INJECTED_STYLES;
  document.head.appendChild(el);
}

// ── Loading skeleton ────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--goberna-blue-950)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background:
              "linear-gradient(90deg, rgba(255,200,0,.08) 25%, rgba(255,200,0,.18) 50%, rgba(255,200,0,.08) 75%)",
            backgroundSize: "800px 72px",
            animation: "goberna-shimmer 1.6s infinite linear",
            margin: "0 auto 24px",
          }}
        />
        <div
          style={{
            width: 160,
            height: 14,
            borderRadius: 7,
            background:
              "linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.1) 50%, rgba(255,255,255,.04) 75%)",
            backgroundSize: "800px 14px",
            animation: "goberna-shimmer 1.6s infinite linear",
            margin: "0 auto",
          }}
        />
      </div>
    </div>
  );
}

// ── Spinner ─────────────────────────────────────────────────────────

function Spinner({ size = 20, color = "var(--goberna-blue-950)" }: { size?: number; color?: string }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `2.5px solid ${color}`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "goberna-spin .65s linear infinite",
        verticalAlign: "middle",
      }}
    />
  );
}

// ── SVG Icons ───────────────────────────────────────────────────────

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

function IconError() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <title>Error</title>
      <circle cx="10" cy="10" r="10" fill="var(--color-error)" opacity=".12" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="var(--color-error)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Inject keyframes + responsive styles on mount
  useEffect(injectStyles, []);

  // Focus email field on mount
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/home");
    }
  }, [isLoading, isAuthenticated, router]);

  // Show skeleton while auth state is resolving
  if (isLoading) return <LoadingSkeleton />;
  if (isAuthenticated) return <LoadingSkeleton />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Ingrese correo y contraseña.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(trimmedEmail, password);
      if (result.ok) {
        router.replace("/home");
      } else {
        setError(result.error ?? "Credenciales incorrectas.");
      }
    } catch {
      setError("Error de conexión. Intente de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Reusable style objects ────────────────────────────────────────

  const fontStack = "var(--font-montserrat), system-ui, sans-serif";

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    fontSize: 15,
    fontFamily: fontStack,
    fontWeight: 500,
    color: "var(--color-text-primary)",
    background: "var(--goberna-blue-50)",
    border: "1.5px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    outline: "none",
    transition: "border-color .2s, box-shadow .2s",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 13,
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

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div
      data-login-root
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: fontStack,
      }}
    >
      {/* ══════════ LEFT PANEL — Brand Hero ══════════ */}
      <div
        data-login-hero
        style={{
          flex: "0 0 60%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background:
            "linear-gradient(165deg, #0a1a33 0%, var(--goberna-blue-950) 35%, var(--goberna-blue-900) 100%)",
          overflow: "hidden",
          padding: "60px 48px",
        }}
      >
        {/* Subtle grid pattern overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,200,0,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,200,0,.03) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            pointerEvents: "none",
          }}
        />

        {/* Radial glow behind logo */}
        <div
          style={{
            position: "absolute",
            width: 480,
            height: 480,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,200,0,.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Hero content */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            animation: "goberna-fade-in .8s ease-out both",
          }}
        >
          {/* Logo */}
          <div
            data-hero-logo
            style={{
              width: 140,
              height: 140,
              marginBottom: 36,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image
              src="/isotipo_2_-removebg-preview.png"
              alt="GOBERNA — Logotipo"
              width={140}
              height={140}
              priority
              style={{ objectFit: "contain", display: "block" }}
            />
          </div>

          {/* Brand name */}
          <h1
            style={{
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: "0.18em",
              color: "#ffffff",
              margin: 0,
              lineHeight: 1,
            }}
          >
            GOBERNA
          </h1>

          {/* Gold accent line */}
          <div
            style={{
              width: 80,
              height: 3,
              background: "var(--goberna-gold)",
              borderRadius: 2,
              margin: "20px 0",
              animation: "goberna-gold-grow .9s ease-out .3s both",
            }}
          />

          {/* Tagline */}
          <p
            style={{
              fontSize: 17,
              fontWeight: 500,
              color: "rgba(255,255,255,.75)",
              margin: 0,
              letterSpacing: "0.04em",
              textAlign: "center",
            }}
          >
            TERRITORIO
          </p>
        </div>


      </div>

      {/* ══════════ RIGHT PANEL — Login Form ══════════ */}
      <div
        data-login-form-side
        style={{
          flex: "0 0 40%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-surface)",
          padding: "48px 40px",
          position: "relative",
        }}
      >
        {/* Gold accent stripe along left edge */}
        <div
          data-login-gold-stripe
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 3,
            height: "100%",
            background:
              "linear-gradient(180deg, var(--goberna-gold) 0%, transparent 60%)",
          }}
        />

        <div
          style={{
            width: "100%",
            maxWidth: 380,
            animation: "goberna-fade-in .7s ease-out .2s both",
          }}
        >
          {/* Heading */}
          <h2
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: "0 0 4px",
              lineHeight: 1.2,
            }}
          >
            Iniciar Sesión
          </h2>
          <div style={{ marginBottom: 36 }} />

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "var(--radius-md)",
                padding: "12px 16px",
                marginBottom: 24,
                animation: "goberna-fade-in .3s ease-out",
              }}
            >
              <span style={{ flexShrink: 0 }}>
                <IconError />
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--color-error)",
                }}
              >
                {error}
              </span>
            </div>
          )}

          {/* ── Form ── */}
          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="login-email" style={labelStyle}>
                Correo electrónico
              </label>
              <input
                ref={emailRef}
                id="login-email"
                type="email"
                autoComplete="email"
                required
                placeholder="usuario@goberna.pe"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                style={inputStyle}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 28 }}>
              <label htmlFor="login-password" style={labelStyle}>
                Contraseña
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  style={{ ...inputStyle, paddingRight: 48 }}
                  onFocus={onInputFocus}
                  onBlur={onInputBlur}
                />
                {/* Toggle password visibility */}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  onClick={() => setShowPassword((v) => !v)}
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
                    alignItems: "center",
                  }}
                >
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%",
                padding: "15px 24px",
                fontSize: 15,
                fontWeight: 700,
                fontFamily: fontStack,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--goberna-blue-950)",
                background: submitting
                  ? "var(--goberna-gold-300)"
                  : "var(--goberna-gold)",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: submitting ? "not-allowed" : "pointer",
                transition: "background .2s, box-shadow .2s, transform .1s",
                boxShadow: "0 2px 8px rgba(255,200,0,.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
              onMouseEnter={(e) => {
                if (!submitting) {
                  e.currentTarget.style.background = "var(--goberna-gold-300)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 16px rgba(255,200,0,.35)";
                }
              }}
              onMouseLeave={(e) => {
                if (!submitting) {
                  e.currentTarget.style.background = "var(--goberna-gold)";
                  e.currentTarget.style.boxShadow =
                    "0 2px 8px rgba(255,200,0,.25)";
                }
              }}
              onMouseDown={(e) => {
                if (!submitting) e.currentTarget.style.transform = "scale(.985)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {submitting ? (
                <>
                  <Spinner size={18} color="var(--goberna-blue-950)" />
                  <span>Verificando...</span>
                </>
              ) : (
                "Ingresar"
              )}
            </button>
          </form>

          {/* Footer */}
          <p
            style={{
              marginTop: 40,
              textAlign: "center",
              fontSize: 11,
              fontWeight: 400,
              color: "var(--color-text-tertiary)",
              letterSpacing: "0.02em",
            }}
          >
            GOBERNA &copy; {new Date().getFullYear()} &middot; Todos los derechos
            reservados
          </p>
        </div>
      </div>
    </div>
  );
}
