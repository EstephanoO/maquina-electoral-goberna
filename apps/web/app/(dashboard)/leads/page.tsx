"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { listLeads, type Lead } from "@/lib/services/leads";

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
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Acceso restringido</h2>
        <p>Solo administradores pueden ver los leads.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>Leads TestFlight</h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "4px 0 0" }}>{total} solicitudes de acceso</p>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "#94a3b8", fontSize: 14 }}>Cargando...</p>
      ) : leads.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>Sin leads todavia</p>
          <p style={{ fontSize: 13, margin: 0 }}>Cuando alguien solicite acceso en /descargar, aparecera aqui.</p>
        </div>
      ) : (
        <>
          <div style={{ borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle}>Nombre</th>
                  <th style={thStyle}>Correo</th>
                  <th style={thStyle}>Plataforma</th>
                  <th style={thStyle}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid #e2e8f0" }}>
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
  padding: "10px 16px", textAlign: "left", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px", fontWeight: 500,
};

const paginationBtn: React.CSSProperties = {
  padding: "6px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8,
  border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#334155",
};
