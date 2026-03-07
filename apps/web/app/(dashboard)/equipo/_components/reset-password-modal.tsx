/**
 * GOBERNA — Reset Password Modal
 * Sets a new password directly for a team member.
 */

"use client";

import { useState } from "react";
import { Button, IconKey } from "../../../../lib/ui";

type ResetPasswordModalProps = {
  name: string;
  onSave: (newPassword: string) => Promise<void>;
  onClose: () => void;
  saving: boolean;
};

export function ResetPasswordModal({
  name,
  onSave,
  onClose,
  saving,
}: ResetPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    await onSave(password);
  };

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar modal"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
          zIndex: 1200,
          animation: "goberna-fade-in 0.15s ease-out",
          border: "none",
          cursor: "default",
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-pw-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "90%",
          maxWidth: 420,
          background: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          zIndex: 1201,
          overflow: "hidden",
          animation: "goberna-fade-in 0.2s ease-out",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div
              id="reset-pw-title"
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <IconKey size={18} color="var(--goberna-blue-600)" />
              Cambiar Contraseña
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
              {name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: "var(--goberna-blue-50)",
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-secondary)",
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Nueva contraseña */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
              Nueva contraseña
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="Mínimo 6 caracteres"
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 40px 10px 12px",
                  fontSize: 14,
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  background: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--color-text-tertiary)",
                  padding: "2px 4px",
                }}
              >
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>

          {/* Confirmar contraseña */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
              Confirmar contraseña
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(null); }}
              placeholder="Repite la contraseña"
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                border: `1px solid ${error && error.includes("coinciden") ? "var(--color-error)" : "var(--color-border)"}`,
                borderRadius: 8,
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              fontSize: 12,
              color: "var(--color-error)",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 6,
              padding: "8px 12px",
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
        }}>
          <Button variant="secondary" size="md" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={saving || !password || !confirm}
            loading={saving}
          >
            Guardar contraseña
          </Button>
        </div>
      </div>
    </>
  );
}
