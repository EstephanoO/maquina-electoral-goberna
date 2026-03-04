"use client";

import {
  useState,
  useRef,
  useEffect,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { FONT_STACK } from "@/lib/constants";
import {
  createVoluntario,
  type CreateVoluntarioInput,
  type RangoEdad,
} from "@/lib/services";
import {
  getDepartamentos,
  getProvincias,
  getDistritos,
  type DepartamentoInfo,
  type ProvinciaInfo,
  type DistritoInfo,
} from "@/lib/services/geo";
import type { CandidatePublic } from "@/lib/types";

// ── Design tokens ─────────────────────────────────────────────────────
const T = {
  accent:        "#f4cc15",
  accentDim:     "rgba(244,204,21,0.1)",
  accentBorder:  "rgba(244,204,21,0.28)",
  accentShadow:  "0 0 0 3px rgba(244,204,21,0.18)",
  textMain:      "#f2f6ff",
  textMuted:     "#c1ccdf",
  textFaint:     "rgba(193,204,223,0.55)",  // placeholder — legible pero diferenciado
  inputBg:       "rgba(8,16,32,0.7)",        // oscuro suficiente para contrastar con card
  inputBorder:   "rgba(255,255,255,0.13)",
  inputBorderFocus: "#f4cc15",
  cardBorder:    "rgba(255,255,255,0.1)",
  sectionLine:   "rgba(255,255,255,0.07)",
  error:         "#f87171",
  errorBg:       "rgba(239,68,68,0.1)",
  errorBorder:   "rgba(239,68,68,0.3)",
  dropdownBg:    "rgba(8,16,32,0.98)",
  pillBg:        "rgba(255,255,255,0.05)",
  pillBorder:    "rgba(255,255,255,0.1)",
  labelColor:    "rgba(193,204,223,0.75)",   // más visible que antes
} as const;

const RANGOS: { value: RangoEdad; label: string }[] = [
  { value: "18-25", label: "18–25" },
  { value: "26-35", label: "26–35" },
  { value: "36-45", label: "36–45" },
];

// ── Form state ────────────────────────────────────────────────────────
type GeoSelection = {
  departamento: string;
  coddep: string;
  provincia: string;
  codprov_full: string;
  distrito: string;
};

type FormState = {
  nombre_completo: string;
  telefono: string;
  geo: GeoSelection;
  rango_edad: RangoEdad | "";
  candidato_slug: string;
  candidato_label: string;
};

type FormErrors = Partial<{
  nombre_completo: string;
  telefono: string;
  departamento: string;
  provincia: string;
  distrito: string;
  rango_edad: string;
}>;

const INITIAL: FormState = {
  nombre_completo: "",
  telefono: "",
  geo: { departamento: "", coddep: "", provincia: "", codprov_full: "", distrito: "" },
  rango_edad: "",
  candidato_slug: "",
  candidato_label: "",
};

// ── Style helpers ─────────────────────────────────────────────────────
const labelStyle = (extra?: CSSProperties): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 5,
  fontSize: "0.67rem",
  fontWeight: 700,
  letterSpacing: "0.1em",
  color: T.labelColor,
  marginBottom: 8,
  fontFamily: FONT_STACK,
  textTransform: "uppercase",
  ...extra,
});

const inputBase = (hasError = false, extra?: CSSProperties): CSSProperties => ({
  width: "100%",
  padding: "12px 16px",
  fontSize: 15,
  fontFamily: FONT_STACK,
  fontWeight: 500,
  border: `1.5px solid ${hasError ? T.errorBorder : T.inputBorder}`,
  borderRadius: 10,
  background: hasError ? T.errorBg : T.inputBg,
  color: T.textMain,
  outline: "none",
  boxSizing: "border-box",
  boxShadow: hasError
    ? `0 0 0 3px ${T.errorBorder}44`
    : "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 4px rgba(0,0,0,0.4)",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
  ...extra,
});

// ── SearchSelect ──────────────────────────────────────────────────────
type SelectOption = { value: string; label: string; sub?: string };

interface SearchSelectProps {
  id?: string;
  placeholder: string;
  value: string;
  options: SelectOption[];
  loading?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  noOptionsText?: string;
  onSelect: (opt: SelectOption) => void;
  onClear?: () => void;
}

function SearchSelect({
  id,
  placeholder,
  value,
  options,
  loading = false,
  disabled = false,
  hasError = false,
  noOptionsText = "Sin resultados",
  onSelect,
  onClear,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.trim().toLowerCase())
      )
    : options;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openDropdown() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(opt: SelectOption) {
    onSelect(opt);
    setOpen(false);
    setQuery("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onClear?.();
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) handleSelect(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[highlighted] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  const borderColor = hasError ? T.errorBorder : open ? T.inputBorderFocus : T.inputBorder;
  const shadow = open
    ? T.accentShadow
    : hasError
    ? `0 0 0 3px ${T.errorBorder}44`
    : "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 4px rgba(0,0,0,0.4)";

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={openDropdown}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDropdown(); } }}
        style={{
          display: "flex",
          alignItems: "center",
          padding: 0,
          overflow: "hidden",
          border: `1.5px solid ${borderColor}`,
          borderRadius: 10,
          background: hasError ? T.errorBg : T.inputBg,
          boxShadow: shadow,
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          width: "100%",
          textAlign: "left",
        }}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          disabled={disabled}
          placeholder={open ? "Escribe para buscar..." : placeholder}
          value={open ? query : value}
          onFocus={openDropdown}
          onChange={(e) => { e.stopPropagation(); setQuery(e.target.value); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          style={{
            flex: 1,
            padding: "12px 14px",
            fontSize: 15,
            fontFamily: FONT_STACK,
            fontWeight: value && !open ? 500 : 400,
            background: "transparent",
            border: "none",
            outline: "none",
            color: value && !open ? T.textMain : T.textFaint,
            minWidth: 0,
            cursor: disabled ? "not-allowed" : "text",
          }}
          className="vf-search-input"
        />
        <div style={{ display: "flex", alignItems: "center", paddingRight: 12, gap: 6, flexShrink: 0 }}>
          {loading && <SpinnerSmall />}
          {value && !open && onClear && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Limpiar selección"
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 3, display: "flex", alignItems: "center",
                color: "rgba(193,204,223,0.45)",
                borderRadius: 4,
              }}
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          <svg
            aria-hidden="true" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="rgba(193,204,223,0.5)" strokeWidth="2.5" strokeLinecap="round"
            style={{
              transition: "transform 0.18s ease",
              transform: open ? "rotate(180deg)" : "none",
              pointerEvents: "none",
              flexShrink: 0,
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={listRef}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 200,
            maxHeight: 220,
            overflowY: "auto",
            borderRadius: 10,
            background: T.dropdownBg,
            border: `1.5px solid ${T.accentBorder}`,
            boxShadow: "0 20px 56px rgba(0,0,0,0.7), 0 0 0 1px rgba(244,204,21,0.08)",
            padding: "4px 0",
          }}
        >
          {loading ? (
            <div style={{
              padding: "14px 16px", color: "rgba(193,204,223,0.5)", fontSize: 13,
              fontFamily: FONT_STACK, display: "flex", alignItems: "center", gap: 8,
            }}>
              <SpinnerSmall /> Cargando...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "14px 16px", color: "rgba(193,204,223,0.5)", fontSize: 13, fontFamily: FONT_STACK }}>
              {noOptionsText}
            </div>
          ) : (
            filtered.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                onMouseEnter={() => setHighlighted(i)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 14px",
                  cursor: "pointer",
                  background: highlighted === i ? "rgba(244,204,21,0.1)" : "transparent",
                  border: "none",
                  borderLeft: highlighted === i ? `3px solid ${T.accent}` : "3px solid transparent",
                  transition: "background 0.1s ease",
                  fontFamily: FONT_STACK,
                }}
              >
                <span style={{
                  display: "block", fontSize: 13.5, fontWeight: 600,
                  color: highlighted === i ? T.textMain : T.textMuted,
                  fontFamily: FONT_STACK,
                }}>
                  {opt.label}
                </span>
                {opt.sub && (
                  <span style={{
                    display: "block", fontSize: 11, color: "rgba(193,204,223,0.4)",
                    fontFamily: FONT_STACK, marginTop: 1,
                  }}>
                    {opt.sub}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────
export function VoluntarioForm({ candidates }: { candidates: CandidatePublic[] }) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  const [departamentos, setDepartamentos] = useState<DepartamentoInfo[]>([]);
  const [provincias, setProvincias] = useState<ProvinciaInfo[]>([]);
  const [distritos, setDistritos] = useState<DistritoInfo[]>([]);
  const [loadingDep, setLoadingDep] = useState(false);
  const [loadingProv, setLoadingProv] = useState(false);
  const [loadingDist, setLoadingDist] = useState(false);

  useEffect(() => {
    setLoadingDep(true);
    getDepartamentos().then((res) => {
      if (res.ok && res.departamentos) setDepartamentos(res.departamentos);
      setLoadingDep(false);
    });
  }, []);

  const depOptions: SelectOption[] = departamentos.map((d) => ({
    value: d.coddep,
    label: d.departamento,
  }));
  const provOptions: SelectOption[] = provincias.map((p) => ({
    value: p.codprov_full,
    label: p.provincia,
  }));
  const distOptions: SelectOption[] = distritos.map((d) => ({
    value: d.ubigeo,
    label: d.distrito,
  }));
  const candidateOptions: SelectOption[] = [
    { value: "", label: "Sin preferencia", sub: "Decide más tarde" },
    ...candidates.map((c) => ({
      value: c.slug,
      label: c.name,
      sub: [c.cargo, c.numero ? `N° ${c.numero}` : ""].filter(Boolean).join(" · "),
    })),
  ];

  async function handleSelectDep(opt: SelectOption) {
    setForm((p) => ({
      ...p,
      geo: { departamento: opt.label, coddep: opt.value, provincia: "", codprov_full: "", distrito: "" },
    }));
    setProvincias([]); setDistritos([]);
    setErrors((p) => ({ ...p, departamento: undefined }));
    setLoadingProv(true);
    const res = await getProvincias(opt.value);
    if (res.ok && res.provincias) setProvincias(res.provincias);
    setLoadingProv(false);
  }

  function handleClearDep() {
    setForm((p) => ({
      ...p,
      geo: { departamento: "", coddep: "", provincia: "", codprov_full: "", distrito: "" },
    }));
    setProvincias([]); setDistritos([]);
  }

  async function handleSelectProv(opt: SelectOption) {
    setForm((p) => ({
      ...p,
      geo: { ...p.geo, provincia: opt.label, codprov_full: opt.value, distrito: "" },
    }));
    setDistritos([]);
    setErrors((p) => ({ ...p, provincia: undefined }));
    setLoadingDist(true);
    const res = await getDistritos(opt.value);
    if (res.ok && res.distritos) setDistritos(res.distritos);
    setLoadingDist(false);
  }

  function handleClearProv() {
    setForm((p) => ({
      ...p,
      geo: { ...p.geo, provincia: "", codprov_full: "", distrito: "" },
    }));
    setDistritos([]);
  }

  function handleSelectDist(opt: SelectOption) {
    setForm((p) => ({ ...p, geo: { ...p.geo, distrito: opt.label } }));
    setErrors((p) => ({ ...p, distrito: undefined }));
  }

  function handleClearDist() {
    setForm((p) => ({ ...p, geo: { ...p.geo, distrito: "" } }));
  }

  function set(key: "nombre_completo" | "telefono", value: string) {
    setForm((p) => ({ ...p, [key]: value }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  }

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!form.nombre_completo.trim() || form.nombre_completo.trim().length < 2)
      e.nombre_completo = "Ingresa tu nombre completo";
    const tel = form.telefono.trim();
    if (!tel || tel.length < 7) e.telefono = "Número inválido";
    else if (!/^[0-9+\s\-()]+$/.test(tel)) e.telefono = "Solo números, +, espacios y guiones";
    if (!form.geo.departamento) e.departamento = "Selecciona un departamento";
    if (!form.geo.provincia) e.provincia = "Selecciona una provincia";
    if (!form.geo.distrito) e.distrito = "Selecciona un distrito";
    if (!form.rango_edad) e.rango_edad = "Selecciona tu rango de edad";
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    if (status === "loading") return;
    setStatus("loading");
    setServerError(null);

    const res = await createVoluntario({
      nombre_completo: form.nombre_completo.trim(),
      telefono: form.telefono.trim(),
      departamento: form.geo.departamento,
      provincia: form.geo.provincia,
      distrito: form.geo.distrito,
      rango_edad: form.rango_edad as RangoEdad,
      ...(form.candidato_slug ? { candidato_slug: form.candidato_slug } : {}),
    } satisfies CreateVoluntarioInput);

    if (res.ok) {
      setStatus("success");
    } else {
      setStatus("error");
      setServerError(res.error?.message ?? "Error inesperado. Inténtalo de nuevo.");
    }
  }

  if (status === "success") {
    return <SuccessState name={form.nombre_completo.split(" ")[0]} />;
  }

  return (
    <div style={{ fontFamily: FONT_STACK }}>
      <style>{`
        /* ── Input focus ── */
        .vf-input:focus {
          border-color: ${T.accent} !important;
          box-shadow: ${T.accentShadow}, 0 1px 4px rgba(0,0,0,0.5) !important;
          background: rgba(12,22,40,0.9) !important;
        }
        .vf-input::placeholder { color: ${T.textFaint}; }

        /* ── icon prefix color on focus ── */
        .vf-input-wrap:focus-within .vf-input-icon { color: ${T.accent}; }

        /* ── pill hover ── */
        .vf-pill:hover {
          border-color: ${T.accentBorder} !important;
          background: rgba(244,204,21,0.07) !important;
        }

        /* ── submit hover ── */
        .vf-btn-submit:hover:not(:disabled) {
          filter: brightness(1.1) saturate(1.1);
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(200,168,41,0.5) !important;
        }
        .vf-btn-submit:active:not(:disabled) {
          transform: translateY(0);
          filter: brightness(0.98);
        }

        @keyframes goberna-spin { to { transform: rotate(360deg); } }

        /* ── geo row: 3 col → 1 col mobile ── */
        .vf-geo-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          margin-bottom: 20px;
        }

        /* ── rangos ── */
        .vf-rangos {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        /* ── Mobile overrides ── */
        @media (max-width: 768px) {
          .vf-geo-row { grid-template-columns: 1fr; gap: 10px; }

          /* inputs con ícono: paddingLeft fijo para no superponerse */
          .vf-input {
            padding: 15px 16px 15px 46px !important;
            font-size: 16px !important;
            border-radius: 12px !important;
          }
          /* input interno de SearchSelect (sin ícono prefijo) */
          .vf-search-input {
            font-size: 16px !important;
            padding: 15px 14px !important;
          }
          .vf-rangos label { padding: 15px 8px !important; }
          .vf-btn-submit {
            padding: 16px 24px !important;
            font-size: 1rem !important;
            border-radius: 14px !important;
          }
          .vf-form-title { font-size: 1.4rem !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h2
          className="vf-form-title"
          style={{
            margin: "0 0 6px",
            fontSize: "clamp(1.25rem,3.5vw,1.5rem)",
            fontWeight: 800,
            color: T.textMain,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
          }}
        >
          Elegí tu candidato y sumáte
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: T.textMuted, lineHeight: 1.5 }}>
          Completá el formulario y te asignamos a tu equipo de distrito.
        </p>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 24 }} />

      {/* ── Sección: Tus datos ── */}
      <SectionLabel
        icon={
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={T.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        }
        text="Tus datos"
      />

      {/* Nombre */}
      <Field labelText="Nombre completo" htmlFor="nombre_completo" error={errors.nombre_completo} required>
        <div className="vf-input-wrap" style={{ position: "relative" }}>
          <span
            className="vf-input-icon"
            style={{
              position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
              color: "rgba(193,204,223,0.38)", pointerEvents: "none",
              transition: "color 0.2s ease", display: "flex",
            }}
          >
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
          <input
            id="nombre_completo"
            className="vf-input"
            type="text"
            placeholder="Juan Carlos Pérez López"
            value={form.nombre_completo}
            onChange={(e) => set("nombre_completo", e.target.value)}
            style={{ ...inputBase(!!errors.nombre_completo), paddingLeft: 42 }}
            autoComplete="name"
          />
        </div>
      </Field>

      {/* Teléfono */}
      <Field labelText="Número de teléfono" htmlFor="telefono" error={errors.telefono} required>
        <div className="vf-input-wrap" style={{ position: "relative" }}>
          <span
            className="vf-input-icon"
            style={{
              position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
              color: "rgba(193,204,223,0.38)", pointerEvents: "none",
              transition: "color 0.2s ease", display: "flex",
            }}
          >
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l1.62-1.62a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </span>
          <input
            id="telefono"
            className="vf-input"
            type="tel"
            placeholder="987 654 321"
            value={form.telefono}
            onChange={(e) => set("telefono", e.target.value)}
            style={{ ...inputBase(!!errors.telefono), paddingLeft: 42 }}
            autoComplete="tel"
          />
        </div>
      </Field>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0 20px" }} />

      {/* ── Sección: Tu zona ── */}
      <SectionLabel
        icon={
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={T.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        }
        text="Tu zona"
      />

      {/* Geo row */}
      <div className="vf-geo-row">
        <Field labelText="Departamento" htmlFor="dep-input" error={errors.departamento} required noMargin>
          <SearchSelect
            id="dep-input"
            placeholder="Departamento..."
            value={form.geo.departamento}
            options={depOptions}
            loading={loadingDep}
            hasError={!!errors.departamento}
            onSelect={handleSelectDep}
            onClear={handleClearDep}
            noOptionsText="No se encontró"
          />
        </Field>
        <Field labelText="Provincia" htmlFor="prov-input" error={errors.provincia} required noMargin>
          <SearchSelect
            id="prov-input"
            placeholder={form.geo.coddep ? "Provincia..." : "— elige depto —"}
            value={form.geo.provincia}
            options={provOptions}
            loading={loadingProv}
            disabled={!form.geo.coddep}
            hasError={!!errors.provincia}
            onSelect={handleSelectProv}
            onClear={handleClearProv}
            noOptionsText="No se encontró"
          />
        </Field>
        <Field labelText="Distrito" htmlFor="dist-input" error={errors.distrito} required noMargin>
          <SearchSelect
            id="dist-input"
            placeholder={form.geo.codprov_full ? "Distrito..." : "— elige prov —"}
            value={form.geo.distrito}
            options={distOptions}
            loading={loadingDist}
            disabled={!form.geo.codprov_full}
            hasError={!!errors.distrito}
            onSelect={handleSelectDist}
            onClear={handleClearDist}
            noOptionsText="No se encontró"
          />
        </Field>
      </div>

      {/* ── Rango de edad ── */}
      <fieldset style={{ border: "none", padding: 0, margin: "0 0 24px" }}>
        <legend style={labelStyle({ marginBottom: 10, display: "flex" })}>
          Rango de edad <span style={{ color: T.accent, marginLeft: 2 }}>*</span>
        </legend>
        <div className="vf-rangos">
          {RANGOS.map((r) => {
            const active = form.rango_edad === r.value;
            return (
              <label
                key={r.value}
                className="vf-pill"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "13px 8px",
                  borderRadius: 10,
                  border: `1.5px solid ${active ? T.accent : T.pillBorder}`,
                  background: active
                    ? "rgba(244,204,21,0.1)"
                    : T.pillBg,
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                  boxShadow: active
                    ? `0 0 0 3px rgba(244,204,21,0.15), inset 0 1px 0 rgba(244,204,21,0.12)`
                    : "inset 0 1px 0 rgba(255,255,255,0.04)",
                  userSelect: "none",
                }}
              >
                <input
                  type="radio"
                  name="rango_edad"
                  value={r.value}
                  checked={active}
                  onChange={() => {
                    setForm((p) => ({ ...p, rango_edad: r.value }));
                    if (errors.rango_edad) setErrors((p) => ({ ...p, rango_edad: undefined }));
                  }}
                  style={{ display: "none" }}
                  aria-label={`${r.label} años`}
                />
                <span style={{
                  fontSize: 15, fontWeight: 800,
                  color: active ? T.accent : T.textMain,
                  fontFamily: FONT_STACK, lineHeight: 1,
                }}>
                  {r.label}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: active ? T.accent : "rgba(193,204,223,0.45)",
                  textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 4,
                }}>
                  años
                </span>
              </label>
            );
          })}
        </div>
        {errors.rango_edad && (
          <p style={{ fontSize: 11.5, color: T.error, marginTop: 8, fontFamily: FONT_STACK }}>
            {errors.rango_edad}
          </p>
        )}
      </fieldset>

      {/* ── Candidato (opcional) ── */}
      {candidates.length > 0 && (
        <>
          {/* ── Divider ── */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "0 0 20px" }} />

          <SectionLabel
            icon={
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke={T.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            }
            text="¿A quién querés apoyar?"
            optional
          />

          <div style={{ marginBottom: 24 }}>
            <SearchSelect
              id="candidato-input"
              placeholder="Buscar candidato..."
              value={form.candidato_label}
              options={candidateOptions}
              onSelect={(opt) => {
                setForm((p) => ({ ...p, candidato_slug: opt.value, candidato_label: opt.label }));
              }}
              onClear={() => setForm((p) => ({ ...p, candidato_slug: "", candidato_label: "" }))}
              noOptionsText="No se encontró el candidato"
            />
          </div>
        </>
      )}

      {/* ── Server error ── */}
      {serverError && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: T.errorBg, border: `1px solid ${T.errorBorder}`,
          color: "#fca5a5", fontSize: 13, marginBottom: 20, fontFamily: FONT_STACK,
          lineHeight: 1.5,
        }}>
          {serverError}
        </div>
      )}

      {/* ── Submit ── */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={status === "loading"}
        className="vf-btn-submit"
        style={{
          width: "100%",
          padding: "14px 24px",
          fontSize: "0.92rem",
          fontWeight: 700,
          fontFamily: FONT_STACK,
          letterSpacing: "0.01em",
          color: status === "loading" ? "rgba(255,247,203,0.5)" : "#fff7cb",
          background: status === "loading"
            ? "rgba(200,168,41,0.4)"
            : "linear-gradient(135deg, #d4a91e 0%, #c8a829 60%, #b89520 100%)",
          border: "1px solid rgba(255,235,100,0.25)",
          borderRadius: 999,
          cursor: status === "loading" ? "not-allowed" : "pointer",
          transition: "transform 200ms ease, filter 200ms ease, box-shadow 200ms ease",
          boxShadow: status === "loading"
            ? "none"
            : "0 4px 20px rgba(200,168,41,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {status === "loading" ? (
          <>
            <Spinner />
            Enviando...
          </>
        ) : (
          <>
            Quiero ser brigadista
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </>
        )}
      </button>

      <p style={{
        textAlign: "center", fontSize: 11.5, color: "rgba(193,204,223,0.4)",
        marginTop: 14, fontFamily: FONT_STACK, lineHeight: 1.5,
      }}>
        Tus datos son confidenciales y se usan solo para coordinar tu participación.
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────
function SectionLabel({ icon, text, optional }: { icon: ReactNode; text: string; optional?: boolean }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 9,
      marginBottom: 16,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: "rgba(244,204,21,0.08)",
        border: "1px solid rgba(244,204,21,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <span style={{
        fontSize: "0.72rem",
        fontWeight: 700,
        color: "rgba(242,246,255,0.7)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontFamily: FONT_STACK,
      }}>
        {text}
      </span>
      {optional && (
        <span style={{
          fontSize: "0.65rem",
          color: "rgba(193,204,223,0.35)",
          fontFamily: FONT_STACK,
          marginLeft: 2,
        }}>
          (opcional)
        </span>
      )}
    </div>
  );
}

function Field({
  labelText, htmlFor, error, required, noMargin, children,
}: {
  labelText: string;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  noMargin?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : 18 }}>
      <label htmlFor={htmlFor} style={labelStyle()}>
        {labelText}
        {required && <span style={{ color: T.accent, marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && (
        <p style={{
          fontSize: 11.5, color: T.error, marginTop: 6,
          fontFamily: FONT_STACK, display: "flex", alignItems: "center", gap: 4,
        }}>
          <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

function SpinnerSmall() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24"
      fill="none" stroke="rgba(193,204,223,0.5)" strokeWidth="2.5"
      style={{ animation: "goberna-spin 0.8s linear infinite", flexShrink: 0 }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: "goberna-spin 0.8s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  );
}

function SuccessState({ name }: { name: string }) {
  return (
    <div style={{ textAlign: "center", padding: "52px 24px 40px", fontFamily: FONT_STACK }}>
      <style>{`
        @keyframes vf-in {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes vf-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.5; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      <div style={{
        position: "relative", width: 84, height: 84,
        margin: "0 auto 28px",
        animation: "vf-in 0.4s ease both",
      }}>
        {[1, 2].map((i) => (
          <div key={i} style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: `2px solid ${T.accent}`,
            animation: `vf-pulse-ring 1.8s ease-out ${i * 0.45}s infinite`,
          }} />
        ))}
        <div style={{
          position: "relative", width: "100%", height: "100%", borderRadius: "50%",
          background: "rgba(244,204,21,0.1)",
          border: `2px solid ${T.accent}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24"
            fill="none" stroke={T.accent} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>

      <h3 style={{
        fontSize: "1.5rem", fontWeight: 800, color: T.textMain,
        margin: "0 0 10px", letterSpacing: "-0.025em",
        animation: "vf-in 0.4s ease 0.1s both",
      }}>
        ¡Ya sos brigadista{name ? `, ${name}` : ""}!
      </h3>
      <p style={{
        fontSize: 14.5, lineHeight: 1.65, color: T.textMuted,
        maxWidth: 300, margin: "0 auto 28px",
        animation: "vf-in 0.4s ease 0.2s both",
      }}>
        Tu registro fue recibido. Pronto te asignamos a tu equipo de distrito.
      </p>

      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 20px", borderRadius: 999,
        border: "1px solid rgba(244,204,21,0.25)",
        background: "rgba(244,204,21,0.07)",
        animation: "vf-in 0.4s ease 0.3s both",
      }}>
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.accent }}>
          Bienvenido al equipo
        </span>
      </div>
    </div>
  );
}
