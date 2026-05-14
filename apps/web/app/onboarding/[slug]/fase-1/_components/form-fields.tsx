"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

/**
 * Helpers compartidos para todos los componentes `Section*` del form
 * Fase 1 / Fase 1 Extendido. Extraídos de Fase1RapidaClient.tsx.
 *
 * - useDebounce: para auto-save con delay
 * - Field, TextInput, Textarea, Select, RadioGroup, CheckGroup, TagList:
 *   building blocks de los formularios.
 */

export function useDebounce<T>(value: T, delay = 1200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-600">{hint}</p>}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-3 bg-black/40 border-2 border-gray-700/50 rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
    />
  );
}

export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-4 py-3 bg-black/40 border-2 border-gray-700/50 rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all resize-none"
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Seleccionar...",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-4 py-3 bg-black/40 border-2 border-gray-700/50 rounded-xl text-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all appearance-none"
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#0a1e4a]">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function RadioGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; desc?: string }[];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`p-3 rounded-xl border-2 text-left transition-all ${
            value === o.value
              ? "border-amber-400 bg-amber-400/10 text-amber-400"
              : "border-gray-700/50 bg-black/30 text-gray-300 hover:border-gray-600"
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`size-3.5 rounded-full border-2 flex-shrink-0 ${
                value === o.value
                  ? "border-amber-400 bg-amber-400"
                  : "border-gray-600"
              }`}
            />
            <span className="text-sm font-semibold">{o.label}</span>
          </div>
          {o.desc && <p className="mt-1 text-xs text-gray-500 ml-5.5">{o.desc}</p>}
        </button>
      ))}
    </div>
  );
}

export function CheckGroup({
  values,
  onChange,
  options,
  max,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string }[];
  max?: number;
}) {
  const toggle = (v: string) => {
    if (values.includes(v)) {
      onChange(values.filter((x) => x !== v));
    } else if (!max || values.length < max) {
      onChange([...values, v]);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`px-3 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider transition-all ${
              active
                ? "border-amber-400 bg-amber-400/15 text-amber-400"
                : "border-gray-700 bg-black/20 text-gray-500 hover:border-gray-500 hover:text-gray-300"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function TagList({
  items,
  onChange,
  placeholder,
  minItems = 0,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  minItems?: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) {
      onChange([...items, v]);
      setDraft("");
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder ?? "Agregar y presionar Enter..."}
          className="flex-1 px-3 py-2 bg-black/40 border-2 border-gray-700/50 rounded-lg text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-amber-500 transition-all"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 disabled:opacity-40 hover:bg-amber-500/25 transition-all"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-2 px-3 py-2 bg-[#0a1e4a]/60 rounded-lg border border-white/5"
            >
              <span className="flex-1 text-sm text-gray-200">{item}</span>
              {items.length > minItems && (
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
