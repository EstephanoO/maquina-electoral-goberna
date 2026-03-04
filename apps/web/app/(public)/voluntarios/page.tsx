import type { Metadata } from "next";
import { FONT_STACK } from "@/lib/constants";
import type { CandidatePublic } from "@/lib/types";
import { VoluntarioForm } from "./_components";

// ── Brand colors ────────────────────────────────────────────────────
const BLUE = "rgb(22, 57, 96)";
const BLUE_DARK = "rgb(14, 38, 64)";
const GOLD = "rgb(255, 200, 0)";

// ── SEO ──────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: "Sé Voluntario | Goberna",
  description:
    "Únete como brigadista voluntario a la campaña que impulsa el cambio territorial en el Perú. Regístrate y forma parte del equipo.",
};

// ── Data fetching (server) ───────────────────────────────────────────
async function fetchCandidates(): Promise<CandidatePublic[]> {
  try {
    const baseUrl =
      process.env.BACKEND_PROXY_TARGET ?? "https://api.goberna.us";
    const res = await fetch(`${baseUrl}/api/candidates`, {
      next: { revalidate: 300 }, // revalidate every 5 minutes
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { candidates: CandidatePublic[] };
    return data.candidates ?? [];
  } catch {
    return [];
  }
}

// ── Page ─────────────────────────────────────────────────────────────
export default async function VoluntariosPage() {
  const candidates = await fetchCandidates();

  return (
    <div
      style={{
        minHeight: "calc(100vh - 64px)",
        background: `linear-gradient(160deg, ${BLUE_DARK} 0%, ${BLUE} 60%, rgb(30,70,115) 100%)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.03,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
          pointerEvents: "none",
        }}
      />

      {/* Gold glow top-right */}
      <div
        style={{
          position: "absolute",
          top: "-80px",
          right: "-80px",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(255,200,0,0.07) 0%, transparent 70%)`,
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          maxWidth: 960,
          margin: "0 auto",
          padding: "64px 24px 80px",
          fontFamily: FONT_STACK,
        }}
      >
        {/* Header section */}
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 16px",
              borderRadius: 100,
              background: "rgba(255,200,0,0.1)",
              border: "1px solid rgba(255,200,0,0.2)",
              marginBottom: 28,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: GOLD,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.8,
                textTransform: "uppercase",
                color: GOLD,
              }}
            >
              Únete al equipo
            </span>
          </div>

          <h1
            style={{
              fontSize: "clamp(28px, 4.5vw, 48px)",
              fontWeight: 800,
              color: "#fff",
              margin: "0 0 16px",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            Sé{" "}
            <span style={{ color: GOLD }}>Brigadista Voluntario</span>
          </h1>

          <p
            style={{
              fontSize: "clamp(15px, 2vw, 18px)",
              color: "rgba(255,255,255,0.55)",
              maxWidth: 560,
              margin: "0 auto",
              lineHeight: 1.65,
              fontWeight: 400,
            }}
          >
            Forma parte de la operación territorial que está transformando la
            política en el Perú. Completa el formulario y el equipo de
            campaña se pondrá en contacto contigo.
          </p>
        </div>

        {/* Two-column layout: form + info */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr minmax(0, 420px)",
            gap: 40,
            alignItems: "start",
          }}
        >
          {/* ── Form card ── */}
          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16,
              padding: "36px 32px",
              backdropFilter: "blur(8px)",
            }}
          >
            <VoluntarioForm candidates={candidates} />
          </div>

          {/* ── Info panel ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {[
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
                title: "Trabajo en equipo",
                desc: "Colabora con brigadistas de tu zona y coordina acciones territoriales en tiempo real.",
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                ),
                title: "Impacto territorial",
                desc: "Cada voluntario cubre un área estratégica. Tu presencia local marca la diferencia.",
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                ),
                title: "Proceso rápido",
                desc: "Tu registro se procesa de inmediato. En menos de 48 h un coordinador te contactará.",
              },
            ].map((item) => (
              <div
                key={item.title}
                style={{
                  display: "flex",
                  gap: 16,
                  padding: "20px 22px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "rgba(255,200,0,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {item.icon}
                </div>
                <div>
                  <p
                    style={{
                      margin: "0 0 4px",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    {item.title}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}

            {/* Stats strip */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginTop: 8,
              }}
            >
              {[
                { value: "25", label: "Departamentos" },
                { value: "1,874", label: "Distritos" },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    padding: "18px 16px",
                    borderRadius: 12,
                    background: "rgba(255,200,0,0.06)",
                    border: "1px solid rgba(255,200,0,0.15)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: GOLD,
                      lineHeight: 1,
                    }}
                  >
                    {s.value}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.4)",
                      textTransform: "uppercase",
                      letterSpacing: 1.2,
                      marginTop: 6,
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
