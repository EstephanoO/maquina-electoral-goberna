"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { listLeads, type Lead } from "@/lib/services/leads";
import { PageHeader, SkeletonTable } from "@/lib/ui";

export default function LeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 25;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const res = await listLeads(limit, page * limit);
    if (res.ok && res.data) {
      setLeads(res.data.leads ?? []);
      setTotal(res.data.total ?? 0);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  if (user?.role !== "admin") {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-tertiary)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Acceso restringido</h2>
        <p>Solo administradores pueden ver los leads.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader
        title="Leads TestFlight"
        description={`${total} solicitudes de acceso`}
        breadcrumbs={[{ label: "Dashboard", href: "/home" }, { label: "Leads" }]}
      />

      {loading ? (
        <SkeletonTable rows={5} />
      ) : leads.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-tertiary)", background: "var(--color-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>Sin leads todavia</p>
          <p style={{ fontSize: 13, margin: 0 }}>Cuando alguien solicite acceso en /descargar, aparecera aqui.</p>
        </div>
      ) : (
        <>
          <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "var(--goberna-blue-50)" }}>
                  <th style={thStyle}>Nombre</th>
                  <th style={thStyle}>Correo</th>
                  <th style={thStyle}>Plataforma</th>
                  <th style={thStyle}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="table-row-hover" style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={tdStyle}>{l.nombre}</td>
                    <td style={tdStyle}>
                      <a href={`mailto:${l.correo}`} style={{ color: "#2563eb", textDecoration: "none" }}>{l.correo}</a>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: l.plataforma === "iphone" ? "#eff6ff" : "#ecfdf5", color: l.plataforma === "iphone" ? "#2563eb" : "#059669" }}>
                        {l.plataforma}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: "#64748b" }}>
                      {new Date(l.created_at).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
              <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={paginationBtn}>
                Anterior
              </button>
              <span style={{ fontSize: 13, color: "#64748b" }}>{page + 1} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} style={paginationBtn}>
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 16px", textAlign: "left", fontWeight: 600, fontSize: 12,
  color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px", fontWeight: 500, color: "var(--color-text-primary)",
};

const paginationBtn: React.CSSProperties = {
  padding: "6px 14px", fontSize: 13, fontWeight: 600, borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer",
  color: "var(--color-text-primary)",
};
