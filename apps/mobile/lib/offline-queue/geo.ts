/**
 * Offline geo service — bundled distrito data + SQLite recientes.
 *
 * All ~1874 Peruvian distritos are bundled as a static JSON file in the app.
 * No network requests needed — data is always available immediately.
 *
 * Architecture:
 * - `peru-distritos.json` — static INEI data bundled in the app (~233KB)
 * - On first use, data is loaded into memory from the JSON require()
 * - SQLite `geo_distritos` table is populated from this JSON for persistence
 * - SQLite `geo_recientes` table tracks recently used distritos
 * - Search runs in-memory against the loaded array (instant, ~1874 rows)
 */

import { getDatabase } from './db';
import type { SelectedDistrito } from '../types';

// ─── Static data (bundled in app, ~233KB, 1874 distritos) ───
// This JSON was generated from the INEI ubigeo database via the production API.
// It never changes at runtime — Peru's district boundaries are static.
import PERU_DISTRITOS_RAW from '../data/peru-distritos.json';

type RawDistrito = {
  ubigeo: string;
  distrito: string;
  provincia: string;
  departamento: string;
  coddep: string;
  codprov_full: string;
};

/** All distritos loaded from bundled JSON — available synchronously */
const ALL_DISTRITOS: SelectedDistrito[] = (PERU_DISTRITOS_RAW as RawDistrito[]).map((d) => ({
  ubigeo: d.ubigeo,
  distrito: d.distrito,
  provincia: d.provincia,
  departamento: d.departamento,
  coddep: d.coddep,
  codprov_full: d.codprov_full,
}));

// ─── Types ──────────────────────────────────────────────────

export type GeoDistritoRow = {
  ubigeo: string;
  distrito: string;
  provincia: string;
  departamento: string;
  coddep: string;
  codprov_full: string;
};

export type GeoRecienteRow = GeoDistritoRow & {
  used_at: string;
  use_count: number;
};

/** A provincia group header in search results — shows "Lima, Lima — 43 distritos" */
export type SearchProvinciaGroup = {
  type: 'provincia_group';
  provincia: string;
  departamento: string;
  codprov_full: string;
  coddep: string;
  distritos: SelectedDistrito[];
};

/** A single distrito result in search results */
export type SearchDistritoItem = {
  type: 'distrito';
  distrito: SelectedDistrito;
};

/** Search results can be either provincia groups or individual distritos */
export type SearchResultItem = SearchProvinciaGroup | SearchDistritoItem;

// ─── Preload (bundled → SQLite) ─────────────────────────────

/** Shared promise so multiple callers await the same seed instead of running twice */
let _seedPromise: Promise<number> | null = null;

/**
 * Seed SQLite geo_distritos from bundled JSON data.
 * Idempotent — skips if already populated.
 * Returns number of rows inserted (0 if already seeded).
 */
export function preloadDistritos(): Promise<number> {
  if (_seedPromise) return _seedPromise;

  _seedPromise = _doSeed().finally(() => {
    _seedPromise = null;
  });

  return _seedPromise;
}

async function _doSeed(): Promise<number> {
  try {
    const db = await getDatabase();

    // Check if already seeded
    const existing = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM geo_distritos',
    );
    if ((existing?.cnt ?? 0) > 0) {
      return 0; // Already seeded
    }

    // Bulk insert from bundled data
    const BATCH_SIZE = 200;
    let inserted = 0;

    for (let i = 0; i < ALL_DISTRITOS.length; i += BATCH_SIZE) {
      const batch = ALL_DISTRITOS.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, datetime('now'))").join(', ');
      const values = batch.flatMap((d) => [
        d.ubigeo,
        d.distrito,
        d.provincia,
        d.departamento,
        d.coddep,
        d.codprov_full,
      ]);

      await db.runAsync(
        `INSERT OR REPLACE INTO geo_distritos (ubigeo, distrito, provincia, departamento, coddep, codprov_full, updated_at) VALUES ${placeholders}`,
        values,
      );
      inserted += batch.length;
    }

    console.log(`[geo] seeded ${inserted} distritos from bundled JSON`);
    return inserted;
  } catch (error) {
    console.warn('[geo] seed failed:', error);
    return -1;
  }
}

/**
 * Check if geo data is available. With bundled data this is always true
 * as long as ALL_DISTRITOS loaded successfully.
 */
export async function isGeoCacheReady(): Promise<boolean> {
  return ALL_DISTRITOS.length > 0;
}

/**
 * Get the count of available distritos.
 */
export async function getGeoCacheCount(): Promise<number> {
  return ALL_DISTRITOS.length;
}

// ─── Search ─────────────────────────────────────────────────

/**
 * Remove accents for search matching (Spanish: ñ, á, é, í, ó, ú).
 */
function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Pre-compute normalized names for instant search (~1874 entries)
const _normalized = ALL_DISTRITOS.map((d) => ({
  dist: normalizeForSearch(d.distrito),
  prov: normalizeForSearch(d.provincia),
  dep: normalizeForSearch(d.departamento),
}));

/**
 * Search distritos — returns grouped results, purely in-memory (instant).
 *
 * When a query matches a provincia name (e.g. "lima"), returns:
 *   1. Provincia groups — header "Lima, Lima — 43 distritos" with all distritos listed
 *   2. Individual distrito matches — distritos whose name matches but belong to other provincias
 *
 * When a query only matches distrito names, returns flat distrito results.
 *
 * @param query - Search text (min 1 char)
 * @param limit - Max individual distrito results (default 25). Provincia groups are NOT limited.
 */
export async function searchDistritosOffline(
  query: string,
  limit = 25,
): Promise<SearchResultItem[]> {
  const q = normalizeForSearch(query.trim());
  if (q.length < 1) return [];

  // ── Phase 1: Find provincia matches ──────────────────
  // Group all distritos by codprov_full, detect which provincias match the query
  const provMap = new Map<string, {
    provincia: string;
    departamento: string;
    coddep: string;
    distritos: SelectedDistrito[];
  }>();

  for (const d of ALL_DISTRITOS) {
    let entry = provMap.get(d.codprov_full);
    if (!entry) {
      entry = {
        provincia: d.provincia,
        departamento: d.departamento,
        coddep: d.coddep,
        distritos: [],
      };
      provMap.set(d.codprov_full, entry);
    }
    entry.distritos.push(d);
  }

  // Which provincias match the query?
  const matchedProvGroups: SearchProvinciaGroup[] = [];
  const matchedProvKeys = new Set<string>();

  for (const [codprov_full, entry] of provMap) {
    const provNorm = normalizeForSearch(entry.provincia);
    if (provNorm.startsWith(q) || (q.length >= 3 && provNorm.includes(q))) {
      // Sort distritos alphabetically within the group
      entry.distritos.sort((a, b) => a.distrito.localeCompare(b.distrito));
      matchedProvGroups.push({
        type: 'provincia_group',
        provincia: entry.provincia,
        departamento: entry.departamento,
        codprov_full,
        coddep: entry.coddep,
        distritos: entry.distritos,
      });
      matchedProvKeys.add(codprov_full);
    }
  }

  // Sort provincia groups: startsWith first, then alphabetically
  matchedProvGroups.sort((a, b) => {
    const aNorm = normalizeForSearch(a.provincia);
    const bNorm = normalizeForSearch(b.provincia);
    const aStarts = aNorm.startsWith(q) ? 0 : 1;
    const bStarts = bNorm.startsWith(q) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return a.provincia.localeCompare(b.provincia);
  });

  // ── Phase 2: Find individual distrito matches (NOT in matched provincias) ──
  const distritoMatches: Array<SelectedDistrito & { _score: number }> = [];

  for (let i = 0; i < ALL_DISTRITOS.length; i++) {
    const d = ALL_DISTRITOS[i];
    // Skip distritos already shown in a provincia group
    if (matchedProvKeys.has(d.codprov_full)) continue;

    const n = _normalized[i];
    let score = -1;
    if (n.dist.startsWith(q)) {
      score = 0; // Best: distrito starts with query
    } else if (n.dist.includes(q)) {
      score = 1; // Good: distrito contains query
    } else if (n.dep.startsWith(q)) {
      score = 2; // departamento starts with query
    } else if (q.length >= 3 && n.dep.includes(q)) {
      score = 3; // departamento contains (only for 3+ chars)
    }

    if (score >= 0) {
      distritoMatches.push({ ...d, _score: score });
    }
  }

  // Sort individual matches by score, then alphabetically
  distritoMatches.sort((a, b) => {
    if (a._score !== b._score) return a._score - b._score;
    return a.distrito.localeCompare(b.distrito);
  });

  // ── Phase 3: Combine results ────────────────────────
  const results: SearchResultItem[] = [];

  // Add provincia groups first
  for (const group of matchedProvGroups) {
    results.push(group);
  }

  // Add individual distrito matches (limited)
  const limitedDistritos = distritoMatches.slice(0, limit);
  for (const { _score, ...rest } of limitedDistritos) {
    results.push({ type: 'distrito', distrito: rest });
  }

  return results;
}

// ─── Recientes ──────────────────────────────────────────────

/**
 * Save a distrito as recently used. Upserts into geo_recientes.
 * Increments use_count and updates used_at timestamp.
 */
export async function saveReciente(distrito: SelectedDistrito): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO geo_recientes (ubigeo, distrito, provincia, departamento, coddep, codprov_full, used_at, use_count)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 1)
       ON CONFLICT(ubigeo) DO UPDATE SET
         used_at = datetime('now'),
         use_count = use_count + 1,
         distrito = excluded.distrito,
         provincia = excluded.provincia,
         departamento = excluded.departamento`,
      [
        distrito.ubigeo,
        distrito.distrito,
        distrito.provincia,
        distrito.departamento,
        distrito.coddep,
        distrito.codprov_full,
      ],
    );
  } catch (error) {
    console.warn('[geo] saveReciente failed:', error);
  }
}

/**
 * Get recently used distritos, ordered by last use (most recent first).
 *
 * @param limit - Max results (default 5)
 */
export async function getRecientes(limit = 5): Promise<SelectedDistrito[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<GeoDistritoRow>(
      'SELECT ubigeo, distrito, provincia, departamento, coddep, codprov_full FROM geo_recientes ORDER BY used_at DESC LIMIT ?',
      [limit],
    );
    return rows;
  } catch (error) {
    console.warn('[geo] getRecientes failed:', error);
    return [];
  }
}

/**
 * Get the single most recently used distrito (for "last used" suggestion).
 * Returns null if no recientes exist.
 */
export async function getLastUsed(): Promise<SelectedDistrito | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<GeoDistritoRow>(
      'SELECT ubigeo, distrito, provincia, departamento, coddep, codprov_full FROM geo_recientes ORDER BY used_at DESC LIMIT 1',
    );
    return row ?? null;
  } catch (error) {
    console.warn('[geo] getLastUsed failed:', error);
    return null;
  }
}

/**
 * Get the most frequently used distritos (by use_count, then by recency).
 *
 * @param limit - Max results (default 5)
 */
export async function getMostUsed(limit = 5): Promise<SelectedDistrito[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<GeoDistritoRow>(
      'SELECT ubigeo, distrito, provincia, departamento, coddep, codprov_full FROM geo_recientes ORDER BY use_count DESC, used_at DESC LIMIT ?',
      [limit],
    );
    return rows;
  } catch (error) {
    console.warn('[geo] getMostUsed failed:', error);
    return [];
  }
}
