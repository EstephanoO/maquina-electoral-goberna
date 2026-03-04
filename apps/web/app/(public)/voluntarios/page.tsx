import type { Metadata } from "next";
import { FONT_STACK } from "@/lib/constants";
import type { CandidatePublic } from "@/lib/types";
import { VoluntarioForm } from "./_components";

// ── Design tokens (LandigGoberna) ───────────────────────────────────────
const T = {
  bgMain:       "#060b12",
  textMain:     "#f2f6ff",
  textMuted:    "#c1ccdf",
  line:         "rgba(255,255,255,0.07)",
  cardBorder:   "rgba(255,255,255,0.1)",
  accent:       "#f4cc15",
  accentDim:    "rgba(244,204,21,0.10)",
  accentBorder: "rgba(244,204,21,0.25)",
  accentGlow:   "rgba(244,204,21,0.18)",
} as const;

export const metadata: Metadata = {
  title: "Sé Brigadista | Apoya a tu candidato",
  description:
    "Elige al candidato que te representa y únete como brigadista en tu distrito.",
  openGraph: {
    title: "Sé Brigadista | Apoya a tu candidato",
    description:
      "Elige al candidato que te representa y forma parte de la operación territorial en tu zona.",
  },
};

async function fetchCandidates(): Promise<CandidatePublic[]> {
  try {
    const base = process.env.BACKEND_PROXY_TARGET ?? "https://api.goberna.us";
    const res = await fetch(`${base}/api/candidates`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { candidates: CandidatePublic[] };
    return data.candidates ?? [];
  } catch { return []; }
}

const BENEFITS = [
  {
    icon: (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Equipo organizado",
    desc: "Coordina con brigadistas de tu distrito en tiempo real.",
  },
  {
    icon: (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    ),
    title: "Tu zona, tu voz",
    desc: "Tu presencia en el distrito marca la diferencia.",
  },
  {
    icon: (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: "Apoyo directo",
    desc: "Respalda al candidato que elegiste con acción territorial.",
  },
  {
    icon: (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: "Datos en vivo",
    desc: "Seguí el avance de la campaña desde tu celular.",
  },
];

export default async function VoluntariosPage() {
  const candidates = await fetchCandidates();

  return (
    <div
      style={{
        minHeight: "calc(100vh - 64px)",
        background: T.bgMain,
        position: "relative",
        overflowX: "clip",
        fontFamily: FONT_STACK,
        color: T.textMain,
        width: "100%",
      }}
    >
      <style>{`
        /* ── reset overflow ── */
        html, body, main { overflow-x: clip !important; }

        /* ── grid overlay ── */
        .vol-bg {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image:
            linear-gradient(${T.line} 1px, transparent 1px),
            linear-gradient(90deg, ${T.line} 1px, transparent 1px);
          background-size: 48px 48px;
          opacity: 0.55;
        }

        /* ── page wrapper ── */
        .vol-wrap {
          position: relative; z-index: 1;
          max-width: 1200px; margin: 0 auto;
          padding: clamp(40px,5vw,64px) 24px clamp(64px,8vw,96px);
          display: flex; flex-direction: column; align-items: center;
          gap: clamp(32px,4vw,48px);
        }

        /* ── hero ── */
        .vol-hero { text-align: center; max-width: 680px; }
        .vol-kicker {
          display: inline-flex; align-items: center; gap: 8px;
          margin: 0 0 16px;
          padding: 5px 14px;
          border-radius: 999px;
          border: 1px solid ${T.accentBorder};
          background: ${T.accentDim};
          color: ${T.accent};
          letter-spacing: .1em;
          font-size: .7rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        .vol-h1 {
          font-size: clamp(2rem, 6vw, 3.6rem);
          font-weight: 900;
          margin: 0 0 16px;
          line-height: 1.06;
          letter-spacing: -.035em;
        }
        .vol-sub {
          margin: 0;
          font-size: clamp(.9rem, 1.5vw, 1.05rem);
          color: ${T.textMuted};
          line-height: 1.65;
          max-width: 46ch;
        }

        /* ── 3-col layout ── */
        .vol-layout {
          display: grid;
          grid-template-columns: 200px minmax(0,1fr) 200px;
          gap: 20px;
          align-items: start;
          width: 100%;
        }

        /* ── sidebars ── */
        .vol-aside-l, .vol-aside-r {
          display: flex; flex-direction: column; gap: 12px; padding-top: 8px;
        }

        /* ── form card ── */
        .vol-form-card {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.11);
          background: linear-gradient(160deg, rgba(14,24,42,.97) 0%, rgba(6,11,22,.99) 100%);
          box-shadow:
            0 0 0 1px ${T.accentGlow},
            0 40px 80px rgba(0,0,0,.6),
            inset 0 1px 0 rgba(255,255,255,.07);
          padding: clamp(28px,3.5vw,44px);
        }

        /* ── benefits strip — mobile only ── */
        .vol-benefits-mob { display: none; width: 100%; }

        /* ── MOBILE ── */
        @media (max-width: 768px) {
          .vol-wrap {
            padding: 16px 0 0;
            gap: 0;
          }
          .vol-hero {
            padding: 24px 16px 20px;
            max-width: 100%;
          }
          .vol-sub { display: none; }
          .vol-layout {
            grid-template-columns: 1fr;
            gap: 0;
            width: 100%;
          }
          .vol-aside-l, .vol-aside-r { display: none; }
          .vol-form-card {
            border-radius: 20px 20px 0 0;
            border-left: none;
            border-right: none;
            border-bottom: none;
            padding: 28px 20px 36px;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.07);
            background: linear-gradient(175deg, rgba(14,24,42,.98) 0%, rgba(6,11,22,1) 100%);
          }
          .vol-benefits-mob {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            padding: 16px 16px 32px;
            background: ${T.bgMain};
          }
        }
      `}</style>

      <div className="vol-bg" />

      {/* decorative glows — fully inside container */}
      <div style={{
        position: "absolute", top: 0, right: 0,
        width: 260, height: 260, borderRadius: "50%",
        background: `radial-gradient(circle, ${T.accentGlow} 0%, transparent 70%)`,
        filter: "blur(60px)", pointerEvents: "none", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0,
        width: 260, height: 260, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(19,123,255,.12) 0%, transparent 70%)",
        filter: "blur(60px)", pointerEvents: "none", zIndex: 0,
      }} />

      <div className="vol-wrap">

        {/* ── Hero ── */}
        <div className="vol-hero">
          <p className="vol-kicker">
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="4" fill={T.accent} />
            </svg>
            Operación territorial
          </p>
          <h1 className="vol-h1">
            Sé{" "}
            <span style={{ color: T.accent, textShadow: `0 0 28px ${T.accentGlow}` }}>
              Brigadista
            </span>{" "}
            de tu candidato
          </h1>
          <p className="vol-sub">
            Elegí al candidato que te representa y sumáte a la operación
            territorial en tu distrito.
          </p>
        </div>

        {/* ── 3-col layout ── */}
        <div className="vol-layout">

          {/* Left sidebar — quote */}
          <div className="vol-aside-l">
            <div style={{
              padding: "20px",
              borderRadius: 14,
              border: `1px solid ${T.accentBorder}`,
              background: "linear-gradient(160deg, rgba(18,30,52,.92), rgba(8,14,26,.96))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
            }}>
              {/* large quote mark */}
              <div style={{
                fontSize: 48, lineHeight: 1, color: T.accent, opacity: 0.4,
                fontFamily: "Georgia, serif", marginBottom: 6,
              }}>
                &ldquo;
              </div>
              <p style={{
                margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.7,
                color: T.textMuted, fontStyle: "italic",
              }}>
                Elegí a mi candidato, me registré y al día siguiente ya estaba coordinando con el equipo de mi distrito.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: T.accentDim,
                  border: `1px solid ${T.accentBorder}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 800, color: T.accent, flexShrink: 0,
                }}>
                  R
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: T.textMain }}>
                    Ricardo M.
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.38)", marginTop: 1 }}>
                    Brigadista · Lima Este
                  </p>
                </div>
              </div>
            </div>

            {/* stat pill */}
            <div style={{
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.08)",
              background: "rgba(8,14,26,.8)",
              textAlign: "center",
            }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.accent }}>
                +2,400
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 11, color: T.textMuted, lineHeight: 1.4 }}>
                brigadistas activos en el país
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="vol-form-card">
            <VoluntarioForm candidates={candidates} />
          </div>

          {/* Right sidebar — benefits */}
          <div className="vol-aside-r">
            {BENEFITS.map((b) => (
              <div key={b.title} style={{
                display: "flex",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.08)",
                background: "linear-gradient(160deg, rgba(12,20,38,.95), rgba(6,11,21,.97))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)",
              }}>
                <div style={{
                  flexShrink: 0,
                  width: 40, height: 40, borderRadius: 11,
                  border: `1px solid ${T.accentBorder}`,
                  background: T.accentDim,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {b.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color: T.textMain }}>
                    {b.title}
                  </p>
                  <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: T.textMuted }}>
                    {b.desc}
                  </p>
                </div>
              </div>
            ))}
            {/* accent bar */}
            <div style={{
              height: 2, borderRadius: 999,
              background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`,
              opacity: 0.6,
            }} />
          </div>
        </div>

        {/* ── Benefits 2×2 — mobile only ── */}
        <div className="vol-benefits-mob">
          {BENEFITS.map((b) => (
            <div key={b.title} style={{
              display: "flex", flexDirection: "column", gap: 8,
              padding: "16px 14px 18px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,.07)",
              background: "linear-gradient(160deg, rgba(12,20,38,.95), rgba(6,11,21,.97))",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                border: `1px solid ${T.accentBorder}`,
                background: T.accentDim,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {b.icon}
              </div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.textMain }}>
                {b.title}
              </p>
              <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: T.textMuted }}>
                {b.desc}
              </p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
