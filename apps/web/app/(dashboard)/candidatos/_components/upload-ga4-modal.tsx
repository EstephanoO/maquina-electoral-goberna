/**
 * GOBERNA — UploadGA4Modal Component
 * Modal to upload and parse GA4 CSV reports.
 * Supports two CSV inputs:
 * - Informe Panorámico: overview, pages, sources, dailyUsers
 * - Detalles Demográficos: enriched city data with engagement metrics
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

type EnrichedCity = {
  city: string;
  activeUsers: number;
  newUsers?: number;
  engagedSessions?: number;
  engagementRate?: number;
  sessionsPerUser?: number;
  avgEngagementTime?: number;
  events?: number;
  keyEvents?: number;
  keyEventRate?: number;
  revenue?: number;
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
  cities: EnrichedCity[];
  dailyUsers: Array<{
    day: number;
    newUsers: number;
    returningUsers: number;
  }>;
};

type FileState = {
  file: File | null;
  parsing: boolean;
  error: string | null;
};

export function UploadGA4Modal({ open, onClose, campaign, onSuccess }: Props) {
  // Two file inputs
  const [panoramicoState, setPanoramicoState] = useState<FileState>({
    file: null,
    parsing: false,
    error: null,
  });
  const [demograficoState, setDemograficoState] = useState<FileState>({
    file: null,
    parsing: false,
    error: null,
  });

  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ParsedGA4Data | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Parse Panorámico CSV
  const handlePanoramicoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setPanoramicoState({ file: f, parsing: true, error: null });
    setGlobalError(null);

    try {
      const text = await f.text();
      const parsed = parseInformePanoramico(text);
      
      // Merge with existing demographics if any
      setPreview((prev) => {
        if (prev) {
          return { ...parsed, cities: mergeCities(parsed.cities, prev.cities) };
        }
        return parsed;
      });
      setPanoramicoState({ file: f, parsing: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al parsear CSV";
      setPanoramicoState({ file: f, parsing: false, error: msg });
    }
  }, []);

  // Parse Demográficos CSV
  const handleDemograficoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setDemograficoState({ file: f, parsing: true, error: null });
    setGlobalError(null);

    try {
      const text = await f.text();
      const cities = parseDemograficosCSV(text);
      
      // Merge with existing preview or create minimal preview
      setPreview((prev) => {
        if (prev) {
          return { ...prev, cities: mergeCities(prev.cities, cities) };
        }
        // If no panorámico yet, create placeholder
        return {
          overview: {
            activeUsers: cities.reduce((sum, c) => sum + c.activeUsers, 0),
            newUsers: cities.reduce((sum, c) => sum + (c.newUsers || 0), 0),
            avgEngagementTime: 0,
            totalEvents: cities.reduce((sum, c) => sum + (c.events || 0), 0),
            dateRange: { start: "", end: "" },
          },
          pages: [],
          sources: [],
          cities,
          dailyUsers: [],
        };
      });
      setDemograficoState({ file: f, parsing: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al parsear CSV";
      setDemograficoState({ file: f, parsing: false, error: msg });
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!preview) return;

    // Require at least one file
    if (!panoramicoState.file && !demograficoState.file) {
      setGlobalError("Debes subir al menos un archivo CSV");
      return;
    }

    setUploading(true);
    setGlobalError(null);

    try {
      const res = await api.post(`/api/campaigns/${campaign.id}/analytics`, {
        data: preview,
      });

      if (!res.ok) {
        throw new Error(res.error?.message || "Error al guardar");
      }

      onSuccess();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setUploading(false);
    }
  }, [preview, campaign.id, onSuccess, panoramicoState.file, demograficoState.file]);

  const handleClose = useCallback(() => {
    setPanoramicoState({ file: null, parsing: false, error: null });
    setDemograficoState({ file: null, parsing: false, error: null });
    setPreview(null);
    setGlobalError(null);
    onClose();
  }, [onClose]);

  const handleRemovePanoramico = useCallback(() => {
    setPanoramicoState({ file: null, parsing: false, error: null });
    // If we have demographics, keep cities but clear panorámico data
    if (demograficoState.file && preview) {
      setPreview({
        overview: {
          activeUsers: preview.cities.reduce((sum, c) => sum + c.activeUsers, 0),
          newUsers: preview.cities.reduce((sum, c) => sum + (c.newUsers || 0), 0),
          avgEngagementTime: 0,
          totalEvents: preview.cities.reduce((sum, c) => sum + (c.events || 0), 0),
          dateRange: { start: "", end: "" },
        },
        pages: [],
        sources: [],
        cities: preview.cities,
        dailyUsers: [],
      });
    } else {
      setPreview(null);
    }
  }, [demograficoState.file, preview]);

  const handleRemoveDemografico = useCallback(() => {
    setDemograficoState({ file: null, parsing: false, error: null });
    // If we have panorámico, reparse it to get basic cities
    if (panoramicoState.file && preview) {
      panoramicoState.file.text().then((text) => {
        const parsed = parseInformePanoramico(text);
        setPreview(parsed);
      }).catch(() => {
        // Ignore, keep current preview without enriched cities
      });
    } else {
      setPreview(null);
    }
  }, [panoramicoState.file, preview]);

  if (!open) return null;

  const hasAnyFile = panoramicoState.file || demograficoState.file;
  const isParsing = panoramicoState.parsing || demograficoState.parsing;

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
          {/* Two upload zones side by side */}
          <div style={styles.uploadGrid}>
            {/* Panorámico */}
            <div style={styles.uploadSection}>
              <div style={styles.uploadLabel}>
                <span style={styles.uploadLabelText}>Informe Panoramico</span>
                <span style={styles.uploadLabelHint}>KPIs, paginas, fuentes</span>
              </div>
              {panoramicoState.file ? (
                <div style={styles.fileCard}>
                  <div style={styles.fileCardContent}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span style={styles.fileCardName}>{panoramicoState.file.name}</span>
                  </div>
                  <button type="button" onClick={handleRemovePanoramico} style={styles.removeBtn} aria-label="Eliminar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <label style={styles.dropzoneMini}>
                  <input type="file" accept=".csv" onChange={handlePanoramicoChange} style={{ display: "none" }} />
                  <div style={styles.dropzoneMiniContent}>
                    {panoramicoState.parsing ? (
                      <span style={styles.parsingText}>Parseando...</span>
                    ) : (
                      <>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" aria-hidden="true">
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span style={styles.dropzoneMiniText}>Subir CSV</span>
                      </>
                    )}
                  </div>
                </label>
              )}
              {panoramicoState.error && (
                <div style={styles.inlineError}>{panoramicoState.error}</div>
              )}
            </div>

            {/* Demográficos */}
            <div style={styles.uploadSection}>
              <div style={styles.uploadLabel}>
                <span style={styles.uploadLabelText}>Detalles Demograficos</span>
                <span style={styles.uploadLabelHint}>Ciudades con metricas</span>
              </div>
              {demograficoState.file ? (
                <div style={styles.fileCard}>
                  <div style={styles.fileCardContent}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span style={styles.fileCardName}>{demograficoState.file.name}</span>
                  </div>
                  <button type="button" onClick={handleRemoveDemografico} style={styles.removeBtn} aria-label="Eliminar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <label style={styles.dropzoneMini}>
                  <input type="file" accept=".csv" onChange={handleDemograficoChange} style={{ display: "none" }} />
                  <div style={styles.dropzoneMiniContent}>
                    {demograficoState.parsing ? (
                      <span style={styles.parsingText}>Parseando...</span>
                    ) : (
                      <>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" aria-hidden="true">
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span style={styles.dropzoneMiniText}>Subir CSV</span>
                      </>
                    )}
                  </div>
                </label>
              )}
              {demograficoState.error && (
                <div style={styles.inlineError}>{demograficoState.error}</div>
              )}
            </div>
          </div>

          {/* Preview */}
          {preview && hasAnyFile && !isParsing && (
            <div style={styles.preview}>
              <div style={styles.previewHeader}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span style={styles.previewTitle}>Datos listos para guardar</span>
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

              {/* Cities with engagement indicator */}
              {demograficoState.file && preview.cities.some((c) => c.avgEngagementTime !== undefined) && (
                <div style={styles.enrichedBadge}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <span>Ciudades con metricas de engagement</span>
                </div>
              )}

              {/* Date range */}
              {preview.overview.dateRange.start && (
                <div style={styles.dateRange}>
                  Periodo: {formatDate(preview.overview.dateRange.start)} - {formatDate(preview.overview.dateRange.end)}
                </div>
              )}
            </div>
          )}

          {/* Global Error */}
          {globalError && (
            <div style={styles.error}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {globalError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <Button variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          {preview && hasAnyFile && (
            <Button variant="primary" onClick={handleUpload} disabled={uploading || isParsing}>
              {uploading ? "Guardando..." : "Guardar datos"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CSV Parsers ───────────────────────────────────────────────────────

/**
 * Parse Informe Panorámico CSV (overview, pages, sources, basic cities, dailyUsers)
 */
function parseInformePanoramico(text: string): ParsedGA4Data {
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

  const sections = splitIntoSections(lines);

  // Parse overview
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

  // Parse sources
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

  // Parse cities (basic, from panorámico)
  const citiesSection = sections.find((s) => 
    s[0]?.includes("Ciudad") && s[0]?.includes("Usuarios activos")
  );
  const cities: EnrichedCity[] = [];
  if (citiesSection) {
    for (let i = 1; i < citiesSection.length; i++) {
      const vals = parseCSVLine(citiesSection[i]);
      if (vals.length >= 2) {
        const cityName = normalizeCityName(vals[0]);
        if (cityName) {
          cities.push({
            city: cityName,
            activeUsers: parseInt(vals[1]) || 0,
          });
        }
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
    overview: { ...overview, dateRange: { start: dateStart, end: dateEnd } },
    pages,
    sources,
    cities,
    dailyUsers,
  };
}

/**
 * Parse Detalles Demográficos CSV (enriched city data)
 * Headers: Ciudad, Usuarios activos, Usuarios nuevos, Sesiones con interacción, 
 * Porcentaje de interacciones, Sesiones con interacción por usuario activo, 
 * Tiempo de interacción medio por usuario activo, Número de eventos, 
 * Eventos clave, Tasa de evento clave de usuarios, Total de ingresos
 */
function parseDemograficosCSV(text: string): EnrichedCity[] {
  const lines = text.split("\n").map((l) => l.trim());
  const sections = splitIntoSections(lines);

  // Find the section with city data (has "Ciudad" and "Usuarios activos")
  const citiesSection = sections.find((s) =>
    s[0]?.includes("Ciudad") && s[0]?.includes("Usuarios activos")
  );

  if (!citiesSection || citiesSection.length < 2) {
    throw new Error("No se encontró la sección de ciudades en el CSV demográfico.");
  }

  const cities: EnrichedCity[] = [];

  for (let i = 1; i < citiesSection.length; i++) {
    const vals = parseCSVLine(citiesSection[i]);
    if (vals.length >= 7) {
      // Detect empty city name (Lima case)
      let cityName = normalizeCityName(vals[0]);
      
      // Skip invalid entries like "(not set)" or zip codes
      if (!cityName || cityName === "(not set)" || /^\d+$/.test(cityName)) {
        // If it's the empty Lima case (first column empty, has users)
        if (vals[0] === "" && parseInt(vals[1]) > 0) {
          cityName = "Lima";
        } else {
          continue;
        }
      }

      const activeUsers = parseInt(vals[1]) || 0;
      if (activeUsers === 0) continue;

      cities.push({
        city: cityName,
        activeUsers,
        newUsers: parseInt(vals[2]) || 0,
        engagedSessions: parseInt(vals[3]) || 0,
        engagementRate: parseFloat(vals[4]) || 0, // Already decimal in CSV
        sessionsPerUser: parseFloat(vals[5]) || 0,
        avgEngagementTime: parseFloat(vals[6]) || 0, // Seconds
        events: parseInt(vals[7]) || 0,
        keyEvents: parseInt(vals[8]) || 0,
        keyEventRate: parseFloat(vals[9]) || 0,
        revenue: parseFloat(vals[10]) || 0,
      });
    }
  }

  if (cities.length === 0) {
    throw new Error("No se encontraron ciudades válidas en el CSV demográfico.");
  }

  return cities;
}

/**
 * Merge cities from panorámico and demográficos.
 * Demográficos data takes precedence (more fields).
 */
function mergeCities(baseCities: EnrichedCity[], enrichedCities: EnrichedCity[]): EnrichedCity[] {
  const cityMap = new Map<string, EnrichedCity>();

  // Add base cities first
  for (const city of baseCities) {
    const key = city.city.toLowerCase();
    cityMap.set(key, city);
  }

  // Override with enriched cities (they have more data)
  for (const city of enrichedCities) {
    const key = city.city.toLowerCase();
    cityMap.set(key, city);
  }

  // Sort by activeUsers descending
  return Array.from(cityMap.values()).sort((a, b) => b.activeUsers - a.activeUsers);
}

/**
 * Normalize city name: trim, handle empty (Lima), filter garbage
 */
function normalizeCityName(name: string): string {
  const trimmed = name.trim();
  
  // Skip garbage entries
  if (trimmed === "(not set)" || /^\d+$/.test(trimmed)) {
    return "";
  }
  
  // Skip clearly non-Peru cities (can expand this list)
  const nonPeruCities = [
    "fort worth", "council bluffs", "aspen", "miami", "springfield", 
    "duluth", "prineville", "frankfurt am main", "turin", "collegno",
    "l'hospitalet de llobregat", "paris", "lulea", "gwalior", "siberut tengah", "srumbung"
  ];
  if (nonPeruCities.includes(trimmed.toLowerCase())) {
    return ""; // We could include them but skip for Peru focus
  }
  
  // Skip congressional district entries
  if (trimmed.toLowerCase().includes("congressional district")) {
    return "";
  }

  return trimmed;
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
    maxWidth: 560,
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
  uploadGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 20,
  },
  uploadSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  uploadLabel: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  uploadLabelText: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
  },
  uploadLabelHint: {
    fontSize: 11,
    color: "#94a3b8",
  },
  dropzoneMini: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px dashed #e2e8f0",
    borderRadius: 10,
    padding: 24,
    cursor: "pointer",
    transition: "all 0.2s ease",
    minHeight: 80,
  },
  dropzoneMiniContent: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 8,
    pointerEvents: "none" as const,
  },
  dropzoneMiniText: {
    fontSize: 12,
    fontWeight: 500,
    color: "#64748b",
  },
  parsingText: {
    fontSize: 12,
    color: "#3b82f6",
    fontWeight: 500,
  },
  fileCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 10,
    padding: "12px 14px",
    minHeight: 80,
  },
  fileCardContent: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
  },
  fileCardName: {
    fontSize: 12,
    fontWeight: 500,
    color: "#166534",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 140,
  },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "none",
    backgroundColor: "transparent",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  inlineError: {
    fontSize: 11,
    color: "#dc2626",
    padding: "4px 0",
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
    marginBottom: 12,
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
  enrichedBadge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 11,
    color: "#8b5cf6",
    fontWeight: 500,
    marginBottom: 12,
    padding: "6px 12px",
    backgroundColor: "#f5f3ff",
    borderRadius: 6,
  },
  dateRange: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center" as const,
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
