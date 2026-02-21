"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getCampaignTwilioConfig,
  saveCampaignTwilioConfig,
  type CampaignTwilioConfig,
} from "@/lib/services/cms";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

type Props = {
  campaignId: string;
  onClose: () => void;
};

export function TwilioConfigModal({ campaignId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [accountSid, setAccountSid] = useState("");
  const [whatsappFrom, setWhatsappFrom] = useState("");

  // Auth token: show hint or editable field
  const [authTokenHint, setAuthTokenHint] = useState("");
  const [editingToken, setEditingToken] = useState(false);
  const [authToken, setAuthToken] = useState("");

  const [configured, setConfigured] = useState(false);

  // ── Load current config ──────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getCampaignTwilioConfig(campaignId);
    if (res.ok && res.twilio) {
      const cfg: CampaignTwilioConfig = res.twilio;
      setConfigured(cfg.configured);
      setAccountSid(cfg.account_sid);
      setWhatsappFrom(cfg.whatsapp_from);
      setAuthTokenHint(cfg.auth_token_hint);
      setEditingToken(!cfg.configured); // auto-open token field if not configured yet
    } else {
      setError(res.error ?? "Error cargando configuración");
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Save ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!accountSid.trim()) {
      setError("Account SID es requerido");
      return;
    }
    if (!whatsappFrom.trim()) {
      setError("Número WhatsApp (from) es requerido");
      return;
    }
    if (!configured && !authToken.trim()) {
      setError("Auth Token es requerido para la primera configuración");
      return;
    }

    setSaving(true);
    setError(null);

    const payload: { account_sid: string; whatsapp_from: string; auth_token?: string } = {
      account_sid: accountSid.trim(),
      whatsapp_from: whatsappFrom.trim(),
    };

    // Only send auth_token if the admin explicitly edited it
    if (editingToken && authToken.trim()) {
      payload.auth_token = authToken.trim();
    }

    const res = await saveCampaignTwilioConfig(campaignId, payload);

    if (!res.ok) {
      setError(res.error ?? "Error guardando configuración");
    } else {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    }

    setSaving(false);
  };

  // ── Close on ESC ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--color-surface, #fff)",
          borderRadius: 14,
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
          overflow: "hidden",
          animation: "modalIn .18s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--goberna-blue-50, #eff6ff)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
              <title>WhatsApp</title>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>
                Twilio WhatsApp
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 1 }}>
                Configuración de esta campaña
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-tertiary)",
              padding: 4,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <title>Cerrar</title>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-text-tertiary)", fontSize: 13 }}>
              Cargando configuración...
            </div>
          ) : (
            <>
              {/* Status indicator */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 20,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: configured ? "#f0fdf4" : "#fffbeb",
                  border: `1px solid ${configured ? "#bbf7d0" : "#fde68a"}`,
                  fontSize: 12,
                  fontWeight: 600,
                  color: configured ? "#065f46" : "#92400e",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: configured ? "#16a34a" : "#d97706",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                {configured ? "Twilio configurado para esta campaña" : "Sin configurar — completa los campos para activar"}
              </div>

              {/* Account SID */}
              <div style={{ marginBottom: 14 }}>
                <label
                  htmlFor="twilio-account-sid"
                  style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 5 }}
                >
                  Account SID
                </label>
                <input
                  id="twilio-account-sid"
                  type="text"
                  value={accountSid}
                  onChange={(e) => setAccountSid(e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  style={inputStyle}
                />
                <p style={hintStyle}>Empieza con "AC". Lo encuentras en la consola de Twilio.</p>
              </div>

              {/* Auth Token */}
              <div style={{ marginBottom: 14 }}>
                <label
                  htmlFor="twilio-auth-token"
                  style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 5 }}
                >
                  Auth Token
                </label>
                {!editingToken && configured ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div
                      style={{
                        ...inputStyle,
                        flex: 1,
                        color: "var(--color-text-tertiary)",
                        fontFamily: "monospace",
                        letterSpacing: "0.1em",
                        background: "var(--goberna-blue-50, #eff6ff)",
                      }}
                    >
                      {authTokenHint}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingToken(true)}
                      style={{
                        padding: "8px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: FONT,
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        cursor: "pointer",
                        color: "var(--color-text-secondary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <input
                    id="twilio-auth-token"
                    type="password"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder="Ingresa el Auth Token completo"
                    style={inputStyle}
                    // biome-ignore lint: focus on first render when editing
                    autoFocus={editingToken}
                  />
                )}
                <p style={hintStyle}>
                  Se cifra con AES-256-GCM antes de guardar. Nunca se muestra en claro.
                </p>
              </div>

              {/* WhatsApp From */}
              <div style={{ marginBottom: 6 }}>
                <label
                  htmlFor="twilio-whatsapp-from"
                  style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 5 }}
                >
                  Número WhatsApp (from)
                </label>
                <input
                  id="twilio-whatsapp-from"
                  type="text"
                  value={whatsappFrom}
                  onChange={(e) => setWhatsappFrom(e.target.value)}
                  placeholder="whatsapp:+14155238886"
                  style={inputStyle}
                />
                <p style={hintStyle}>
                  Sandbox: <code style={{ fontSize: 10 }}>whatsapp:+14155238886</code> · 
                  Producción: tu número aprobado por Meta.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#dc2626",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {error}
                </div>
              )}

              {/* Success */}
              {success && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    color: "#065f46",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  ✓ Configuración guardada correctamente
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              padding: "14px 20px",
              borderTop: "1px solid var(--color-border)",
              background: "var(--goberna-blue-50, #eff6ff)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "9px 18px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: FONT,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                cursor: saving ? "not-allowed" : "pointer",
                color: "var(--color-text-secondary)",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || success}
              style={{
                padding: "9px 22px",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: FONT,
                background: saving || success ? "#86efac" : "var(--goberna-blue-900, #1e3a5f)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: saving || success ? "not-allowed" : "pointer",
                transition: "background .15s ease",
              }}
            >
              {saving ? "Guardando..." : success ? "Guardado ✓" : "Guardar"}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes modalIn {
          from { transform: translateY(12px) scale(0.97); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Style helpers ────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: FONT,
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

const hintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 11,
  color: "var(--color-text-tertiary)",
  lineHeight: 1.4,
};
