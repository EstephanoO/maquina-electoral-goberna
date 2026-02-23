"use client";

import Image from "next/image";
import Link from "next/link";

/* ═══════════════════════════════════════════════════════════════════════
   GOBERNA — 404 Not Found
   Branded page with auth-aware redirect button.
   ═══════════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = "goberna_access_token";

function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(STORAGE_KEY);
}

export default function NotFound() {
  const authenticated = typeof window !== "undefined" && isLoggedIn();
  const href = authenticated ? "/home" : "/login";
  const label = authenticated ? "Ir al Dashboard" : "Iniciar Sesion";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--goberna-blue-950)",
        position: "relative",
        overflow: "hidden",
        padding: "40px 24px",
      }}
    >
      {/* Subtle grid pattern */}
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
          width: 500,
          height: 500,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,200,0,.05) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          animation: "goberna-404-fade-in .7s ease-out both",
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            overflow: "hidden",
            border: "2.5px solid rgba(255,200,0,.2)",
            boxShadow: "0 0 40px rgba(255,200,0,.08), 0 6px 24px rgba(0,0,0,.3)",
            marginBottom: 32,
            flexShrink: 0,
          }}
        >
          <Image
            src="/isotipo_2_-removebg-preview.png"
            alt="GOBERNA"
            width={88}
            height={88}
            priority
            style={{ objectFit: "cover", display: "block" }}
          />
        </div>

        {/* 404 number */}
        <h1
          style={{
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: "0.06em",
            color: "rgba(255,255,255,.08)",
            margin: 0,
            lineHeight: 1,
            position: "absolute",
            top: -24,
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          404
        </h1>

        {/* Brand name */}
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.18em",
            color: "rgba(255,255,255,.35)",
            margin: "0 0 24px",
            textTransform: "uppercase",
          }}
        >
          GOBERNA
        </p>

        {/* Gold accent line */}
        <div
          style={{
            width: 48,
            height: 2.5,
            background: "var(--goberna-gold)",
            borderRadius: 2,
            marginBottom: 24,
          }}
        />

        {/* Title */}
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#ffffff",
            margin: "0 0 10px",
            lineHeight: 1.3,
          }}
        >
          Pagina no encontrada
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 14,
            fontWeight: 400,
            color: "rgba(255,255,255,.5)",
            margin: "0 0 36px",
            maxWidth: 340,
            lineHeight: 1.5,
          }}
        >
          La ruta que buscas no existe o fue movida.
        </p>

        {/* CTA button */}
        <Link
          href={href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 28px",
            background: "var(--goberna-gold)",
            color: "var(--goberna-blue-950)",
            fontSize: 14,
            fontWeight: 700,
            borderRadius: 8,
            textDecoration: "none",
            letterSpacing: "0.02em",
            boxShadow: "0 2px 12px rgba(255,200,0,.2)",
            transition: "background .15s, box-shadow .15s, transform .15s",
          }}
          onMouseEnter={(e) => {
            const t = e.currentTarget;
            t.style.background = "var(--goberna-gold-300)";
            t.style.boxShadow = "0 4px 20px rgba(255,200,0,.3)";
            t.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            const t = e.currentTarget;
            t.style.background = "var(--goberna-gold)";
            t.style.boxShadow = "0 2px 12px rgba(255,200,0,.2)";
            t.style.transform = "translateY(0)";
          }}
        >
          {/* Arrow icon */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M3 8h10m0 0L9.5 4.5M13 8l-3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {label}
        </Link>
      </div>

      {/* Bottom tagline */}
      <p
        style={{
          position: "absolute",
          bottom: 28,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 11,
          fontWeight: 400,
          color: "rgba(255,255,255,.25)",
          letterSpacing: "0.05em",
          margin: 0,
          padding: "0 24px",
        }}
      >
        Plataforma de Gestion Territorial
      </p>

      {/* Scoped animation */}
      <style>{`
        @keyframes goberna-404-fade-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
