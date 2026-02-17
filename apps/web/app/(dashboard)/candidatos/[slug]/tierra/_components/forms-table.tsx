"use client";

import { useCallback, useEffect, useState } from "react";
import { getRecentForms, type FormRecord } from "@/lib/services";

interface FormsTableProps {
  campaignId: string;
  primaryColor: string;
  secondaryColor: string;
}

export function FormsTable({ campaignId, primaryColor, secondaryColor }: FormsTableProps) {
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchForms = useCallback(async () => {
    const res = await getRecentForms(campaignId, 50);
    if (res.ok && res.data?.forms) {
      setForms(res.data.forms);
      setError(null);
    } else {
      setError(res.error?.message ?? "Error cargando datos");
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    fetchForms();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchForms, 10000);
    return () => clearInterval(interval);
  }, [fetchForms]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
        Cargando registros...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#ef4444" }}>
        {error}
      </div>
    );
  }

  if (forms.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          color: "#64748b",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 48 }}>📋</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>No hay registros aún</div>
        <div style={{ fontSize: 13 }}>Los datos capturados desde la app móvil aparecerán aquí</div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: "#f8fafc",
              borderBottom: "2px solid #e2e8f0",
            }}
          >
            <th style={thStyle}>Nombre</th>
            <th style={thStyle}>Teléfono</th>
            <th style={thStyle}>Zona</th>
            <th style={thStyle}>Encuestador</th>
            <th style={thStyle}>Fecha</th>
            <th style={thStyle}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {forms.map((form, index) => {
            const date = new Date(form.created_at);
            const dateStr = date.toLocaleDateString("es-PE", {
              day: "2-digit",
              month: "short",
            });
            const timeStr = date.toLocaleTimeString("es-PE", {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <tr
                key={form.id}
                style={{
                  backgroundColor: index % 2 === 0 ? "#ffffff" : "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: "#334155" }}>
                    {form.nombre || "Sin nombre"}
                  </div>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: "#64748b" }}>
                    {form.telefono || "-"}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: "#64748b" }}>
                    {form.zona || "-"}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: "#475569", fontWeight: 500 }}>
                    {form.encuestador || "-"}
                  </span>
                </td>
                <td style={tdStyle}>
                  <div style={{ color: "#64748b", fontSize: 12 }}>
                    {dateStr}
                    <br />
                    <span style={{ color: "#94a3b8" }}>{timeStr}</span>
                  </div>
                </td>
                <td style={tdStyle}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      backgroundColor: "#dcfce7",
                      color: "#166534",
                    }}
                  >
                    Sincronizado
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer with count */}
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "#f8fafc",
          borderTop: "1px solid #e2e8f0",
          fontSize: 12,
          color: "#64748b",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{forms.length} registros mostrados</span>
        <span style={{ color: "#22c55e" }}>● Actualización automática cada 10s</span>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  fontWeight: 600,
  color: "#475569",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  verticalAlign: "middle",
};
