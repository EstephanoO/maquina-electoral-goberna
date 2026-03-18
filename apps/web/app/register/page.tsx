"use client";

import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api-client";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef, useMemo, type FormEvent, Suspense } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   GOBERNA — Register Page
   Phone-first registration, auto-associates to a campaign.
   Supports ?c=slug query param to pick a specific candidate.
   ═══════════════════════════════════════════════════════════════════════ */

type CandidateInfo = {
  id: string;
  name: string;
  slug: string;
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
};

// Normalize text for search (remove accents, lowercase)
const normalize = (t: string) =>
  t.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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

@media (max-width: 840px) {
  [data-register-root] {
    flex-direction: column !important;
  }
  [data-register-hero] {
    flex: none !important;
    min-height: 200px !important;
    padding: 32px 24px 24px !important;
  }
  [data-register-hero] h1 {
    font-size: 26px !important;
  }
  [data-register-hero] [data-hero-logo] {
    width: 80px !important;
    height: 80px !important;
  }
  [data-hero-bottom] {
    position: static !important;
    margin-top: 12px !important;
  }
  [data-register-form-side] {
    flex: 1 1 auto !important;
    padding: 28px 24px !important;
  }
  [data-register-gold-stripe] {
    display: none !important;
  }
}
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("goberna-register-styles")) return;
  const el = document.createElement("style");
  el.id = "goberna-register-styles";
  el.textContent = INJECTED_STYLES;
  document.head.appendChild(el);
}

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

function IconSuccess() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <title>Exito</title>
      <circle cx="10" cy="10" r="10" fill="var(--color-success)" opacity=".12" />
      <path d="M6 10l3 3 5-5" stroke="var(--color-success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Wrap with Suspense for useSearchParams
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageInner />
    </Suspense>
  );
}

function RegisterPageInner() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const phoneRef = useRef<HTMLInputElement>(null);

  // ── Candidates (fetched at mount) ────────────────────────────────
  const [candidates, setCandidates] = useState<CandidateInfo[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [candidateSearch, setCandidateSearch] = useState(searchParams.get("c") ?? "");

  // ── Form state ───────────────────────────────────────────────────
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(injectStyles, []);

  useEffect(() => {
    phoneRef.current?.focus();
  }, []);

  // Fetch candidates on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ candidates: CandidateInfo[] }>("/api/candidates");
        if (res.ok && res.data?.candidates) {
          setCandidates(res.data.candidates);
          // If ?c= query param matches a slug, pre-fill search
          const slugParam = searchParams.get("c");
          if (slugParam) {
            const match = res.data.candidates.find((c) => c.slug === slugParam);
            if (match) setCandidateSearch(match.name.split(" ")[0]);
          }
        }
      } catch {
        // Non-critical: candidates just won't auto-match
      } finally {
        setLoadingCandidates(false);
      }
    })();
  }, [searchParams]);

  // Match candidate by first name (same logic as mobile)
  const matchedCandidate = useMemo(() => {
    const term = normalize(candidateSearch);
    if (term.length < 3) return null;
    return candidates.find((c) => {
      const firstName = normalize(c.name.split(" ")[0]);
      return firstName === term;
    }) ?? null;
  }, [candidateSearch, candidates]);

  // Already logged in → go to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/home");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) return null;
  if (isAuthenticated) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedPhone = phone.trim();
    const trimmedName = fullName.trim();

    if (!trimmedPhone || !trimmedName || !password) {
      setError("Teléfono, nombre y contraseña son obligatorios.");
      return;
    }

    if (!/^9\d{8}$/.test(trimmedPhone)) {
      setError("Ingrese un número de 9 dígitos que empiece con 9.");
      return;
    }

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    if (!matchedCandidate) {
      setError("Escriba el primer nombre de su candidato para continuar.");
      return;
    }

    setSubmitting(true);
    try {
      const generatedEmail = `${trimmedPhone.replace(/\D/g, "")}@goberna.pe`;

      // 1) Register — send all required fields
      const res = await api.post<{ user: { id: string; email: string } }>(
        "/api/auth/register",
        {
          phone: trimmedPhone,
          password,
          full_name: trimmedName,
          region: "LIMA",
          campaign_id: matchedCandidate.id,
          email: generatedEmail,
        },
      );

      if (!res.ok) {
        const msg = res.error?.message ?? "Error al registrarse.";
        // Friendly messages for common errors
        if (res.error?.code === "AUTH_PHONE_EXISTS") {
          setError("Este número de teléfono ya está registrado.");
        } else {
          setError(msg);
        }
        return;
      }

      // 2) Auto-login with phone-based email
      const loginResult = await login(generatedEmail, password);
      if (loginResult.ok) {
        router.replace("/onboarding");
      } else {
        router.replace("/login");
      }
    } catch {
      setError("Error de conexión. Intente de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  const fontStack = "var(--font-montserrat), system-ui, sans-serif";

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "13px 16px",
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
    marginBottom: 5,
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

  return (
    <div
      data-register-root
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: fontStack,
      }}
    >
      {/* ══════════ LEFT PANEL — Brand Hero ══════════ */}
      <div
        data-register-hero
        style={{
          flex: "0 0 50%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background:
            "linear-gradient(165deg, #0a1a33 0%, var(--goberna-blue-950) 35%, var(--goberna-blue-900) 100%)",
          overflow: "hidden",
          padding: "48px 40px",
        }}
      >
        {/* Grid pattern */}
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

        {/* Radial glow */}
        <div
          style={{
            position: "absolute",
            width: 440,
            height: 440,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,200,0,.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

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
          <div
            data-hero-logo
            style={{
              width: 120,
              height: 120,
              borderRadius: "50%",
              overflow: "hidden",
              border: "3px solid rgba(255,200,0,.25)",
              boxShadow: "0 0 60px rgba(255,200,0,.1), 0 8px 32px rgba(0,0,0,.4)",
              marginBottom: 28,
              flexShrink: 0,
            }}
          >
            <Image
              src="/isotipo_2_-removebg-preview.png"
              alt="GOBERNA — Logotipo"
              width={120}
              height={120}
              priority
              style={{ objectFit: "cover", display: "block" }}
            />
          </div>

          <h1
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "0.18em",
              color: "#ffffff",
              margin: 0,
              lineHeight: 1,
            }}
          >
            GOBERNA
          </h1>

          <div
            style={{
              width: 80,
              height: 3,
              background: "var(--goberna-gold)",
              borderRadius: 2,
              margin: "16px 0",
              animation: "goberna-gold-grow .9s ease-out .3s both",
            }}
          />

          <p
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: "rgba(255,255,255,.75)",
              margin: 0,
              letterSpacing: "0.04em",
              textAlign: "center",
            }}
          >
            Plataforma de Gestión Territorial
          </p>
        </div>

        <p
          data-hero-bottom
          style={{
            position: "absolute",
            bottom: 32,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 12,
            fontWeight: 400,
            color: "rgba(255,255,255,.35)",
            letterSpacing: "0.06em",
            margin: 0,
            padding: "0 24px",
            animation: "goberna-fade-in 1s ease-out .6s both",
          }}
        >
          Regístrese para acceder a la gestión territorial.
        </p>
      </div>

      {/* ══════════ RIGHT PANEL — Register Form ══════════ */}
      <div
        data-register-form-side
        style={{
          flex: "0 0 50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-surface)",
          padding: "40px 36px",
          position: "relative",
        }}
      >
        <div
          data-register-gold-stripe
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 3,
            height: "100%",
            background: "linear-gradient(180deg, var(--goberna-gold) 0%, transparent 60%)",
          }}
        />

        <div
          style={{
            width: "100%",
            maxWidth: 400,
            animation: "goberna-fade-in .7s ease-out .2s both",
          }}
        >
          {/* Heading */}
          <h2
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: "0 0 4px",
              lineHeight: 1.2,
            }}
          >
            Crear Cuenta
          </h2>
          <p
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: "var(--color-text-tertiary)",
              margin: "0 0 28px",
            }}
          >
            Complete sus datos para registrarse en la plataforma
          </p>

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "var(--color-error-bg)",
                border: "1px solid var(--color-error-border)",
                borderRadius: "var(--radius-md)",
                padding: "11px 14px",
                marginBottom: 20,
                animation: "goberna-fade-in .3s ease-out",
              }}
            >
              <span style={{ flexShrink: 0 }}><IconError /></span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-error)" }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Full Name */}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="reg-name" style={labelStyle}>
                Nombre completo
              </label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                required
                placeholder="Juan Perez"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={submitting}
                style={inputStyle}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="reg-email" style={labelStyle}>
                Correo electrónico
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                placeholder="usuario@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                style={inputStyle}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="reg-password" style={labelStyle}>
                Contraseña
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  style={{ ...inputStyle, paddingRight: 48 }}
                  onFocus={onInputFocus}
                  onBlur={onInputBlur}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
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

            {/* Confirm Password */}
            <div style={{ marginBottom: 24 }}>
              <label htmlFor="reg-confirm" style={labelStyle}>
                Confirmar contraseña
              </label>
              <input
                id="reg-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                placeholder="Repita la contraseña"
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
                padding: "14px 24px",
                fontSize: 15,
                fontWeight: 700,
                fontFamily: fontStack,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--goberna-blue-950)",
                background: submitting ? "var(--goberna-gold-300)" : "var(--goberna-gold)",
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
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(255,200,0,.35)";
                }
              }}
              onMouseLeave={(e) => {
                if (!submitting) {
                  e.currentTarget.style.background = "var(--goberna-gold)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(255,200,0,.25)";
                }
              }}
            >
              {submitting ? (
                <>
                  <Spinner size={18} color="var(--goberna-blue-950)" />
                  <span>Registrando...</span>
                </>
              ) : (
                "Crear Cuenta"
              )}
            </button>
          </form>

          {/* Link to login */}
          <p
            style={{
              marginTop: 28,
              textAlign: "center",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--color-text-secondary)",
            }}
          >
            ¿Ya tiene una cuenta?{" "}
            <Link
              href="/login"
              style={{
                color: "var(--goberna-blue-600)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Iniciar Sesión
            </Link>
          </p>

          <p
            style={{
              marginTop: 24,
              textAlign: "center",
              fontSize: 11,
              fontWeight: 400,
              color: "var(--color-text-tertiary)",
              letterSpacing: "0.02em",
            }}
          >
            GOBERNA &copy; {new Date().getFullYear()} &middot; Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
