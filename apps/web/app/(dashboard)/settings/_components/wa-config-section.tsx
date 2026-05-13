"use client";

/**
 * GOBERNA — WA Config Section (Settings)
 *
 * Centraliza la configuración WhatsApp de la campaña activa:
 *   - whatsapp_number: número del candidato (sin '+', 9-15 dígitos)
 *   - whatsapp_qr_message: template del mensaje con tokens {candidato} {brigadista}
 *   - whatsapp_channel_url: URL pública del canal WhatsApp
 *
 * Al guardar, se autoregeneran dos QRs visuales:
 *   - QR del candidato: wa.me/<number>?text=<message-encoded>
 *   - QR del canal: el channel URL directo
 *
 * Solo candidato+/admin con membresía a la campaña activa puede editar.
 * El mobile lee whatsapp_number desde GET /api/campaigns/:id y lo expone
 * en candidate.whatsapp_number para el flow post-submit del form.
 */

import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../../../../lib/auth-context";
import {
  getCampaign,
  patchCampaignConfig,
  patchCampaignWhatsappQrMessage,
} from "../../../../lib/services/campaigns";
import { Spinner } from "../../../../lib/ui";

const DEFAULT_MESSAGE_TEMPLATE =
  "Hola {candidato}, me acabo de registrar con {brigadista}. Quiero saber más sobre tu campaña.";

function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Copiar</title>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconWhatsapp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <title>WhatsApp</title>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488" />
    </svg>
  );
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label ?? "Copiar"}
      style={{
        padding: "4px 8px",
        borderRadius: 4,
        border: "1px solid var(--color-border)",
        background: copied ? "var(--color-success-bg)" : "var(--color-surface)",
        color: copied ? "var(--color-success)" : "var(--color-text-secondary)",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
      }}
    >
      <IconCopy />
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function buildCandidateWaUrl(number: string | null, message: string | null, candidateName: string): string | null {
  if (!number) return null;
  const cleanNumber = number.replace(/\D/g, "");
  if (cleanNumber.length < 9) return null;
  // Tokens del template se resuelven en el server al escanear el QR de form,
  // pero aquí mostramos el render del mensaje genérico (candidato resuelto,
  // brigadista placeholder) para que el admin vea el preview.
  const msg = (message ?? DEFAULT_MESSAGE_TEMPLATE)
    .replaceAll("{candidato}", candidateName)
    .replaceAll("{brigadista}", "[brigadista]");
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(msg)}`;
}

type Status = "idle" | "loading" | "saving" | "saved" | "error";

export function WaConfigSection() {
  const { activeCampaignId, user } = useAuth();
  const fontStack = "var(--font-montserrat), system-ui, sans-serif";

  const [campaignName, setCampaignName] = useState<string>("");
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const canManage = ["admin", "consultor", "candidato"].includes(user?.role ?? "");

  const load = useCallback(async (id: string) => {
    setStatus("loading");
    setErrorMessage("");
    const res = await getCampaign(id);
    if (!res.ok || !res.data) {
      setStatus("error");
      setErrorMessage(res.error?.message ?? "Error cargando la campaña");
      return;
    }
    const c = res.data.campaign;
    setCampaignName(c.name ?? "");
    const cfg = c.config ?? {};
    setNumber(typeof cfg.whatsapp_number === "string" ? cfg.whatsapp_number : "");
    setMessage(typeof cfg.whatsapp_qr_message === "string" ? cfg.whatsapp_qr_message : "");
    setChannelUrl(typeof cfg.whatsapp_channel_url === "string" ? cfg.whatsapp_channel_url : "");
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (activeCampaignId) load(activeCampaignId);
  }, [activeCampaignId, load]);

  if (!canManage) return null;
  if (!activeCampaignId) return null;

  async function handleSave() {
    if (!activeCampaignId) return;
    const cleanNumber = number.trim().replace(/\D/g, "");
    if (cleanNumber && (cleanNumber.length < 9 || cleanNumber.length > 15)) {
      setStatus("error");
      setErrorMessage("El número debe tener 9–15 dígitos (sin '+').");
      return;
    }
    setStatus("saving");
    setErrorMessage("");

    // El endpoint genérico /config requiere admin. Para candidato+ usamos
    // el endpoint dedicado del mensaje. Probamos los dos:
    //   1. patchCampaignConfig (admin) — mete number + channel_url + message
    //   2. Si 403, patchCampaignWhatsappQrMessage para el message solo y
    //      avisamos que number/channel no se pudieron guardar (admin only)
    const partial: Parameters<typeof patchCampaignConfig>[1] = {};
    if (cleanNumber) partial.whatsapp_number = cleanNumber;
    if (channelUrl.trim()) partial.whatsapp_channel_url = channelUrl.trim();
    if (message.trim()) partial.whatsapp_qr_message = message.trim();

    const res = await patchCampaignConfig(activeCampaignId, partial);
    if (res.ok) {
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
      return;
    }

    // Si falla por permisos (probable candidato no-admin), al menos guardar el mensaje
    if (res.status === 403 && message.trim()) {
      const r2 = await patchCampaignWhatsappQrMessage(activeCampaignId, message.trim());
      if (r2.ok) {
        setStatus("error");
        setErrorMessage(
          "Solo el mensaje pudo guardarse — el número y URL del canal requieren rol admin.",
        );
        return;
      }
    }
    setStatus("error");
    setErrorMessage(res.error?.message ?? "Error guardando.");
  }

  const candidateQrUrl = buildCandidateWaUrl(number, message, campaignName || "el candidato");

  const inputStyle: React.CSSProperties = {
    width: "100%",
    fontSize: 14,
    padding: "9px 12px",
    border: "1.5px solid var(--color-border)",
    borderRadius: 6,
    fontFamily: fontStack,
    background: "var(--color-surface-hover)",
    color: "var(--color-text-primary)",
    outline: "none",
    transition: "border-color 0.15s",
  };

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: 24,
        marginTop: 24,
        fontFamily: fontStack,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ color: "#25D366", display: "flex" }}>
          <IconWhatsapp />
        </span>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
          WhatsApp del candidato
        </h2>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4, marginBottom: 20, lineHeight: 1.55 }}>
        Configurá el número del candidato y el mensaje automático.
        Los QRs (entrevistado → candidato, y del canal) se autogeneran al guardar
        y se usan en la app mobile post-registro y en pipeline view.
      </p>

      {status === "loading" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-tertiary)", fontSize: 13, padding: "16px 0" }}>
          <Spinner size="sm" />
          Cargando configuración...
        </div>
      ) : (
        <>
          {/* Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* whatsapp_number */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Número del candidato (sin +)
              </label>
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="ej. 51923895098"
                inputMode="numeric"
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--goberna-blue-500)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
              />
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                9–15 dígitos. Con código de país. Sin el símbolo +.
              </p>
            </div>

            {/* whatsapp_qr_message */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Mensaje automático
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={DEFAULT_MESSAGE_TEMPLATE}
                rows={3}
                maxLength={800}
                style={{ ...inputStyle, fontFamily: fontStack, resize: "vertical" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--goberna-blue-500)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
              />
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                Tokens disponibles: <code style={{ background: "var(--color-surface-hover)", padding: "1px 5px", borderRadius: 3 }}>{"{candidato}"}</code>{" "}
                <code style={{ background: "var(--color-surface-hover)", padding: "1px 5px", borderRadius: 3 }}>{"{brigadista}"}</code>. Se reemplazan automáticamente al generar el QR.
              </p>
            </div>

            {/* whatsapp_channel_url */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                URL del canal WhatsApp
              </label>
              <input
                type="url"
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
                placeholder="https://whatsapp.com/channel/0029..."
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--goberna-blue-500)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
              />
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                Link público del canal de difusión. Se usa para el QR del canal en pipeline view.
              </p>
            </div>

            {errorMessage && (
              <div style={{
                background: "var(--color-error-bg)", border: "1px solid var(--color-error-border)",
                borderRadius: 6, padding: "10px 14px",
                fontSize: 12, color: "var(--color-error)",
              }}>
                {errorMessage}
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={handleSave}
                disabled={status === "saving"}
                style={{
                  padding: "10px 20px", borderRadius: 6, border: "none",
                  background: status === "saved" ? "var(--color-success)" : "var(--goberna-gold)",
                  color: status === "saved" ? "#fff" : "var(--goberna-blue-950)",
                  fontSize: 13, fontWeight: 700, fontFamily: fontStack,
                  cursor: status === "saving" ? "default" : "pointer",
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}
              >
                {status === "saving" && <Spinner size="xs" />}
                {status === "saved" ? "✓ Guardado" : status === "saving" ? "Guardando..." : "Guardar configuración"}
              </button>
            </div>
          </div>

          {/* QRs preview */}
          {(candidateQrUrl || channelUrl) && (
            <div style={{
              marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--color-border)",
            }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", marginTop: 0, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                QRs generados
              </h3>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 0, marginBottom: 18 }}>
                Imprimibles, compartibles, o se autogeneran al sumarse al pipeline / form mobile.
              </p>

              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {candidateQrUrl && (
                  <div style={{ flex: "0 0 auto" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      QR del candidato
                    </div>
                    <div style={{ padding: 12, background: "#FFFFFF", border: "1px solid var(--color-border)", borderRadius: 8, display: "inline-block" }}>
                      <QRCodeSVG value={candidateQrUrl} size={160} level="M" />
                    </div>
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <CopyButton value={candidateQrUrl} label="Copiar link wa.me" />
                      <a
                        href={candidateQrUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, color: "var(--goberna-blue-600)", textDecoration: "none" }}
                      >
                        Probar link →
                      </a>
                    </div>
                  </div>
                )}

                {channelUrl && (
                  <div style={{ flex: "0 0 auto" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      QR del canal
                    </div>
                    <div style={{ padding: 12, background: "#FFFFFF", border: "1px solid var(--color-border)", borderRadius: 8, display: "inline-block" }}>
                      <QRCodeSVG value={channelUrl} size={160} level="M" />
                    </div>
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <CopyButton value={channelUrl} label="Copiar URL del canal" />
                      <a
                        href={channelUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, color: "var(--goberna-blue-600)", textDecoration: "none" }}
                      >
                        Abrir canal →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!candidateQrUrl && !channelUrl && (
            <div style={{
              marginTop: 20, padding: 14, borderRadius: 8,
              background: "var(--color-warning-bg, #fef3c7)",
              border: "1px solid var(--color-warning-border, #fcd34d)",
              fontSize: 12, color: "var(--color-warning-text, #92400e)",
              lineHeight: 1.55,
            }}>
              Los QRs aparecen acá cuando guardes el número y/o el URL del canal.
              El mobile mostrará el QR del candidato a los entrevistados tras cada registro.
              Si el número no está set, el mobile muestra "Número aún no configurado".
            </div>
          )}
        </>
      )}
    </div>
  );
}
