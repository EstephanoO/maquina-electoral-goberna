"use client";

/**
 * /invite/[code] — Magic link landing page.
 *
 * Flow:
 * - Mobile (iOS/Android) WITH app installed: the universal link
 *   intercepts before this page even loads (handled by AASA + assetlinks).
 * - Mobile WITHOUT app installed: this page renders → fetches code info
 *   from backend → shows campaign name → CTA to install (TestFlight or
 *   Play Store) + custom scheme attempt for already-installed-but-AASA-broken.
 * - Desktop / unsupported: shows the code + instruction to open from mobile.
 *
 * Backend contract (mobile uses the same): GET /api/invitations/validate/:code
 *   → 200 { invitation: { campaign_id, campaign_name, campaign_slug, role } }
 *   → 401/403/404 → fallthrough to "code may be invalid" UI.
 *
 * The page never logs the user in — the actual flow happens in the app.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.estephano.gobernaterritory02&hl=es_PE";
const TESTFLIGHT_URL = "https://testflight.apple.com/join/JAZ5smzy";

const APP_SCHEME = "com.estephano.gobernaterritory02";

type DetectedPlatform = "android" | "ios" | "other";

type InvitationInfo = {
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  role: string;
};

type ValidationState =
  | { status: "loading" }
  | { status: "valid"; invitation: InvitationInfo }
  | { status: "invalid"; reason: string };

function detectPlatform(): DetectedPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  return "other";
}

const ROLE_LABELS: Record<string, string> = {
  agente_campo: "Agente de campo",
  brigadista_zonal: "Brigadista zonal",
  jefe_campana: "Jefe de campaña",
  candidato: "Candidato",
  consultor: "Consultor",
  admin: "Administrador",
};

export default function InvitePage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? "";

  const [platform, setPlatform] = useState<DetectedPlatform>("other");
  const [attempted, setAttempted] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({ status: "loading" });

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  // Validate the invitation code against the backend so the landing can
  // show the campaign name. Failure is non-fatal: we still show the install
  // CTA so the user can complete the flow inside the app.
  useEffect(() => {
    if (!code) {
      setValidation({ status: "invalid", reason: "Falta el código de invitación." });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invitations/validate/${encodeURIComponent(code)}`, {
          method: "GET",
          credentials: "omit",
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.ok) {
          const json = (await res.json()) as { invitation?: InvitationInfo };
          if (json.invitation) {
            setValidation({ status: "valid", invitation: json.invitation });
            return;
          }
        }
        setValidation({
          status: "invalid",
          reason:
            res.status === 404
              ? "El código no existe o ya fue usado."
              : "No pudimos validar el código. Probá abrirlo desde la app.",
        });
      } catch {
        if (!cancelled) {
          setValidation({
            status: "invalid",
            reason: "No pudimos validar el código (sin conexión).",
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [code]);

  // On Android: try to open the app via custom scheme as a last resort
  // (App Links should have already handled it if app is installed)
  useEffect(() => {
    if (platform !== "android" || !code || attempted) return;
    setAttempted(true);

    const timer = setTimeout(() => {
      window.location.href = `${APP_SCHEME}://invite/${code}`;
    }, 600);

    return () => clearTimeout(timer);
  }, [platform, code, attempted]);

  const handleStoreButton = () => {
    if (platform === "ios") {
      window.open(TESTFLIGHT_URL, "_blank");
    } else {
      window.open(PLAY_STORE_URL, "_blank");
    }
  };

  const storeLabel =
    platform === "ios" ? "Instalar via TestFlight" : "Descargar en Play Store";
  const storeIcon = platform === "ios" ? "🍎" : "▶";

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoWrap}>
          <Image
            src="/isotipo_2_-removebg-preview.png"
            alt="Goberna"
            width={72}
            height={72}
            style={{ borderRadius: 16 }}
            priority
          />
        </div>

        <div style={styles.badge}>
          <span style={styles.badgeIcon}>🔗</span>
          <span style={styles.badgeText}>Invitación oficial</span>
        </div>

        <h1 style={styles.title}>Goberna</h1>

        {/* Validation outcome */}
        {validation.status === "loading" && (
          <p style={styles.subtitle}>Validando tu invitación…</p>
        )}
        {validation.status === "valid" && (
          <>
            <p style={styles.subtitle}>
              Te invitan a unirte como{" "}
              <strong style={{ color: BRAND_BLUE }}>
                {ROLE_LABELS[validation.invitation.role] ?? validation.invitation.role}
              </strong>{" "}
              en
            </p>
            <p style={styles.campaignName}>{validation.invitation.campaign_name}</p>
          </>
        )}
        {validation.status === "invalid" && (
          <p style={styles.subtitle}>{validation.reason}</p>
        )}

        <div style={styles.divider} />

        {platform === "other" ? (
          <>
            <p style={styles.body}>
              Abrí este link desde tu teléfono Android o iOS para continuar.
            </p>
            <div style={styles.codeBox}>
              <span style={styles.codeLabel}>Tu código de invitación</span>
              <span style={styles.codeValue}>{code}</span>
            </div>
          </>
        ) : (
          <>
            <p style={styles.body}>
              {platform === "android"
                ? "Si la app no se abrió automáticamente, descargala desde Play Store e ingresá el código de invitación."
                : "Instalá la app de Goberna via TestFlight para usar tu invitación."}
            </p>

            <div style={styles.codeBox}>
              <span style={styles.codeLabel}>Tu código de invitación</span>
              <span style={styles.codeValue}>{code}</span>
            </div>

            <button type="button" style={styles.storeButton} onClick={handleStoreButton}>
              <span style={styles.storeIcon}>{storeIcon}</span>
              <span style={styles.storeButtonText}>{storeLabel}</span>
            </button>
          </>
        )}

        <p style={styles.footer}>¿Problemas? Contactá a tu coordinador de campaña.</p>
      </div>
    </div>
  );
}

const BRAND_BLUE = "#163960";
const BRAND_YELLOW = "#FFC800";

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: BRAND_BLUE,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "'Montserrat', system-ui, sans-serif",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: "40px 32px",
    maxWidth: 400,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
  },
  logoWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: BRAND_BLUE,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    overflow: "hidden",
  },
  badge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    border: "1px solid #BFDBFE",
    borderRadius: 20,
    padding: "4px 14px",
  },
  badgeIcon: { fontSize: 13 },
  badgeText: {
    fontSize: 12,
    fontWeight: 700,
    color: BRAND_BLUE,
    letterSpacing: 0.3,
    textTransform: "uppercase" as const,
  },
  title: { fontSize: 28, fontWeight: 800, color: BRAND_BLUE, margin: 0, letterSpacing: 1 },
  subtitle: {
    fontSize: 15,
    color: "rgba(22,57,96,0.6)",
    margin: 0,
    textAlign: "center" as const,
    lineHeight: 1.5,
  },
  campaignName: {
    fontSize: 18,
    fontWeight: 800,
    color: BRAND_BLUE,
    margin: 0,
    textAlign: "center" as const,
  },
  divider: { width: "100%", height: 1, backgroundColor: "#E1E6F0", margin: "4px 0" },
  body: {
    fontSize: 14,
    color: "rgba(22,57,96,0.7)",
    textAlign: "center" as const,
    lineHeight: 1.6,
    margin: 0,
  },
  codeBox: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F8FAFC",
    border: "1.5px solid #E1E6F0",
    borderRadius: 14,
    padding: "12px 24px",
    width: "100%",
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(22,57,96,0.5)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  codeValue: {
    fontSize: 22,
    fontWeight: 800,
    color: BRAND_BLUE,
    letterSpacing: 4,
    fontVariantNumeric: "tabular-nums",
  },
  storeButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: BRAND_YELLOW,
    border: "none",
    borderRadius: 14,
    padding: "16px 24px",
    width: "100%",
    cursor: "pointer",
    marginTop: 4,
  },
  storeIcon: { fontSize: 18 },
  storeButtonText: {
    fontSize: 15,
    fontWeight: 800,
    color: BRAND_BLUE,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  footer: {
    fontSize: 12,
    color: "rgba(22,57,96,0.4)",
    textAlign: "center" as const,
    margin: 0,
    marginTop: 8,
  },
};
