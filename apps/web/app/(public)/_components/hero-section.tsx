import Link from "next/link";
import { FONT_STACK } from "@/lib/constants";

export function HeroSection() {
  return (
    <section
      style={{
        position: "relative",
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: "linear-gradient(135deg, var(--goberna-blue-950) 0%, var(--goberna-blue-900) 50%, var(--goberna-blue-800) 100%)",
      }}
    >
      {/* Decorative grid pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.04,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Decorative glow */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          right: "10%",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,200,0,0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div
        style={{
          position: "relative",
          maxWidth: 900,
          margin: "0 auto",
          padding: "80px 24px",
          textAlign: "center",
          fontFamily: FONT_STACK,
        }}
      >
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
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--goberna-gold)",
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: "var(--goberna-gold)",
            }}
          >
            Plataforma de Inteligencia Territorial
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 800,
            lineHeight: 1.1,
            color: "#ffffff",
            margin: "0 0 24px",
            letterSpacing: "-0.02em",
          }}
        >
          Operacion Territorial{" "}
          <span style={{ color: "var(--goberna-gold)" }}>Inteligente</span>
          {" "}para Campanas Politicas
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: "clamp(16px, 2vw, 20px)",
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.6)",
            maxWidth: 640,
            margin: "0 auto 48px",
            fontWeight: 400,
          }}
        >
          Geovisores interactivos, gestion de campo en tiempo real y datos
          electorales para tomar mejores decisiones territoriales.
        </p>

        {/* CTAs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/mapa"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 32px",
              fontSize: 15,
              fontWeight: 700,
              color: "#0f172a",
              textDecoration: "none",
              borderRadius: "var(--radius-md)",
              background: "var(--goberna-gold)",
              transition: "all 0.2s ease",
              fontFamily: FONT_STACK,
              boxShadow: "0 4px 24px rgba(255,200,0,0.25)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            Explorar Mapa
          </Link>

          <Link
            href="/onboarding"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 32px",
              fontSize: 15,
              fontWeight: 600,
              color: "rgba(255,255,255,0.9)",
              textDecoration: "none",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(255,255,255,0.2)",
              transition: "all 0.2s ease",
              fontFamily: FONT_STACK,
            }}
          >
            Comenzar Ahora
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "clamp(24px, 4vw, 64px)",
            marginTop: 72,
            flexWrap: "wrap",
          }}
        >
          {[
            { value: "25", label: "Departamentos" },
            { value: "196", label: "Provincias" },
            { value: "1,874", label: "Distritos" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "clamp(28px, 3vw, 40px)",
                  fontWeight: 800,
                  color: "var(--goberna-gold)",
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  marginTop: 8,
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
