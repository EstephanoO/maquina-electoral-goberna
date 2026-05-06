/**
 * Moodle course list proxy with in-memory cache.
 * Keeps the webservice token on the server side (not exposed to the UI).
 */

const URL_BASE = process.env.MOODLE_WS_URL || "https://campus.grupogoberna.com/webservice/rest/server.php";
const TOKEN = process.env.MOODLE_WS_TOKEN || "";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

export type Course = {
  id: number;
  name: string;
  shortname: string;
  category_id: number;
};

type Cache = { at: number; data: Course[] };
let cache: Cache | null = null;
let inflight: Promise<Course[]> | null = null;

function decodeEntities(s: string): string {
  return String(s || "")
    .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ")
    .replace(/&Aacute;/g, "Á").replace(/&Eacute;/g, "É").replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Ntilde;/g, "Ñ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, "").trim();
}

async function fetchFromMoodle(): Promise<Course[]> {
  if (!TOKEN) throw new Error("MOODLE_WS_TOKEN not configured");

  const url = new URL(URL_BASE);
  url.searchParams.set("wstoken", TOKEN);
  url.searchParams.set("wsfunction", "core_course_get_courses");
  url.searchParams.set("moodlewsrestformat", "json");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`moodle ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error("moodle returned non-array");

  return raw
    .filter((c: any) => c && c.id && c.fullname)
    .map((c: any) => ({
      id: c.id,
      name: decodeEntities(c.fullname),
      shortname: decodeEntities(c.shortname),
      category_id: c.categoryid ?? 0,
    }))
    // Exclude the top-level "site" course (Moodle root)
    .filter((c: Course) => c.id !== 1);
}

export async function getCourses(force = false): Promise<Course[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;

  inflight = fetchFromMoodle()
    .then((data) => {
      cache = { at: Date.now(), data };
      return data;
    })
    .finally(() => { inflight = null; });
  return inflight;
}
