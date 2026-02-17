/**
 * GOBERNA — FormField Components
 * Consistent form input styling.
 */

import type { CSSProperties, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { FONT_STACK } from "../constants";

// ── Shared Styles ──────────────────────────────────────────────────

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  marginBottom: 6,
  fontFamily: FONT_STACK,
};

const inputBaseStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: FONT_STACK,
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-surface)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s ease",
};

const hintStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--color-text-tertiary)",
  marginTop: 4,
};

const errorStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--color-error)",
  marginTop: 4,
};

// ── Field Wrapper ──────────────────────────────────────────────────

type FieldWrapperProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  style?: CSSProperties;
};

export function FieldWrapper({ label, htmlFor, hint, error, children, style }: FieldWrapperProps) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
      {children}
      {error && <p style={errorStyle}>{error}</p>}
      {!error && hint && <p style={hintStyle}>{hint}</p>}
    </div>
  );
}

// ── Text Input ─────────────────────────────────────────────────────

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextInput({ label, hint, error, id, style, ...props }: TextInputProps) {
  return (
    <FieldWrapper label={label} htmlFor={id ?? ""} hint={hint} error={error}>
      <input
        id={id}
        style={{
          ...inputBaseStyle,
          borderColor: error ? "var(--color-error)" : undefined,
          ...style,
        }}
        {...props}
      />
    </FieldWrapper>
  );
}

// ── Select ─────────────────────────────────────────────────────────

type SelectInputProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function SelectInput({
  label,
  hint,
  error,
  id,
  options,
  placeholder,
  value,
  style,
  ...props
}: SelectInputProps) {
  return (
    <FieldWrapper label={label} htmlFor={id ?? ""} hint={hint} error={error}>
      <select
        id={id}
        value={value}
        style={{
          ...inputBaseStyle,
          color: value ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          borderColor: error ? "var(--color-error)" : undefined,
          ...style,
        }}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

// ── Textarea ───────────────────────────────────────────────────────

type TextAreaInputProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextAreaInput({ label, hint, error, id, style, ...props }: TextAreaInputProps) {
  return (
    <FieldWrapper label={label} htmlFor={id ?? ""} hint={hint} error={error}>
      <textarea
        id={id}
        style={{
          ...inputBaseStyle,
          resize: "vertical",
          minHeight: 80,
          borderColor: error ? "var(--color-error)" : undefined,
          ...style,
        }}
        {...props}
      />
    </FieldWrapper>
  );
}

// ── Color Picker ───────────────────────────────────────────────────

type ColorPickerProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  showHex?: boolean;
};

export function ColorPicker({ label, showHex = true, value, style, ...props }: ColorPickerProps) {
  return (
    <div>
      <span style={{ ...labelStyle, marginBottom: 4 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          value={value}
          style={{
            width: 36,
            height: 36,
            padding: 0,
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            background: "none",
            ...style,
          }}
          {...props}
        />
        {showHex && (
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontFamily: "monospace" }}>
            {value}
          </span>
        )}
      </div>
    </div>
  );
}
