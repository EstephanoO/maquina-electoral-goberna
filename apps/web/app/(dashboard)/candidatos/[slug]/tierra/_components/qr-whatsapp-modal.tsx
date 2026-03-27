"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTheme } from "@/lib/theme-context";
import { api } from "@/lib/services/api";

/* ========== Types ========== */

type Props = {
  campaignId: string;
  primaryColor: string;
  secondaryColor?: string;
  interviewerName: string;
  whatsappChannelUrl: string;
};

type ModalState =
  | { step: "idle" }
  | { step: "creating" }
  | { step: "ready"; code: string; qrUrl: string }
  | { step: "scanned" }
  | { step: "error"; message: string };

/* ========== Component ========== */

export const QRWhatsAppButton = memo(function QRWhatsAppButton({
  campaignId,
  primaryColor,
  secondaryColor,
  interviewerName,
  whatsappChannelUrl,
}: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [state, setState] = useState<ModalState>({ step: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    cleanup();
    setState({ step: "idle" });
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  const handleOpen = useCallback(async () => {
    setState({ step: "creating" });

    try {
      // Create a scan code on the backend
      const res = await api.post<{ code: string }>(
        "/api/qr-leads/codes",
        { redirect_url: whatsappChannelUrl },
        { campaignId },
      );

      if (!res.ok || !res.data?.code) {
        setState({ step: "error", message: "Error creando codigo QR. Intenta de nuevo." });
        return;
      }

      const code = res.data.code;
      const origin = window.location.origin;
      const qrUrl = `${origin}/api/qr-leads/redirect/${code}`;

      setState({ step: "ready", code, qrUrl });

      // Poll for scan status every 2s
      cleanup();
      pollRef.current = setInterval(async () => {
        try {
          const check = await api.get<{ scanned: boolean }>(`/api/qr-leads/codes/${code}/status`);
          if (check.ok && check.data?.scanned) {
            cleanup();
            setState({ step: "scanned" });
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch {
      setState({ step: "error", message: "Error de conexion. Verifica tu internet." });
    }
  }, [whatsappChannelUrl, campaignId, cleanup]);

  /* ── Idle: floating button ── */
  if (state.step === "idle") {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="cursor-pointer border-none flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95"
        style={{ background: primaryColor, color: "#fff", fontSize: 13, fontWeight: 600 }}
        title="Generar QR de WhatsApp"
      >
        <QRIcon />
        QR WhatsApp
      </button>
    );
  }

  /* ── Modal ── */
  return (
    <>
      <button
        type="button"
        onClick={handleClose}
        className="cursor-pointer border-none flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg opacity-50"
        style={{ background: primaryColor, color: "#fff", fontSize: 13, fontWeight: 600 }}
      >
        <QRIcon />
        QR WhatsApp
      </button>

      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        role="presentation"
      >
        <div
          className={`relative rounded-2xl shadow-2xl w-[360px] max-w-[92vw] flex flex-col items-center overflow-hidden ${
            isDark ? "bg-[#0f172a] border border-[#2a303b]" : "bg-white border border-slate-200"
          }`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
        >
          {/* Close X */}
          <button
            type="button"
            onClick={handleClose}
            className={`absolute top-3 right-3 z-10 w-7 h-7 rounded-full flex items-center justify-center border-none cursor-pointer transition-colors ${
              isDark ? "bg-[#1e293b] text-slate-300 hover:bg-[#334155]" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            &times;
          </button>

          {/* Creating */}
          {state.step === "creating" && (
            <div className="flex flex-col items-center gap-3 py-16 px-6">
              <div
                className="w-10 h-10 border-[3px] rounded-full animate-spin"
                style={{ borderColor: isDark ? "#334155" : "#e2e8f0", borderTopColor: primaryColor }}
              />
              <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Generando QR...
              </p>
            </div>
          )}

          {/* Ready */}
          {state.step === "ready" && (
            <>
              {/* Campaign-colored header */}
              <div className="w-full py-3 px-5 flex flex-col items-center" style={{ background: primaryColor }}>
                <span className="text-[13px] font-bold" style={{ color: secondaryColor ?? "#fff" }}>
                  Escanea para unirte al canal
                </span>
              </div>

              <div className="flex flex-col items-center gap-3 p-6 pb-5">
                {/* QR Code */}
                <div className="p-3 rounded-xl bg-white shadow-sm">
                  <QRCodeSVG
                    value={state.qrUrl}
                    size={220}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>

                {/* Interviewer name */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className={`text-[15px] font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                    {interviewerName || "Entrevistador"}
                  </span>
                  <span className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    Entrevistador
                  </span>
                </div>

                {/* Waiting indicator */}
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#25D366" }} />
                  <span className={`text-[11px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Esperando escaneo...
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Scanned */}
          {state.step === "scanned" && (
            <div className="flex flex-col items-center gap-4 py-10 px-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "#25D366" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className={`text-base font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                  QR Escaneado
                </p>
                <p className={`text-[12px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Contacto registrado exitosamente
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="mt-1 px-6 py-2.5 rounded-lg border-none cursor-pointer text-white text-[13px] font-semibold transition-colors hover:opacity-90"
                style={{ background: primaryColor }}
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Error */}
          {state.step === "error" && (
            <div className="flex flex-col items-center gap-3 py-10 px-6">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <p className={`text-sm font-medium text-center ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                {state.message}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleOpen}
                  className="px-4 py-2 rounded-lg border-none cursor-pointer text-white text-[12px] font-semibold"
                  style={{ background: primaryColor }}
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className={`px-4 py-2 rounded-lg border cursor-pointer text-[12px] font-semibold ${
                    isDark ? "border-slate-600 bg-[#1e293b] text-slate-300" : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
});

/* ── QR Icon ── */
function QRIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3z" />
      <path d="M20 14v3h-3" />
      <path d="M14 20h3" />
      <path d="M20 20h.01" />
    </svg>
  );
}
