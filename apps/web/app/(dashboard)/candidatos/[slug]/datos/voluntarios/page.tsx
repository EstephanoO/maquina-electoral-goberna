"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { listVoluntarios, type Voluntario } from "@/lib/services/voluntarios";

const FONT = "var(--font-montserrat), system-ui, sans-serif";
const LIMIT = 50;

const RANGOS_COLOR: Record<string, { bg: string; color: string }> = {
  "18-25": { bg: "#eff6ff", color: "#2563eb" },
  "26-35": { bg: "#f0fdf4", color: "#16a34a" },
  "36-45": { bg: "#fefce8", color: "#ca8a04" },
};

export default function DatosVoluntariosTab() {
  const params = useParams();
  const slug = params.slug as string;

  const [voluntarios, setVoluntarios] = useState<Voluntario[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await listVoluntarios(LIMIT, page * LIMIT, slug);
    if (res.ok && res.data) {
      setVoluntarios(res.data.voluntarios ?? []);
      setTotal(res.data.total ?? 0);
    }
    setLoading(false);
  }, [page, slug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ fontFamily: FONT, maxWidth: 1100 }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--color-text-primary)", margin: 0 }}>Voluntarios</h1>
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "4px 0 0" }}>
            {total.toLocaleString("es-PE")} registrados desde el formulario público.
          </p>
        </div>
      </div>

      {loading && voluntarios.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>Cargando…</div>
      ) : voluntarios.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div style={{ borderRadius: 12, border: "1px solid var(--color-border)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--color-surface-hover)" }}>
                  <th style={thStyle}>Nombre</th>
                  <th style={thStyle}>Teléfono</th>
                  <th style={thStyle}>Ubicación</th>
                  <th style={thStyle}>Edad</th>
                  <th style={thStyle}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {voluntarios.map((v) => {
                  const rango = RANGOS_COLOR[v.rango_edad];
                  return (
                    <tr key={v.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={tdStyle}>{v.nombre_completo}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace" }}>{v.telefono}</td>
                      <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>
                        {v.distrito}, {v.departamento}
                      </td>
                      <td style={tdStyle}>
                        {rango && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: rango.bg, color: rango.color }}>
                            {v.rango_edad}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--color-text-tertiary)", fontSize: 12 }}>
                        {new Date(v.created_at).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
              <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={pageBtn}>Anterior</button>
              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>{page + 1} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} style={pageBtn}>Siguiente</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: 40, textAlign: "center", border: "1px dashed var(--color-border)", borderRadius: 12, color: "var(--color-text-tertiary)" }}>
      <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>Sin voluntarios todavía</p>
      <p style={{ fontSize: 12, margin: 0 }}>Compartí el link público de registro para que se sumen.</p>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: 11,
  color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px", color: "var(--color-text-primary)",
};

const pageBtn: React.CSSProperties = {
  padding: "6px 14px", fontSize: 13, fontWeight: 600,
  borderRadius: 8, border: "1px solid var(--color-border)",
  background: "var(--color-surface)", cursor: "pointer",
  color: "var(--color-text-primary)", fontFamily: FONT,
};
