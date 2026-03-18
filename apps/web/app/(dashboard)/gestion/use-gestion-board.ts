import { useState, useEffect, useCallback } from "react";
import type { KanbanCardData } from "./_components/kanban-card";
import type { KanbanColumnData } from "./_components/kanban-column";
import {
  COLUMNS_TEMPLATE,
  relativeTime,
  saveBoardState,
  loadBoardState,
} from "./gestion-helpers";
import type { BoardState, CardsMap } from "./gestion-helpers";

// ── API response types ───────────────────────────────────────────────
type AccessRequest = {
  id: string;
  user_full_name?: string;
  campaign_name?: string;
  status: string;
  requested_at: string;
};

type Meet = {
  id: string;
  title: string;
  status: string;
  location_name?: string | null;
  starts_at: string;
  participant_count?: number;
};

type Lead = {
  id: string;
  nombre?: string;
  plataforma?: string;
  created_at: string;
};

type SupportConversation = {
  other_user_id: string;
  other_user_name?: string;
  last_message?: string;
  unread_count?: number;
  updated_at: string;
};

// ── Card builders ────────────────────────────────────────────────────

function buildAccessCards(requests: AccessRequest[]): KanbanCardData[] {
  const pending = requests.filter((r) => r.status === "pending");
  const rest = requests.filter((r) => r.status !== "pending");
  return [...pending, ...rest].slice(0, 8).map((req) => ({
    id: `access-${req.id}`,
    title: req.user_full_name ?? "Solicitud de acceso",
    subtitle: req.campaign_name ? `Campaña: ${req.campaign_name}` : undefined,
    source: "access" as const,
    badge: req.status === "pending" ? "Pendiente" : req.status === "approved" ? "Aprobado" : "Rechazado",
    badgeColor: req.status === "pending" ? "#F59E0B" : req.status === "approved" ? "#10B981" : "#EF4444",
    meta: relativeTime(req.requested_at),
  }));
}

function buildMeetCards(meets: Meet[]): KanbanCardData[] {
  const statusLabel: Record<string, string> = { active: "Activa", scheduled: "Programada", completed: "Completada", cancelled: "Cancelada" };
  const statusColor: Record<string, string> = { active: "#7C3AED", scheduled: "#0EA5E9", completed: "#10B981", cancelled: "#94A3B8" };
  const order: Record<string, number> = { active: 0, scheduled: 1, completed: 2, cancelled: 3 };

  const sorted = [...meets].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  return sorted.slice(0, 10).map((meet) => ({
    id: `meet-${meet.id}`,
    title: meet.title,
    subtitle: meet.location_name ?? undefined,
    source: "meet" as const,
    badge: statusLabel[meet.status] ?? meet.status,
    badgeColor: statusColor[meet.status] ?? "#94A3B8",
    meta: meet.participant_count != null ? `${meet.participant_count} participantes` : relativeTime(meet.starts_at),
    tags: meet.participant_count != null ? [{ label: relativeTime(meet.starts_at), color: "#94A3B8" }] : undefined,
  }));
}

function buildLeadCards(leads: Lead[]): KanbanCardData[] {
  return leads.slice(0, 6).map((lead) => ({
    id: `lead-${lead.id}`,
    title: lead.nombre ?? "Lead sin nombre",
    subtitle: lead.plataforma ? `Plataforma: ${lead.plataforma}` : undefined,
    source: "lead" as const,
    badge: "Nuevo",
    badgeColor: "#10B981",
    meta: relativeTime(lead.created_at),
  }));
}

function buildSupportCards(conversations: SupportConversation[]): KanbanCardData[] {
  return conversations
    .filter((c) => (c.unread_count ?? 0) > 0)
    .slice(0, 5)
    .map((conv) => ({
      id: `support-${conv.other_user_id}`,
      title: `Mensaje de ${conv.other_user_name ?? "usuario"}`,
      subtitle: conv.last_message
        ? `"${conv.last_message.slice(0, 60)}${conv.last_message.length > 60 ? "…" : ""}"`
        : undefined,
      source: "support" as const,
      badge: conv.unread_count ? `${conv.unread_count} sin leer` : "Nuevo",
      badgeColor: "#EF4444",
      meta: relativeTime(conv.updated_at),
    }));
}

// ── Assign cards to columns (respecting saved positions) ─────────────

function assignCardsToColumns(
  newCards: KanbanCardData[],
  prevState: BoardState,
): BoardState {
  const saved = loadBoardState();
  const allSystemIds = new Set(newCards.map((c) => c.id));

  const next: BoardState = saved
    ? {
        pendiente: (saved.pendiente ?? []).filter(
          (id) =>
            allSystemIds.has(id) ||
            (!id.startsWith("access-") &&
              !id.startsWith("meet-") &&
              !id.startsWith("lead-") &&
              !id.startsWith("support-")),
        ),
        "en-progreso": saved["en-progreso"] ?? [],
        completado: saved.completado ?? [],
      }
    : { pendiente: [], "en-progreso": [], completado: [] };

  const placed = new Set([...next.pendiente, ...next["en-progreso"], ...next.completado]);

  for (const card of newCards) {
    if (placed.has(card.id)) continue;
    let colId = "pendiente";
    if (card.source === "meet") {
      const badge = card.badge ?? "";
      if (badge === "completed") colId = "completado";
      else if (badge === "active") colId = "en-progreso";
    }
    next[colId].push(card.id);
  }

  // Keep custom cards from prev state that aren't in new
  for (const colId of Object.keys(prevState)) {
    for (const id of prevState[colId] ?? []) {
      if (!placed.has(id) && !allSystemIds.has(id)) {
        next[colId] = next[colId] ?? [];
        next[colId].push(id);
      }
    }
  }

  return next;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useGestionBoard(params: {
  userId: string | undefined;
  activeCampaignId: string | null | undefined;
}) {
  const { userId, activeCampaignId } = params;

  const [loading, setLoading] = useState(true);
  const [cardsMap, setCardsMap] = useState<CardsMap>({});
  const [boardState, setBoardState] = useState<BoardState>({
    pendiente: [],
    "en-progreso": [],
    completado: [],
  });

  // ── Fetch all card sources in parallel ─────────────────────────────
  useEffect(() => {
    if (!userId) return;

    async function fetchCards() {
      setLoading(true);

      const [accessRes, meetsRes, leadsRes, supportRes] = await Promise.allSettled([
        fetch("/api/access-requests", { credentials: "same-origin" }),
        activeCampaignId
          ? fetch(`/api/meets/campaign/${activeCampaignId}`, { credentials: "same-origin" })
          : Promise.resolve(null),
        fetch("/api/leads", { credentials: "same-origin" }),
        fetch("/api/support/conversations", { credentials: "same-origin" }),
      ]);

      const newCards: KanbanCardData[] = [];

      // 1. Access requests
      if (accessRes.status === "fulfilled" && accessRes.value?.ok) {
        try {
          const json = await accessRes.value.json() as {
            ok: boolean;
            access_requests?: AccessRequest[];
          };
          if (json.ok && Array.isArray(json.access_requests)) {
            newCards.push(...buildAccessCards(json.access_requests));
          }
        } catch { /* graceful degradation */ }
      }

      // 2. Meets
      if (meetsRes.status === "fulfilled" && meetsRes.value?.ok) {
        try {
          const json = await meetsRes.value.json() as {
            ok: boolean;
            meets?: Meet[];
          };
          if (json.ok && Array.isArray(json.meets)) {
            newCards.push(...buildMeetCards(json.meets));
          }
        } catch { /* graceful degradation */ }
      }

      // 3. Leads
      if (leadsRes.status === "fulfilled" && leadsRes.value?.ok) {
        try {
          const json = await leadsRes.value.json() as {
            ok: boolean;
            leads?: Lead[];
          };
          if (json.ok && Array.isArray(json.leads)) {
            newCards.push(...buildLeadCards(json.leads));
          }
        } catch { /* graceful degradation */ }
      }

      // 4. Support conversations
      if (supportRes.status === "fulfilled" && supportRes.value?.ok) {
        try {
          const json = await supportRes.value.json() as {
            ok: boolean;
            conversations?: SupportConversation[];
          };
          if (json.ok && Array.isArray(json.conversations)) {
            newCards.push(...buildSupportCards(json.conversations));
          }
        } catch { /* graceful degradation */ }
      }

      // Build cardsMap
      const map: CardsMap = {};
      for (const card of newCards) map[card.id] = card;

      setCardsMap((prev) => ({ ...prev, ...map }));
      setBoardState((prev) => assignCardsToColumns(newCards, prev));
      setLoading(false);
    }

    void fetchCards();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeCampaignId]);

  // ── Move card between columns ──────────────────────────────────────
  const handleMove = useCallback(
    (cardId: string, fromColId: string, direction: "left" | "right") => {
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
    },
    [],
  );

  // ── Add custom card ────────────────────────────────────────────────
  const handleAddCard = useCallback((colId: string, card: KanbanCardData) => {
    setCardsMap((prev) => ({ ...prev, [card.id]: card }));
    setBoardState((prev) => {
      const next = { ...prev, [colId]: [...(prev[colId] ?? []), card.id] };
      saveBoardState(next);
      return next;
    });
  }, []);

  // ── Derived data ───────────────────────────────────────────────────
  const columns: KanbanColumnData[] = COLUMNS_TEMPLATE.map((col) => ({
    ...col,
    cards: (boardState[col.id] ?? [])
      .map((id) => cardsMap[id])
      .filter((c): c is KanbanCardData => !!c),
  }));

  const totalCards = Object.values(boardState).flat().length;

  return { loading, columns, totalCards, handleMove, handleAddCard };
}
