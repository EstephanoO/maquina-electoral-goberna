"use client";

import Image from "next/image";
import { useState } from "react";
import { FONT_STACK } from "@/lib/constants";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.estephano.gobernaterritory02&hl=es_PE";
const TESTFLIGHT_URL = "https://testflight.apple.com/join/JAZ5smzy";

export default function DescargarPage() {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [enviado, setEnviado] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !correo.trim()) return;
    // TODO: conectar a backend POST /api/leads
    setEnviado(true);
    setNombre("");
    setCorreo("");
    setTimeout(() => setEnviado(false), 4000);
  }

  return (
    <section
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background:
          "linear-gradient(135deg, var(--goberna-blue-950) 0%, var(--goberna-blue-900) 50%, var(--goberna-blue-800) 100%)",
        fontFamily: FONT_STACK,
      }}
    >
      {/* Decorative grid */}
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

      {/* Gold glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,200,0,0.08) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div
        style={{
          position: "relative",
          maxWidth: 560,
          width: "100%",
          margin: "0 auto",
          padding: "80px 24px",
          textAlign: "center",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 40 }}>
          <Image
            src="/isotipo_2_-removebg-preview.png"
            alt="Goberna"
            width={48}
            height={48}
            style={{ borderRadius: 8 }}
            priority
          />
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: "clamp(36px, 6vw, 56px)",
            fontWeight: 800,
            lineHeight: 1.05,
            color: "#ffffff",
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
          }}
        >
          GOBERNA
        </h1>
        <h2
          style={{
            fontSize: "clamp(28px, 5vw, 44px)",
            fontWeight: 800,
            lineHeight: 1.1,
            color: "var(--goberna-gold)",
            margin: "0 0 20px",
            letterSpacing: "0.04em",
          }}
        >
          TERRITORIO
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontSize: "clamp(15px, 2vw, 18px)",
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.55)",
            maxWidth: 420,
            margin: "0 auto 48px",
            fontWeight: 400,
          }}
        >
          Descarga la app de campo para tu operacion territorial
        </p>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            maxWidth: 400,
            margin: "0 auto 48px",
          }}
        >
          <input
            type="text"
            placeholder="Nombre completo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            style={{
              padding: "14px 18px",
              fontSize: 14,
              fontWeight: 500,
              color: "#ffffff",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "var(--radius-md)",
              outline: "none",
              fontFamily: FONT_STACK,
              transition: "border-color 0.2s ease",
            }}
          />
          <input
            type="email"
            placeholder="Correo electronico"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
            style={{
              padding: "14px 18px",
              fontSize: 14,
              fontWeight: 500,
              color: "#ffffff",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "var(--radius-md)",
              outline: "none",
              fontFamily: FONT_STACK,
              transition: "border-color 0.2s ease",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "14px 32px",
              fontSize: 15,
              fontWeight: 700,
              color: "#0f172a",
              background: "var(--goberna-gold)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontFamily: FONT_STACK,
              transition: "all 0.2s ease",
              boxShadow: "0 4px 24px rgba(255,200,0,0.25)",
              marginTop: 4,
            }}
          >
            Enviar
          </button>

          {enviado && (
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--goberna-gold)", marginTop: 4 }}>
              Gracias por tu interes. Te contactaremos pronto.
            </p>
          )}
        </form>

        {/* Download buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 28px",
              fontSize: 15,
              fontWeight: 600,
              color: "#ffffff",
              textDecoration: "none",
              borderRadius: "var(--radius-md)",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              transition: "all 0.2s ease",
              fontFamily: FONT_STACK,
              minWidth: 200,
            }}
          >
            <PlayStoreIcon />
            <span style={{ textAlign: "left" }}>
              <span style={{ display: "block", fontSize: 10, fontWeight: 500, opacity: 0.6, letterSpacing: 0.5, textTransform: "uppercase" as const, lineHeight: 1, marginBottom: 2 }}>
                Disponible en
              </span>
              <span style={{ display: "block", fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
                Google Play
              </span>
            </span>
          </a>

          <a
            href={TESTFLIGHT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 28px",
              fontSize: 15,
              fontWeight: 600,
              color: "#ffffff",
              textDecoration: "none",
              borderRadius: "var(--radius-md)",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              transition: "all 0.2s ease",
              fontFamily: FONT_STACK,
              minWidth: 200,
            }}
          >
            <AppleIcon />
            <span style={{ textAlign: "left" }}>
              <span style={{ display: "block", fontSize: 10, fontWeight: 500, opacity: 0.6, letterSpacing: 0.5, textTransform: "uppercase" as const, lineHeight: 1, marginBottom: 2 }}>
                Descargar en
              </span>
              <span style={{ display: "block", fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
                App Store
              </span>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────── */

function PlayStoreIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Google Play">
      <title>Google Play</title>
      <path d="M3.61 1.814A1.2 1.2 0 0 0 3 2.88v18.24a1.2 1.2 0 0 0 .61 1.066L13.694 12 3.61 1.814ZM14.8 10.894l-2.56-2.56L5.2 2.28l10.9 6.29-1.3 2.324Zm0 2.212L13.5 15.43l1.3 2.324-10.9 6.29 7.04-6.054 2.56-2.56 1.3-2.324Zm1.72-.994L22.2 12l-5.68 0-1.3-2.212 1.3 2.324Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="App Store">
      <title>App Store</title>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
    </svg>
  );
}
