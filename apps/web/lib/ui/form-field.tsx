import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* ── Shared classes ─────────────────────────────────────────────── */

const inputBase =
  "w-full px-3 py-2.5 text-sm font-sans border border-border rounded-sm bg-surface outline-none transition-colors focus:border-goberna-blue-400";

/* ── Field Wrapper ──────────────────────────────────────────────── */

type FieldWrapperProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
};

export function FieldWrapper({ label, htmlFor, hint, error, children, className }: FieldWrapperProps) {
  return (
    <div className={cn("mb-4", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-text-secondary mb-1.5 font-sans">
        {label}
      </label>
      {children}
      {error && <p className="text-[11px] text-error mt-1 m-0">{error}</p>}
      {!error && hint && <p className="text-[11px] text-text-tertiary mt-1 m-0">{hint}</p>}
    </div>
  );
}

/* ── Text Input ─────────────────────────────────────────────────── */

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextInput({ label, hint, error, id, className, ...props }: TextInputProps) {
  return (
    <FieldWrapper label={label} htmlFor={id ?? ""} hint={hint} error={error}>
      <input id={id} className={cn(inputBase, error && "border-error", className)} {...props} />
    </FieldWrapper>
  );
}

/* ── Select ─────────────────────────────────────────────────────── */

type SelectInputProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function SelectInput({
  label, hint, error, id, options, placeholder, value, className, ...props
}: SelectInputProps) {
  return (
    <FieldWrapper label={label} htmlFor={id ?? ""} hint={hint} error={error}>
      <select
        id={id}
        value={value}
        className={cn(
          inputBase,
          error && "border-error",
          !value && "text-text-tertiary",
          className,
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </FieldWrapper>
  );
}

/* ── Textarea ───────────────────────────────────────────────────── */

type TextAreaInputProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextAreaInput({ label, hint, error, id, className, ...props }: TextAreaInputProps) {
  return (
    <FieldWrapper label={label} htmlFor={id ?? ""} hint={hint} error={error}>
      <textarea
        id={id}
        className={cn(inputBase, "resize-y min-h-[80px]", error && "border-error", className)}
        {...props}
      />
    </FieldWrapper>
  );
}

/* ── Color Picker ───────────────────────────────────────────────── */

type ColorPickerProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  showHex?: boolean;
};

export function ColorPicker({ label, showHex = true, value, className, ...props }: ColorPickerProps) {
  return (
    <div>
      <span className="block text-xs font-semibold text-text-secondary mb-1 font-sans">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          className={cn("size-9 p-0 border border-border rounded-sm cursor-pointer bg-transparent", className)}
          {...props}
        />
        {showHex && (
          <span className="text-[11px] text-text-tertiary font-mono">{value}</span>
        )}
      </div>
    </div>
  );
}
