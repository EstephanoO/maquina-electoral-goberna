/**
 * GOBERNA — UploadGA4Modal Component
 * Modal to upload and parse 5 GA4 CSV reports.
 *
 * CSV 1: Informe Panoramico — overview, pages, sources, dailyUsers, basic cities
 * CSV 2: Detalles Demograficos — enriched city data with engagement metrics
 * CSV 3: Eventos — event funnel data (page_view, scroll, click, form_start, etc)
 * CSV 4: Paginas y Pantallas — detailed page paths with engagement metrics
 * CSV 5: Fuente/Medio (Respuesta Instantanea) — additional source/medium data
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "../../../../lib/ui";
import { api } from "../../../../lib/services";
import type { Campaign } from "../../../../lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  campaign: Campaign;
  onSuccess: () => void;
};

/* ── Parsed data types (client-side only) ──────────────────────────── */

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

type EnrichedRegion = {
  region: string;
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

type ParsedEvent = {
  name: string;
  count: number;
  users: number;
  countPerUser: number;
  revenue: number;
};

type ParsedPageDetailed = {
  path: string;
  views: number;
  activeUsers: number;
  viewsPerUser: number;
  avgEngagementTime: number;
  events: number;
  keyEvents: number;
  revenue: number;
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
  pagesDetailed: ParsedPageDetailed[];
  sources: Array<{
    source: string;
    medium: string;
    users: number;
  }>;
  sessionSources: Array<{
    source: string;
    medium: string;
    sessions: number;
  }>;
  events: ParsedEvent[];
  cities: EnrichedCity[];
  regions: EnrichedRegion[];
  dailyUsers: Array<{
    day: number;
    newUsers: number;
    returningUsers: number;
  }>;
};

type FileSlot = {
  id: string;
  label: string;
  hint: string;
  icon: string;
  required: boolean;
};

type FileState = {
  file: File | null;
  parsing: boolean;
  error: string | null;
};

const FILE_SLOTS: FileSlot[] = [
  { id: "panoramico", label: "Informe Panoramico", hint: "KPIs, paginas, fuentes, ciudades", icon: "chart", required: true },
  { id: "demografico", label: "Detalles Demograficos", hint: "Ciudades con engagement", icon: "globe", required: false },
  { id: "demografico_region", label: "Demograficos por Region", hint: "Regiones con engagement (mapa)", icon: "map", required: false },
  { id: "eventos", label: "Eventos", hint: "Funnel de eventos", icon: "zap", required: false },
  { id: "paginas", label: "Paginas y Pantallas", hint: "URLs con metricas", icon: "file", required: false },
  { id: "fuente", label: "Fuente / Medio", hint: "Canales de adquisicion", icon: "share", required: false },
];

const emptyFileState = (): FileState => ({ file: null, parsing: false, error: null });

export function UploadGA4Modal({ open, onClose, campaign, onSuccess }: Props) {
  const [files, setFiles] = useState<Record<string, FileState>>({
    panoramico: emptyFileState(),
    demografico: emptyFileState(),
    demografico_region: emptyFileState(),
    eventos: emptyFileState(),
    paginas: emptyFileState(),
    fuente: emptyFileState(),
  });

  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ParsedGA4Data | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* ── File handlers ──────────────────────────────────────────────── */

  const updateFile = useCallback((slotId: string, update: Partial<FileState>) => {
    setFiles((prev) => ({ ...prev, [slotId]: { ...prev[slotId], ...update } }));
  }, []);

  const handleFileChange = useCallback(async (slotId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    updateFile(slotId, { file: f, parsing: true, error: null });
    setGlobalError(null);

    try {
      const text = await f.text();

      switch (slotId) {
        case "panoramico": {
          const parsed = parseInformePanoramico(text);
          setPreview((prev) => {
            if (prev) {
              return {
                ...prev,
                overview: parsed.overview,
                pages: parsed.pages,
                sources: parsed.sources,
                sessionSources: parsed.sessionSources.length > 0 ? parsed.sessionSources : prev.sessionSources,
                dailyUsers: parsed.dailyUsers,
                cities: mergeCities(parsed.cities, prev.cities),
              };
            }
            return parsed;
          });
          break;
        }
        case "demografico": {
          const cities = parseDemograficosCSV(text);
          setPreview((prev) => {
            if (prev) {
              return { ...prev, cities: mergeCities(prev.cities, cities) };
            }
            return createMinimalPreview({ cities });
          });
          break;
        }
        case "demografico_region": {
          const regions = parseRegionesCSV(text);
          setPreview((prev) => {
            if (prev) {
              return { ...prev, regions };
            }
            return createMinimalPreview({ regions });
          });
          break;
        }
        case "eventos": {
          const events = parseEventosCSV(text);
          setPreview((prev) => {
            if (prev) {
              return { ...prev, events };
            }
            return createMinimalPreview({ events });
          });
          break;
        }
        case "paginas": {
          const pagesDetailed = parsePaginasCSV(text);
          setPreview((prev) => {
            if (prev) {
              return { ...prev, pagesDetailed };
            }
            return createMinimalPreview({ pagesDetailed });
          });
          break;
        }
        case "fuente": {
          const sources = parseFuenteMedioCSV(text);
          setPreview((prev) => {
            if (prev) {
              // Merge sources, preferring existing panoramico sources
              const existingKeys = new Set(prev.sources.map((s) => `${s.source}/${s.medium}`));
              const newSources = sources.filter((s) => !existingKeys.has(`${s.source}/${s.medium}`));
              return { ...prev, sources: [...prev.sources, ...newSources] };
            }
            return createMinimalPreview({ sources });
          });
          break;
        }
      }
      updateFile(slotId, { file: f, parsing: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al parsear el CSV.";
      updateFile(slotId, { file: f, parsing: false, error: msg });
    }
  }, [updateFile]);

  const handleRemoveFile = useCallback((slotId: string) => {
    updateFile(slotId, { file: null, parsing: false, error: null });

    // Reset input
    const input = fileInputRefs.current[slotId];
    if (input) input.value = "";

    // Check if any other file remains
    const hasOtherFile = Object.entries(files).some(
      ([id, state]) => id !== slotId && state.file !== null
    );

    // Reparse remaining files
    setPreview((prev) => {
      if (!prev) return null;

      switch (slotId) {
        case "panoramico":
          // Lost core data, try to rebuild from other files
          if (!hasOtherFile) return null;
          return {
            ...prev,
            overview: { activeUsers: 0, newUsers: 0, avgEngagementTime: 0, totalEvents: 0, dateRange: { start: "", end: "" } },
            pages: [],
            dailyUsers: [],
          };
        case "demografico":
          return { ...prev, cities: prev.cities.map((c) => ({ city: c.city, activeUsers: c.activeUsers })) };
        case "demografico_region":
          return { ...prev, regions: [] };
        case "eventos":
          return { ...prev, events: [] };
        case "paginas":
          return { ...prev, pagesDetailed: [] };
        case "fuente":
          return prev; // Sources from panoramico remain
        default:
          return prev;
      }
    });
  }, [updateFile, files]);

  /* ── Upload ─────────────────────────────────────────────────────── */

  const handleUpload = useCallback(async () => {
    if (!preview) return;

    const hasAnyFile = Object.values(files).some((s) => s.file !== null);
    if (!hasAnyFile) {
      setGlobalError("Debes subir al menos un archivo CSV.");
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
      setGlobalError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setUploading(false);
    }
  }, [preview, campaign.id, onSuccess, files]);

  const handleClose = useCallback(() => {
    setFiles({
      panoramico: emptyFileState(),
      demografico: emptyFileState(),
      demografico_region: emptyFileState(),
      eventos: emptyFileState(),
      paginas: emptyFileState(),
      fuente: emptyFileState(),
    });
    setPreview(null);
    setGlobalError(null);
    setStep("upload");
    onClose();
  }, [onClose]);

  if (!open) return null;

  const hasAnyFile = Object.values(files).some((s) => s.file !== null);
  const isParsing = Object.values(files).some((s) => s.parsing);
  const uploadedCount = Object.values(files).filter((s) => s.file !== null).length;

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
            <h2 id="upload-ga4-title" style={styles.title}>GOOGLE ANALYTICS</h2>
            <p style={styles.subtitle}>
              {campaign.name} — {step === "upload" ? "Subir CSVs" : "Vista previa"}
            </p>
          </div>
          <div style={styles.headerRight}>
            {hasAnyFile && (
              <span style={styles.fileBadge}>{uploadedCount}/6 archivos</span>
            )}
            <button type="button" onClick={handleClose} style={styles.closeBtn} aria-label="Cerrar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {step === "upload" ? (
            <>
              {/* Instructions */}
              <div style={styles.instructions}>
                <SlotIcon icon="info" size={16} color="#3b82f6" />
                <span>Exporta los 5 reportes desde Google Analytics 4 y subelosos aqui. Solo el Informe Panoramico es obligatorio.</span>
              </div>

              {/* 5 CSV slots in grid */}
              <div style={styles.slotsGrid}>
                {FILE_SLOTS.map((slot) => {
                  const state = files[slot.id];
                  return (
                    <div key={slot.id} style={styles.slotCard}>
                      <div style={styles.slotHeader}>
                        <div style={styles.slotIcon}>
                          <SlotIcon icon={slot.icon} size={18} color={state.file ? "#10b981" : "#94a3b8"} />
                        </div>
                        <div style={styles.slotInfo}>
                          <div style={styles.slotLabel}>
                            {slot.label}
                            {slot.required && <span style={styles.requiredDot}>*</span>}
                          </div>
                          <div style={styles.slotHint}>{slot.hint}</div>
                        </div>
                      </div>

                      {state.file ? (
                        <div style={styles.fileCard}>
                          <div style={styles.fileCardContent}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span style={styles.fileCardName}>{state.file.name}</span>
                          </div>
                          <button type="button" onClick={() => handleRemoveFile(slot.id)} style={styles.removeBtn} aria-label="Eliminar">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <label style={styles.dropzone}>
                          <input
                            ref={(el) => { fileInputRefs.current[slot.id] = el; }}
                            type="file"
                            accept=".csv"
                            onChange={(e) => handleFileChange(slot.id, e)}
                            style={{ display: "none" }}
                          />
                          {state.parsing ? (
                            <span style={styles.parsingText}>Procesando...</span>
                          ) : (
                            <div style={styles.dropzoneContent}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" aria-hidden="true">
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                                <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
                              </svg>
                              <span style={styles.dropzoneText}>Subir CSV</span>
                            </div>
                          )}
                        </label>
                      )}

                      {state.error && (
                        <div style={styles.inlineError}>{state.error}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Preview button */}
              {preview && hasAnyFile && !isParsing && (
                <button
                  type="button"
                  onClick={() => setStep("preview")}
                  style={styles.previewButton}
                >
                  Ver vista previa de datos
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </>
          ) : (
            /* Preview step */
            <PreviewPanel preview={preview!} files={files} onBack={() => setStep("upload")} />
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
          {step === "preview" && (
            <button type="button" onClick={() => setStep("upload")} style={styles.backBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Archivos
            </button>
          )}
          <div style={{ flex: 1 }} />
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

/* ═══════════════════════════════════════════════════════════════════════
   Preview Panel
   ═══════════════════════════════════════════════════════════════════ */

function PreviewPanel({
  preview,
  files,
  onBack,
}: {
  preview: ParsedGA4Data;
  files: Record<string, FileState>;
  onBack: () => void;
}) {
  return (
    <div style={previewStyles.container}>
      {/* Success badge */}
      <div style={previewStyles.successBadge}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span style={previewStyles.successText}>Datos listos para guardar</span>
      </div>

      {/* Date range */}
      {preview.overview.dateRange.start && (
        <div style={previewStyles.dateRange}>
          {formatDate(preview.overview.dateRange.start)} — {formatDate(preview.overview.dateRange.end)}
        </div>
      )}

      {/* Stats grid */}
      <div style={previewStyles.statsGrid}>
        <StatCard value={preview.overview.activeUsers} label="Usuarios" />
        <StatCard value={preview.overview.newUsers} label="Nuevos" />
        <StatCard value={preview.overview.totalEvents} label="Eventos" />
        <StatCard value={`${preview.overview.avgEngagementTime.toFixed(1)}s`} label="Tiempo prom." />
      </div>

      {/* Data inventory */}
      <div style={previewStyles.inventory}>
        <InventoryRow
          icon="file"
          label="Paginas (panoramico)"
          count={preview.pages.length}
          active={preview.pages.length > 0}
        />
        <InventoryRow
          icon="file"
          label="Paginas detalladas"
          count={preview.pagesDetailed.length}
          active={preview.pagesDetailed.length > 0}
        />
        <InventoryRow
          icon="share"
          label="Fuentes de trafico"
          count={preview.sources.length}
          active={preview.sources.length > 0}
        />
        <InventoryRow
          icon="zap"
          label="Tipos de evento"
          count={preview.events.length}
          active={preview.events.length > 0}
        />
        <InventoryRow
          icon="globe"
          label="Ciudades"
          count={preview.cities.length}
          active={preview.cities.length > 0}
          badge={files.demografico.file ? "enriquecido" : undefined}
        />
        <InventoryRow
          icon="map"
          label="Regiones (mapa)"
          count={preview.regions.length}
          active={preview.regions.length > 0}
          badge={files.demografico_region.file ? "region" : undefined}
        />
        <InventoryRow
          icon="chart"
          label="Dias de datos"
          count={preview.dailyUsers.length}
          active={preview.dailyUsers.length > 0}
        />
      </div>

      {/* Events funnel mini-preview */}
      {preview.events.length > 0 && (
        <div style={previewStyles.funnelPreview}>
          <div style={previewStyles.funnelTitle}>Funnel de eventos</div>
          <div style={previewStyles.funnelBars}>
            {preview.events.slice(0, 6).map((evt) => {
              const maxCount = preview.events[0]?.count || 1;
              const pct = Math.max(4, (evt.count / maxCount) * 100);
              return (
                <div key={evt.name} style={previewStyles.funnelRow}>
                  <span style={previewStyles.funnelLabel}>{evt.name}</span>
                  <div style={previewStyles.funnelBarBg}>
                    <div style={{ ...previewStyles.funnelBar, width: `${pct}%` }} />
                  </div>
                  <span style={previewStyles.funnelValue}>{evt.count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  const display = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div style={previewStyles.statCard}>
      <span style={previewStyles.statValue}>{display}</span>
      <span style={previewStyles.statLabel}>{label}</span>
    </div>
  );
}

function InventoryRow({
  icon,
  label,
  count,
  active,
  badge,
}: {
  icon: string;
  label: string;
  count: number;
  active: boolean;
  badge?: string;
}) {
  return (
    <div style={{ ...previewStyles.inventoryRow, opacity: active ? 1 : 0.4 }}>
      <SlotIcon icon={icon} size={14} color={active ? "#10b981" : "#94a3b8"} />
      <span style={previewStyles.inventoryLabel}>{label}</span>
      {badge && <span style={previewStyles.inventoryBadge}>{badge}</span>}
      <span style={previewStyles.inventoryCount}>{count}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SlotIcon helper
   ═══════════════════════════════════════════════════════════════════ */

function SlotIcon({ icon, size, color }: { icon: string; size: number; color: string }) {
  const s = { width: size, height: size };
  switch (icon) {
    case "chart":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
        </svg>
      );
    case "globe":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "zap":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "file":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "share":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      );
    case "map":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      );
    case "info":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   CSV Parsers
   ═══════════════════════════════════════════════════════════════════ */

/** Parse Informe Panoramico CSV (overview, pages, sources, basic cities, dailyUsers) */
function parseInformePanoramico(text: string): ParsedGA4Data {
  const lines = text.split("\n").map((l) => l.trim());

  let dateStart = "";
  let dateEnd = "";
  for (const line of lines) {
    if (line.startsWith("# Fecha de inicio:")) {
      dateStart = line.split(":")[1]?.trim() || "";
    }
    if (line.startsWith("# Fecha de finalizaci")) {
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

  // Parse pages (by title)
  const pagesSection = sections.find((s) =>
    s[0]?.includes("Titulo de pagina") || s[0]?.includes("Título de página")
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

  // Parse sources (first user source/medium)
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

  // Parse session sources
  const sessionSourcesSection = sections.find((s) =>
    s[0]?.includes("Fuente/medio de la sesi") && s[0]?.includes("Sesiones")
  );
  const sessionSources: ParsedGA4Data["sessionSources"] = [];
  if (sessionSourcesSection) {
    for (let i = 1; i < sessionSourcesSection.length; i++) {
      const vals = parseCSVLine(sessionSourcesSection[i]);
      if (vals.length >= 2) {
        const [source, medium] = vals[0].split(" / ");
        sessionSources.push({
          source: source || "",
          medium: medium || "",
          sessions: parseInt(vals[1]) || 0,
        });
      }
    }
  }

  // Parse cities (basic from panoramico)
  const citiesSection = sections.find((s) =>
    s[0]?.includes("Ciudad") && s[0]?.includes("Usuarios activos") && !s[0]?.includes("Usuarios nuevos")
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
    s[0]?.includes("Dia N") || s[0]?.includes("Día N")
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
    throw new Error("No se pudo parsear el CSV. Verifica que sea un Informe Panoramico de GA4.");
  }

  return {
    overview: { ...overview, dateRange: { start: dateStart, end: dateEnd } },
    pages,
    pagesDetailed: [],
    sources,
    sessionSources,
    events: [],
    cities,
    regions: [],
    dailyUsers,
  };
}

/** Parse Detalles Demograficos CSV (enriched city data) */
function parseDemograficosCSV(text: string): EnrichedCity[] {
  const lines = text.split("\n").map((l) => l.trim());
  const sections = splitIntoSections(lines);

  const citiesSection = sections.find((s) =>
    s[0]?.includes("Ciudad") && s[0]?.includes("Usuarios activos")
  );

  if (!citiesSection || citiesSection.length < 2) {
    throw new Error("No se encontro la seccion de ciudades en el CSV demografico.");
  }

  const cities: EnrichedCity[] = [];

  for (let i = 1; i < citiesSection.length; i++) {
    const vals = parseCSVLine(citiesSection[i]);
    if (vals.length >= 7) {
      let cityName = normalizeCityName(vals[0]);

      if (!cityName || cityName === "(not set)" || /^\d+$/.test(cityName)) {
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
        engagementRate: parseFloat(vals[4]) || 0,
        sessionsPerUser: parseFloat(vals[5]) || 0,
        avgEngagementTime: parseFloat(vals[6]) || 0,
        events: parseInt(vals[7]) || 0,
        keyEvents: parseInt(vals[8]) || 0,
        keyEventRate: parseFloat(vals[9]) || 0,
        revenue: parseFloat(vals[10]) || 0,
      });
    }
  }

  if (cities.length === 0) {
    throw new Error("No se encontraron ciudades validas en el CSV demografico.");
  }

  return cities;
}

/** Parse Detalles Demograficos por Region CSV (GA4 region-level data) */
function parseRegionesCSV(text: string): EnrichedRegion[] {
  const lines = text.split("\n").map((l) => l.trim());
  const sections = splitIntoSections(lines);

  // The region CSV header uses "Región" instead of "Ciudad"
  const regionSection = sections.find((s) =>
    (s[0]?.includes("Regi") || s[0]?.includes("Region")) && s[0]?.includes("Usuarios activos")
  );

  if (!regionSection || regionSection.length < 2) {
    throw new Error("No se encontro la seccion de regiones en el CSV. Verifica que sea el reporte 'Detalles demograficos: Region'.");
  }

  const regions: EnrichedRegion[] = [];

  // Find which column index corresponds to each metric from the header
  const headers = parseCSVLine(regionSection[0]);
  const idxRegion = headers.findIndex((h) => h.includes("Regi") || h.includes("Region"));
  const idxActiveUsers = headers.findIndex((h) => h.includes("Usuarios activos"));
  const idxNewUsers = headers.findIndex((h) => h.includes("Usuarios nuevos"));
  const idxEngagedSessions = headers.findIndex((h) => h.includes("Sesiones con interacci"));
  const idxEngagementRate = headers.findIndex((h) => h.includes("Porcentaje de interacci"));
  const idxSessionsPerUser = headers.findIndex((h) => h.includes("Sesiones con interacci") && h.includes("usuario"));
  const idxAvgTime = headers.findIndex((h) => h.includes("Tiempo de interacci") || h.includes("Tiempo de interacción"));
  const idxEvents = headers.findIndex((h) => h.includes("Número de eventos") || h.includes("Numero de eventos"));
  const idxKeyEvents = headers.findIndex((h) => h.includes("Eventos clave") && !h.includes("Tasa"));
  const idxKeyEventRate = headers.findIndex((h) => h.includes("Tasa de evento clave"));
  const idxRevenue = headers.findIndex((h) => h.includes("ingresos") || h.includes("Ingresos"));

  for (let i = 1; i < regionSection.length; i++) {
    const vals = parseCSVLine(regionSection[i]);
    if (vals.length < 2) continue;

    const regionName = (idxRegion >= 0 ? vals[idxRegion] : vals[0])?.trim();
    if (!regionName || regionName === "(not set)" || /^\d+$/.test(regionName)) continue;

    const activeUsers = parseInt(idxActiveUsers >= 0 ? vals[idxActiveUsers] : vals[1]) || 0;
    if (activeUsers === 0) continue;

    regions.push({
      region: regionName,
      activeUsers,
      newUsers: idxNewUsers >= 0 ? parseInt(vals[idxNewUsers]) || 0 : undefined,
      engagedSessions: idxEngagedSessions >= 0 ? parseInt(vals[idxEngagedSessions]) || 0 : undefined,
      engagementRate: idxEngagementRate >= 0 ? parseFloat(vals[idxEngagementRate]) || 0 : undefined,
      sessionsPerUser: idxSessionsPerUser >= 0 && idxSessionsPerUser !== idxEngagedSessions
        ? parseFloat(vals[idxSessionsPerUser]) || 0
        : undefined,
      avgEngagementTime: idxAvgTime >= 0 ? parseFloat(vals[idxAvgTime]) || 0 : undefined,
      events: idxEvents >= 0 ? parseInt(vals[idxEvents]) || 0 : undefined,
      keyEvents: idxKeyEvents >= 0 ? parseInt(vals[idxKeyEvents]) || 0 : undefined,
      keyEventRate: idxKeyEventRate >= 0 ? parseFloat(vals[idxKeyEventRate]) || 0 : undefined,
      revenue: idxRevenue >= 0 ? parseFloat(vals[idxRevenue]) || 0 : undefined,
    });
  }

  if (regions.length === 0) {
    throw new Error("No se encontraron regiones validas en el CSV. Verifica que sea el reporte de Region (no Ciudad).");
  }

  return regions.sort((a, b) => b.activeUsers - a.activeUsers);
}

/** Parse Eventos CSV */
function parseEventosCSV(text: string): ParsedEvent[] {
  const lines = text.split("\n").map((l) => l.trim());
  const sections = splitIntoSections(lines);

  const eventsSection = sections.find((s) =>
    s[0]?.includes("Nombre del evento") && s[0]?.includes("Numero de eventos") ||
    s[0]?.includes("Nombre del evento") && s[0]?.includes("Número de eventos")
  );

  if (!eventsSection || eventsSection.length < 2) {
    throw new Error("No se encontro la seccion de eventos en el CSV.");
  }

  const events: ParsedEvent[] = [];

  for (let i = 1; i < eventsSection.length; i++) {
    const vals = parseCSVLine(eventsSection[i]);
    if (vals.length >= 4) {
      events.push({
        name: vals[0],
        count: parseInt(vals[1]) || 0,
        users: parseInt(vals[2]) || 0,
        countPerUser: parseFloat(vals[3]) || 0,
        revenue: parseFloat(vals[4]) || 0,
      });
    }
  }

  if (events.length === 0) {
    throw new Error("No se encontraron eventos validos en el CSV.");
  }

  // Sort by count descending
  events.sort((a, b) => b.count - a.count);
  return events;
}

/** Parse Paginas y Pantallas CSV (with URL paths) */
function parsePaginasCSV(text: string): ParsedPageDetailed[] {
  const lines = text.split("\n").map((l) => l.trim());
  const sections = splitIntoSections(lines);

  const pagesSection = sections.find((s) =>
    s[0]?.includes("Ruta de pagina") || s[0]?.includes("Ruta de página")
  );

  if (!pagesSection || pagesSection.length < 2) {
    throw new Error("No se encontro la seccion de paginas en el CSV.");
  }

  const pages: ParsedPageDetailed[] = [];

  for (let i = 1; i < pagesSection.length; i++) {
    const vals = parseCSVLine(pagesSection[i]);
    if (vals.length >= 7) {
      pages.push({
        path: vals[0],
        views: parseInt(vals[1]) || 0,
        activeUsers: parseInt(vals[2]) || 0,
        viewsPerUser: parseFloat(vals[3]) || 0,
        avgEngagementTime: parseFloat(vals[4]) || 0,
        events: parseInt(vals[5]) || 0,
        keyEvents: parseInt(vals[6]) || 0,
        revenue: parseFloat(vals[7]) || 0,
      });
    }
  }

  if (pages.length === 0) {
    throw new Error("No se encontraron paginas validas en el CSV.");
  }

  return pages;
}

/** Parse Fuente/Medio CSV (respuesta instantanea) */
function parseFuenteMedioCSV(text: string): ParsedGA4Data["sources"] {
  const lines = text.split("\n").map((l) => l.trim());
  const sections = splitIntoSections(lines);

  const sourcesSection = sections.find((s) =>
    s[0]?.includes("fuente/medio") || s[0]?.includes("Fuente/medio")
  );

  if (!sourcesSection || sourcesSection.length < 2) {
    throw new Error("No se encontro la seccion de fuentes en el CSV.");
  }

  const sources: ParsedGA4Data["sources"] = [];

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

  if (sources.length === 0) {
    throw new Error("No se encontraron fuentes validas en el CSV.");
  }

  return sources;
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function createMinimalPreview(partial: Partial<ParsedGA4Data>): ParsedGA4Data {
  return {
    overview: {
      activeUsers: 0,
      newUsers: 0,
      avgEngagementTime: 0,
      totalEvents: 0,
      dateRange: { start: "", end: "" },
    },
    pages: [],
    pagesDetailed: [],
    sources: [],
    sessionSources: [],
    events: [],
    cities: [],
    regions: [],
    dailyUsers: [],
    ...partial,
  };
}

function mergeCities(baseCities: EnrichedCity[], enrichedCities: EnrichedCity[]): EnrichedCity[] {
  const cityMap = new Map<string, EnrichedCity>();

  for (const city of baseCities) {
    cityMap.set(city.city.toLowerCase(), city);
  }

  for (const city of enrichedCities) {
    cityMap.set(city.city.toLowerCase(), city);
  }

  return Array.from(cityMap.values()).sort((a, b) => b.activeUsers - a.activeUsers);
}

function normalizeCityName(name: string): string {
  const trimmed = name.trim();

  if (trimmed === "(not set)" || /^\d+$/.test(trimmed)) return "";

  const nonPeruCities = [
    "fort worth", "council bluffs", "aspen", "miami", "springfield",
    "duluth", "prineville", "frankfurt am main", "turin", "collegno",
    "l'hospitalet de llobregat", "paris", "lulea", "gwalior",
    "siberut tengah", "srumbung", "bad ragaz", "dublin",
    "freiburg im breisgau", "guernica", "juiz de fora",
    "buenos aires", "cayambe", "costa mesa", "madrid", "seville",
    "new york", "vernon township",
  ];
  if (nonPeruCities.includes(trimmed.toLowerCase())) return "";

  if (trimmed.toLowerCase().includes("congressional district")) return "";

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
  const y = dateStr.slice(0, 4);
  return `${d} ${months[m]} ${y}`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════════════ */

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1200,
    padding: 20,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 680,
    maxHeight: "90vh",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    display: "flex",
    flexDirection: "column" as const,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "20px 24px",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: "#1e293b",
    letterSpacing: "0.03em",
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "#64748b",
  },
  fileBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    backgroundColor: "#f0fdf4",
    color: "#166534",
    border: "1px solid #bbf7d0",
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
    overflow: "auto",
    flex: 1,
    minHeight: 0,
  },
  instructions: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    fontSize: 12,
    color: "#1e40af",
    lineHeight: 1.5,
    marginBottom: 20,
  },
  slotsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  slotCard: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    padding: 14,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    backgroundColor: "#fafbfc",
  },
  slotHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  slotIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  slotInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    minWidth: 0,
  },
  slotLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  requiredDot: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: 700,
  },
  slotHint: {
    fontSize: 11,
    color: "#94a3b8",
  },
  dropzone: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px dashed #e2e8f0",
    borderRadius: 8,
    padding: "14px 12px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    minHeight: 44,
  },
  dropzoneContent: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    pointerEvents: "none" as const,
  },
  dropzoneText: {
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
    borderRadius: 8,
    padding: "10px 12px",
    minHeight: 44,
  },
  fileCardContent: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
  },
  fileCardName: {
    fontSize: 11,
    fontWeight: 500,
    color: "#166534",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 150,
  },
  removeBtn: {
    width: 22,
    height: 22,
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
    padding: "2px 0",
  },
  previewButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "12px 16px",
    marginTop: 16,
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    color: "#334155",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s ease",
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
    alignItems: "center",
    gap: 12,
    padding: "16px 24px",
    borderTop: "1px solid #e2e8f0",
    backgroundColor: "#fafbfc",
    flexShrink: 0,
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#fff",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
};

const previewStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },
  successBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    border: "1px solid #bbf7d0",
  },
  successText: {
    fontSize: 14,
    fontWeight: 600,
    color: "#166534",
  },
  dateRange: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center" as const,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
  },
  statCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 14,
    textAlign: "center" as const,
    border: "1px solid #e2e8f0",
  },
  statValue: {
    display: "block",
    fontSize: 20,
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
    letterSpacing: "0.03em",
  },
  inventory: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    padding: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
  },
  inventoryRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 0",
  },
  inventoryLabel: {
    flex: 1,
    fontSize: 12,
    color: "#475569",
  },
  inventoryBadge: {
    fontSize: 9,
    fontWeight: 600,
    color: "#8b5cf6",
    backgroundColor: "#f5f3ff",
    padding: "2px 6px",
    borderRadius: 4,
    textTransform: "uppercase" as const,
  },
  inventoryCount: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1e293b",
    minWidth: 28,
    textAlign: "right" as const,
  },
  funnelPreview: {
    padding: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
  },
  funnelTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#475569",
    marginBottom: 10,
  },
  funnelBars: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  funnelRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  funnelLabel: {
    fontSize: 11,
    color: "#64748b",
    width: 100,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  funnelBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    overflow: "hidden",
  },
  funnelBar: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 3,
    transition: "width 0.3s ease",
  },
  funnelValue: {
    fontSize: 11,
    fontWeight: 600,
    color: "#334155",
    minWidth: 44,
    textAlign: "right" as const,
  },
};
