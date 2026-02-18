/**
 * GOBERNA — UploadGA4Modal Component
 * Modal to upload and parse GA4 CSV reports.
 */

"use client";

import { useState, useCallback } from "react";
import { Button } from "../../../../lib/ui";
import { api } from "../../../../lib/services";
import type { Campaign } from "../../../../lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  campaign: Campaign;
  onSuccess: () => void;
};

type ParsedGA4Data = {
  overview: {
    activeUsers: number;
    newUsers: number;
    avgEngagementTime: number;
    totalEvents: number;
    dateRange: { start: string; end: string };
  };
  pages: Array<{
    title: string;
    views: number;
    activeUsers: number;
    events: number;
    bounceRate: number;
  }>;
  sources: Array<{
    source: string;
    medium: string;
    users: number;
  }>;
  cities: Array<{
    city: string;
    activeUsers: number;
  }>;
  dailyUsers: Array<{
    day: number;
    newUsers: number;
    returningUsers: number;
  }>;
};

export function UploadGA4Modal({ open, onClose, campaign, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedGA4Data | null>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setFile(f);
    setError(null);
    setParsing(true);

    try {
      const text = await f.text();
      const parsed = parseGA4CSV(text);
      setPreview(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al parsear el CSV");
      setPreview(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!preview) return;

    setUploading(true);
    setError(null);

    try {
      const res = await api.post(`/api/campaigns/${campaign.id}/analytics`, {
        data: preview,
      });

      if (!res.ok) {
        throw new Error(res.error?.message || "Error al guardar");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setUploading(false);
    }
  }, [preview, campaign.id, onSuccess]);

  const handleClose = useCallback(() => {
    setFile(null);
    setPreview(null);
    setError(null);
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      style={styles.overlay}
      onClick={handleClose}
      onKeyDown={(e) => e.key === "Escape" && handleClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-ga4-title"
    >
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 id="upload-ga4-title" style={styles.title}>Subir datos de Google Analytics</h2>
            <p style={styles.subtitle}>{campaign.name}</p>
          </div>
          <button type="button" onClick={handleClose} style={styles.closeBtn} aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Upload area */}
          {!preview && (
            <label style={styles.dropzone}>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <div style={styles.dropzoneContent}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p style={styles.dropzoneText}>
                  {parsing ? "Parseando..." : "Arrastra o haz clic para subir"}
                </p>
                <p style={styles.dropzoneHint}>
                  Informe panoramico de GA4 (.csv)
                </p>
              </div>
            </label>
          )}

          {/* Preview */}
          {preview && (
            <div style={styles.preview}>
              <div style={styles.previewHeader}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span style={styles.previewTitle}>CSV parseado correctamente</span>
              </div>

              {/* Stats grid */}
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <span style={styles.statValue}>{preview.overview.activeUsers.toLocaleString()}</span>
                  <span style={styles.statLabel}>Usuarios</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statValue}>{preview.pages.length}</span>
                  <span style={styles.statLabel}>Paginas</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statValue}>{preview.sources.length}</span>
                  <span style={styles.statLabel}>Fuentes</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statValue}>{preview.cities.length}</span>
                  <span style={styles.statLabel}>Ciudades</span>
                </div>
              </div>

              {/* Date range */}
              <div style={styles.dateRange}>
                Periodo: {formatDate(preview.overview.dateRange.start)} - {formatDate(preview.overview.dateRange.end)}
              </div>

              {/* File name */}
              <div style={styles.fileName}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {file?.name}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={styles.error}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <Button variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          {preview && (
            <Button variant="primary" onClick={handleUpload} disabled={uploading}>
              {uploading ? "Guardando..." : "Guardar datos"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CSV Parser ─────────────────────────────────────────────────────────

function parseGA4CSV(text: string): ParsedGA4Data {
  const lines = text.split("\n").map((l) => l.trim());
  
  // Find date range
  let dateStart = "";
  let dateEnd = "";
  for (const line of lines) {
    if (line.startsWith("# Fecha de inicio:")) {
      dateStart = line.split(":")[1]?.trim() || "";
    }
    if (line.startsWith("# Fecha de finalización:")) {
      dateEnd = line.split(":")[1]?.trim() || "";
      break;
    }
  }

  // Find sections by header patterns
  const sections = splitIntoSections(lines);

  // Parse overview (first section with Usuarios activos)
  const overviewSection = sections.find((s) => 
    s[0]?.includes("Usuarios activos") && s[0]?.includes("Usuarios nuevos")
  );
  let overview = { activeUsers: 0, newUsers: 0, avgEngagementTime: 0, totalEvents: 0 };
  if (overviewSection && overviewSection[1]) {
    const vals = overviewSection[1].split(",");
    overview = {
      activeUsers: parseInt(vals[0]) || 0,
      newUsers: parseInt(vals[1]) || 0,
      avgEngagementTime: parseFloat(vals[2]) || 0,
      totalEvents: parseInt(vals[3]) || 0,
    };
  }

  // Parse pages
  const pagesSection = sections.find((s) => 
    s[0]?.includes("Título de página") && s[0]?.includes("Vistas")
  );
  const pages: ParsedGA4Data["pages"] = [];
  if (pagesSection) {
    for (let i = 1; i < pagesSection.length; i++) {
      const vals = parseCSVLine(pagesSection[i]);
      if (vals.length >= 5) {
        pages.push({
          title: vals[0],
          views: parseInt(vals[1]) || 0,
          activeUsers: parseInt(vals[2]) || 0,
          events: parseInt(vals[3]) || 0,
          bounceRate: parseFloat(vals[4]) || 0,
        });
      }
    }
  }

  // Parse sources (Primera fuente/medio)
  const sourcesSection = sections.find((s) => 
    s[0]?.includes("Primera fuente/medio") && s[0]?.includes("Usuarios activos")
  );
  const sources: ParsedGA4Data["sources"] = [];
  if (sourcesSection) {
    for (let i = 1; i < sourcesSection.length; i++) {
      const vals = parseCSVLine(sourcesSection[i]);
      if (vals.length >= 2) {
        const [source, medium] = vals[0].split(" / ");
        sources.push({
          source: source || "",
          medium: medium || "",
          users: parseInt(vals[1]) || 0,
        });
      }
    }
  }

  // Parse cities
  const citiesSection = sections.find((s) => 
    s[0]?.includes("Ciudad") && s[0]?.includes("Usuarios activos")
  );
  const cities: ParsedGA4Data["cities"] = [];
  if (citiesSection) {
    for (let i = 1; i < citiesSection.length; i++) {
      const vals = parseCSVLine(citiesSection[i]);
      if (vals.length >= 2) {
        cities.push({
          city: vals[0],
          activeUsers: parseInt(vals[1]) || 0,
        });
      }
    }
  }

  // Parse daily users
  const dailySection = sections.find((s) => 
    s[0]?.includes("Día N") && s[0]?.includes("new")
  );
  const dailyUsers: ParsedGA4Data["dailyUsers"] = [];
  if (dailySection) {
    for (let i = 1; i < dailySection.length; i++) {
      const vals = parseCSVLine(dailySection[i]);
      if (vals.length >= 3) {
        const newU = parseInt(vals[1]) || 0;
        const retU = parseInt(vals[2]) || 0;
        if (newU > 0 || retU > 0) {
          dailyUsers.push({
            day: parseInt(vals[0]) || 0,
            newUsers: newU,
            returningUsers: retU,
          });
        }
      }
    }
  }

  if (overview.activeUsers === 0 && pages.length === 0) {
    throw new Error("No se pudo parsear el CSV. Verifica que sea un Informe panoramico de GA4.");
  }

  return {
    overview: {
      ...overview,
      dateRange: { start: dateStart, end: dateEnd },
    },
    pages,
    sources,
    cities,
    dailyUsers,
  };
}

function splitIntoSections(lines: string[]): string[][] {
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("#") || line === "") {
      if (current.length > 0) {
        sections.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    sections.push(current);
  }

  return sections;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const d = parseInt(dateStr.slice(6, 8));
  const m = parseInt(dateStr.slice(4, 6)) - 1;
  return `${d} ${months[m]}`;
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 500,
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "20px 24px",
    borderBottom: "1px solid #e2e8f0",
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: "#1e293b",
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "#64748b",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "none",
    backgroundColor: "#f1f5f9",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 24,
  },
  dropzone: {
    display: "block",
    border: "2px dashed #e2e8f0",
    borderRadius: 12,
    padding: 40,
    textAlign: "center" as const,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  dropzoneContent: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 12,
  },
  dropzoneText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "#334155",
  },
  dropzoneHint: {
    margin: 0,
    fontSize: 12,
    color: "#94a3b8",
  },
  preview: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 20,
  },
  previewHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#10b981",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    textAlign: "center" as const,
    border: "1px solid #e2e8f0",
  },
  statValue: {
    display: "block",
    fontSize: 18,
    fontWeight: 700,
    color: "#1e293b",
  },
  statLabel: {
    display: "block",
    fontSize: 10,
    fontWeight: 500,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    marginTop: 2,
  },
  dateRange: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center" as const,
    marginBottom: 12,
  },
  fileName: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 12,
    color: "#64748b",
    fontFamily: "monospace",
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    color: "#dc2626",
    fontSize: 13,
    marginTop: 16,
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    padding: "16px 24px",
    borderTop: "1px solid #e2e8f0",
    backgroundColor: "#fafbfc",
  },
};
