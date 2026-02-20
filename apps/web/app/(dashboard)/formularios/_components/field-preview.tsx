/**
 * GOBERNA — Formularios: Field Preview
 * Renders a single form field as it will appear in the mobile app.
 */

import type { CSSProperties } from "react";
import type { FormField } from "./types";

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  background: "#f9fafb",
  boxSizing: "border-box",
  color: "#9ca3af",
  fontFamily: "inherit",
};

export function FieldPreview({ field }: { field: FormField }) {
  const label = (
    <p
      style={{
        display: "block",
        fontSize: 13,
        fontWeight: 600,
        color: "#374151",
        marginBottom: 4,
        margin: "0 0 4px",
      }}
    >
      {field.label}
      {field.required && <span style={{ color: "#dc2626" }}> *</span>}
    </p>
  );

  let control: React.ReactNode;

  if (field.type === "textarea") {
    control = (
      <textarea
        placeholder={field.placeholder || field.label}
        disabled
        rows={3}
        style={{ ...INPUT_STYLE, resize: "none" }}
      />
    );
  } else if (field.type === "select") {
    control = (
      <select disabled style={INPUT_STYLE}>
        <option>Seleccionar…</option>
        {field.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "radio") {
    control = (
      <div style={{ display: "grid", gap: 6 }}>
        {(field.options || [{ value: "", label: "Opción 1" }]).map((opt) => (
          <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="radio" disabled />
            {opt.label}
          </label>
        ))}
      </div>
    );
  } else if (field.type === "checkbox") {
    control = (
      <div style={{ display: "grid", gap: 6 }}>
        {(field.options || [{ value: "", label: "Opción 1" }]).map((opt) => (
          <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" disabled />
            {opt.label}
          </label>
        ))}
      </div>
    );
  } else if (field.type === "location") {
    control = (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 10,
          border: "2px dashed #3b82f6",
          background: "#eff6ff",
        }}
      >
        <span style={{ fontSize: 18 }}>📍</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8" }}>Capturar GPS</div>
          <div style={{ fontSize: 11, color: "#3b82f6" }}>Toca para registrar coordenadas</div>
        </div>
      </div>
    );
  } else if (field.type === "photo") {
    control = (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 10,
          border: "2px dashed #8b5cf6",
          background: "#f5f3ff",
        }}
      >
        <span style={{ fontSize: 18 }}>📷</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6d28d9" }}>Tomar foto</div>
          <div style={{ fontSize: 11, color: "#7c3aed" }}>Toca para abrir la cámara</div>
        </div>
      </div>
    );
  } else {
    control = (
      <input
        type={field.type === "phone" ? "tel" : field.type === "email" ? "email" : "text"}
        placeholder={field.placeholder || field.label}
        disabled
        style={INPUT_STYLE}
      />
    );
  }

  return (
    <div>
      {label}
      {control}
      {field.helpText && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>{field.helpText}</p>
      )}
    </div>
  );
}
