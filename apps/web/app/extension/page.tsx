"use client";

import Image from "next/image";
import { useState } from "react";
import { FONT_STACK } from "@/lib/constants";

const EXTENSION_ZIP_URL = "/whatsapp-helper.zip";

type Step = "intro" | "steps";

export default function ExtensionPage() {
  const [view, setView] = useState<Step>("intro");

  function handleDownload() {
    const a = document.createElement("a");
    a.href = EXTENSION_ZIP_URL;
    a.download = "whatsapp-helper.zip";
    a.click();
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0c1a0f 0%, #0f2b14 50%, #132f18 100%)", fontFamily: FONT_STACK }}>
      {/* Grid decoration */}
      <div style={{ position: "fixed", inset: 0, opacity: 0.04, backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "60px 60px", pointerEvents: "none" }} />
      {/* Green glow */}
      <div style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(37,211,102,0.1) 0%, transparent 70%)", filter: "blur(80px)", pointerEvents: "none" }} />

      <div style={{ position: "relative", maxWidth: 480, width: "100%", margin: "0 auto", padding: "60px 20px 40px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(37,211,102,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <WhatsAppLogo size={32} />
            </div>
          </div>
          <h1 style={{ fontSize: "clamp(28px, 7vw, 40px)", fontWeight: 800, lineHeight: 1.1, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.02em" }}>WhatsApp Helper</h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.5 }}>Extension de Chrome para Goberna <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(37,211,102,0.6)" }}>v8.0.0</span></p>
        </div>

        {view === "intro" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Features */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 }}>
              <Feature icon="tab" title="Una sola pestana" desc="Reutiliza WhatsApp Web en vez de abrir 100 pestanas" />
              <Feature icon="speed" title="Cambio instantaneo" desc="Cambia de chat sin recargar toda la app" />
              <Feature icon="detect" title="Deteccion de respuestas" desc="Detecta palabras clave en mensajes entrantes" />
              <Feature icon="safe" title="Seguro" desc="Solo lee mensajes, no automatiza envios" />
            </div>

            {/* Requirements */}
            <div style={{ background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.15)", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ fontSize: 13, color: "#25d366", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
                Requisitos: Google Chrome en computadora. La extension funciona junto con el dashboard de Goberna.
              </p>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={() => setView("steps")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                padding: "16px 24px", fontSize: 16, fontWeight: 700, color: "#fff",
                background: "#25d366", border: "none", borderRadius: 12, cursor: "pointer",
                fontFamily: FONT_STACK, boxShadow: "0 4px 24px rgba(37,211,102,0.3)",
                transition: "transform 0.1s", width: "100%",
              }}
            >
              <ChromeIcon size={20} />
              Instalar extension
            </button>
          </div>
        )}

        {view === "steps" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <button type="button" onClick={() => setView("intro")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, textAlign: "left", fontFamily: FONT_STACK }}>
              &larr; Volver
            </button>

            <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", textAlign: "center", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1.5 }}>Como instalar</p>

            <InstallStep n={1} title="Descarga la extension" last={false}>
              <p style={stepText}>Descarga el archivo ZIP con la extension.</p>
              <button
                type="button"
                onClick={handleDownload}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px",
                  fontSize: 14, fontWeight: 700, color: "#fff", background: "#25d366",
                  border: "none", borderRadius: 10, cursor: "pointer", fontFamily: FONT_STACK,
                  boxShadow: "0 4px 24px rgba(37,211,102,0.25)",
                }}
              >
                <DownloadIcon />
                Descargar ZIP
              </button>
              <p style={{ ...stepText, marginTop: 10 }}>Descomprime el archivo en una carpeta de tu computadora.</p>
            </InstallStep>

            <InstallStep n={2} title="Abre Chrome Extensions" last={false}>
              <p style={stepText}>
                Abre Chrome y escribe en la barra de direcciones:
              </p>
              <CopyBox text="chrome://extensions" />
              <p style={{ ...stepText, marginTop: 10 }}>
                Activa el <strong style={{ color: "#fff" }}>Modo de desarrollador</strong> en la esquina superior derecha.
              </p>
            </InstallStep>

            <InstallStep n={3} title="Carga la extension" last>
              <p style={stepText}>
                Haz clic en <strong style={{ color: "#fff" }}>&quot;Cargar descomprimida&quot;</strong> y selecciona la carpeta <strong style={{ color: "#25d366" }}>whatsapp-helper</strong> que aparece al descomprimir.
              </p>
              <p style={stepText}>
                Veras el icono de WhatsApp Goberna en la barra de Chrome. Listo!
              </p>
              <div style={{ background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.2)", borderRadius: 10, padding: "14px", marginTop: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#25d366", margin: 0 }}>
                  Ahora cuando hagas clic en un numero de WhatsApp en Validacion, se abrira en la misma pestana.
                </p>
              </div>

              <div style={{ background: "rgba(255,149,0,0.08)", border: "1px solid rgba(255,149,0,0.2)", borderRadius: 10, padding: "14px", marginTop: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#ff9f0a", margin: "0 0 4px" }}>
                  Ya tenias una version anterior?
                </p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.5 }}>
                  Borra la carpeta vieja, descomprime la nueva, y haz clic en el boton de recarga en chrome://extensions.
                </p>
              </div>
            </InstallStep>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Styles ── */

const stepText: React.CSSProperties = {
  fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 12px", lineHeight: 1.6,
};

/* ── Sub-components ── */

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    tab: <TabIcon />,
    speed: <SpeedIcon />,
    detect: <DetectIcon />,
    safe: <SafeIcon />,
  };
  return (
    <div style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(37,211,102,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#25d366" }}>
        {iconMap[icon]}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
      </div>
    </div>
  );
}

function InstallStep({ n, title, last, children }: { n: number; title: string; last: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 32, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#25d366", color: "#0c1a0f", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
        {!last && <div style={{ width: 2, flex: 1, background: "rgba(255,255,255,0.08)", marginTop: 8 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: last ? 0 : 24 }}>
        <h4 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "4px 0 10px" }}>{title}</h4>
        {children}
      </div>
    </div>
  );
}

function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, cursor: "pointer",
        fontFamily: "monospace", fontSize: 13, color: "#25d366", textAlign: "left",
      }}
    >
      <span>{text}</span>
      <span style={{ fontSize: 11, color: copied ? "#25d366" : "rgba(255,255,255,0.3)", fontFamily: FONT_STACK, fontWeight: 600 }}>
        {copied ? "Copiado!" : "Copiar"}
      </span>
    </button>
  );
}

/* ── Icons ── */

function WhatsAppLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25d366" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function ChromeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="21.17" y1="8" x2="12" y2="8" />
      <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
      <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function TabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="3" x2="9" y2="9" />
    </svg>
  );
}

function SpeedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function DetectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SafeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
