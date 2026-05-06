import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Course } from "../types";

// Module-level cache: load once per page
let _coursesPromise: Promise<Course[]> | null = null;
function loadCourses(): Promise<Course[]> {
  if (!_coursesPromise) _coursesPromise = api.listCourses().catch(() => []);
  return _coursesPromise;
}

/** Normalize string for accent-insensitive search */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

type Props = {
  value: string[];                // selected course names
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
};

export function CourseMultiSelect({ value, onChange, placeholder = "Buscar cursos…" }: Props) {
  const [all, setAll] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCourses().then((cs) => { setAll(cs); setLoading(false); });
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    if (!q.trim()) return all;
    const needle = norm(q);
    return all.filter((c) => norm(c.name).includes(needle) || norm(c.shortname).includes(needle));
  }, [q, all]);

  const shown = filtered.slice(0, 50); // cap for perf

  function toggle(name: string) {
    if (value.includes(name)) onChange(value.filter((v) => v !== name));
    else onChange([...value, name]);
  }

  function remove(name: string) {
    onChange(value.filter((v) => v !== name));
  }

  return (
    <div className="cms-root" ref={rootRef}>
      {/* Selected chips */}
      <div className={`cms-selected ${open ? "cms-open" : ""}`} onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
        {value.length === 0 && !open && (
          <span className="cms-placeholder">{loading ? "Cargando cursos…" : "Click para elegir cursos"}</span>
        )}
        {value.map((name) => (
          <span key={name} className="cms-chip" onClick={(e) => e.stopPropagation()}>
            {name}
            <button onClick={(e) => { e.stopPropagation(); remove(name); }} aria-label="Quitar">×</button>
          </span>
        ))}
        {open && (
          <input
            ref={inputRef}
            className="cms-input"
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          />
        )}
      </div>

      {open && (
        <div className="cms-popover">
          <div className="cms-popover-header">
            <span>{loading ? "Cargando…" : `${filtered.length} de ${all.length} cursos`}</span>
            {value.length > 0 && (
              <button className="cms-clear" onClick={() => onChange([])}>Limpiar selección</button>
            )}
          </div>
          <ul className="cms-list">
            {shown.length === 0 && !loading && <li className="cms-empty">Sin resultados</li>}
            {shown.map((c) => {
              const selected = value.includes(c.name);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`cms-option ${selected ? "cms-option-selected" : ""}`}
                    onClick={() => toggle(c.name)}
                  >
                    <span className="cms-check">{selected ? "✓" : ""}</span>
                    <span className="cms-option-text">{c.name}</span>
                  </button>
                </li>
              );
            })}
            {filtered.length > 50 && (
              <li className="cms-more">
                Mostrando primeros 50. Escribe para refinar la búsqueda.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Single-course searchable dropdown (for filters) */
export function CourseFilter({
  value, onChange, placeholder = "Cualquier curso",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [all, setAll] = useState<Course[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadCourses().then(setAll); }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    if (!q.trim()) return all;
    const needle = norm(q);
    return all.filter((c) => norm(c.name).includes(needle));
  }, [q, all]);

  return (
    <div className="cms-root cms-single" ref={rootRef}>
      <button type="button" className="input cms-trigger" onClick={() => setOpen((x) => !x)}>
        <span className={value ? "" : "cms-placeholder"}>{value || placeholder}</span>
        {value && (
          <span className="cms-clear-x" onClick={(e) => { e.stopPropagation(); onChange(""); }}>×</span>
        )}
        <span className="cms-caret">▾</span>
      </button>
      {open && (
        <div className="cms-popover">
          <div className="cms-popover-header">
            <input
              autoFocus
              className="input"
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
            />
          </div>
          <ul className="cms-list">
            {filtered.slice(0, 50).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`cms-option ${value === c.name ? "cms-option-selected" : ""}`}
                  onClick={() => { onChange(c.name); setOpen(false); }}
                >
                  <span className="cms-option-text">{c.name}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="cms-empty">Sin resultados</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
