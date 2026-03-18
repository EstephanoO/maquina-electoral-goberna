/**
 * GOBERNA — Utility Functions
 * Pure utility functions with no side effects.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// ── Class Name Utility ─────────────────────────────────────────────

/**
 * Merge Tailwind classes with deduplication & conflict resolution.
 * Standard `cn()` utility — use this for all className composition.
 *
 * @example
 *   cn("px-4 py-2", isActive && "bg-primary text-on-primary", className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── String Utilities ───────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a string.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Get initials from a full name.
 */
export function getInitials(name: string, maxLength = 2): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, maxLength)
    .join("")
    .toUpperCase();
}

/**
 * Truncate text with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

// ── Date Utilities ─────────────────────────────────────────────────

/**
 * Format a date string for display in Peru locale.
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-PE", options ?? { dateStyle: "medium" });
}

/**
 * Format a date string with time.
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("es-PE");
}

/**
 * Get relative time string (e.g., "hace 5 minutos").
 */
export function getRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "ahora";
  if (diffMins < 60) return `hace ${diffMins} min`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays < 7) return `hace ${diffDays}d`;
  return formatDate(d);
}

// ── Number Utilities ───────────────────────────────────────────────

/**
 * Format bytes to human readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

/**
 * Format number with locale separators.
 */
export function formatNumber(num: number): string {
  return num.toLocaleString("es-PE");
}

// ── Validation Utilities ───────────────────────────────────────────

/**
 * Check if a string is a valid email.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Check if a string is a valid Peru phone number.
 */
export function isValidPeruPhone(phone: string): boolean {
  return /^9\d{8}$/.test(phone.replace(/\s/g, ""));
}

// ── Color Utilities ────────────────────────────────────────────────

/**
 * Add alpha transparency to a hex color.
 */
export function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Determine if a color is light or dark.
 */
export function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

// ── Geo Utilities ──────────────────────────────────────────────────

/**
 * Convert UTM coordinates to WGS84 (latitude, longitude).
 * Used because the forms table stores x/y as UTM easting/northing.
 * Peru uses mostly zones 17S, 18S, and 19S.
 */
export function utmToLatLng(
  easting: number,
  northing: number,
  zone: number,
  isSouthern: boolean,
): { lat: number; lng: number } {
  // WGS84 ellipsoid constants
  const a = 6378137; // semi-major axis
  const f = 1 / 298.257223563; // flattening
  const e = Math.sqrt(2 * f - f * f); // eccentricity
  const e2 = e * e;
  const ep2 = e2 / (1 - e2); // e'^2
  const k0 = 0.9996; // scale factor

  const x = easting - 500000; // remove false easting
  const y = isSouthern ? northing - 10000000 : northing; // remove false northing for southern

  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const phi1 =
    mu +
    (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu) +
    (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu) +
    (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = sinPhi1 / cosPhi1;

  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * k0);

  const lat =
    phi1 -
    (N1 * tanPhi1 / R1) *
      (D * D / 2 -
        (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D * D * D * D / 24 +
        (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D * D * D * D * D * D / 720);

  const lng =
    (D -
      (1 + 2 * T1 + C1) * D * D * D / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D * D * D * D * D / 120) /
    cosPhi1;

  const lngDeg = lng * (180 / Math.PI) + (zone - 1) * 6 - 180 + 3;
  const latDeg = lat * (180 / Math.PI);

  return { lat: latDeg, lng: lngDeg };
}

/**
 * Parse the zona field from a form record and convert UTM x/y to lat/lng.
 * Zona can be: "18S", "18L", "17S", JSON string with lat/lng, etc.
 * Returns null if conversion fails.
 */
export function formCoordsToLatLng(
  x: number,
  y: number,
  zona: string,
): { lat: number; lng: number } | null {
  if (!x || !y) return null;

  // If zona is JSON with lat/lng already computed, use those directly
  if (zona && zona.startsWith("{")) {
    try {
      const parsed = JSON.parse(zona);
      if (typeof parsed.latitude === "number" && typeof parsed.longitude === "number") {
        return { lat: parsed.latitude, lng: parsed.longitude };
      }
    } catch { /* fall through */ }
  }

  // Detect native lat/lng coordinates (from form_submissions where x=lng, y=lat).
  // UTM eastings are 100k–900k, so if |x| < 360 the values are already geographic.
  // Peru bounds: lat [-25, 5], lng [-85, -65].
  if (Math.abs(x) < 360 && Math.abs(y) < 360) {
    // x = lng, y = lat (mapped from form_submissions.lng / .lat)
    const lat = y;
    const lng = x;
    if (lat >= -25 && lat <= 5 && lng >= -85 && lng <= -65) {
      return { lat, lng };
    }
    return null;
  }

  // Parse zone number and hemisphere from "18S", "18L", etc.
  const match = zona.match(/(\d+)\s*([A-Za-z])?/);
  
  // Default to zone 18S (Peru default) if zona is invalid or missing
  let zoneNum = 18;
  let isSouthern = true;
  
  if (match) {
    zoneNum = parseInt(match[1], 10);
    if (zoneNum < 1 || zoneNum > 60) zoneNum = 18;
    
    // UTM bands: C-M are southern, N-X are northern
    const band = (match[2] ?? "S").toUpperCase();
    isSouthern = band <= "M" || band === "S";
  }

  // Sanity check: x should be 100k-900k (easting), y > 0 (northing)
  if (x < 100000 || x > 900000 || y < 0 || y > 10000000) return null;

  try {
    const result = utmToLatLng(x, y, zoneNum, isSouthern);
    // Validate result is within reasonable bounds for Peru
    if (result.lat < -25 || result.lat > 5 || result.lng < -85 || result.lng > -65) return null;
    return result;
  } catch {
    return null;
  }
}

// ── DOM Utilities ──────────────────────────────────────────────────

/**
 * Inject CSS keyframes into document head (idempotent).
 */
export function injectStyles(id: string, css: string): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

// ── Object Utilities ───────────────────────────────────────────────

/**
 * Remove undefined values from an object.
 */
export function cleanObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Deep clone an object.
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
