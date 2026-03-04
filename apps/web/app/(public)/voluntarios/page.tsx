import type { Metadata } from "next";
import { FONT_STACK } from "@/lib/constants";
import type { CandidatePublic } from "@/lib/types";
import { VoluntarioForm } from "./_components";

const T = {
  bgMain:       "#060b12",
  textMain:     "#f2f6ff",
  textMuted:    "#c1ccdf",
  line:         "rgba(255,255,255,0.09)",
  cardBorder:   "rgba(255,255,255,0.1)",
  accent:       "#f4cc15",
  accentDim:    "rgba(244,204,21,0.12)",
  accentBorder: "rgba(244,204,21,0.28)",
  accentGlow:   "rgba(244,204,21,0.22)",
} as const;

export const metadata: Metadata = {
  title: "Sé Brigadista Voluntario | Goberna",
  description:
    "Únete como brigadista voluntario a la campaña que impulsa el cambio territorial en el Perú.",
  openGraph: {
    title: "Sé Brigadista Voluntario | Goberna",
    description: "Operación territorial inteligente. Forma parte del equipo que transforma la política en el Perú.",
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
    icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    title: "Trabajo en equipo",
    desc: "Coordina en tiempo real con brigadistas de tu zona.",
  },
  {
    icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    title: "Impacto territorial",
    desc: "Tu presencia local en el distrito marca la diferencia.",
  },
  {
    icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    title: "Respuesta en 48 h",
    desc: "Un coordinador de tu zona te contactará rápido.",
  },
  {
    icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    title: "Métricas en vivo",
    desc: "Accede a datos de cobertura y rendimiento del equipo.",
  },
];

export default async function VoluntariosPage() {
  const candidates = await fetchCandidates();

  return (
    <div style={{ minHeight: "calc(100vh - 64px)", background: T.bgMain, position: "relative", overflowX: "clip", fontFamily: FONT_STACK, color: T.textMain, width: "100%" }}>
      <style>{`
        /* prevent horizontal scroll — clip en toda la cadena */
        html, body, main { overflow-x: clip !important; }
        html, body { max-width: 100%; }

        /* ── grid overlay ── */
        .vol-bg {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image:
            linear-gradient(${T.line} 1px, transparent 1px),
            linear-gradient(90deg, ${T.line} 1px, transparent 1px);
          background-size: 48px 48px; opacity: 0.62;
        }

        /* ── wrapper ── */
        .vol-wrap {
          position: relative; z-index: 1;
          max-width: 1280px; margin: 0 auto;
          padding: clamp(36px,6vw,72px) 20px clamp(56px,8vw,96px);
          display: flex; flex-direction: column; align-items: center;
          gap: clamp(28px,5vw,52px);
        }

        /* ── hero ── */
        .vol-hero { text-align: center; }
        .vol-kicker {
          margin: 0 0 12px; color: ${T.accent};
          letter-spacing: .08em; font-size: .76rem;
          font-weight: 300; text-transform: uppercase;
        }
        .vol-h1 {
          font-size: clamp(1.9rem,8vw,3.8rem);
          font-weight: 900; margin: 0;
          line-height: 1.06; letter-spacing: -.035em;
        }
        .vol-sub {
          margin: .9rem auto 0;
          font-size: clamp(.88rem,1.6vw,1rem);
          color: ${T.textMuted}; line-height: 1.6; font-weight: 500; max-width: 44ch;
        }

        /* ── 3-col layout (desktop) ── */
        .vol-layout {
          display: grid;
          grid-template-columns: minmax(0,220px) minmax(0,1fr) minmax(0,220px);
          gap: 24px; align-items: start; width: 100%;
        }
        .vol-aside-l, .vol-aside-r { display: flex; flex-direction: column; gap: 10px; padding-top: 6px; }
        .vol-form-card {
          border-radius: 16px;
          border: 1px solid ${T.cardBorder};
          background: linear-gradient(165deg,rgba(21,34,56,.9),rgba(8,14,26,.95));
          box-shadow: 0 32px 96px rgba(0,0,0,.5), 0 -22px 72px -28px rgba(255,255,255,.12) inset, 0 0 0 1px ${T.accentGlow};
          padding: clamp(24px,4vw,48px);
        }

        /* benefits strip mobile */
        .vol-benefits-mob { display: none; width: 100%; }

        /* ── MOBILE ── */
        @media (max-width: 768px) {
          .vol-wrap { padding: 20px 12px 48px; gap: 0; }
          .vol-hero  { padding: 20px 4px 18px; }
          .vol-sub   { display: none; }
          .vol-layout {
            grid-template-columns: 1fr;
            gap: 0;
          }
          .vol-aside-l, .vol-aside-r { display: none; }
          .vol-form-card {
            border-radius: 0;
            border-left: none; border-right: none;
            padding: 24px 16px 32px;
            box-shadow: none;
            background: linear-gradient(175deg,rgba(15,26,46,.97),rgba(6,11,22,.99));
          }
          .vol-benefits-mob {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            padding: 20px 12px 0;
          }
        }
      `}</style>

      <div className="vol-bg" />

      {/* glows — 100% dentro del contenedor, sin overflow */}
      <div style={{ position:"absolute", top:0, right:0, width:260, height:260, borderRadius:"50%", background:`radial-gradient(circle,${T.accentGlow} 0%,transparent 70%)`, filter:"blur(60px)", pointerEvents:"none", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:0, left:0, width:260, height:260, borderRadius:"50%", background:"radial-gradient(circle,rgba(19,123,255,.13) 0%,transparent 70%)", filter:"blur(60px)", pointerEvents:"none", zIndex:0 }} />

      <div className="vol-wrap">

        {/* hero */}
        <div className="vol-hero">
          <p className="vol-kicker">Únete al equipo Goberna</p>
          <h1 className="vol-h1">
            Sé <span style={{ color:T.accent, textShadow:`0 0 22px ${T.accentGlow}` }}>Brigadista</span> Voluntario
          </h1>
          <p className="vol-sub">
            Forma parte de la operación territorial que está transformando la política en el Perú.
          </p>
        </div>

        {/* layout */}
        <div className="vol-layout">

          {/* left sidebar — desktop only */}
          <div className="vol-aside-l">
            <div style={{ padding:20, borderRadius:14, border:`1px solid ${T.accentBorder}`, background:"linear-gradient(165deg,rgba(21,34,56,.88),rgba(8,14,26,.92))", boxShadow:"0 -18px 60px -26px rgba(255,255,255,.08) inset" }}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill={T.accent} style={{ marginBottom:10, opacity:.55 }}>
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
              </svg>
              <p style={{ margin:"0 0 14px", fontSize:13, lineHeight:1.65, color:T.textMuted, fontStyle:"italic" }}>
                &ldquo;El software nos permite ver en tiempo real quiénes están activos en cada distrito.&rdquo;
              </p>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:30, height:30, borderRadius:"50%", background:T.accentDim, border:`1px solid ${T.accentBorder}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:T.accent }}>G</div>
                <div>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, color:T.textMain }}>Coordinador de Zona</p>
                  <p style={{ margin:0, fontSize:11, color:"rgba(255,255,255,.35)" }}>Lima Sur</p>
                </div>
              </div>
            </div>
          </div>

          {/* form */}
          <div className="vol-form-card">
            <VoluntarioForm candidates={candidates} />
          </div>

          {/* right sidebar — desktop only */}
          <div className="vol-aside-r">
            {BENEFITS.map((b) => (
              <div key={b.title} style={{ display:"flex", gap:12, padding:"14px 16px", borderRadius:14, border:"1px solid rgba(171,191,220,.16)", background:"linear-gradient(162deg,rgba(10,18,33,.96),rgba(6,11,21,.94))", boxShadow:"0 18px 38px -28px rgba(0,0,0,.8),0 -22px 72px -40px rgba(255,255,255,.08) inset" }}>
                <div style={{ flexShrink:0, width:36, height:36, borderRadius:10, border:`1px solid ${T.accentBorder}`, background:T.accentDim, display:"flex", alignItems:"center", justifyContent:"center" }}>{b.icon}</div>
                <div>
                  <p style={{ margin:"0 0 3px", fontSize:13, fontWeight:700, color:T.textMain }}>{b.title}</p>
                  <p style={{ margin:0, fontSize:11.5, lineHeight:1.55, color:T.textMuted }}>{b.desc}</p>
                </div>
              </div>
            ))}
            <div style={{ marginTop:4, height:3, borderRadius:999, background:`linear-gradient(90deg,${T.accentDim} 0%,rgba(244,205,20,.9) 48%,${T.accentDim} 100%)`, boxShadow:`0 0 14px ${T.accentGlow}` }} />
          </div>
        </div>

        {/* benefits 2×2 — mobile only */}
        <div className="vol-benefits-mob">
          {BENEFITS.map((b) => (
            <div key={b.title} style={{ display:"flex", flexDirection:"column", gap:8, padding:"16px 14px 18px", borderRadius:14, border:"1px solid rgba(171,191,220,.14)", background:"linear-gradient(162deg,rgba(10,18,33,.96),rgba(6,11,21,.94))" }}>
              <div style={{ width:34, height:34, borderRadius:9, border:`1px solid ${T.accentBorder}`, background:T.accentDim, display:"flex", alignItems:"center", justifyContent:"center" }}>{b.icon}</div>
              <p style={{ margin:0, fontSize:13, fontWeight:700, color:T.textMain }}>{b.title}</p>
              <p style={{ margin:0, fontSize:11, lineHeight:1.5, color:T.textMuted }}>{b.desc}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
