import Link from "next/link";
import { FONT_STACK } from "@/lib/constants";

export function CtaSection() {
  return (
    <section
      style={{
        position: "relative",
        padding: "80px 24px",
        background: "linear-gradient(135deg, var(--goberna-blue-950) 0%, var(--goberna-blue-900) 100%)",
        overflow: "hidden",
        fontFamily: FONT_STACK,
      }}
    >
      {/* Decorative grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.03,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Gold glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 500,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,200,0,0.06) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div
        style={{
          position: "relative",
          maxWidth: 700,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(24px, 3.5vw, 36px)",
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.2,
            margin: "0 0 16px",
          }}
        >
          Tu operacion territorial{" "}
          <span style={{ color: "var(--goberna-gold)" }}>empieza hoy</span>
        </h2>

        <p
          style={{
            fontSize: "clamp(15px, 1.8vw, 18px)",
            lineHeight: 1.7,
            color: "rgba(255,255,255,0.55)",
            margin: "0 0 40px",
            maxWidth: 540,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Habla con nuestro equipo y recibe una demo personalizada.
          Sin compromiso, sin letra chica.
        </p>

        <div
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/onboarding"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 36px",
              fontSize: 15,
              fontWeight: 700,
              color: "#0f172a",
              textDecoration: "none",
              borderRadius: 10,
              background: "var(--goberna-gold)",
              boxShadow: "0 4px 24px rgba(255,200,0,0.25)",
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

          <a
            href="https://wa.me/51999999999"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 36px",
              fontSize: 15,
              fontWeight: 600,
              color: "rgba(255,255,255,0.9)",
              textDecoration: "none",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.2)",
              transition: "all 0.2s ease",
              fontFamily: FONT_STACK,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Hablar por WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
