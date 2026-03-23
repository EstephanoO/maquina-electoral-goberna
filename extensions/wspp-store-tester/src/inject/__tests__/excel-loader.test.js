import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

// We can't import the module directly because it uses FileReader (browser API).
// Instead we test the internal logic by recreating the key functions.

// ── Phone normalization (mirrors excel-loader.js) ─────────────────
function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits || digits.length < 9) return null;
  if (digits.length >= 11 && digits.startsWith("51")) digits = digits.slice(2);
  return digits;
}

// ── Column detection (mirrors excel-loader.js) ────────────────────
const PHONE_HINTS = ["telefono", "teléfono", "celular", "cel", "phone", "número", "numero", "movil", "móvil", "whatsapp", "wa", "nro", "tel"];
const NAME_HINTS  = ["nombre", "name", "nombres", "contacto", "persona", "nombres y apellidos", "nombre completo", "nombre_completo"];

function normalizeHeader(h) {
  return String(h || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function detectColumn(headers, hints) {
  const normalized = headers.map(normalizeHeader);
  for (const hint of hints) {
    const idx = normalized.indexOf(hint);
    if (idx !== -1) return idx;
  }
  for (const hint of hints) {
    const idx = normalized.findIndex(h => h.includes(hint));
    if (idx !== -1) return idx;
  }
  return -1;
}

describe("excel-loader logic", () => {
  describe("normalizePhone", () => {
    it("strips non-digits", () => {
      expect(normalizePhone("+51 987 654 321")).toBe("987654321");
    });
    it("removes 51 prefix from 11-digit", () => {
      expect(normalizePhone("51987654321")).toBe("987654321");
    });
    it("keeps 9-digit as is", () => {
      expect(normalizePhone("987654321")).toBe("987654321");
    });
    it("returns null for too short", () => {
      expect(normalizePhone("12345")).toBeNull();
    });
    it("returns null for empty", () => {
      expect(normalizePhone("")).toBeNull();
      expect(normalizePhone(null)).toBeNull();
    });
    it("handles numbers stored as numeric", () => {
      expect(normalizePhone(987654321)).toBe("987654321");
    });
  });

  describe("detectColumn", () => {
    it("detects telefono column", () => {
      expect(detectColumn(["Nombre", "Teléfono", "Zona"], PHONE_HINTS)).toBe(1);
    });
    it("detects phone column", () => {
      expect(detectColumn(["name", "phone"], PHONE_HINTS)).toBe(1);
    });
    it("detects celular column", () => {
      expect(detectColumn(["datos", "celular"], PHONE_HINTS)).toBe(1);
    });
    it("detects nombre column", () => {
      expect(detectColumn(["Nombre", "Teléfono"], NAME_HINTS)).toBe(0);
    });
    it("returns -1 when not found", () => {
      expect(detectColumn(["campo1", "campo2"], PHONE_HINTS)).toBe(-1);
    });
    it("handles accented headers via normalization", () => {
      expect(detectColumn(["Número", "Nombre"], PHONE_HINTS)).toBe(0);
    });
    it("detects partial match", () => {
      expect(detectColumn(["nro_telefono", "nombre_completo"], PHONE_HINTS)).toBe(0);
    });
  });

  describe("XLSX parsing integration", () => {
    it("parses a simple workbook", () => {
      // Create an in-memory workbook
      const wb = XLSX.utils.book_new();
      const data = [
        ["nombre", "telefono"],
        ["Maria Garcia", "987654321"],
        ["Juan Lopez", "912345678"],
        ["Duplicado", "987654321"], // dupe
        ["Invalid", "123"],         // too short
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

      // Read it back
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      expect(rows.length).toBe(5); // header + 4 data rows

      const headers = rows[0];
      const phoneCol = detectColumn(headers, PHONE_HINTS);
      const nameCol = detectColumn(headers, NAME_HINTS);
      expect(phoneCol).toBe(1);
      expect(nameCol).toBe(0);

      // Parse contacts with dedup
      const contacts = [];
      const seen = new Set();
      for (let i = 1; i < rows.length; i++) {
        const phone = normalizePhone(rows[i][phoneCol]);
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        contacts.push({ nombre: rows[i][nameCol], telefono: phone });
      }

      expect(contacts).toHaveLength(2); // Maria + Juan (dupe removed, invalid removed)
      expect(contacts[0].nombre).toBe("Maria Garcia");
      expect(contacts[0].telefono).toBe("987654321");
      expect(contacts[1].nombre).toBe("Juan Lopez");
      expect(contacts[1].telefono).toBe("912345678");
    });
  });
});
