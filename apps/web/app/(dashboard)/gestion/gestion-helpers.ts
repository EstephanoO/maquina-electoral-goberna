import type { KanbanCardData } from "./_components/kanban-card";
import type { KanbanColumnData } from "./_components/kanban-column";

// ── Role guard ────────────────────────────────────────────────────────
export const ALLOWED_ROLES = new Set(["admin", "consultor"]);

export function mapRole(role: string): string {
  if (role === "admin") return "admin";
  if (role === "consultor") return "consultor";
  return "other";
}

// ── Column definitions ────────────────────────────────────────────────
export const COLUMNS_TEMPLATE: Omit<KanbanColumnData, "cards">[] = [
  { id: "pendiente",   title: "Pendiente",    color: "#F59E0B" },
  { id: "en-progreso", title: "En progreso",  color: "#0EA5E9" },
  { id: "completado",  title: "Completado",   color: "#10B981" },
];

// ── Helpers to format relative time ──────────────────────────────────
export function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

// ── localStorage persistence ──────────────────────────────────────────
export const BOARD_STORAGE_KEY = "goberna_gestion_board_v1";

export type BoardState = Record<string, string[]>; // colId → [cardId, ...]
export type CardsMap = Record<string, KanbanCardData>;

export function saveBoardState(state: BoardState) {
  try { localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
}

export function loadBoardState(): BoardState | null {
  try {
    const raw = localStorage.getItem(BOARD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BoardState) : null;
  } catch { return null; }
}
