"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { listVoluntarios, type Voluntario } from "@/lib/services/voluntarios";
import { PageHeader, SkeletonTable } from "@/lib/ui";

const LIMIT = 50;

const RANGOS_COLOR: Record<string, { bg: string; color: string }> = {
  "18-25": { bg: "#eff6ff", color: "#2563eb" },
  "26-35": { bg: "#f0fdf4", color: "#16a34a" },
  "36-45": { bg: "#fefce8", color: "#ca8a04" },
};

export default function VoluntariosAdminPage() {
  const { user } = useAuth();

  const [voluntarios, setVoluntarios] = useState<Voluntario[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(0);
  const [filterCandidato, setFilterCandidato] = useState("");
  const [filterDepto, setFilterDepto]         = useState("");

  // Derived filter values — reset page when they change
  const handleFilterCandidato = (v: string) => { setFilterCandidato(v); setPage(0); };
  const handleFilterDepto     = (v: string) => { setFilterDepto(v);     setPage(0); };

  const fetch = useCallback(async () => {
    setLoading(true);
    const res = await listVoluntarios(
      LIMIT,
      page * LIMIT,
      filterCandidato || undefined,
    );
    if (res.ok && res.data) {
      const all = res.data.voluntarios ?? [];
      // client-side depto filter (API doesn't support it yet)
      const filtered = filterDepto
        ? all.filter((v) => v.departamento.toLowerCase().includes(filterDepto.toLowerCase()))
        : all;
      setVoluntarios(filtered);
      setTotal(res.data.total ?? 0);
    }
    setLoading(false);
  }, [page, filterCandidato, filterDepto]);

  useEffect(() => { fetch(); }, [fetch]);

  // ── Unique candidates for the filter dropdown ──
  const candidatos = Array.from(
    new Set(voluntarios.map((v) => v.candidato_slug).filter(Boolean) as string[]),
  );

  // ── Access guard ──
  if (user?.role !== "admin") {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-tertiary)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Acceso restringido</h2>
        <p>Solo administradores pueden ver los brigadistas registrados.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader
        title="Brigadistas"
        description={`${total} registros en total`}
        breadcrumbs={[{ label: "Dashboard", href: "/home" }, { label: "Brigadistas" }]}
      />

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Filtrar por departamento..."
          value={filterDepto}
          onChange={(e) => handleFilterDepto(e.target.value)}
          style={inputStyle}
        />
        <select
          value={filterCandidato}
          onChange={(e) => handleFilterCandidato(e.target.value)}
          style={inputStyle}
        >
          <option value="">Todos los candidatos</option>
          {candidatos.map((slug) => (
            <option key={slug} value={slug}>{slug}</option>
          ))}
        </select>
        {(filterDepto || filterCandidato) && (
          <button
            type="button"
            onClick={() => { handleFilterDepto(""); handleFilterCandidato(""); }}
            style={{ ...inputStyle, cursor: "pointer", color: "var(--color-text-tertiary)" }}
          >
            × Limpiar filtros
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <SkeletonTable rows={8} />
      ) : voluntarios.length === 0 ? (
        <div style={{
          padding: 48, textAlign: "center",
          color: "var(--color-text-tertiary)",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-border)",
        }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>Sin brigadistas todavía</p>
          <p style={{ fontSize: 13, margin: 0 }}>
            {filterDepto || filterCandidato
              ? "Ningún resultado para los filtros aplicados."
              : "Cuando alguien complete el formulario en /voluntarios, aparecerá aquí."}
          </p>
        </div>
      ) : (
        <>
          <div style={{
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "var(--goberna-blue-50)" }}>
                  <th style={thStyle}>Nombre</th>
                  <th style={thStyle}>Teléfono</th>
                  <th style={thStyle}>Departamento</th>
                  <th style={thStyle}>Provincia</th>
                  <th style={thStyle}>Distrito</th>
                  <th style={thStyle}>Edad</th>
                  <th style={thStyle}>Candidato</th>
                  <th style={thStyle}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {voluntarios.map((v) => (
                  <tr
                    key={v.id}
                    className="table-row-hover"
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{v.nombre_completo}</td>
                    <td style={tdStyle}>
                      <a
                        href={`tel:${v.telefono}`}
                        style={{ color: "#2563eb", textDecoration: "none" }}
                      >
                        {v.telefono}
                      </a>
                    </td>
                    <td style={tdStyle}>{v.departamento}</td>
                    <td style={tdStyle}>{v.provincia}</td>
                    <td style={tdStyle}>{v.distrito}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: RANGOS_COLOR[v.rango_edad]?.bg ?? "#f1f5f9",
                        color: RANGOS_COLOR[v.rango_edad]?.color ?? "#475569",
                      }}>
                        {v.rango_edad}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {v.candidato_slug ? (
                        <span style={{
                          padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: "#fefce8", color: "#92400e",
                        }}>
                          {v.candidato_slug}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--color-text-tertiary)" }}>
                      {new Date(v.created_at).toLocaleDateString("es-PE", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "center", gap: 12, marginTop: 16,
            }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={paginationBtn}
              >
                Anterior
              </button>
              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
                style={paginationBtn}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────
const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 12,
  color: "var(--color-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontWeight: 500,
  color: "var(--color-text-primary)",
};

const inputStyle: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  outline: "none",
  minWidth: 180,
};

const paginationBtn: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  cursor: "pointer",
  color: "var(--color-text-primary)",
};
