import type { Metadata } from "next";
import { FONT_STACK } from "@/lib/constants";
import type { CandidatePublic } from "@/lib/types";
import { VoluntarioForm } from "./_components";

// ── Brand tokens ─────────────────────────────────────────────────────
const C = {
  blue:      "rgb(22, 57, 96)",
  blueDark:  "rgb(14, 38, 64)",
  blueDeep:  "rgb(10, 28, 48)",
  gold:      "rgb(255, 200, 0)",
  goldDim:   "rgba(255,200,0,0.1)",
  goldBorder:"rgba(255,200,0,0.2)",
};

// ── SEO ──────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: "Sé Brigadista Voluntario | Goberna",
  description:
    "Únete como brigadista voluntario a la campaña que impulsa el cambio territorial en el Perú. Regístrate y forma parte del equipo.",
  openGraph: {
    title: "Sé Brigadista Voluntario | Goberna",
    description: "Operación territorial inteligente. Forma parte del equipo que transforma la política en el Perú.",
  },
};

// ── Data fetching ─────────────────────────────────────────────────────
async function fetchCandidates(): Promise<CandidatePublic[]> {
  try {
    const base = process.env.BACKEND_PROXY_TARGET ?? "https://api.goberna.us";
    const res = await fetch(`${base}/api/candidates`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { candidates: CandidatePublic[] };
    return data.candidates ?? [];
  } catch {
    return [];
  }
}

// ── Page ──────────────────────────────────────────────────────────────
export default async function VoluntariosPage() {
  const candidates = await fetchCandidates();

  return (
    <div
      style={{
        minHeight: "calc(100vh - 64px)",
        background: `linear-gradient(160deg, ${C.blueDeep} 0%, ${C.blueDark} 40%, ${C.blue} 100%)`,
        position: "relative",
        overflow: "hidden",
        fontFamily: FONT_STACK,
      }}
    >
      {/* ── Background decorations ── */}

      {/* Grid overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: [
          "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
          "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
        ].join(", "),
        backgroundSize: "48px 48px",
      }} />

      {/* Gold glow — top right */}
      <div style={{
        position: "absolute", top: -120, right: -120,
        width: 600, height: 600, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,200,0,0.1) 0%, transparent 65%)",
        filter: "blur(80px)", pointerEvents: "none",
      }} />

      {/* Subtle blue glow — bottom left */}
      <div style={{
        position: "absolute", bottom: -100, left: -100,
        width: 500, height: 500, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(30,90,160,0.3) 0%, transparent 70%)",
        filter: "blur(80px)", pointerEvents: "none",
      }} />

      {/* ── Content ── */}
      <div style={{
        position: "relative",
        maxWidth: 1080,
        margin: "0 auto",
        padding: "72px 24px 96px",
      }}>

        {/* ── Hero Header ── */}
        <div style={{ textAlign: "center", marginBottom: 64 }}>

          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "7px 18px", borderRadius: 100, marginBottom: 32,
            background: C.goldDim, border: `1px solid ${C.goldBorder}`,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={C.gold} stroke="none">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
              textTransform: "uppercase", color: C.gold,
            }}>
              Únete al equipo Goberna
            </span>
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: "clamp(32px, 5.5vw, 60px)",
            fontWeight: 900,
            color: "#fff",
            margin: "0 0 20px",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
          }}>
            Sé{" "}
            <span style={{
              color: C.gold,
              display: "inline-block",
            }}>
              Brigadista
            </span>
            <br />
            Voluntario
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: "clamp(15px, 2vw, 18px)",
            color: "rgba(255,255,255,0.55)",
            maxWidth: 540,
            margin: "0 auto 40px",
            lineHeight: 1.7,
          }}>
            Forma parte de la operación territorial que está transformando
            la política en el Perú. Tu zona necesita un líder.
          </p>

          {/* Trust bar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(16px, 3vw, 40px)",
            flexWrap: "wrap",
          }}>
            {[
              { value: "25", label: "Departamentos" },
              { value: "196", label: "Provincias" },
              { value: "1,874", label: "Distritos" },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 900, color: C.gold, lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Main layout: form + benefits ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 520px) minmax(0, 1fr)",
          gap: 40,
          alignItems: "start",
          justifyContent: "center",
        }}>

          {/* ── Form Card ── */}
          <div style={{
            background: "rgba(255,255,255,0.045)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20,
            padding: "clamp(24px, 4vw, 40px)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
          }}>
            <VoluntarioForm candidates={candidates} />
          </div>

          {/* ── Right panel ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Benefits */}
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
                title: "Trabajo en equipo",
                desc: "Colabora con brigadistas de tu zona y coordina acciones territoriales en tiempo real con la plataforma Goberna.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                ),
                title: "Impacto territorial",
                desc: "Cada voluntario cubre un área estratégica. Tu presencia local en el distrito marca la diferencia.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                ),
                title: "Proceso inmediato",
                desc: "Tu registro se procesa en el momento. En menos de 48 horas un coordinador de tu zona se pondrá en contacto.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                ),
                title: "Seguimiento en tiempo real",
                desc: "Acceso a métricas de la operación territorial, zonas de cobertura y rendimiento del equipo.",
              },
            ].map((item) => (
              <div
                key={item.title}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "18px 20px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  transition: "border-color 0.2s ease",
                }}
              >
                <div style={{
                  flexShrink: 0,
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: C.goldDim,
                  border: `1px solid ${C.goldBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {item.icon}
                </div>
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    {item.title}
                  </p>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,0.45)" }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}

            {/* Testimonial / quote */}
            <div style={{
              padding: "20px",
              borderRadius: 14,
              background: C.goldDim,
              border: `1px solid ${C.goldBorder}`,
              marginTop: 4,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill={C.gold} style={{ marginBottom: 10, opacity: 0.7 }}>
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
              </svg>
              <p style={{ margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.65, color: "rgba(255,255,255,0.7)", fontStyle: "italic" }}>
                &ldquo;El software que usa el equipo nos permite ver en tiempo real quiénes están activos en cada distrito. Cambia la manera de hacer campaña.&rdquo;
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(255,200,0,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 800, color: C.gold,
                }}>
                  G
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#fff" }}>Coordinador de Zona</p>
                  <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Lima Sur</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
