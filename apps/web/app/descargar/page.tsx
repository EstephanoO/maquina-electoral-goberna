"use client";

import Image from "next/image";
import { useState } from "react";
import { FONT_STACK } from "@/lib/constants";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.estephano.gobernaterritory02&hl=es_PE";
const TESTFLIGHT_URL = "https://testflight.apple.com/join/JAZ5smzy";
const TESTFLIGHT_APP_URL = "https://apps.apple.com/us/app/testflight/id899247664";

type Platform = "choose" | "android" | "iphone";

export default function DescargarPage() {
  const [platform, setPlatform] = useState<Platform>("choose");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [enviado, setEnviado] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !correo.trim()) return;
    setEnviado(true);
    setNombre("");
    setCorreo("");
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, var(--goberna-blue-950) 0%, var(--goberna-blue-900) 50%, var(--goberna-blue-800) 100%)", fontFamily: FONT_STACK }}>
      {/* Decorative grid */}
      <div style={{ position: "fixed", inset: 0, opacity: 0.04, backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "60px 60px", pointerEvents: "none" }} />
      {/* Gold glow */}
      <div style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,200,0,0.08) 0%, transparent 70%)", filter: "blur(80px)", pointerEvents: "none" }} />

      <div style={{ position: "relative", maxWidth: 480, width: "100%", margin: "0 auto", padding: "60px 20px 40px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <Image src="/isotipo_2_-removebg-preview.png" alt="Goberna" width={44} height={44} style={{ borderRadius: 8 }} priority />
          </div>
          <h1 style={{ fontSize: "clamp(32px, 8vw, 48px)", fontWeight: 800, lineHeight: 1, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>GOBERNA</h1>
          <h2 style={{ fontSize: "clamp(24px, 6vw, 36px)", fontWeight: 800, lineHeight: 1.1, color: "var(--goberna-gold)", margin: "0 0 12px", letterSpacing: "0.04em" }}>TERRITORIO</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.5 }}>App de campo para operacion territorial</p>
        </div>

        {/* ── Platform chooser ── */}
        {platform === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", textAlign: "center", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1.5 }}>Elige tu dispositivo</p>
            <PlatformBtn onClick={() => setPlatform("android")} icon={<PlayStoreIcon />} label="Android" sub="Descarga directa" accent="#3DDC84" />
            <PlatformBtn onClick={() => setPlatform("iphone")} icon={<AppleIcon />} label="iPhone" sub="Via TestFlight" accent="#ffffff" />
          </div>
        )}

        {/* ── Android: direct download ── */}
        {platform === "android" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <button type="button" onClick={() => setPlatform("choose")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, textAlign: "left", fontFamily: FONT_STACK }}>
              &larr; Volver
            </button>

            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 24, textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(61,220,132,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <PlayStoreIcon size={28} />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Android</h3>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: "0 0 24px", lineHeight: 1.5 }}>
                La app esta disponible en Google Play. Toca el boton para ir directo a la tienda.
              </p>
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "16px 24px", fontSize: 16, fontWeight: 700, color: "#0f172a", textDecoration: "none", borderRadius: 12, background: "var(--goberna-gold)", fontFamily: FONT_STACK, boxShadow: "0 4px 24px rgba(255,200,0,0.25)" }}>
                <PlayStoreIcon size={20} color="#0f172a" />
                Descargar en Google Play
              </a>
            </div>
          </div>
        )}

        {/* ── iPhone: form + guide ── */}
        {platform === "iphone" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <button type="button" onClick={() => setPlatform("choose")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, textAlign: "left", fontFamily: FONT_STACK }}>
              &larr; Volver
            </button>

            {/* Explainer */}
            <div style={{ background: "rgba(255,200,0,0.06)", border: "1px solid rgba(255,200,0,0.15)", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ fontSize: 13, color: "var(--goberna-gold)", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
                La app de iPhone esta en pruebas via <strong>TestFlight</strong>. Sigue los 3 pasos para instalarla.
              </p>
            </div>

            {/* Steps guide */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", textAlign: "center", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1.5 }}>Como instalar</p>

              <Step n={1} title="Solicita acceso" last={false}>
                <p style={stepTextStyle}>Necesitamos tu nombre y correo (el de tu Apple ID) para habilitarte en TestFlight.</p>
                {!enviado ? (
                  <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input type="text" placeholder="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} required style={inputStyle} />
                    <input type="email" placeholder="Correo (el de tu Apple ID)" value={correo} onChange={(e) => setCorreo(e.target.value)} required style={inputStyle} />
                    <button type="submit" style={{ padding: "12px 24px", fontSize: 14, fontWeight: 700, color: "#0f172a", background: "var(--goberna-gold)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: FONT_STACK, boxShadow: "0 4px 24px rgba(255,200,0,0.25)", marginTop: 2 }}>
                      Enviar solicitud
                    </button>
                  </form>
                ) : (
                  <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "14px 14px", textAlign: "center" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#10b981", margin: "0 0 4px" }}>&#10003; Solicitud enviada</p>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.5 }}>Te habilitaremos y recibiras un email de Apple.</p>
                  </div>
                )}
              </Step>

              <Step n={2} title="Descarga TestFlight" last={false}>
                <p style={stepTextStyle}>TestFlight es la app oficial de Apple para probar apps. Descargala gratis del App Store.</p>
                <Image src="/instalar-testflight.jpeg" alt="TestFlight en App Store — Toca GET para descargar" width={440} height={160} style={{ width: "100%", height: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", marginBottom: 12 }} />
                <a href={TESTFLIGHT_APP_URL} target="_blank" rel="noopener noreferrer" style={stepBtnStyle}>
                  <AppleIcon size={16} />
                  Abrir en App Store
                </a>
              </Step>

              <Step n={3} title="Abre la invitacion de Goberna" last>
                <p style={stepTextStyle}>Una vez habilitado, abre este enlace desde tu iPhone. Toca &quot;Instalar&quot; y listo.</p>
                <Image src="/instalar goberna.jpeg" alt="Goberna Territorio en TestFlight — Toca Instalar" width={440} height={500} style={{ width: "100%", height: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", marginBottom: 12 }} />
                <a href={TESTFLIGHT_URL} target="_blank" rel="noopener noreferrer" style={stepBtnStyle}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><title>Link</title><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                  Abrir invitacion TestFlight
                </a>
              </Step>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Shared styles ─── */

const inputStyle: React.CSSProperties = {
  padding: "14px 18px", fontSize: 15, fontWeight: 500, color: "#ffffff",
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12, outline: "none", fontFamily: "var(--font-montserrat), system-ui, sans-serif",
};

const stepTextStyle: React.CSSProperties = {
  fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 12px", lineHeight: 1.6,
};

const stepBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px",
  fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none",
  borderRadius: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
  fontFamily: "var(--font-montserrat), system-ui, sans-serif",
};

/* ── Sub-components ─── */

function PlatformBtn({ onClick, icon, label, sub, accent }: { onClick: () => void; icon: React.ReactNode; label: string; sub: string; accent: string }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, cursor: "pointer", fontFamily: "var(--font-montserrat), system-ui, sans-serif", textAlign: "left", width: "100%", transition: "all 0.2s ease" }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: `${accent}10`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{sub}</div>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><title>Ir</title><polyline points="9 18 15 12 9 6" /></svg>
    </button>
  );
}

function Step({ n, title, last, children }: { n: number; title: string; last: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      {/* Timeline */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 32, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--goberna-gold)", color: "#0f172a", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
        {!last && <div style={{ width: 2, flex: 1, background: "rgba(255,255,255,0.08)", marginTop: 8 }} />}
      </div>
      {/* Content */}
      <div style={{ flex: 1, paddingBottom: last ? 0 : 24 }}>
        <h4 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "4px 0 10px" }}>{title}</h4>
        {children}
      </div>
    </div>
  );
}

/* ── Icons ─── */

function PlayStoreIcon({ size = 24, color = "#3DDC84" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} role="img" aria-label="Google Play">
      <title>Google Play</title>
      <path d="M3.61 1.814A1.2 1.2 0 0 0 3 2.88v18.24a1.2 1.2 0 0 0 .61 1.066L13.694 12 3.61 1.814ZM14.8 10.894l-2.56-2.56L5.2 2.28l10.9 6.29-1.3 2.324Zm0 2.212L13.5 15.43l1.3 2.324-10.9 6.29 7.04-6.054 2.56-2.56 1.3-2.324Zm1.72-.994L22.2 12l-5.68 0-1.3-2.212 1.3 2.324Z" />
    </svg>
  );
}

function AppleIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff" role="img" aria-label="Apple">
      <title>Apple</title>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
    </svg>
  );
}
