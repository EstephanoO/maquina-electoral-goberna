"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

export default function DatosExportsTab() {
  const params = useParams();
  const slug = params.slug as string;
  const { campaigns } = useAuth();
  const campaign = campaigns.find((c) => c.slug === slug);

  const exportUrls = campaign
    ? [
        { label: "Voluntarios (CSV)", desc: "Todos los voluntarios registrados de esta campaña.", href: `/api/voluntarios/export?candidato_slug=${slug}` },
        { label: "Formularios (CSV)", desc: "Todos los registros desde la app móvil.", href: `/api/forms/export?campaign_id=${campaign.id}` },
        { label: "Contactos CMS (CSV)", desc: "Pipeline digital con tags y estado.", href: `/api/cms/export?campaign_id=${campaign.id}` },
      ]
    : [];

  return (
    <div style={{ fontFamily: FONT, maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--color-text-primary)", margin: 0 }}>
        Exportar
      </h1>
      <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "4px 0 24px" }}>
        Descargá los datos en CSV para Excel / Google Sheets.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {exportUrls.map((e) => (
          <a
            key={e.href}
            href={e.href}
            download
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 16,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              textDecoration: "none",
              color: "inherit",
              transition: "border-color 0.15s ease",
            }}
            className="export-card"
          >
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
                {e.label}
              </p>
              <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0 }}>{e.desc}</p>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--goberna-blue-600)" }}>
              Descargar ↓
            </span>
          </a>
        ))}
      </div>

      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "20px 0 0", lineHeight: 1.5 }}>
        ⚠️ Si un endpoint todavía no existe en backend, vas a recibir un 404.
        Los reportes <code>/api/voluntarios/export</code>, <code>/api/forms/export</code>{" "}
        y <code>/api/cms/export</code> son los nombres convencionales — confirmá con tu equipo si están implementados.
      </p>

      <style>{`
        .export-card:hover {
          border-color: var(--goberna-gold) !important;
        }
      `}</style>
    </div>
  );
}
