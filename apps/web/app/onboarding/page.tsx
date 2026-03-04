"use client";

import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api-client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   GOBERNA — Onboarding Page
   After registration, user picks a candidate and submits access request.
   ═══════════════════════════════════════════════════════════════════════ */

type Candidate = {
  id: string;
  name: string;
  slug: string;
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
};

type MyAccessRequest = {
  id: string;
  campaign_id: string;
  status: string;
  campaign_name?: string;
  campaign_cargo?: string;
};

const INJECTED_STYLES = `
@keyframes goberna-fade-in {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes goberna-fade-up {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes goberna-spin {
  to { transform: rotate(360deg); }
}
@keyframes goberna-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: .5; }
}
@keyframes goberna-glow {
  0%, 100% { box-shadow: 0 0 0 3px rgba(74,138,196,.15); }
  50%       { box-shadow: 0 0 0 6px rgba(74,138,196,.25); }
}
[data-card-selected] {
  animation: goberna-glow 2s ease-in-out infinite;
}
@media (max-width: 640px) {
  [data-onboarding-grid] {
    grid-template-columns: 1fr !important;
  }
}
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("goberna-onboarding-styles")) return;
  const el = document.createElement("style");
  el.id = "goberna-onboarding-styles";
  el.textContent = INJECTED_STYLES;
  document.head.appendChild(el);
}

function Spinner({ size = 20, color = "var(--goberna-blue-500)" }: { size?: number; color?: string }) {
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

// ── Candidate Card ──────────────────────────────────────────────────

function CandidateCard({
  candidate,
  selected,
  onSelect,
}: {
  candidate: Candidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-card-selected={selected ? "" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "28px 20px 22px",
        background: selected
          ? "linear-gradient(145deg, var(--goberna-blue-50) 0%, #f0f7ff 100%)"
          : hovered
            ? "#fafbfc"
            : "var(--color-surface)",
        border: selected
          ? "2px solid var(--goberna-blue-500)"
          : hovered
            ? "2px solid var(--goberna-blue-200)"
            : "2px solid var(--color-border)",
        borderRadius: "var(--radius-xl, 16px)",
        cursor: "pointer",
        transition: "all .2s ease",
        boxShadow: selected
          ? "0 8px 24px rgba(74,138,196,.18)"
          : hovered
            ? "0 4px 16px rgba(0,0,0,.08)"
            : "0 1px 4px rgba(0,0,0,.06)",
        textAlign: "center",
        fontFamily: "inherit",
        width: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Selected checkmark */}
      {selected && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--goberna-blue-500)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M2 6.5L5 9.5L11 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* Photo */}
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: "50%",
          overflow: "hidden",
          marginBottom: 14,
          border: selected
            ? "3px solid var(--goberna-gold)"
            : hovered
              ? "3px solid var(--goberna-blue-200)"
              : "3px solid var(--color-border)",
          flexShrink: 0,
          background: "var(--goberna-blue-100)",
          transition: "border-color .2s ease",
          boxShadow: selected ? "0 0 0 4px rgba(255,200,0,.2)" : "none",
        }}
      >
        {candidate.foto_url ? (
          <Image
            src={candidate.foto_url}
            alt={candidate.name}
            width={96}
            height={96}
            style={{ objectFit: "cover", display: "block", width: "100%", height: "100%" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 800,
              color: "var(--goberna-blue-400)",
            }}
          >
            {candidate.name.charAt(0)}
          </div>
        )}
      </div>

      {/* Number badge */}
      {candidate.numero && (
        <span
          style={{
            display: "inline-block",
            padding: "3px 12px",
            fontSize: 12,
            fontWeight: 800,
            color: selected ? "var(--goberna-blue-950)" : "var(--color-text-secondary)",
            background: selected ? "var(--goberna-gold)" : "var(--goberna-blue-100)",
            borderRadius: 20,
            marginBottom: 10,
            letterSpacing: "0.05em",
            transition: "all .2s ease",
          }}
        >
          #{candidate.numero}
        </span>
      )}

      {/* Name */}
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: selected ? "var(--goberna-blue-900)" : "var(--color-text-primary)",
          marginBottom: 5,
          lineHeight: 1.3,
        }}
      >
        {candidate.name}
      </span>

      {/* Cargo */}
      {candidate.cargo && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
            marginBottom: 4,
          }}
        >
          {candidate.cargo}
        </span>
      )}

      {/* Partido */}
      {candidate.partido && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: selected ? "var(--goberna-blue-600)" : "var(--goberna-blue-400)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginTop: 2,
          }}
        >
          {candidate.partido}
        </span>
      )}
    </button>
  );
}

// ── Pending Screen ──────────────────────────────────────────────────

function PendingScreen({ candidateName }: { candidateName: string }) {
  const router = useRouter();

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "0 auto",
        textAlign: "center",
        animation: "goberna-fade-up .6s ease-out both",
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "rgba(22,163,74,.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 28px",
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <title>Enviado</title>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>

      <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--color-text-primary)", margin: "0 0 10px" }}>
        Solicitud Enviada
      </h2>

      <p style={{ fontSize: 15, color: "var(--color-text-secondary)", margin: "0 0 10px", lineHeight: 1.6 }}>
        Su solicitud de acceso para <strong>{candidateName}</strong> fue enviada correctamente.
      </p>

      <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", margin: "0 0 36px", lineHeight: 1.5 }}>
        Un administrador revisará su solicitud y le otorgará acceso. Esto puede tomar algunos minutos.
      </p>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 24px",
          background: "var(--goberna-gold-100)",
          borderRadius: "var(--radius-lg)",
          marginBottom: 36,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--goberna-gold-600)",
            animation: "goberna-pulse 2s ease-in-out infinite",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--goberna-gold-600)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Pendiente de aprobación
        </span>
      </div>

      <div>
        <button
          type="button"
          onClick={() => router.push("/login")}
          style={{
            padding: "13px 36px",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "inherit",
            color: "var(--goberna-blue-700)",
            background: "transparent",
            border: "1.5px solid var(--goberna-blue-200)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            transition: "all .2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--goberna-blue-50)";
            e.currentTarget.style.borderColor = "var(--goberna-blue-400)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "var(--goberna-blue-200)";
          }}
        >
          Ir a Iniciar Sesión
        </button>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { user, campaigns, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [myRequests, setMyRequests] = useState<MyAccessRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submittedName, setSubmittedName] = useState("");

  useEffect(injectStyles, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated && campaigns.length > 0) {
      router.replace("/home");
    }
  }, [isLoading, isAuthenticated, campaigns, router]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  const fetchData = useCallback(async () => {
    setLoadingCandidates(true);
    try {
      const [candidatesRes, requestsRes] = await Promise.all([
        api.get<{ candidates: Candidate[] }>("/api/candidates"),
        api.get<{ access_requests: MyAccessRequest[] }>("/api/access-requests/mine"),
      ]);

      if (candidatesRes.ok && candidatesRes.data) {
        setCandidates(candidatesRes.data.candidates);
      }
      if (requestsRes.ok && requestsRes.data) {
        setMyRequests(requestsRes.data.access_requests);
        const pending = requestsRes.data.access_requests.find((r) => r.status === "pending");
        if (pending) {
          setSubmitted(true);
          setSubmittedName(pending.campaign_name ?? "el candidato seleccionado");
        }
      }
    } catch {
      setError("Error cargando candidatos.");
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      fetchData();
    }
  }, [isAuthenticated, isLoading, fetchData]);

  if (isLoading || !isAuthenticated) return null;

  // ── Pending state ──
  if (submitted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          background: "var(--color-background)",
          fontFamily: "var(--font-montserrat), system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
          <Image
            src="/isotipo_2_-removebg-preview.png"
            alt="GOBERNA"
            width={36}
            height={36}
            style={{ borderRadius: "var(--radius-sm)" }}
          />
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "3px", color: "var(--goberna-blue-900)" }}>
            GOBERNA
          </span>
        </div>
        <PendingScreen candidateName={submittedName} />
      </div>
    );
  }

  async function handleSubmit() {
    if (!selectedId) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await api.post<{ access_request: { id: string } }>(
        "/api/access-requests",
        { campaign_id: selectedId },
      );
      if (!res.ok) {
        if (res.error?.code === "ACCESS_REQUEST_DUPLICATE") {
          setError("Ya tiene una solicitud pendiente para este candidato");
        } else {
          setError(res.error?.message ?? "Error enviando solicitud.");
        }
        return;
      }
      const selected = candidates.find((c) => c.id === selectedId);
      setSubmittedName(selected?.name ?? "el candidato seleccionado");
      setSubmitted(true);
    } catch {
      setError("Error de conexión. Intente de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  const requestedCampaignIds = new Set(myRequests.map((r) => r.campaign_id));
  const availableCandidates = candidates.filter((c) => !requestedCampaignIds.has(c.id));
  const firstName = user?.full_name?.split(" ")[0] ?? "Usuario";

  // ── Main layout ──
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-background)",
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
      }}
    >
      {/* Top bar — minimal */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image
            src="/isotipo_2_-removebg-preview.png"
            alt="GOBERNA"
            width={32}
            height={32}
            style={{ borderRadius: "var(--radius-sm)" }}
          />
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "3px", color: "var(--goberna-blue-900)" }}>
            GOBERNA
          </span>
        </div>
        <span style={{ fontSize: 13, color: "var(--color-text-tertiary)", fontWeight: 500 }}>
          {user?.email}
        </span>
      </header>

      {/* Hero section */}
      <div
        style={{
          padding: "52px 24px 36px",
          textAlign: "center",
          animation: "goberna-fade-up .5s ease-out both",
        }}
      >
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--goberna-blue-500)",
            marginBottom: 12,
          }}
        >
          Paso 1 de 1
        </p>
        <h1
          style={{
            fontSize: "clamp(26px, 4vw, 36px)",
            fontWeight: 800,
            color: "var(--color-text-primary)",
            margin: "0 0 14px",
            lineHeight: 1.2,
          }}
        >
          Hola, {firstName}. ¿Con quién colaboras?
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--color-text-secondary)",
            maxWidth: 480,
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          Selecciona el candidato al que perteneces. Tu solicitud será revisada por un administrador.
        </p>
      </div>

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
            margin: "0 auto 24px",
            maxWidth: 680,
            width: "calc(100% - 48px)",
            animation: "goberna-fade-in .3s ease-out",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <title>Error</title>
            <circle cx="10" cy="10" r="10" fill="var(--color-error)" opacity=".12" />
            <path d="M7 7l6 6M13 7l-6 6" stroke="var(--color-error)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-error)" }}>{error}</span>
        </div>
      )}

      {/* Main content area — candidates + submit */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 24px 48px",
        }}
      >
        {/* Loading */}
        {loadingCandidates && (
          <div style={{ padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <Spinner size={36} />
            <span style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>Cargando candidatos...</span>
          </div>
        )}

        {/* Candidate grid */}
        {!loadingCandidates && availableCandidates.length > 0 && (
          <>
            <div
              data-onboarding-grid
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 18,
                width: "100%",
                maxWidth: 780,
                marginBottom: 36,
                animation: "goberna-fade-up .5s ease-out .1s both",
              }}
            >
              {availableCandidates.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  selected={selectedId === c.id}
                  onSelect={() => setSelectedId(c.id)}
                />
              ))}
            </div>

            {/* Selection hint */}
            {!selectedId && (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--color-text-tertiary)",
                  marginBottom: 20,
                  animation: "goberna-fade-in .4s ease-out .3s both",
                }}
              >
                Toca una tarjeta para seleccionar
              </p>
            )}

            {/* Selected confirmation chip */}
            {selectedId && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 18px",
                  background: "var(--goberna-blue-50)",
                  border: "1px solid var(--goberna-blue-200)",
                  borderRadius: 999,
                  marginBottom: 20,
                  animation: "goberna-fade-in .25s ease-out both",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="7" fill="var(--goberna-blue-500)" />
                  <path d="M4 7l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--goberna-blue-700)" }}>
                  {availableCandidates.find((c) => c.id === selectedId)?.name ?? "Candidato seleccionado"}
                </span>
              </div>
            )}

            {/* Submit CTA */}
            <button
              type="button"
              disabled={!selectedId || submitting}
              onClick={handleSubmit}
              style={{
                padding: "16px 52px",
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "inherit",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: !selectedId ? "var(--color-text-tertiary)" : "var(--goberna-blue-950)",
                background: !selectedId
                  ? "var(--color-border)"
                  : submitting
                    ? "var(--goberna-gold-300)"
                    : "var(--goberna-gold)",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: !selectedId || submitting ? "not-allowed" : "pointer",
                transition: "background .2s, box-shadow .2s, transform .15s",
                boxShadow: selectedId
                  ? "0 4px 16px rgba(255,200,0,.35), 0 1px 4px rgba(0,0,0,.08)"
                  : "none",
                display: "flex",
                alignItems: "center",
                gap: 12,
                animation: "goberna-fade-up .5s ease-out .2s both",
              }}
              onMouseEnter={(e) => {
                if (selectedId && !submitting) {
                  e.currentTarget.style.background = "var(--goberna-gold-300)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 6px 20px rgba(255,200,0,.4), 0 2px 8px rgba(0,0,0,.1)";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedId && !submitting) {
                  e.currentTarget.style.background = "var(--goberna-gold)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(255,200,0,.35), 0 1px 4px rgba(0,0,0,.08)";
                }
              }}
            >
              {submitting ? (
                <>
                  <Spinner size={20} color="var(--goberna-blue-950)" />
                  <span>Enviando solicitud...</span>
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M10 2L18 10L10 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2 10H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span>Solicitar Acceso</span>
                </>
              )}
            </button>
          </>
        )}

        {/* Empty state */}
        {!loadingCandidates && availableCandidates.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 24px",
              color: "var(--color-text-tertiary)",
              animation: "goberna-fade-up .5s ease-out both",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--goberna-blue-50)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-blue-300)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6 }}>
              No hay candidatos disponibles
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>
              Contacta a tu administrador para más información.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--color-border)",
          padding: "14px 24px",
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-tertiary)", letterSpacing: "0.02em", margin: 0 }}>
          GOBERNA &copy; {new Date().getFullYear()} &middot; Todos los derechos reservados
        </p>
      </footer>
    </div>
  );
}
