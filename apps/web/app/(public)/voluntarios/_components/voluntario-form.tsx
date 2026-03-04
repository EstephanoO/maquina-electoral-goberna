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

// ── Design tokens (LandigGoberna) ────────────────────────────────────
const T = {
  accent:       "#f4cc15",
  accentDim:    "rgba(244,204,21,0.12)",
  accentBorder: "rgba(244,204,21,0.28)",
  accentShadow: "rgba(244,204,21,0.22)",
  textMain:     "#f2f6ff",
  textMuted:    "#c1ccdf",
  cardBorder:   "rgba(255,255,255,0.1)",
  inputBg:      "rgba(255,255,255,0.06)",
  inputBorder:  "rgba(255,255,255,0.1)",
  inputFocus:   "#f4cc15",
  whiteLow:     "rgba(255,255,255,0.28)",
  whiteMid:     "rgba(255,255,255,0.55)",
  error:        "#f87171",
  errorBg:      "rgba(239,68,68,0.1)",
  errorBorder:  "rgba(239,68,68,0.28)",
  dropdownBg:   "rgba(10,18,33,0.98)",
} as const;

const RANGOS: { value: RangoEdad; label: string }[] = [
  { value: "18-25", label: "18 – 25" },
  { value: "26-35", label: "26 – 35" },
  { value: "36-45", label: "36 – 45" },
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
  fontSize: "0.66rem",
  fontWeight: 600,
  letterSpacing: "0.09em",
  color: "#8fa4c2",
  marginBottom: 7,
  fontFamily: FONT_STACK,
  textTransform: "uppercase",
  ...extra,
});

const inputBase = (hasError = false, extra?: CSSProperties): CSSProperties => ({
  width: "100%",
  padding: "13px 16px",
  fontSize: 14,
  fontFamily: FONT_STACK,
  fontWeight: 500,
  border: `1.5px solid ${hasError ? T.errorBorder : "rgba(255,255,255,0.08)"}`,
  borderRadius: 12,
  background: hasError
    ? T.errorBg
    : "linear-gradient(135deg, rgba(21,34,56,0.7) 0%, rgba(10,18,33,0.85) 100%)",
  color: T.textMain,
  outline: "none",
  boxSizing: "border-box",
  boxShadow: hasError
    ? `0 0 0 3px ${T.errorBorder}33, 0 2px 8px rgba(0,0,0,0.3)`
    : "0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
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

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div
        style={{
          ...inputBase(hasError),
          display: "flex",
          alignItems: "center",
          padding: 0,
          overflow: "hidden",
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? "not-allowed" : undefined,
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
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          style={{
            flex: 1,
            padding: "12px 14px",
            fontSize: 14,
            fontFamily: FONT_STACK,
            fontWeight: value && !open ? 500 : 400,
            background: "transparent",
            border: "none",
            outline: "none",
            color: value && !open ? T.textMain : T.textMuted,
            minWidth: 0,
            cursor: disabled ? "not-allowed" : "text",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", paddingRight: 12, gap: 4, flexShrink: 0 }}>
          {loading && <SpinnerSmall />}
          {value && !open && onClear && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Limpiar selección"
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 2, display: "flex", alignItems: "center", color: T.whiteLow,
              }}
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          <svg
            aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke={T.whiteLow} strokeWidth="2.5" strokeLinecap="round"
            style={{
              transition: "transform 0.18s ease",
              transform: open ? "rotate(180deg)" : "none",
              pointerEvents: "none",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          ref={listRef}
          style={{
            position: "absolute",
            top: "calc(100% + 5px)",
            left: 0,
            right: 0,
            zIndex: 100,
            maxHeight: 220,
            overflowY: "auto",
            borderRadius: 10,
            background: T.dropdownBg,
            border: `1px solid ${T.accentBorder}`,
            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            padding: "4px 0",
          }}
        >
          {loading ? (
            <div style={{
              padding: "14px 16px", color: T.whiteLow, fontSize: 13,
              fontFamily: FONT_STACK, display: "flex", alignItems: "center", gap: 8,
            }}>
              <SpinnerSmall /> Cargando...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "14px 16px", color: T.whiteLow, fontSize: 13, fontFamily: FONT_STACK }}>
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
                  background: highlighted === i ? T.accentDim : "transparent",
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
                    display: "block", fontSize: 11, color: T.whiteLow,
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
    setForm((p) => ({ ...p, geo: { departamento: opt.label, coddep: opt.value, provincia: "", codprov_full: "", distrito: "" } }));
    setProvincias([]);
    setDistritos([]);
    setErrors((p) => ({ ...p, departamento: undefined }));
    setLoadingProv(true);
    const res = await getProvincias(opt.value);
    if (res.ok && res.provincias) setProvincias(res.provincias);
    setLoadingProv(false);
  }

  function handleClearDep() {
    setForm((p) => ({ ...p, geo: { departamento: "", coddep: "", provincia: "", codprov_full: "", distrito: "" } }));
    setProvincias([]);
    setDistritos([]);
  }

  async function handleSelectProv(opt: SelectOption) {
    setForm((p) => ({ ...p, geo: { ...p.geo, provincia: opt.label, codprov_full: opt.value, distrito: "" } }));
    setDistritos([]);
    setErrors((p) => ({ ...p, provincia: undefined }));
    setLoadingDist(true);
    const res = await getDistritos(opt.value);
    if (res.ok && res.distritos) setDistritos(res.distritos);
    setLoadingDist(false);
  }

  function handleClearProv() {
    setForm((p) => ({ ...p, geo: { ...p.geo, provincia: "", codprov_full: "", distrito: "" } }));
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
        /* inputs */
        .vf-input:focus {
          border-color: ${T.accent} !important;
          box-shadow: 0 0 0 3px ${T.accentShadow}44, 0 2px 12px rgba(0,0,0,0.4) !important;
          background: linear-gradient(135deg, rgba(30,48,76,0.85) 0%, rgba(15,26,48,0.95) 100%) !important;
        }
        .vf-input::placeholder { color: rgba(193,204,223,0.3); }
        .vf-input-wrap:focus-within .vf-input-icon { color: ${T.accent}; }
        .vf-input-wrap:focus-within > div {
          border-color: ${T.accent} !important;
          box-shadow: 0 0 0 3px ${T.accentShadow}44, 0 2px 12px rgba(0,0,0,0.4) !important;
          background: linear-gradient(135deg, rgba(30,48,76,0.85) 0%, rgba(15,26,48,0.95) 100%) !important;
        }
        /* pills rango edad */
        .vf-pill:hover {
          border-color: ${T.accentBorder} !important;
          background: ${T.accentDim} !important;
        }
        /* submit */
        .vf-btn-primary:hover:not(:disabled) {
          filter: brightness(1.08) !important;
          transform: translateY(-2px) !important;
          box-shadow: 0 8px 28px rgba(200,168,41,0.45) !important;
        }
        .vf-btn-primary:active:not(:disabled) { transform: translateY(0) !important; }
        @keyframes goberna-spin { to { transform: rotate(360deg); } }

        /* geo row: 3 col desktop → 1 col mobile */
        .vf-geo-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        /* rangos: 3 col fijos siempre */
        .vf-rangos { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }

        @media (max-width: 768px) {
          /* geo: 1 col full en mobile */
          .vf-geo-row {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          /* inputs más altos, más fácil de tocar */
          .vf-input {
            padding: 15px 16px 15px 44px !important;
            font-size: 16px !important; /* evita zoom en iOS */
            border-radius: 14px !important;
          }
          /* searchselect inner input */
          .vf-input-wrap input {
            font-size: 16px !important;
            padding: 15px 14px !important;
          }
          /* rangos: más altos táctiles */
          .vf-rangos label {
            padding: 16px 8px !important;
          }
          /* submit: más alto */
          .vf-btn-primary {
            padding: 16px 24px !important;
            font-size: 1rem !important;
            border-radius: 14px !important;
          }
          /* header del form */
          .vf-form-header h2 { font-size: 1.35rem !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="vf-form-header" style={{ marginBottom: 24 }}>
        <h2 style={{
          margin: "0 0 5px",
          fontSize: "clamp(1.2rem, 4vw, 1.42rem)",
          fontWeight: 800,
          color: T.textMain,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
        }}>
          Regístrate ahora
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>
          Un coordinador de tu zona te contactará en 48 h.
        </p>
      </div>

      {/* ── Sección: Tus datos ── */}
      <SectionLabel icon={
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      } text="Tus datos" />

      <Field labelText="Nombre completo" htmlFor="nombre_completo" error={errors.nombre_completo} required>
        <div className="vf-input-wrap" style={{ position: "relative" }}>
          <span className="vf-input-icon" style={{
            position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
            color: "rgba(255,255,255,0.28)", pointerEvents: "none",
            transition: "color 0.2s ease", display: "flex",
          }}>
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
            style={{ ...inputBase(!!errors.nombre_completo), paddingLeft: 40 }}
            autoComplete="name"
          />
        </div>
      </Field>

      <Field labelText="Número de teléfono" htmlFor="telefono" error={errors.telefono} required>
        <div className="vf-input-wrap" style={{ position: "relative" }}>
          <span className="vf-input-icon" style={{
            position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
            color: "rgba(255,255,255,0.28)", pointerEvents: "none",
            transition: "color 0.2s ease", display: "flex",
          }}>
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
            style={{ ...inputBase(!!errors.telefono), paddingLeft: 40 }}
            autoComplete="tel"
          />
        </div>
      </Field>

      {/* ── Sección: Tu zona ── */}
      <SectionLabel icon={
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      } text="Tu zona" />

      {/* Departamento · Provincia · Distrito — una fila (colapsa en mobile) */}
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

      {/* Rango de edad */}
      <div style={{ marginBottom: 22 }}>
        <p style={labelStyle({ marginBottom: 10 })}>
          Rango de edad <span style={{ color: T.accent }}>*</span>
        </p>
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
                  padding: "12px 8px",
                  borderRadius: 10,
                  border: `1px solid ${active ? T.accent : T.inputBorder}`,
                  background: active ? T.accentDim : T.inputBg,
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                  boxShadow: active ? `0 0 0 3px ${T.accentShadow}33` : "none",
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
                  fontSize: 9, fontWeight: 600,
                  color: active ? T.accent : T.whiteLow,
                  textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4,
                }}>
                  años
                </span>
              </label>
            );
          })}
        </div>
        {errors.rango_edad && (
          <p style={{ fontSize: 11, color: T.error, marginTop: 6, fontFamily: FONT_STACK }}>
            {errors.rango_edad}
          </p>
        )}
      </div>

      {/* ── Candidato (opcional) ── */}
      {candidates.length > 0 && (
        <>
          <SectionLabel icon={
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          } text="¿A quién apoyas?" optional />

          <div style={{ marginBottom: 22 }}>
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

      {/* ── Error de servidor ── */}
      {serverError && (
        <div style={{
          padding: "11px 14px", borderRadius: 10,
          background: T.errorBg, border: `1px solid ${T.errorBorder}`,
          color: "#fca5a5", fontSize: 13, marginBottom: 18, fontFamily: FONT_STACK,
        }}>
          {serverError}
        </div>
      )}

      {/* ── Submit — pill dorado, estilo .primary-btn de LandigGoberna ── */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={status === "loading"}
        className="vf-btn-primary"
        style={{
          width: "100%",
          padding: "13px 24px",
          fontSize: "0.9rem",
          fontWeight: 600,
          fontFamily: FONT_STACK,
          color: status === "loading" ? "rgba(255,247,203,0.5)" : "#fff7cb",
          background: status === "loading" ? "rgba(200,168,41,0.45)" : "#c8a829",
          border: "1px solid rgba(255,255,255,0.24)",
          borderRadius: 999,
          cursor: status === "loading" ? "not-allowed" : "pointer",
          transition: "transform 250ms cubic-bezier(0.22,1,0.36,1), filter 250ms ease",
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
            Quiero ser voluntario
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </>
        )}
      </button>

      <p style={{
        textAlign: "center", fontSize: 11, color: T.whiteLow,
        marginTop: 12, fontFamily: FONT_STACK,
      }}>
        Tu información es confidencial y solo se usa para contactarte.
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────
function SectionLabel({ icon, text, optional }: { icon: ReactNode; text: string; optional?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      marginBottom: 14, paddingBottom: 10,
      borderBottom: `1px solid rgba(255,255,255,0.07)`,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 7,
        background: "rgba(244,204,21,0.1)",
        border: "1px solid rgba(244,204,21,0.22)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {icon}
      </div>
      <span style={{
        fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.65)",
        letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT_STACK,
      }}>
        {text}
      </span>
      {optional && (
        <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.28)", fontFamily: FONT_STACK }}>
          (opcional)
        </span>
      )}
    </div>
  );
}

function Field({ labelText, htmlFor, error, required, noMargin, children }: {
  labelText: string;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  noMargin?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : 16 }}>
      <label htmlFor={htmlFor} style={labelStyle()}>
        {labelText}
        {required && <span style={{ color: T.accent, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error && (
        <p style={{ fontSize: 11, color: T.error, marginTop: 5, fontFamily: FONT_STACK }}>
          {error}
        </p>
      )}
    </div>
  );
}

function SpinnerSmall() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24"
      fill="none" stroke={T.whiteLow} strokeWidth="2.5"
      style={{ animation: "goberna-spin 0.8s linear infinite", flexShrink: 0 }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: "goberna-spin 0.8s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  );
}

function SuccessState({ name }: { name: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", fontFamily: FONT_STACK }}>
      <style>{`
        @keyframes vf-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes vf-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>

      <div style={{
        position: "relative", width: 80, height: 80,
        margin: "0 auto 24px", animation: "vf-in 0.4s ease",
      }}>
        {[1, 2].map((i) => (
          <div key={i} style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: `2px solid ${T.accent}`,
            animation: `vf-pulse-ring 1.6s ease-out ${i * 0.4}s infinite`,
          }} />
        ))}
        <div style={{
          position: "relative", width: "100%", height: "100%", borderRadius: "50%",
          background: T.accentDim, border: `2px solid ${T.accent}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg aria-hidden="true" width="34" height="34" viewBox="0 0 24 24"
            fill="none" stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>

      <h3 style={{
        fontSize: "1.42rem", fontWeight: 800, color: "#f2f6ff",
        margin: "0 0 8px", letterSpacing: "-0.02em",
      }}>
        ¡Bienvenido{name ? `, ${name}` : ""}!
      </h3>
      <p style={{
        fontSize: 14, lineHeight: 1.65, color: "#c1ccdf",
        maxWidth: 320, margin: "0 auto 24px",
      }}>
        Tu registro fue recibido. En menos de 48 h un coordinador de tu zona te contactará.
      </p>

      {/* Pill — ghost-btn style */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "9px 18px", borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.22)",
        background: "rgba(8,16,30,0.4)",
      }}>
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.accent }}>
          Respuesta en menos de 48 h
        </span>
      </div>
    </div>
  );
}
