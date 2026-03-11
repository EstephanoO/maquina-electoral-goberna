"use client";

/**
 * /gestion — Tablero Kanban de gestión operativa
 *
 * Acceso: admin + consultor (excluye candidato, brigadista, agente)
 * Vinculado a datos reales del sistema: meets, accesos, leads, CMS, soporte.
 *
 * Columnas: Pendiente → En progreso → Completado
 * Las tarjetas de sistema se cargan al montar y son de solo lectura (movibles localmente).
 * Las tarjetas custom se agregan manualmente y persisten en localStorage por sesión.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { KanbanColumn } from "./_components/kanban-column";
import { AddCardModal } from "./_components/add-card-modal";
import type { KanbanCardData } from "./_components/kanban-card";
import type { KanbanColumnData } from "./_components/kanban-column";

// ── Role guard ────────────────────────────────────────────────────────
const ALLOWED_ROLES = new Set(["admin", "consultor"]);

function mapRole(role: string): string {
  if (role === "admin") return "admin";
  if (role === "consultor") return "consultor";
  return "other";
}

// ── Column definitions ────────────────────────────────────────────────
const COLUMNS_TEMPLATE: Omit<KanbanColumnData, "cards">[] = [
  { id: "pendiente",   title: "Pendiente",    color: "#F59E0B" },
  { id: "en-progreso", title: "En progreso",  color: "#0EA5E9" },
  { id: "completado",  title: "Completado",   color: "#10B981" },
];

// ── Helpers to format relative time ──────────────────────────────────
function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

// ── localStorage persistence key ──────────────────────────────────────
const BOARD_STORAGE_KEY = "goberna_gestion_board_v1";

type BoardState = Record<string, string[]>; // colId → [cardId, ...]
type CardsMap = Record<string, KanbanCardData>;

function saveBoardState(state: BoardState) {
  try { localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
}

function loadBoardState(): BoardState | null {
  try {
    const raw = localStorage.getItem(BOARD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BoardState) : null;
  } catch { return null; }
}

// ── Page component ────────────────────────────────────────────────────
export default function GestionPage() {
  const { user, activeCampaignId } = useAuth();
  const router = useRouter();

  const uiRole = mapRole(user?.role ?? "");

  // Role guard — redirect non-allowed roles
  useEffect(() => {
    if (user && !ALLOWED_ROLES.has(uiRole)) {
      router.replace("/home");
    }
  }, [user, uiRole, router]);

  const [loading, setLoading] = useState(true);
  const [cardsMap, setCardsMap] = useState<CardsMap>({});
  const [boardState, setBoardState] = useState<BoardState>({
    pendiente: [],
    "en-progreso": [],
    completado: [],
  });

  const [addingToCol, setAddingToCol] = useState<{ id: string; title: string } | null>(null);

  // ── Load data from API ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    async function fetchCards() {
      setLoading(true);
      const newCards: KanbanCardData[] = [];

      // 1. Access requests (pendiente)
      try {
        const res = await fetch("/api/access-requests", { credentials: "same-origin" });
        if (res.ok) {
          const json = await res.json() as { ok: boolean; data?: Array<{ id: string; user_name?: string; created_at: string; campaign_name?: string }> };
          if (json.ok && Array.isArray(json.data)) {
            for (const req of json.data.slice(0, 8)) {
              newCards.push({
                id: `access-${req.id}`,
                title: req.user_name ?? "Solicitud de acceso",
                subtitle: req.campaign_name ? `Campaña: ${req.campaign_name}` : undefined,
                source: "access",
                badge: "Pendiente",
                badgeColor: "#F59E0B",
                meta: relativeTime(req.created_at),
                href: undefined,
              });
            }
          }
        }
      } catch { /* graceful degradation */ }

      // 2. Meets (activos → en-progreso, completados → completado)
      if (activeCampaignId) {
        try {
          const res = await fetch(`/api/meets?campaign_id=${activeCampaignId}`, { credentials: "same-origin" });
          if (res.ok) {
            const json = await res.json() as { ok: boolean; data?: Array<{ id: string; title: string; status: string; location_name?: string; starts_at: string }> };
            if (json.ok && Array.isArray(json.data)) {
              for (const meet of json.data.slice(0, 10)) {
                newCards.push({
                  id: `meet-${meet.id}`,
                  title: meet.title,
                  subtitle: meet.location_name ?? undefined,
                  source: "meet",
                  badge: meet.status,
                  badgeColor: meet.status === "active" ? "#7C3AED" : meet.status === "completed" ? "#10B981" : "#94A3B8",
                  meta: relativeTime(meet.starts_at),
                });
              }
            }
          }
        } catch { /* graceful degradation */ }
      }

      // 3. Leads (pendiente)
      try {
        const res = await fetch("/api/leads", { credentials: "same-origin" });
        if (res.ok) {
          const json = await res.json() as { ok: boolean; data?: Array<{ id: string; nombre?: string; status?: string; created_at: string }> };
          if (json.ok && Array.isArray(json.data)) {
            for (const lead of json.data.slice(0, 6)) {
              newCards.push({
                id: `lead-${lead.id}`,
                title: lead.nombre ?? "Lead sin nombre",
                source: "lead",
                badge: lead.status ?? "nuevo",
                badgeColor: "#10B981",
                meta: relativeTime(lead.created_at),
              });
            }
          }
        }
      } catch { /* graceful degradation */ }

      // 4. Support tickets (pendiente)
      try {
        const res = await fetch("/api/support", { credentials: "same-origin" });
        if (res.ok) {
          const json = await res.json() as { ok: boolean; data?: Array<{ id: string; subject?: string; status?: string; created_at: string }> };
          if (json.ok && Array.isArray(json.data)) {
            for (const ticket of json.data.slice(0, 5)) {
              newCards.push({
                id: `support-${ticket.id}`,
                title: ticket.subject ?? "Ticket de soporte",
                source: "support",
                badge: ticket.status ?? "abierto",
                badgeColor: "#EF4444",
                meta: relativeTime(ticket.created_at),
              });
            }
          }
        }
      } catch { /* graceful degradation */ }

      // Build cardsMap
      const map: CardsMap = {};
      for (const card of newCards) {
        map[card.id] = card;
      }

      setCardsMap((prev) => ({ ...prev, ...map }));

      // Assign system cards to columns (respecting saved positions)
      setBoardState((prev) => {
        const saved = loadBoardState();
        const allSystemIds = new Set(newCards.map((c) => c.id));

        // Start from saved state if available
        const next: BoardState = saved
          ? {
              pendiente: (saved.pendiente ?? []).filter((id) => allSystemIds.has(id) || !id.startsWith("access-") && !id.startsWith("meet-") && !id.startsWith("lead-") && !id.startsWith("support-")),
              "en-progreso": (saved["en-progreso"] ?? []),
              completado: (saved.completado ?? []),
            }
          : { pendiente: [], "en-progreso": [], completado: [] };

        // Add new system cards that aren't placed yet
        const placed = new Set([...next.pendiente, ...next["en-progreso"], ...next.completado]);

        for (const card of newCards) {
          if (placed.has(card.id)) continue;
          // Default column based on source/status
          let colId = "pendiente";
          if (card.source === "meet") {
            const badge = card.badge ?? "";
            if (badge === "completed") colId = "completado";
            else if (badge === "active") colId = "en-progreso";
          }
          next[colId].push(card.id);
        }

        // Keep custom cards from prev state that aren't in new
        for (const colId of Object.keys(prev)) {
          for (const id of prev[colId] ?? []) {
            if (!placed.has(id) && !allSystemIds.has(id)) {
              next[colId] = next[colId] ?? [];
              next[colId].push(id);
            }
          }
        }

        return next;
      });

      setLoading(false);
    }

    void fetchCards();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeCampaignId]);

  // ── Move card ─────────────────────────────────────────────────────
  const handleMove = useCallback((cardId: string, fromColId: string, direction: "left" | "right") => {
    const colIds = COLUMNS_TEMPLATE.map((c) => c.id);
    const fromIdx = colIds.indexOf(fromColId);
    const toIdx = direction === "left" ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= colIds.length) return;
    const toColId = colIds[toIdx];

    setBoardState((prev) => {
      const next: BoardState = {
        pendiente: [...(prev.pendiente ?? [])],
        "en-progreso": [...(prev["en-progreso"] ?? [])],
        completado: [...(prev.completado ?? [])],
      };
      next[fromColId] = (next[fromColId] ?? []).filter((id) => id !== cardId);
      next[toColId] = [...(next[toColId] ?? []), cardId];
      saveBoardState(next);
      return next;
    });
  }, []);

  // ── Add custom card ───────────────────────────────────────────────
  const handleAddCard = useCallback((colId: string, card: KanbanCardData) => {
    setCardsMap((prev) => ({ ...prev, [card.id]: card }));
    setBoardState((prev) => {
      const next = { ...prev, [colId]: [...(prev[colId] ?? []), card.id] };
      saveBoardState(next);
      return next;
    });
  }, []);

  // ── Build column data for render ──────────────────────────────────
  const columns: KanbanColumnData[] = COLUMNS_TEMPLATE.map((col) => ({
    ...col,
    cards: (boardState[col.id] ?? [])
      .map((id) => cardsMap[id])
      .filter((c): c is KanbanCardData => !!c),
  }));

  const totalCards = Object.values(boardState).flat().length;

  // ── Guard: don't render for unauthorized roles ─────────────────────
  if (user && !ALLOWED_ROLES.has(uiRole)) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      {/* Header */}
      <div style={{
        background: "#FFFFFF",
        borderBottom: "1px solid #E8EDF5",
        padding: "20px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "rgba(22,57,96,0.4)", marginBottom: 4 }}>
            Gestión operativa
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#163960", margin: 0, lineHeight: 1.2 }}>
            Tablero
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Stats summary */}
          <div style={{ display: "flex", gap: 16 }}>
            {columns.map((col) => (
              <div key={col.id} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: col.color }}>{col.cards.length}</div>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "rgba(22,57,96,0.4)" }}>{col.title}</div>
              </div>
            ))}
          </div>

          {/* Badge total */}
          {!loading && (
            <div style={{
              padding: "6px 14px",
              background: "#163960",
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 700,
              color: "#FFFFFF",
            }}>
              {totalCards} tarjetas
            </div>
          )}
        </div>
      </div>

      {/* Board */}
      <div style={{ padding: "24px 32px", overflowX: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", gap: 16 }}>
            {COLUMNS_TEMPLATE.map((col) => (
              <div key={col.id} style={{
                minWidth: 300,
                height: 400,
                background: "#F1F5F9",
                borderRadius: 14,
                border: "1px solid #E8EDF5",
                animation: "pulse 1.5s ease-in-out infinite",
              }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", minWidth: "fit-content" }}>
            {columns.map((col, idx) => (
              <KanbanColumn
                key={col.id}
                column={col}
                columnIndex={idx}
                totalColumns={columns.length}
                onMove={handleMove}
                onAddCard={(colId) => {
                  const colDef = COLUMNS_TEMPLATE.find((c) => c.id === colId);
                  if (colDef) setAddingToCol({ id: colDef.id, title: colDef.title });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info footer */}
      {!loading && (
        <div style={{ padding: "0 32px 24px" }}>
          <div style={{
            fontSize: 12,
            color: "rgba(22,57,96,0.35)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
            Datos vinculados al sistema — Solicitudes de acceso, Reuniones, Leads y Soporte se cargan automáticamente.
            Usa las flechas ← → para mover tarjetas entre columnas. Las posiciones se guardan en esta sesión.
          </div>
        </div>
      )}

      {/* Add card modal */}
      {addingToCol && (
        <AddCardModal
          columnId={addingToCol.id}
          columnTitle={addingToCol.title}
          onAdd={handleAddCard}
          onClose={() => setAddingToCol(null)}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
