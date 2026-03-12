"use client";

/**
 * GOBERNA — WA Phones Section (Settings)
 * Manages aliases for physical WhatsApp Web phones used by operators.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../../../lib/auth-context";
import {
  listWaPhones,
  upsertWaPhone,
  deleteWaPhone,
  type WaPhone,
} from "../../../../lib/services/cms";
import { Spinner } from "../../../../lib/ui";

// ── Types ─────────────────────────────────────────────────────────────

type EditState = {
  own_number: string;
  alias: string;
};

// ── Icons ─────────────────────────────────────────────────────────────

function IconPhone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Celular</title>
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Editar</title>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Eliminar</title>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <title>Agregar</title>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ── Phone row ─────────────────────────────────────────────────────────

function PhoneRow({
  phone,
  campaignId,
  onUpdated,
  onDeleted,
}: {
  phone: WaPhone;
  campaignId: string;
  onUpdated: (p: WaPhone) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState(phone.alias ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const fontStack = "var(--font-montserrat), system-ui, sans-serif";

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function handleSave() {
    if (!alias.trim()) {
      setError("El alias no puede estar vacío.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await upsertWaPhone(campaignId, phone.number, alias.trim());
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Error guardando.");
      return;
    }
    if (res.phone) onUpdated(res.phone);
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar el alias "${phone.alias ?? phone.number}"?`)) return;
    setDeleting(true);
    const res = await deleteWaPhone(campaignId, phone.id);
    setDeleting(false);
    if (!res.ok) {
      setError(res.error ?? "Error eliminando.");
      return;
    }
    onDeleted(phone.id);
  }

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid var(--color-border)",
    fontFamily: fontStack,
  };

  return (
    <div style={rowStyle}>
      {/* Icon */}
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--goberna-blue-100)",
        color: "var(--goberna-blue-600)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <IconPhone />
      </div>

      {/* Number + alias */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)" }}>
          +{phone.number}
        </div>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") { setEditing(false); setAlias(phone.alias ?? ""); }
            }}
            placeholder="ej. Vasquez 1"
            style={{
              marginTop: 4,
              fontSize: 13,
              padding: "4px 8px",
              border: "1.5px solid var(--goberna-blue-500)",
              borderRadius: 6,
              fontFamily: fontStack,
              background: "var(--color-surface-hover)",
              color: "var(--color-text-primary)",
              outline: "none",
              width: "100%",
              maxWidth: 200,
            }}
          />
        ) : (
          <div style={{ fontSize: 12, color: phone.alias ? "var(--color-text-secondary)" : "var(--color-text-tertiary)", marginTop: 1 }}>
            {phone.alias ?? <em>Sin alias</em>}
          </div>
        )}
        {error && <div style={{ fontSize: 11, color: "var(--color-error)", marginTop: 3 }}>{error}</div>}
      </div>

      {/* Actions */}
      {editing ? (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              fontSize: 12, fontWeight: 700, fontFamily: fontStack,
              padding: "5px 12px", borderRadius: 6, cursor: saving ? "default" : "pointer",
              background: "var(--goberna-gold)", color: "var(--goberna-blue-950)",
              border: "none", display: "flex", alignItems: "center", gap: 5,
            }}
          >
            {saving ? <Spinner size={12} /> : null}
            Guardar
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setAlias(phone.alias ?? ""); setError(""); }}
            style={{
              fontSize: 12, fontWeight: 600, fontFamily: fontStack,
              padding: "5px 10px", borderRadius: 6, cursor: "pointer",
              background: "var(--color-surface)", color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
            }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            title="Editar alias"
            onClick={() => setEditing(true)}
            style={{
              padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)",
              background: "var(--color-surface)", color: "var(--color-text-secondary)",
              cursor: "pointer", display: "flex", alignItems: "center",
            }}
          >
            <IconEdit />
          </button>
          <button
            type="button"
            title="Eliminar"
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-error-border)",
              background: "var(--color-error-bg)", color: "var(--color-error)",
              cursor: deleting ? "default" : "pointer", display: "flex", alignItems: "center",
            }}
          >
            {deleting ? <Spinner size={12} /> : <IconTrash />}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Add phone form ─────────────────────────────────────────────────────

function AddPhoneForm({
  campaignId,
  onAdded,
}: {
  campaignId: string;
  onAdded: (p: WaPhone) => void;
}) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [alias, setAlias] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fontStack = "var(--font-montserrat), system-ui, sans-serif";

  async function handleAdd() {
    const num = number.trim().replace(/\D/g, "");
    const al = alias.trim();
    if (!num) { setError("Ingrese el número del celular (solo dígitos)."); return; }
    if (!al) { setError("Ingrese un alias."); return; }
    setSaving(true);
    setError("");
    const res = await upsertWaPhone(campaignId, num, al);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? "Error guardando."); return; }
    if (res.phone) onAdded(res.phone);
    setNumber("");
    setAlias("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          marginTop: 12, fontSize: 12, fontWeight: 700, fontFamily: fontStack,
          padding: "7px 14px", borderRadius: 6,
          border: "1px dashed var(--color-border)",
          background: "none", color: "var(--color-text-secondary)",
          cursor: "pointer",
        }}
      >
        <IconPlus />
        Agregar celular
      </button>
    );
  }

  const inputStyle: React.CSSProperties = {
    flex: 1, fontSize: 13, padding: "7px 10px",
    border: "1.5px solid var(--color-border)", borderRadius: 6,
    fontFamily: fontStack, background: "var(--color-surface-hover)",
    color: "var(--color-text-primary)", outline: "none",
  };

  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", fontFamily: fontStack, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Nuevo celular
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Número (ej. 51987654321)"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          style={{ ...inputStyle, minWidth: 180 }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--goberna-blue-500)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
        />
        <input
          type="text"
          placeholder="Alias (ej. Vasquez 1)"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          style={{ ...inputStyle, minWidth: 140 }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--goberna-blue-500)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          style={{
            padding: "7px 14px", borderRadius: 6, border: "none",
            background: "var(--goberna-gold)", color: "var(--goberna-blue-950)",
            fontSize: 12, fontWeight: 700, fontFamily: fontStack,
            cursor: saving ? "default" : "pointer",
            display: "flex", alignItems: "center", gap: 5,
          }}
        >
          {saving ? <Spinner size={12} /> : null}
          Guardar
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(""); setNumber(""); setAlias(""); }}
          style={{
            padding: "7px 12px", borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)", color: "var(--color-text-secondary)",
            fontSize: 12, fontWeight: 600, fontFamily: fontStack, cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: "var(--color-error)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────

export function WaPhonesSection() {
  const { activeCampaignId, user } = useAuth();
  const [phones, setPhones] = useState<WaPhone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fontStack = "var(--font-montserrat), system-ui, sans-serif";

  // Only candidato+ can manage phones
  const canManage = ["admin", "consultor", "candidato"].includes(user?.role ?? "");

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setError("");
    const res = await listWaPhones(cid);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Error cargando.");
      return;
    }
    setPhones(res.phones);
  }, []);

  useEffect(() => {
    if (activeCampaignId) load(activeCampaignId);
  }, [activeCampaignId, load]);

  if (!canManage) return null;

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
          Celulares WhatsApp Web
        </h2>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4, marginBottom: 16, lineHeight: 1.5 }}>
        Asigná un alias legible a cada celular físico usado por las operadoras.
        El número se detecta automáticamente desde la extensión de Chrome.
      </p>

      {error && (
        <div style={{
          background: "var(--color-error-bg)", border: "1px solid var(--color-error-border)",
          borderRadius: 6, padding: "10px 14px", marginBottom: 12,
          fontSize: 12, color: "var(--color-error)",
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-tertiary)", fontSize: 13, padding: "16px 0" }}>
          <Spinner size={16} />
          Cargando celulares...
        </div>
      ) : (
        <>
          {phones.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", padding: "12px 0" }}>
              No hay celulares registrados todavía.
            </div>
          ) : (
            <div>
              {phones.map((p) => (
                <PhoneRow
                  key={p.id}
                  phone={p}
                  campaignId={activeCampaignId!}
                  onUpdated={(updated) =>
                    setPhones((prev) => prev.map((x) => x.id === updated.id ? updated : x))
                  }
                  onDeleted={(id) =>
                    setPhones((prev) => prev.filter((x) => x.id !== id))
                  }
                />
              ))}
            </div>
          )}

          {activeCampaignId && (
            <AddPhoneForm
              campaignId={activeCampaignId}
              onAdded={(p) => setPhones((prev) => {
                const exists = prev.findIndex((x) => x.id === p.id);
                if (exists >= 0) return prev.map((x) => x.id === p.id ? p : x);
                return [...prev, p];
              })}
            />
          )}
        </>
      )}
    </div>
  );
}
