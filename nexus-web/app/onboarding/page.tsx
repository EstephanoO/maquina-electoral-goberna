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
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes goberna-spin {
  to { transform: rotate(360deg); }
}
@keyframes goberna-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
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

// ── Step: Select Candidate ──────────────────────────────────────────

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
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px 16px",
        background: selected
          ? "var(--goberna-blue-50)"
          : hovered
            ? "#fafbfc"
            : "var(--color-surface)",
        border: selected
          ? "2px solid var(--goberna-blue-500)"
          : "2px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        cursor: "pointer",
        transition: "all .2s ease",
        boxShadow: selected
          ? "0 0 0 3px rgba(74,138,196,.15)"
          : hovered
            ? "var(--shadow-md)"
            : "var(--shadow-sm)",
        textAlign: "center",
        fontFamily: "inherit",
        width: "100%",
      }}
    >
      {/* Photo */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          overflow: "hidden",
          marginBottom: 12,
          border: selected
            ? "3px solid var(--goberna-gold)"
            : "3px solid var(--color-border)",
          flexShrink: 0,
          background: "var(--goberna-blue-100)",
        }}
      >
        {candidate.foto_url ? (
          <Image
            src={candidate.foto_url}
            alt={candidate.name}
            width={80}
            height={80}
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
              fontSize: 28,
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
            padding: "2px 10px",
            fontSize: 13,
            fontWeight: 800,
            color: selected ? "var(--goberna-blue-950)" : "var(--color-text-secondary)",
            background: selected ? "var(--goberna-gold)" : "var(--goberna-blue-100)",
            borderRadius: 20,
            marginBottom: 8,
            letterSpacing: "0.05em",
          }}
        >
          #{candidate.numero}
        </span>
      )}

      {/* Name */}
      <span
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          marginBottom: 4,
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
            color: "var(--goberna-blue-600)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {candidate.partido}
        </span>
      )}
    </button>
  );
}

// ── Step: Pending approval ──────────────────────────────────────────

function PendingScreen({ candidateName }: { candidateName: string }) {
  const router = useRouter();

  return (
    <div
      style={{
        maxWidth: 500,
        margin: "0 auto",
        textAlign: "center",
        animation: "goberna-fade-in .6s ease-out both",
      }}
    >
      {/* Checkmark icon */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(22,163,74,.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <title>Enviado</title>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>

      <h2
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: "var(--color-text-primary)",
          margin: "0 0 8px",
        }}
      >
        Solicitud Enviada
      </h2>

      <p
        style={{
          fontSize: 15,
          color: "var(--color-text-secondary)",
          margin: "0 0 12px",
          lineHeight: 1.5,
        }}
      >
        Su solicitud de acceso para <strong>{candidateName}</strong> fue enviada correctamente.
      </p>

      <p
        style={{
          fontSize: 14,
          color: "var(--color-text-tertiary)",
          margin: "0 0 32px",
          lineHeight: 1.5,
        }}
      >
        Un administrador revisara su solicitud y le otorgara acceso.
        Esto puede tomar algunos minutos.
      </p>

      {/* Status badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          background: "var(--goberna-gold-100)",
          borderRadius: "var(--radius-lg)",
          marginBottom: 32,
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
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--goberna-gold-600)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Pendiente de aprobacion
        </span>
      </div>

      <div>
        <button
          type="button"
          onClick={() => router.push("/login")}
          style={{
            padding: "12px 32px",
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
          Ir a Iniciar Sesion
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

  // If user already has campaigns, skip onboarding
  useEffect(() => {
    if (!isLoading && isAuthenticated && campaigns.length > 0) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, campaigns, router]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Fetch candidates and my requests
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
        // If user already has a pending request, show pending screen
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

  // If already submitted
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
        {/* GOBERNA header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 40,
          }}
        >
          <Image
            src="/isotipo(2).jpg"
            alt="GOBERNA"
            width={40}
            height={40}
            style={{ borderRadius: "var(--radius-sm)" }}
          />
          <span
            style={{
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "3px",
              color: "var(--goberna-blue-900)",
            }}
          >
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
          setError("Ya tiene una solicitud pendiente para este candidato.");
        } else {
          setError(res.error?.message ?? "Error enviando solicitud.");
        }
        return;
      }

      const selected = candidates.find((c) => c.id === selectedId);
      setSubmittedName(selected?.name ?? "el candidato seleccionado");
      setSubmitted(true);
    } catch {
      setError("Error de conexion. Intente de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  // Candidates that the user hasn't already requested
  const requestedCampaignIds = new Set(myRequests.map((r) => r.campaign_id));
  const availableCandidates = candidates.filter((c) => !requestedCampaignIds.has(c.id));

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 24px",
        background: "var(--color-background)",
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
      }}
    >
      {/* GOBERNA header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <Image
          src="/isotipo(2).jpg"
          alt="GOBERNA"
          width={40}
          height={40}
          style={{ borderRadius: "var(--radius-sm)" }}
        />
        <span
          style={{
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "3px",
            color: "var(--goberna-blue-900)",
          }}
        >
          GOBERNA
        </span>
      </div>

      {/* Welcome */}
      <h1
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: "var(--color-text-primary)",
          margin: "24px 0 8px",
          textAlign: "center",
        }}
      >
        Bienvenido, {user?.full_name?.split(" ")[0] ?? "Usuario"}
      </h1>

      <p
        style={{
          fontSize: 15,
          color: "var(--color-text-secondary)",
          margin: "0 0 32px",
          textAlign: "center",
          maxWidth: 500,
          lineHeight: 1.5,
        }}
      >
        Seleccione el candidato con el que desea colaborar.
        Un administrador aprobara su solicitud.
      </p>

      {/* Error */}
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
            padding: "11px 14px",
            marginBottom: 20,
            maxWidth: 500,
            width: "100%",
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

      {/* Loading */}
      {loadingCandidates && (
        <div style={{ padding: "40px 0" }}>
          <Spinner size={32} />
        </div>
      )}

      {/* Candidate grid */}
      {!loadingCandidates && availableCandidates.length > 0 && (
        <div
          data-onboarding-grid
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
            width: "100%",
            maxWidth: 700,
            marginBottom: 32,
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
      )}

      {/* Empty state */}
      {!loadingCandidates && availableCandidates.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 24px",
            color: "var(--color-text-tertiary)",
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 500 }}>
            No hay candidatos disponibles en este momento.
          </p>
        </div>
      )}

      {/* Submit button */}
      {!loadingCandidates && availableCandidates.length > 0 && (
        <button
          type="button"
          disabled={!selectedId || submitting}
          onClick={handleSubmit}
          style={{
            padding: "14px 40px",
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "inherit",
            letterSpacing: "0.04em",
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
            transition: "background .2s, box-shadow .2s",
            boxShadow: selectedId ? "0 2px 8px rgba(255,200,0,.25)" : "none",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
          onMouseEnter={(e) => {
            if (selectedId && !submitting) {
              e.currentTarget.style.background = "var(--goberna-gold-300)";
            }
          }}
          onMouseLeave={(e) => {
            if (selectedId && !submitting) {
              e.currentTarget.style.background = "var(--goberna-gold)";
            }
          }}
        >
          {submitting ? (
            <>
              <Spinner size={18} color="var(--goberna-blue-950)" />
              <span>Enviando...</span>
            </>
          ) : (
            "Solicitar Acceso"
          )}
        </button>
      )}

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
        GOBERNA &copy; {new Date().getFullYear()} &middot; Todos los derechos reservados
      </p>
    </div>
  );
}
