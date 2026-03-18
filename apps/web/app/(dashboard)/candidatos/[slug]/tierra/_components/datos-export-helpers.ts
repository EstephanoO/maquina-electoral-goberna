/**
 * datos-export-helpers.ts — CSV and Excel export logic for DatosView.
 *
 * Extracted from datos-view.tsx to keep the component focused on rendering.
 * All functions here are pure or side-effect-only (download triggers).
 */

import type { FormRecord } from "@/lib/services";

/* ========== Constants ========== */

const CSV_HEADERS = ["Nombre", "Telefono", "Departamento", "Provincia", "Distrito", "Zona", "Encuestador", "Candidato Preferido", "Comentarios", "Latitud", "Longitud", "Fecha Registro", "Fecha Captura"] as const;

/* ========== Shared helpers ========== */

function esc(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return (s.includes(",") || s.includes('"') || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

/* ========== CSV ========== */

export function buildCSV(forms: FormRecord[]): string {
  const rows = [CSV_HEADERS.join(",")];
  for (const f of forms) {
    rows.push([
      esc(f.nombre), esc(f.telefono),
      esc(f.departamento), esc(f.provincia), esc(f.distrito),
      esc(f.zona), esc(f.encuestador), esc(f.candidato_preferido), esc(f.comentarios),
      String(f.y ?? ""), String(f.x ?? ""), esc(fmtDate(f.created_at)), esc(f.fecha),
    ].join(","));
  }
  return "\uFEFF" + rows.join("\n");
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ========== Excel ========== */

/** Hex color (#RRGGBB) → ExcelJS ARGB (FFRRGGBB) */
function hexToArgb(hex: string): string {
  const clean = hex.replace("#", "");
  return `FF${clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean}`.toUpperCase();
}

/** Lighten a hex color for alternating row backgrounds */
function lightenHex(hex: string, amount = 0.93): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`.toUpperCase();
}

function downloadBlob(buffer: ArrayBuffer | import("exceljs").Buffer, filename: string, mime: string) {
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ws_setup(wb: import("exceljs").Workbook, campaignName: string, primaryColor: string, forms: FormRecord[]) {
  const ws = wb.addWorksheet("Datos de Campo", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  const brandArgb = hexToArgb(primaryColor);
  const colCount = 13;

  // ─── Row 1: Title ───
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${campaignName} — Datos de Campo`;
  titleCell.font = { name: "Calibri", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brandArgb } };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(1).height = 36;

  // ─── Row 2: Summary ───
  ws.mergeCells(2, 1, 2, colCount);
  const sumCell = ws.getCell(2, 1);
  const now = new Date();
  sumCell.value = `Exportado: ${now.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })} ${now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}  •  ${forms.length.toLocaleString()} registros`;  
  sumCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF64748B" } };
  sumCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(2).height = 22;

  // ─── Row 3: Headers ───
  const headers = ["#", "Nombre", "Teléfono", "Departamento", "Provincia", "Distrito", "Zona", "Encuestador", "Candidato Preferido", "Comentarios", "Latitud", "Longitud", "Fecha Registro"];
  const headerRow = ws.getRow(3);
  headerRow.values = headers;
  headerRow.height = 28;
  for (let c = 1; c <= colCount; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { name: "Calibri", bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brandArgb } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: { argb: brandArgb } },
    };
  }

  // Enable auto-filter on header row
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + forms.length, column: colCount } };


  return ws;
}

function addDataRows(ws: import("exceljs").Worksheet, forms: FormRecord[], primaryColor: string) {
  const stripeBg = lightenHex(primaryColor, 0.95);
  const thinBorder: import("exceljs").Border = { style: "thin", color: { argb: "FFE2E8F0" } };
  const borders: Partial<import("exceljs").Borders> = { left: thinBorder, right: thinBorder, bottom: thinBorder };

  for (let i = 0; i < forms.length; i++) {
    const f = forms[i];
    const rowNum = i + 4; // data starts at row 4
    const row = ws.getRow(rowNum);

    row.values = [
      i + 1,
      f.nombre || "—",
      f.telefono || "—",
      f.departamento || "—",
      f.provincia || "—",
      f.distrito || "—",
      f.zona || "—",
      f.encuestador || "—",
      f.candidato_preferido || "—",
      f.comentarios || "",
      f.y != null ? Number(f.y) : "",
      f.x != null ? Number(f.x) : "",
      fmtDate(f.created_at),
    ];

    row.height = 22;

    // Alternating row stripes
    // Columns: 1=#  2=Nombre  3=Teléfono  4=Depto  5=Prov  6=Dist  7=Zona  8=Encuestador  9=Cand.Pref  10=Comentarios  11=Lat  12=Lng  13=Fecha
    const isOdd = i % 2 === 1;
    for (let c = 1; c <= 13; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Calibri", size: 10 };
      cell.alignment = { vertical: "middle", wrapText: c === 10 }; // wrap comments (col 10)
      cell.border = borders;
      if (isOdd) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${stripeBg}` } };
      }
    }

    // Number column — centered and gray
    const numCell = row.getCell(1);
    numCell.font = { name: "Calibri", size: 9, color: { argb: "FF94A3B8" } };
    numCell.alignment = { horizontal: "center", vertical: "middle" };

    // Phone — monospace style
    const phoneCell = row.getCell(3);
    phoneCell.alignment = { horizontal: "center", vertical: "middle" };

    // Lat/Lng — number format (cols 11 and 12)
    for (const c of [11, 12]) {
      const cell = row.getCell(c);
      if (typeof cell.value === "number") {
        cell.numFmt = "0.000000";
      }
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }

    // Date — right-aligned (col 13)
    const dateCell = row.getCell(13);
    dateCell.alignment = { horizontal: "right", vertical: "middle" };
  }
}

function autoFitColumns(ws: import("exceljs").Worksheet) {
  // Minimum widths per column
  // #  Nombre  Teléfono  Depto  Prov  Dist  Zona  Encuestador  Cand.Pref  Comentarios  Lat  Lng  Fecha
  const minWidths = [6, 24, 14, 18, 18, 18, 16, 20, 22, 30, 12, 12, 20];
  ws.columns.forEach((col, idx) => {
    let maxLen = minWidths[idx] ?? 10;
    col.eachCell?.({ includeEmpty: false }, (cell, rowNum) => {
      if (rowNum <= 2) return; // skip title rows
      const val = cell.value ? String(cell.value) : "";
      maxLen = Math.max(maxLen, Math.min(val.length + 2, 50));
    });
    col.width = maxLen;
  });
}

export async function buildExcelAndDownload(forms: FormRecord[], campaignName: string, primaryColor: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Goberna";
  wb.created = new Date();

  const ws = ws_setup(wb, campaignName, primaryColor, forms);
  addDataRows(ws, forms, primaryColor);
  autoFitColumns(ws);

  const buf = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().split("T")[0];
  const safeName = campaignName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
  downloadBlob(buf, `datos_${safeName}_${date}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
